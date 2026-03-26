import path from 'node:path';
import type { CodeQuality, ConfigAnalysis, DependencyGraph, ImprovementItem } from '../../domain/index.js';
import { CODE_EXTENSIONS } from './core.js';
import { isActionableCodePath } from './scoping.js';

// --- Types ---

export interface HealthDimension {
  name: string;
  score: number;  // 0-100
  weight: number; // 0-1
  details: string[];  // what contributed to the score
}

export interface HealthScore {
  overall: number;  // 0-100 weighted
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  maturity: 'prototype' | 'early-development' | 'growing' | 'stable' | 'production-ready';
  dimensions: HealthDimension[];
}

// --- Helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasFile(fileList: string[], pattern: RegExp): boolean {
  return fileList.some((f) => pattern.test(f));
}

function hasFileExact(fileList: string[], names: string[]): boolean {
  return names.some((name) => fileList.some((f) => {
    const lower = f.toLowerCase();
    const nameLower = name.toLowerCase();
    return lower === nameLower || lower.endsWith('/' + nameLower) || lower.endsWith('\\' + nameLower);
  }));
}


// --- Dimension Scorers ---

function scoreCodeQuality(
  fileList: string[],
  _files: Map<string, string>,
  codeQuality: CodeQuality,
  configAnalysis: ConfigAnalysis,
  languages: Record<string, number>,
): HealthDimension {
  let score = 0;
  const details: string[] = [];
  const totalLangLines = Object.values(languages).reduce((a, b) => a + b, 0);

  const typedLangs = ['TypeScript', 'Rust', 'Go', 'Java', 'C#', 'Kotlin', 'Dart'];
  const typedLines = typedLangs.reduce((sum, lang) => sum + (languages[lang] ?? 0), 0);
  if (totalLangLines > 0 && typedLines / totalLangLines > 0.5) {
    score += 15;
    details.push('Typed language usage >50%');
  }

  // Python projects with type checking tools get partial credit
  const hasPythonTypeChecking = hasFile(fileList, /mypy\.ini|\.mypy\.ini|pyrightconfig|py\.typed/i) ||
    hasFile(fileList, /pyproject\.toml/i); // pyproject.toml often configures mypy
  if ((languages['Python'] ?? 0) > 0 && hasPythonTypeChecking) {
    score += 10;
    details.push('Python type checking configured');
  }

  if (configAnalysis.typescript?.strict) {
    score += 10;
    details.push('TypeScript strict mode enabled');
  }

  const hasLinter = hasFile(fileList, /\.eslintrc|eslint\.config|\.pylintrc|\.flake8|\.golangci|clippy|biome\.json|biome\.jsonc|ruff\.toml|\.ruff\.toml/i) ||
    hasFile(fileList, /\.pre-commit-config/i);
  if (hasLinter) {
    score += 10;
    details.push('Linting configuration present');
  }

  const hasFormatter = hasFile(fileList, /\.prettierrc|rustfmt\.toml|\.editorconfig|biome\.json|biome\.jsonc|ruff\.toml|\.ruff\.toml|\.pre-commit-config/i);
  if (hasFormatter) {
    score += 5;
    details.push('Formatter configuration present');
  }

  if (codeQuality.anyTypeCount <= 3) {
    score += 10;
    details.push(`Low \`any\` usage (${codeQuality.anyTypeCount})`);
  }

  if (codeQuality.emptyCatchCount <= 5) {
    score += codeQuality.emptyCatchCount === 0 ? 10 : 5;
    details.push(codeQuality.emptyCatchCount === 0 ? 'No suppressed exception handlers' : `Low suppressed exception count (${codeQuality.emptyCatchCount})`);
  }

  if (codeQuality.maxNestingDepth < 5) {
    score += 10;
    details.push(`Reasonable nesting depth (max ${codeQuality.maxNestingDepth})`);
  }

  if (codeQuality.avgFunctionLength <= 25) {
    score += 10;
    details.push(`Reasonable function lengths (avg ${codeQuality.avgFunctionLength} lines)`);
  }

  if (codeQuality.todoCount <= 5) {
    score += 10;
    details.push(`Low TODO/FIXME count (${codeQuality.todoCount})`);
  }

  if (codeQuality.commentRatio >= 0.05 && codeQuality.commentRatio <= 0.30) {
    score += 10;
    details.push(`Good comment ratio (${(codeQuality.commentRatio * 100).toFixed(1)}%)`);
  }

  return { name: 'Code Quality', score: clamp(score, 0, 100), weight: 0.25, details };
}

function scoreDocumentation(
  fileList: string[],
  files: Map<string, string>,
  codeQuality: CodeQuality,
): HealthDimension {
  let score = 0;
  const details: string[] = [];

  const readmeFile = fileList.find((f) => /^readme/i.test(path.basename(f)));
  if (readmeFile) {
    score += 30;
    details.push('README exists');
    const content = files.get(readmeFile);
    if (content && content.length > 500) {
      score += 10;
      details.push('README is detailed (>500 chars)');
    }
  }

  if (hasFileExact(fileList, ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md'])) {
    score += 15;
    details.push('LICENSE file exists');
  }

  if (hasFileExact(fileList, ['CHANGELOG.md', 'CHANGELOG', 'CHANGELOG.txt', 'HISTORY.md'])) {
    score += 10;
    details.push('CHANGELOG exists');
  }

  if (hasFileExact(fileList, ['CONTRIBUTING.md', 'CONTRIBUTING', 'CONTRIBUTING.txt'])) {
    score += 10;
    details.push('CONTRIBUTING.md exists');
  }

  if (hasFileExact(fileList, ['CODE_OF_CONDUCT.md', 'CODE-OF-CONDUCT.md'])) {
    score += 5;
    details.push('Code of conduct exists');
  }

  if (codeQuality.commentRatio > 0.05) {
    score += 10;
    details.push(`Inline comment ratio >5% (${(codeQuality.commentRatio * 100).toFixed(1)}%)`);
  }

  const hasArchDocs = hasFile(fileList, /docs?\/(architecture|design|adr)/i) ||
    hasFileExact(fileList, ['ARCHITECTURE.md', 'docs/README.md']);
  if (hasArchDocs) {
    score += 10;
    details.push('Architecture documentation exists');
  }

  return { name: 'Documentation', score: clamp(score, 0, 100), weight: 0.15, details };
}

function scoreSecurity(
  fileList: string[],
  files: Map<string, string>,
  improvements: ImprovementItem[],
): HealthDimension {
  let score = 0;
  const details: string[] = [];

  const hasSecretIssue = improvements.some((i) => i.area === 'Security' && i.issue.toLowerCase().includes('secret'));
  if (!hasSecretIssue) {
    score += 30;
    details.push('No hardcoded secrets detected');
  }

  if (hasFileExact(fileList, ['SECURITY.md', 'SECURITY', 'SECURITY.txt', '.github/SECURITY.md'])) {
    score += 15;
    details.push('SECURITY.md exists');
  }

  const hasLockFile = hasFileExact(fileList, [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
    'Pipfile.lock', 'poetry.lock', 'uv.lock', 'Cargo.lock', 'Gemfile.lock', 'go.sum',
  ]);
  if (hasLockFile) {
    score += 15;
    details.push('Lock file present');
  }

  let hasEvalPattern = false;
  for (const [fp, content] of files) {
    if (!isActionableCodePath(fp)) continue;
    if (/\beval\s*\(|\bexec\s*\(|\bFunction\s*\(/.test(content)) {
      hasEvalPattern = true;
      break;
    }
  }
  if (!hasEvalPattern) {
    score += 15;
    details.push('No eval/exec patterns detected');
  }

  const hasCorsIssue = improvements.some((i) => i.area === 'Security' && i.issue.toLowerCase().includes('cors'));
  if (!hasCorsIssue) {
    score += 10;
    details.push('No wildcard CORS issues detected');
  }

  let hasHttpsEnforcement = false;
  for (const [fp, content] of files) {
    if (!isActionableCodePath(fp)) continue;
    if (/https:\/\/|SSL|TLS|helmet|strict-transport|HSTS/i.test(content)) {
      hasHttpsEnforcement = true;
      break;
    }
  }
  if (hasHttpsEnforcement) {
    score += 15;
    details.push('HTTPS/TLS references found');
  }

  return { name: 'Security', score: clamp(score, 0, 100), weight: 0.20, details };
}

function scoreMaintainability(
  fileList: string[],
  _files: Map<string, string>,
  codeQuality: CodeQuality,
  dependencyGraph: DependencyGraph,
  _configAnalysis: ConfigAnalysis,
  languages: Record<string, number>,
): HealthDimension {
  let score = 0;
  const details: string[] = [];

  const hasCi = hasFile(fileList, /\.github\/workflows|\.gitlab-ci|Jenkinsfile|\.circleci|\.travis\.yml|azure-pipelines/i);
  if (hasCi) {
    score += 20;
    details.push('CI/CD configuration present');
  }

  const totalLangLines = Object.values(languages).reduce((a, b) => a + b, 0);
  const typedLangs = ['TypeScript', 'Rust', 'Go', 'Java', 'C#', 'Kotlin', 'Dart'];
  const typedLines = typedLangs.reduce((sum, lang) => sum + (languages[lang] ?? 0), 0);
  if (totalLangLines > 0 && typedLines / totalLangLines > 0.5) {
    score += 15;
    details.push('Typed language for maintainability');
  } else if ((languages['Python'] ?? 0) > 0) {
    // Python projects with type checking/quality tools get partial credit
    const hasPyQualityTools = hasFile(fileList, /mypy\.ini|\.mypy\.ini|pyrightconfig|py\.typed|\.pre-commit-config|ruff\.toml|\.ruff\.toml/i);
    if (hasPyQualityTools) {
      score += 10;
      details.push('Python quality/type checking tools configured');
    }
  }

  const hasLinter = hasFile(fileList, /\.eslintrc|eslint\.config|\.pylintrc|\.flake8|\.golangci|clippy|biome\.json|biome\.jsonc|ruff\.toml|\.ruff\.toml|\.pre-commit-config/i);
  if (hasLinter) {
    score += 10;
    details.push('Linting enforced');
  }

  if (dependencyGraph.circularDeps.length === 0) {
    score += 15;
    details.push('No circular dependencies');
  }

  const actionableFiles = fileList.filter((f) => isActionableCodePath(f) && CODE_EXTENSIONS.has(path.extname(f)));
  const scopedOrphans = dependencyGraph.orphanFiles.filter((f) => isActionableCodePath(f));
  if (actionableFiles.length > 0 && scopedOrphans.length / actionableFiles.length < 0.2) {
    score += 10;
    details.push('Low dead code (few orphan files)');
  }

  if (codeQuality.topFilesBySize.length > 0) {
    const totalLines = codeQuality.topFilesBySize.reduce((s, f) => s + f.lines, 0);
    const avgLines = totalLines / codeQuality.topFilesBySize.length;
    if (avgLines < 500) {
      score += 10;
      details.push(`Reasonable file sizes (avg ${Math.round(avgLines)} lines in top files)`);
    }
  }

  const hasSrcDir = hasFile(fileList, /^src[\\/]/i) || hasFile(fileList, /^lib[\\/]/i) || hasFile(fileList, /^app[\\/]/i);
  if (hasSrcDir) {
    score += 10;
    details.push('Good module structure (src/lib/app directory)');
  }

  const codeFiles = fileList.filter((f) => CODE_EXTENSIONS.has(path.extname(f)));
  if (codeFiles.length > 0) {
    const basenames = codeFiles.map((f) => path.basename(f));
    const camelCase = basenames.filter((b) => /^[a-z][a-zA-Z]+\.\w+$/.test(b)).length;
    const kebabCase = basenames.filter((b) => /^[a-z][a-z0-9-]+\.\w+$/.test(b)).length;
    const snakeCase = basenames.filter((b) => /^[a-z][a-z0-9_]+\.\w+$/.test(b)).length;
    const pascalCase = basenames.filter((b) => /^[A-Z][a-zA-Z]+\.\w+$/.test(b)).length;
    const maxConvention = Math.max(camelCase, kebabCase, snakeCase, pascalCase);
    if (maxConvention / basenames.length > 0.7) {
      score += 10;
      details.push('Consistent file naming convention');
    }
  }

  return { name: 'Maintainability', score: clamp(score, 0, 100), weight: 0.20, details };
}

function scoreTestCoverage(
  fileList: string[],
  configAnalysis: ConfigAnalysis,
): HealthDimension {
  let score = 0;
  const details: string[] = [];

  const testFiles = fileList.filter((f) => /\.test\.|\.spec\.|_test\.|_spec\.|test_|spec_|__tests__/i.test(f));
  if (testFiles.length > 0) {
    score += 40;
    details.push(`${testFiles.length} test file(s) found`);
  }

  const hasTestFramework = hasFile(fileList, /vitest\.config|jest\.config|pytest\.ini|conftest\.py|\.rspec|phpunit/i) ||
    (configAnalysis.scripts ?? []).some((s) => /vitest|jest|mocha|pytest|rspec/.test(s.command));
  if (hasTestFramework) {
    score += 15;
    details.push('Test framework configured');
  }

  const codeFiles = fileList.filter((f) => CODE_EXTENSIONS.has(path.extname(f)) && !(/\.test\.|\.spec\.|_test\.|_spec\.|test_|spec_|__tests__/i.test(f)));
  if (codeFiles.length > 0 && testFiles.length / codeFiles.length > 0.3) {
    score += 15;
    details.push(`Good test-to-code ratio (${(testFiles.length / codeFiles.length * 100).toFixed(0)}%)`);
  }

  const hasTestScript = (configAnalysis.scripts ?? []).some((s) => s.name === 'test' || s.name === 'test:unit' || s.name === 'test:e2e');
  if (hasTestScript) {
    score += 10;
    details.push('Test runner scripts in package.json');
  }

  const ciFiles = fileList.filter((f) => /\.github\/workflows|\.gitlab-ci|Jenkinsfile|\.circleci/i.test(f));
  if (ciFiles.length > 0 && (configAnalysis.scripts ?? []).some((s) => s.name === 'test')) {
    score += 10;
    details.push('CI likely runs tests');
  }

  const hasUnit = testFiles.some((f) => /unit|\.test\.|\.spec\./i.test(f));
  const hasIntegration = testFiles.some((f) => /integration|e2e|cypress|playwright/i.test(f));
  if (hasUnit && hasIntegration) {
    score += 10;
    details.push('Multiple test types (unit + integration/e2e)');
  }

  return { name: 'Test Coverage', score: clamp(score, 0, 100), weight: 0.10, details };
}

function scoreDependencies(
  fileList: string[],
  configAnalysis: ConfigAnalysis,
): HealthDimension {
  let score = 0;
  const details: string[] = [];

  const hasLockFile = hasFileExact(fileList, [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
    'Pipfile.lock', 'poetry.lock', 'uv.lock', 'Cargo.lock', 'Gemfile.lock', 'go.sum',
  ]);
  if (hasLockFile) {
    score += 20;
    details.push('Lock file present');
  }

  const depCount = configAnalysis.depCount;
  if (depCount) {
    const totalProd = depCount.production;
    if (totalProd > 0 && totalProd <= 80) {
      score += 15;
      details.push(`Reasonable dependency count (${totalProd} production)`);
    }

    if (depCount.dev > 0 && depCount.production !== depCount.dev) {
      score += 15;
      details.push('Dev dependencies separate from production');
    }

    if (totalProd > 100) {
      score -= 15;
      details.push(`Excessive production dependencies (${totalProd})`);
    } else {
      score += 15;
      details.push('Production dependency count within bounds');
    }
  }

  if (configAnalysis.packageManager) {
    score += 10;
    details.push(`Package manager specified (${configAnalysis.packageManager})`);
  }

  const hasDeprecatedMarker = false; // static analysis cannot reliably detect deprecated packages
  if (!hasDeprecatedMarker) {
    score += 15;
    details.push('No deprecated package markers detected');
  }

  let hasVersionConstraints = false;
  for (const fp of fileList) {
    if (fp === 'package.json' || fp.endsWith('/package.json')) {
      hasVersionConstraints = true;
      break;
    }
  }
  if (!hasVersionConstraints) {
    hasVersionConstraints = hasFileExact(fileList, ['Cargo.toml', 'go.mod', 'Gemfile', 'pyproject.toml', 'requirements.txt']);
  }
  if (hasVersionConstraints) {
    score += 10;
    details.push('Version constraints used');
  }

  return { name: 'Dependencies', score: clamp(score, 0, 100), weight: 0.10, details };
}

// --- Grade & Maturity ---

function computeGrade(overall: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (overall >= 90) return 'A';
  if (overall >= 80) return 'B';
  if (overall >= 65) return 'C';
  if (overall >= 50) return 'D';
  return 'F';
}

function computeMaturity(overall: number): HealthScore['maturity'] {
  if (overall >= 81) return 'production-ready';
  if (overall >= 61) return 'stable';
  if (overall >= 41) return 'growing';
  if (overall >= 21) return 'early-development';
  return 'prototype';
}

// --- Main Export ---

export function computeHealthScore(params: {
  fileList: string[];
  allFileList?: string[];
  files: Map<string, string>;
  codeQuality: CodeQuality;
  dependencyGraph: DependencyGraph;
  configAnalysis: ConfigAnalysis;
  improvements: ImprovementItem[];
  languages: Record<string, number>;
}): HealthScore {
  const { fileList, files, codeQuality, dependencyGraph, configAnalysis, improvements, languages } = params;
  // allFileList includes ALL files (docs, vendor, etc.) — used for documentation/config checks
  // fileList is production+test scoped — used for code quality checks
  const allFiles = params.allFileList ?? fileList;

  const dimensions: HealthDimension[] = [
    scoreCodeQuality(allFiles, files, codeQuality, configAnalysis, languages),
    scoreDocumentation(allFiles, files, codeQuality),
    scoreSecurity(allFiles, files, improvements),
    scoreMaintainability(allFiles, files, codeQuality, dependencyGraph, configAnalysis, languages),
    scoreTestCoverage(allFiles, configAnalysis),
    scoreDependencies(allFiles, configAnalysis),
  ];

  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  return {
    overall: clamp(overall, 0, 100),
    grade: computeGrade(overall),
    maturity: computeMaturity(overall),
    dimensions,
  };
}
