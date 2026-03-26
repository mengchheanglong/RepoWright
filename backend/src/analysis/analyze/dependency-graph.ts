import path from 'node:path';
import type { DependencyGraph, DependencyNode } from '../../domain/index.js';

export function buildDependencyGraph(fileContents: Map<string, string>, _sourceRoot: string): DependencyGraph {
  const nodes = new Map<string, { imports: Set<string>; importedBy: Set<string> }>();

  for (const fp of fileContents.keys()) {
    nodes.set(fp, { imports: new Set(), importedBy: new Set() });
  }

  // Build a set of known top-level Python packages from the file tree
  // e.g., if we have "openviking/utils/foo.py", then "openviking" is a known package
  const knownPyPackages = new Set<string>();
  for (const fp of fileContents.keys()) {
    if (fp.endsWith('.py')) {
      const parts = fp.replace(/\\/g, '/').split('/');
      if (parts.length >= 2) knownPyPackages.add(parts[0]!);
    }
  }

  const externalPackages = new Set<string>();
  let internalImportCount = 0;

  for (const [fp, content] of fileContents) {
    const importPaths = extractImportPaths(content, fp);
    for (const raw of importPaths) {
      if (isRelativeOrInternalImport(raw, fp, knownPyPackages)) {
        const resolved = resolveRelativeImport(fp, raw, fileContents, knownPyPackages);
        if (resolved && nodes.has(resolved)) {
          nodes.get(fp)!.imports.add(resolved);
          nodes.get(resolved)!.importedBy.add(fp);
          internalImportCount++;
        }
      } else {
        // Track unique external package names (top-level package only)
        const ext = path.extname(fp).toLowerCase();
        let pkgName = raw;
        if (ext === '.py') {
          pkgName = raw.split('.')[0] ?? raw;
        } else if (raw.startsWith('@')) {
          // Scoped npm packages: @scope/pkg
          pkgName = raw.split('/').slice(0, 2).join('/');
        } else {
          pkgName = raw.split('/')[0] ?? raw;
        }
        externalPackages.add(pkgName);
      }
    }
  }

  const externalDepCount = externalPackages.size;

  const centralModules = [...nodes.entries()]
    .map(([file, n]) => ({ file, importedByCount: n.importedBy.size }))
    .filter((n) => n.importedByCount > 0)
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, 10);

  const entryLike = /index\.|main\.|app\.|server\.|cli/i;
  // Test files, conftest, setup scripts, benchmarks, and __init__.py are expected entry points
  const knownEntryOrRunner = /(?:^|[\\/])(?:test_|spec_|tests?[\\/]|__tests__[\\/]|conftest\.py|setup\.py|manage\.py|__init__\.py|benchmark|__main__\.py)/i;
  const orphanFiles = [...nodes.entries()]
    .filter(([file, n]) => n.importedBy.size === 0 && !entryLike.test(file) && !knownEntryOrRunner.test(file))
    .map(([file]) => file)
    .slice(0, 15);

  const circularDeps = findCircularDeps(nodes);

  const nodeList: DependencyNode[] = [...nodes.entries()]
    .filter(([, n]) => n.imports.size > 0 || n.importedBy.size > 0)
    .map(([file, n]) => ({ file, imports: [...n.imports], importedBy: [...n.importedBy] }));

  return { nodes: nodeList, centralModules, circularDeps, orphanFiles, externalDepCount, internalImportCount };
}

function extractImportPaths(content: string, filePath?: string): string[] {
  const paths: string[] = [];
  const ext = filePath ? path.extname(filePath).toLowerCase() : '';

  for (const m of content.matchAll(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g)) {
    if (m[1]) paths.push(m[1]);
  }
  for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1]) paths.push(m[1]);
  }
  for (const m of content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1]) paths.push(m[1]);
  }

  if (ext === '.py') {
    for (const m of content.matchAll(/^\s*from\s+([\w.]+)\s+import/gm)) {
      if (m[1]) paths.push(m[1]);
    }
    for (const m of content.matchAll(/^\s*import\s+([\w.]+)/gm)) {
      if (m[1]) paths.push(m[1]);
    }
  }

  if (ext === '.go') {
    for (const m of content.matchAll(/^\s*import\s+"([^"]+)"/gm)) {
      if (m[1]) paths.push(m[1]);
    }
    for (const m of content.matchAll(/import\s*\(([\s\S]*?)\)/g)) {
      const block = m[1] ?? '';
      for (const line of block.matchAll(/"([^"]+)"/g)) {
        if (line[1]) paths.push(line[1]);
      }
    }
  }

  if (ext === '.rs') {
    for (const m of content.matchAll(/^\s*use\s+([\w:]+)/gm)) {
      if (m[1]) paths.push(m[1]);
    }
    for (const m of content.matchAll(/^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm)) {
      if (m[1]) paths.push(m[1]);
    }
  }

  if (ext === '.java' || ext === '.kt') {
    for (const m of content.matchAll(/^\s*import\s+([\w.]+(?:\.\*)?)\s*;?/gm)) {
      if (m[1]) paths.push(m[1]);
    }
  }

  if (ext === '.rb') {
    for (const m of content.matchAll(/^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm)) {
      if (m[1]) paths.push(m[1]);
    }
  }

  if (ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp') {
    for (const m of content.matchAll(/^\s*#include\s+["<]([^">]+)[">]/gm)) {
      if (m[1]) paths.push(m[1]);
    }
  }

  if (ext === '.php') {
    for (const m of content.matchAll(/^\s*(?:use|require_once|require|include_once|include)\s+['"]?([^'";]+)/gm)) {
      if (m[1]) paths.push(m[1].trim());
    }
  }

  return paths;
}

function isRelativeOrInternalImport(p: string, filePath?: string, knownPyPackages?: Set<string>): boolean {
  if (p.startsWith('./') || p.startsWith('../')) return true;
  const ext = filePath ? path.extname(filePath).toLowerCase() : '';
  if (ext === '.py' && p.startsWith('.')) return true;
  // Python absolute imports: check if the top-level package matches a known project package
  if (ext === '.py' && knownPyPackages && knownPyPackages.size > 0) {
    const topLevel = p.split('.')[0] ?? '';
    if (topLevel && knownPyPackages.has(topLevel)) return true;
  }
  if (ext === '.rb') return true;
  if ((ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp') && !p.includes('/')) return true;
  return false;
}

function resolveRelativeImport(fromFile: string, importPath: string, knownFiles: Map<string, string>, knownPyPackages?: Set<string>): string | null {
  const dir = path.dirname(fromFile);
  const ext = path.extname(fromFile).toLowerCase();

  let normalizedPath = importPath;
  if (ext === '.py' && /^[\w.]+$/.test(importPath)) {
    // Check if this is an absolute import matching a known project package
    const topLevel = importPath.split('.')[0] ?? '';
    if (knownPyPackages && knownPyPackages.has(topLevel)) {
      // Absolute import: convert dots to path separators from project root
      normalizedPath = importPath.replace(/\./g, '/');
    } else {
      // Relative import within the same directory
      normalizedPath = './' + importPath.replace(/\./g, '/');
    }
  }

  const base = ext === '.py' && knownPyPackages && knownPyPackages.has((importPath.split('.')[0] ?? ''))
    ? normalizedPath.replace(/\\/g, '/')
    : path.join(dir, normalizedPath).replace(/\\/g, '/');
  const candidates: string[] = [base];

  if (ext === '.py') {
    candidates.push(`${base}.py`, `${base}/__init__.py`);
  } else if (ext === '.go') {
    candidates.push(`${base}.go`);
  } else if (ext === '.rs') {
    candidates.push(`${base}.rs`, `${base}/mod.rs`);
  } else if (ext === '.rb') {
    candidates.push(`${base}.rb`);
  } else if (ext === '.java' || ext === '.kt') {
    candidates.push(`${base}.java`, `${base}.kt`);
  } else if (ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp') {
    candidates.push(`${base}.h`, `${base}.hpp`, `${base}.c`, `${base}.cpp`, `${base}.cc`, `${base}.cxx`);
  } else {
    candidates.push(
      `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
      `${base}/index.ts`, `${base}/index.js`, `${base}/index.tsx`,
    );
  }

  for (const c of candidates) {
    const normalized = c.replace(/\\/g, '/');
    if (knownFiles.has(normalized)) return normalized;
    const winNorm = normalized.replace(/\//g, '\\');
    if (knownFiles.has(winNorm)) return winNorm;
  }

  if (base.endsWith('.js')) {
    const tsBase = base.slice(0, -3);
    const tsCandidates = [`${tsBase}.ts`, `${tsBase}.tsx`];
    for (const c of tsCandidates) {
      if (knownFiles.has(c)) return c;
      if (knownFiles.has(c.replace(/\//g, '\\'))) return c.replace(/\//g, '\\');
    }
  }

  return null;
}

function findCircularDeps(nodes: Map<string, { imports: Set<string>; importedBy: Set<string> }>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (cycles.length >= 5) return;
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart >= 0) cycles.push([...stack.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const edges = nodes.get(node);
    if (edges) {
      for (const dep of edges.imports) {
        dfs(dep);
        if (cycles.length >= 5) return;
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const file of nodes.keys()) {
    if (!visited.has(file)) dfs(file);
    if (cycles.length >= 5) break;
  }
  return cycles;
}
