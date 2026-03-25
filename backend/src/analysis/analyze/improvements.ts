import path from 'node:path';
import type { CodeQuality, ConfigAnalysis, DependencyGraph, ImprovementItem } from '../../domain/index.js';
import { CODE_EXTENSIONS } from './core.js';
import { classifyPathScope, isActionableCodePath, isLikelyPlaceholderSecret } from './scoping.js';

function confidenceLabel(evidenceCount: number, coverageRatio: number): 'high' | 'medium' | 'low' {
  if (evidenceCount >= 4 && coverageRatio >= 0.6) return 'high';
  if (evidenceCount >= 2 || coverageRatio >= 0.35) return 'medium';
  return 'low';
}

export function detectImprovements(
  filePaths: string[],
  fileContents: Map<string, string>,
  hasTests: boolean,
  _frameworks: string[],
  _patterns: string[],
  _fileCount: number,
  cq: CodeQuality,
  depGraph: DependencyGraph,
  configAnalysis: ConfigAnalysis,
): ImprovementItem[] {
  const items: ImprovementItem[] = [];
  const actionableCodeFiles = filePaths.filter((f) => isActionableCodePath(f) && CODE_EXTENSIONS.has(path.extname(f)));
  const coverageRatio = actionableCodeFiles.length / Math.max(filePaths.filter((f) => CODE_EXTENSIONS.has(path.extname(f))).length, 1);

  if (!hasTests) {
    items.push({ area: 'Testing', issue: 'No test files detected', suggestion: 'Add unit and integration tests for core business logic', priority: 'high' });
  } else {
    const testFiles = filePaths.filter((f) => classifyPathScope(f) === 'test');
    const ratio = testFiles.length / Math.max(actionableCodeFiles.length, 1);
    if (ratio < 0.1) {
      items.push({
        area: 'Testing',
        issue: `Low test-to-production ratio: ${testFiles.length} test files for ${actionableCodeFiles.length} production code files (${(ratio * 100).toFixed(0)}%)`,
        suggestion: 'Prioritize tests for production modules with highest import count. Confidence: high (path-scoped; production-only denominator).',
        priority: 'high',
        files: depGraph.centralModules.slice(0, 3).map((m) => m.file),
      });
    }
  }

  if (cq.anyTypeCount > 0) {
    items.push({ area: 'Type Safety', issue: `${cq.anyTypeCount} uses of any type found in production-scoped files`, suggestion: 'Replace with specific types or generics. Confidence: high (test/vendor/generated paths excluded).', priority: cq.anyTypeCount > 10 ? 'high' : 'medium', files: cq.anyTypeFiles });
  }

  if (cq.emptyCatchCount > 0) {
    items.push({ area: 'Error Handling', issue: `${cq.emptyCatchCount} suppressed exception handler(s) (except: pass) in production-scoped files`, suggestion: 'Add logging or re-throw instead of silently swallowing exceptions. Confidence: high (test/vendor/generated paths excluded).', priority: cq.emptyCatchCount > 10 ? 'high' : 'medium', files: cq.emptyCatchFiles });
  }

  if (cq.largeFiles.length > 0) {
    items.push({
      area: 'Code Organization',
      issue: `${cq.largeFiles.length} file(s) exceed 350 lines — largest is ${cq.maxFilePath} at ${cq.maxFileLines} lines`,
      suggestion: 'Split into focused modules. Extract helper functions, types, and constants into separate files.',
      priority: cq.maxFileLines > 600 ? 'high' : 'medium',
      files: cq.largeFiles.map((f) => `${f.path} (${f.lines} lines)`),
    });
  }

  if (cq.maxNestingDepth > 6) {
    items.push({
      area: 'Code Complexity',
      issue: `Maximum nesting depth of ${cq.maxNestingDepth} in ${cq.maxNestingFile}`,
      suggestion: 'Use early returns, extract nested logic into helper functions, or use guard clauses.',
      priority: cq.maxNestingDepth > 8 ? 'high' : 'medium',
      files: [cq.maxNestingFile],
    });
  }

  if (cq.todoCount > 3) {
    const todoConfidence = confidenceLabel(cq.todoCount, coverageRatio);
    items.push({ area: 'Tech Debt', issue: `${cq.todoCount} TODO/FIXME/HACK comments in production-scoped files`, suggestion: `Track these in an issue tracker and resolve. Confidence: ${todoConfidence} (marker-based heuristic).`, priority: cq.todoCount > 10 ? 'medium' : 'low' });
  }

  if (depGraph.circularDeps.length > 0) {
    const scopedCycles = depGraph.circularDeps
      .map((cycle) => cycle.filter((f) => isActionableCodePath(f)))
      .filter((cycle) => cycle.length >= 2);
    if (scopedCycles.length > 0) {
      items.push({
        area: 'Architecture',
        issue: `${scopedCycles.length} circular dependency chain(s) detected in production-scoped files`,
        suggestion: 'Break cycles by extracting shared types into a separate module, or use dependency inversion. Confidence: high.',
        priority: 'high',
        files: scopedCycles.map((c) => c.join(' -> ')),
      });
    }
  }

  const scopedOrphans = depGraph.orphanFiles.filter((f) => isActionableCodePath(f));
  if (scopedOrphans.length > 5) {
    const orphanConfidence = confidenceLabel(Math.min(scopedOrphans.length, 6), coverageRatio);
    items.push({
      area: 'Dead Code',
      issue: `${scopedOrphans.length} production files are not imported by any other module`,
      suggestion: `Review whether these are unused. Remove dead code or add explicit entry references where intentional. Confidence: ${orphanConfidence}.`,
      priority: 'low',
      files: scopedOrphans.slice(0, 8),
    });
  }

  if (configAnalysis.typescript && configAnalysis.typescript.issues.length > 0) {
    items.push({
      area: 'TypeScript Config',
      issue: `${configAnalysis.typescript.issues.length} tsconfig issue(s): ${configAnalysis.typescript.issues[0]}`,
      suggestion: configAnalysis.typescript.issues.join('. '),
      priority: !configAnalysis.typescript.strict ? 'high' : 'medium',
    });
  }

  if (cq.commentRatio < 0.03 && cq.totalCodeLines > 500) {
    items.push({ area: 'Documentation', issue: `Comment ratio is only ${(cq.commentRatio * 100).toFixed(1)}% across ${cq.totalCodeLines} lines of code`, suggestion: 'Add JSDoc comments to exported functions and complex logic. Focus on the why, not the what.', priority: 'low' });
  }

  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    if ((/Access-Control-Allow-Origin/i.test(content) && /\*/.test(content)) || /cors\s*\([^)]*origin\s*:\s*['"]\*['"]/i.test(content)) {
      items.push({ area: 'Security', issue: 'CORS allows all origins (*)', suggestion: 'Restrict to specific trusted origins in production. Confidence: medium (string-match heuristic).', priority: 'medium', files: [fp] });
      break;
    }
  }

  // README check is done via allFilePaths passed separately since README is docs-scoped
  // This is handled by health-score documentation dimension instead

  if (cq.avgFunctionLength > 30) {
    items.push({ area: 'Code Quality', issue: `Average function length is ${cq.avgFunctionLength} lines — functions are doing too much`, suggestion: 'Extract sub-operations into focused helper functions. Aim for < 20 lines per function.', priority: 'medium' });
  }

  const bareExceptFiles: string[] = [];
  const globalFiles: string[] = [];
  let bareExceptCount = 0;
  let globalCount = 0;
  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    if (!fp.endsWith('.py')) continue;
    const bareExcepts = (content.match(/except\s*:/g) ?? []).length;
    if (bareExcepts > 0) {
      bareExceptCount += bareExcepts;
      bareExceptFiles.push(fp);
    }
    const globals = (content.match(/^\s*global\s+\w/gm) ?? []).length;
    if (globals > 0) {
      globalCount += globals;
      globalFiles.push(fp);
    }
  }
  if (bareExceptCount > 0) {
    items.push({ area: 'Python Error Handling', issue: `${bareExceptCount} bare except: clause(s) — catches all exceptions including KeyboardInterrupt`, suggestion: 'Use specific exception types (except ValueError:) or at minimum except Exception:', priority: 'high', files: bareExceptFiles.slice(0, 5) });
  }
  if (globalCount > 2) {
    items.push({ area: 'Python Code Quality', issue: `${globalCount} global statement(s) used`, suggestion: 'Avoid global mutable state. Use class instances, closures, or dependency injection instead.', priority: 'medium', files: globalFiles.slice(0, 5) });
  }

  const panicFiles: string[] = [];
  let panicCount = 0;
  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    if (!fp.endsWith('.go')) continue;
    const panics = (content.match(/\bpanic\s*\(/g) ?? []).length;
    if (panics > 0) {
      panicCount += panics;
      panicFiles.push(`${fp} (${panics})`);
    }
  }
  if (panicCount > 0) {
    items.push({ area: 'Go Error Handling', issue: `${panicCount} panic() call(s) found — program crashes instead of handling errors`, suggestion: 'Return errors instead of panicking. Reserve panic for truly unrecoverable situations.', priority: 'high', files: panicFiles.slice(0, 5) });
  }

  const unsafeFiles: string[] = [];
  let unsafeCount = 0;
  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    if (!fp.endsWith('.rs')) continue;
    const unsafes = (content.match(/\bunsafe\s*\{/g) ?? []).length;
    if (unsafes > 0) {
      unsafeCount += unsafes;
      unsafeFiles.push(`${fp} (${unsafes})`);
    }
  }
  if (unsafeCount > 0) {
    items.push({ area: 'Rust Safety', issue: `${unsafeCount} unsafe block(s) found`, suggestion: 'Audit each unsafe block. Document why it is necessary and verify invariants. Consider safe abstractions.', priority: 'medium', files: unsafeFiles.slice(0, 5) });
  }

  const secretFindings: string[] = [];
  const secretEvidence: string[] = [];
  let placeholderCount = 0;
  let secretMatchCount = 0;
  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    if (fp.includes('.env')) continue;

    for (const m of content.matchAll(/\b(password|secret|api[_-]?key|token|credential|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*['"]([^'"]{12,})['"]/ig)) {
      const keyName = m[1] ?? 'secret';
      const value = m[2] ?? '';
      if (isLikelyPlaceholderSecret(keyName, value, fp)) {
        placeholderCount++;
        continue;
      }
      secretMatchCount++;
      secretEvidence.push(`${fp}:${keyName}`);
      if (!secretFindings.includes(fp)) secretFindings.push(fp);
    }
  }
  if (secretFindings.length > 0) {
    const confidence = confidenceLabel(secretMatchCount, coverageRatio);
    items.push({
      area: 'Security',
      issue: `Potential hardcoded secrets/credentials found in ${secretFindings.length} production file(s) (${secretMatchCount} match(es), ${placeholderCount} placeholder-like filtered)`,
      suggestion: `Use environment variables or a secrets manager. Confidence: ${confidence} (path-scoped, placeholder-filtered, key/value pattern matched).`,
      priority: secretMatchCount >= 3 ? 'high' : 'medium',
      files: secretEvidence.slice(0, 6),
    });
  }

  const commandInjectionFiles: string[] = [];
  let commandInjectionSignals = 0;
  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    const dynamicExec = /(?:exec|spawn|system|popen)\s*\([^)]*(?:\+|\$\{|format\(|f['"]).*\)/i.test(content);
    if (dynamicExec) {
      commandInjectionSignals++;
      commandInjectionFiles.push(fp);
    }
  }
  if (commandInjectionSignals > 0) {
    const confidence = confidenceLabel(commandInjectionSignals, coverageRatio);
    items.push({
      area: 'Security',
      issue: `${commandInjectionSignals} dynamic command execution signal(s) in production-scoped files`,
      suggestion: `Avoid shell interpolation with untrusted input. Use argument arrays / allowlists and validate input. Confidence: ${confidence}.`,
      priority: commandInjectionSignals > 2 ? 'high' : 'medium',
      files: commandInjectionFiles.slice(0, 5),
    });
  }

  return items.slice(0, 20);
}
