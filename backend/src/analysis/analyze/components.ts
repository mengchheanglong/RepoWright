import path from 'node:path';
import type { ComponentInfo, DependencyGraph } from '../../domain/index.js';
import { inferComponentDescription, inferFunctionDescription, isUtilityOrHook } from './core.js';
import { classifyPathScope } from './scoping.js';

/**
 * Returns true if the file path looks like a test file.
 * Test files should not contribute "useful components".
 */
function isTestFile(fp: string): boolean {
  const scope = classifyPathScope(fp);
  if (scope === 'test') return true;
  const base = path.basename(fp).toLowerCase();
  if (base.startsWith('test_') || base.startsWith('spec_') || base.includes('.test.') || base.includes('.spec.')) return true;
  if (/[\\/](tests?|__tests__|specs?|fixtures?|mocks?)[\\/]/i.test(fp)) return true;
  return false;
}

/**
 * Returns true if the class/function name looks like a test helper
 * (Fake*, Dummy*, _Fake*, _Dummy*, _Noop*, _Mock*, Stub*, etc.)
 */
function isTestHelperName(name: string): boolean {
  return /^_?(Fake|Dummy|Mock|Stub|Noop|Spy|Fixture|TestHelper)/i.test(name);
}

export function detectUsefulComponents(
  filePaths: string[],
  fileContents: Map<string, string>,
  frameworks: string[],
  depGraph: DependencyGraph,
): ComponentInfo[] {
  const components: ComponentInfo[] = [];
  const importCounts = new Map<string, number>();
  for (const n of depGraph.nodes) {
    importCounts.set(n.file, n.importedBy.length);
  }

  for (const [fp, content] of fileContents) {
    if (components.length >= 20) break;
    if (isTestFile(fp)) continue;
    const jsdocMap = extractJsdocComments(content);

    for (const m of content.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g)) {
      const name = m[1] ?? '';
      if (!name || /test|mock|stub|spec/i.test(name)) continue;
      if (isTestHelperName(name)) continue;
      const jsdoc = jsdocMap.get(m.index ?? 0);
      const desc = jsdoc ?? inferComponentDescription(name, fp);
      components.push({
        name,
        description: desc,
        location: fp,
        reusability: rankReusability(fp, importCounts.get(fp) ?? 0, content),
      });
    }

    for (const m of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g)) {
      const name = m[1] ?? '';
      if (!name || /test|mock|stub|spec/i.test(name)) continue;
      if (isTestHelperName(name)) continue;
      if (!isUtilityOrHook(name, fp) && !frameworks.includes('React')) continue;
      const jsdoc = jsdocMap.get(m.index ?? 0);
      const desc = jsdoc ?? inferFunctionDescription(name, fp);
      if (!components.some((c) => c.name === name && c.location === fp)) {
        components.push({
          name,
          description: desc,
          location: fp,
          reusability: rankReusability(fp, importCounts.get(fp) ?? 0, content),
        });
      }
    }

    for (const m of content.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g)) {
      const name = m[1] ?? '';
      if (!name || /test|mock|stub|spec/i.test(name)) continue;
      if (isTestHelperName(name)) continue;
      if (!isUtilityOrHook(name, fp)) continue;
      if (!components.some((c) => c.name === name && c.location === fp)) {
        const jsdoc = jsdocMap.get(m.index ?? 0);
        components.push({
          name,
          description: jsdoc ?? inferFunctionDescription(name, fp),
          location: fp,
          reusability: rankReusability(fp, importCounts.get(fp) ?? 0, content),
        });
      }
    }
  }

  for (const [fp, content] of fileContents) {
    if (components.length >= 30) break;
    if (isTestFile(fp)) continue;
    const ext = path.extname(fp).toLowerCase();

    if (ext === '.py') {
      for (const m of content.matchAll(/^class\s+(\w+)(?:\([\w., ]*\))?:/gm)) {
        const name = m[1] ?? '';
        if (!name || /test|mock|stub/i.test(name)) continue;
        if (isTestHelperName(name)) continue;
        if (components.some((c) => c.name === name && c.location === fp)) continue;
        components.push({
          name,
          description: inferComponentDescription(name, fp),
          location: fp,
          reusability: rankReusability(fp, importCounts.get(fp) ?? 0, content),
        });
      }
      for (const m of content.matchAll(/@(?:app|router)\.\w+.*\n\s*(?:async\s+)?def\s+(\w+)/g)) {
        const name = m[1] ?? '';
        if (!name || components.some((c) => c.name === name && c.location === fp)) continue;
        components.push({
          name,
          description: `API endpoint handler from ${path.basename(fp)}`,
          location: fp,
          reusability: 'medium',
        });
      }
    }

    if (ext === '.go') {
      for (const m of content.matchAll(/type\s+(\w+)\s+(struct|interface)\s*\{/g)) {
        const name = m[1] ?? '';
        const kind = m[2] ?? 'struct';
        if (!name || /test|mock/i.test(name)) continue;
        if (isTestHelperName(name)) continue;
        if (components.some((c) => c.name === name && c.location === fp)) continue;
        components.push({
          name,
          description: kind === 'interface' ? `Interface contract from ${path.basename(fp)}` : inferComponentDescription(name, fp),
          location: fp,
          reusability: kind === 'interface' ? 'high' : rankReusability(fp, importCounts.get(fp) ?? 0, content),
        });
      }
    }

    if (ext === '.rs') {
      for (const m of content.matchAll(/pub\s+(?:struct|enum|trait)\s+(\w+)/g)) {
        const name = m[1] ?? '';
        if (!name || /test|mock/i.test(name)) continue;
        if (isTestHelperName(name)) continue;
        if (components.some((c) => c.name === name && c.location === fp)) continue;
        const kind = content.includes(`trait ${name}`) ? 'Trait' : content.includes(`enum ${name}`) ? 'Enum' : 'Struct';
        components.push({
          name,
          description: `${kind} from ${path.basename(fp)}`,
          location: fp,
          reusability: kind === 'Trait' ? 'high' : rankReusability(fp, importCounts.get(fp) ?? 0, content),
        });
      }
    }

    if (ext === '.java' || ext === '.kt') {
      for (const m of content.matchAll(/(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/g)) {
        const name = m[1] ?? '';
        if (!name || /Test|Mock|Stub/i.test(name)) continue;
        if (isTestHelperName(name)) continue;
        if (components.some((c) => c.name === name && c.location === fp)) continue;
        components.push({
          name,
          description: inferComponentDescription(name, fp),
          location: fp,
          reusability: rankReusability(fp, importCounts.get(fp) ?? 0, content),
        });
      }
    }
  }

  for (const fp of filePaths) {
    if (components.length >= 30) break;
    if (isTestFile(fp)) continue;
    if ((fp.includes('schema') || fp.includes('types') || fp.includes('models')) && !components.some((c) => c.location === fp)) {
      components.push({
        name: path.basename(fp, path.extname(fp)),
        description: 'Data schema/model definitions',
        location: fp,
        reusability: 'high',
      });
    }
  }

  components.sort((a, b) => {
    const rOrder = { high: 0, medium: 1, low: 2 };
    const rDiff = rOrder[a.reusability] - rOrder[b.reusability];
    if (rDiff !== 0) return rDiff;
    return (importCounts.get(b.location) ?? 0) - (importCounts.get(a.location) ?? 0);
  });

  return components.slice(0, 25);
}

function extractJsdocComments(content: string): Map<number, string> {
  const map = new Map<number, string>();
  const regex = /\/\*\*\s*([\s\S]*?)\s*\*\//g;
  for (const m of content.matchAll(regex)) {
    const endIdx = (m.index ?? 0) + m[0].length;
    const after = content.slice(endIdx, endIdx + 100);
    if (/^\s*export/.test(after)) {
      const comment = (m[1] ?? '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/@\w+.*$/gm, '')
        .trim()
        .split('\n')[0] ?? '';
      if (comment.length > 5) {
        map.set(endIdx + (after.match(/^\s*/)?.at(0)?.length ?? 0), comment);
      }
    }
  }
  return map;
}

function rankReusability(fp: string, importedByCount: number, content: string): ComponentInfo['reusability'] {
  if (importedByCount >= 5) return 'high';
  if (fp.includes('utils') || fp.includes('lib') || fp.includes('helpers') || fp.includes('shared')) return 'high';
  if (fp.includes('domain') || fp.includes('types') || fp.includes('schemas')) return 'high';
  if (/interface\s+\w|abstract\s+class/i.test(content.slice(0, 800))) return 'high';
  if (importedByCount >= 2) return 'medium';
  if (fp.includes('services') || fp.includes('core')) return 'medium';
  return 'medium';
}
