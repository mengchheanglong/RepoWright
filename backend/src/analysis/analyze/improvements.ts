import path from 'node:path';
import type { CodeQuality, ConfigAnalysis, DepAuditReport, DependencyGraph, ImprovementItem } from '../../domain/index.js';
import { CODE_EXTENSIONS } from './core.js';
import { hasDynamicCommandExecutionSignal } from './dangerous-execution.js';
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
  depAudit?: DepAuditReport | null,
  allFilePaths?: string[],
): ImprovementItem[] {
  const items: ImprovementItem[] = [];
  const actionableCodeFiles = filePaths.filter((f) => isActionableCodePath(f) && CODE_EXTENSIONS.has(path.extname(f)));
  const coverageRatio = actionableCodeFiles.length / Math.max(filePaths.filter((f) => CODE_EXTENSIONS.has(path.extname(f))).length, 1);
  const testFileUniverse = allFilePaths ?? filePaths;

  if (!hasTests) {
    const startWith = depGraph.centralModules.length > 0
      ? ` Start with ${depGraph.centralModules[0]!.file} (imported by ${depGraph.centralModules[0]!.importedByCount} modules).`
      : '';
    items.push({ area: 'Testing', issue: 'No test files detected', suggestion: `Add unit and integration tests for core business logic.${startWith}`, priority: 'high' });
  } else {
    const testFiles = testFileUniverse.filter((f) => classifyPathScope(f) === 'test');
    const ratio = testFiles.length / Math.max(actionableCodeFiles.length, 1);
    if (ratio < 0.1) {
      const untested = depGraph.centralModules.slice(0, 3).map((m) => `${m.file} (${m.importedByCount} dependents)`);
      items.push({
        area: 'Testing',
        issue: `Low test-to-production ratio: ${testFiles.length} test files for ${actionableCodeFiles.length} production code files (${(ratio * 100).toFixed(0)}%)`,
        suggestion: `Prioritize tests for the most-imported modules — changes there have the highest blast radius.`,
        priority: 'high',
        files: untested,
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

  const corsFiles: string[] = [];
  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    const hasJsCors = (/Access-Control-Allow-Origin/i.test(content) && /\*/.test(content)) || /cors\s*\([^)]*origin\s*:\s*['"]\*['"]/i.test(content);
    // Python/FastAPI: cors_origins = ["*"], allow_origins=["*"], CORSMiddleware with allow_origins=["*"]
    const hasPyCors = /cors_origins.*\["?\*"?\]|allow_origins.*\["?\*"?\]|CORSMiddleware.*allow_origins.*\*/i.test(content);
    if (hasJsCors || hasPyCors) {
      corsFiles.push(fp);
    }
  }
  if (corsFiles.length > 0) {
    items.push({ area: 'Security', issue: 'CORS allows all origins (*)', suggestion: 'Restrict to specific trusted origins in production. Confidence: medium (string-match heuristic).', priority: 'medium', files: corsFiles.slice(0, 5) });
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
    if (hasDynamicCommandExecutionSignal(fp, content)) {
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

  // --- New checks: cognitive complexity, argument count, boolean complexity, duplicates ---

  if (cq.maxCognitiveComplexity && cq.maxCognitiveComplexity > 30) {
    items.push({
      area: 'Code Complexity',
      issue: `Cognitive complexity of ${cq.maxCognitiveComplexity} in ${cq.maxCognitiveComplexityFile ?? 'unknown'}`,
      suggestion: 'Break complex functions into smaller, focused helpers. Use early returns to reduce nesting.',
      priority: cq.maxCognitiveComplexity > 60 ? 'high' : 'medium',
      files: cq.maxCognitiveComplexityFile ? [cq.maxCognitiveComplexityFile] : [],
      estimatedMinutes: Math.min(60, Math.round(cq.maxCognitiveComplexity * 0.3)),
    });
  }

  if (cq.maxArgCount && cq.maxArgCount > 5) {
    items.push({
      area: 'Code Quality',
      issue: `Function with ${cq.maxArgCount} parameters (${cq.maxArgCountFile ?? 'unknown'})`,
      suggestion: 'Group related parameters into an options object or data class. Functions with many parameters are hard to call correctly.',
      priority: cq.maxArgCount > 8 ? 'high' : 'medium',
      files: cq.maxArgCountFile ? [cq.maxArgCountFile] : [],
      estimatedMinutes: 15,
    });
  }

  if (cq.booleanComplexityCount && cq.booleanComplexityCount > 3) {
    items.push({
      area: 'Code Complexity',
      issue: `${cq.booleanComplexityCount} lines with 3+ boolean operators (complex conditions)`,
      suggestion: 'Extract complex boolean expressions into named variables or helper functions for readability.',
      priority: cq.booleanComplexityCount > 10 ? 'high' : 'medium',
      estimatedMinutes: Math.min(30, cq.booleanComplexityCount * 3),
    });
  }

  if (cq.duplicateBlockCount && cq.duplicateBlockCount > 5) {
    items.push({
      area: 'Code Organization',
      issue: `${cq.duplicateBlockCount} duplicate code block(s) detected across files`,
      suggestion: 'Extract shared logic into reusable functions or modules to reduce maintenance burden.',
      priority: cq.duplicateBlockCount > 15 ? 'high' : 'medium',
      estimatedMinutes: Math.min(60, cq.duplicateBlockCount * 5),
    });
  }

  // --- Dependency vulnerabilities ---

  if (depAudit && depAudit.totalVulnerabilities > 0) {
    const criticalHigh = depAudit.criticalCount + depAudit.highCount;
    const fixable = depAudit.vulnerabilities.filter((v) => v.fixAvailable).length;
    items.push({
      area: 'Security',
      issue: `${depAudit.totalVulnerabilities} dependency vulnerability(ies) (${depAudit.criticalCount} critical, ${depAudit.highCount} high) via ${depAudit.auditSource}`,
      suggestion: fixable > 0
        ? `${fixable} have fixes available. Run package audit fix or update affected dependencies.`
        : 'Review vulnerable dependencies and consider alternatives or manual patches.',
      priority: criticalHigh > 0 ? 'high' : 'medium',
      estimatedMinutes: Math.min(120, depAudit.totalVulnerabilities * 10),
    });
  }

  // --- Add remediation time estimates to items that don't have them ---

  for (const item of items) {
    if (item.estimatedMinutes != null) continue;
    item.estimatedMinutes = estimateRemediationMinutes(item);
  }

  return items.slice(0, 25);
}

function estimateRemediationMinutes(item: ImprovementItem): number {
  // Estimate based on area and priority — inspired by SonarQube/CodeClimate approaches
  // Base values represent per-item remediation time in minutes (kept conservative)
  const baseByArea: Record<string, number> = {
    'Testing': 30,
    'Type Safety': 5,
    'Error Handling': 5,
    'Code Organization': 15,
    'Code Complexity': 10,
    'Code Quality': 10,
    'Tech Debt': 5,
    'Architecture': 20,
    'Dead Code': 5,
    'TypeScript Config': 10,
    'Documentation': 10,
    'Security': 15,
    'Python Error Handling': 5,
    'Python Code Quality': 10,
    'Go Error Handling': 10,
    'Rust Safety': 10,
  };

  const base = baseByArea[item.area] ?? 10;
  const multiplier = item.priority === 'high' ? 1.5 : item.priority === 'medium' ? 1.2 : 1;
  // Logarithmic scaling for file count to avoid explosive growth
  const fileScale = Math.max(1, Math.log2((item.files?.length ?? 1) + 1));
  return Math.round(base * multiplier * fileScale);
}
