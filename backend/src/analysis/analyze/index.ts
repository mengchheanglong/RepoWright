import fs from 'node:fs';
import path from 'node:path';
import type {
  AnalysisReport,
  CodeQuality,
  ConfigAnalysis,
  DeepAnalysis,
  DependencyGraph,
  Source,
} from '../../domain/index.js';
import type { OperatorConfig } from '../../core/config.js';
import { collectFiles } from '../../utils/fs.js';
import { generateId, now } from '../../utils/id.js';
import { getLogger } from '../../utils/logger.js';
import {
  buildTechStack,
  classifyProject,
  classifyText,
  CODE_EXTENSIONS,
  computeComplexity,
  detectFrameworks,
  detectLanguages,
  detectPatterns,
  extractTextInsights,
  LANGUAGE_MAP,
} from './core.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { analyzeConfigs } from './config-analysis.js';
import { computeAllFileMetrics, computeFileMetrics, aggregateCodeQuality } from './metrics.js';
import { detectUsefulComponents } from './components.js';
import { detectImprovements } from './improvements.js';
import { detectUniqueness } from './uniqueness.js';
import { generateOptimizations } from './optimizations.js';
import { scanSecurity } from './security.js';
import { computeHealthScore } from './health-score.js';
import { fmtSize, readJsonSafe, readTextSafe } from './io.js';
import { classifyPathScope, isActionableCodePath, summarizePathScopes } from './scoping.js';

export function analyzeSource(source: Source, config: OperatorConfig): AnalysisReport {
  const logger = getLogger();
  logger.info(`Analyzing source: ${source.name} (${source.type})`);

  if (source.type === 'text-brief') return analyzeTextBrief(source);
  if (source.type === 'directory' || source.type === 'git-url') return analyzeDirectory(source, config);
  if (source.type === 'file') return analyzeFile(source);
  return analyzeTextBrief(source);
}

function analyzeTextBrief(source: Source): AnalysisReport {
  const brief = (source.metadata?.brief as string) ?? source.name;
  const wordCount = brief.split(/\s+/).length;
  const classification = classifyText(brief);
  const insights = extractTextInsights(brief);

  const urls = brief.match(/https?:\/\/\S+/g) ?? [];
  const codeRefs = brief.match(/`[^`]+`/g) ?? [];
  const techMentions = brief.match(/\b(?:React|Vue|Angular|Django|Flask|Express|Go|Rust|Python|TypeScript|JavaScript|Java|Node\.js|Docker|Kubernetes|AWS|GCP|Azure|SQL|NoSQL|MongoDB|PostgreSQL|Redis|GraphQL|REST|API|CLI|gRPC|WebSocket)\b/gi) ?? [];

  if (urls.length > 0) insights.push(`References ${urls.length} URL(s): ${urls.slice(0, 2).join(', ')}`);
  if (codeRefs.length > 0) insights.push(`Contains ${codeRefs.length} code reference(s)`);
  if (techMentions.length > 0) {
    const unique = [...new Set(techMentions.map((t) => t.toLowerCase()))];
    insights.push(`Technologies mentioned: ${unique.join(', ')}`);
  }

  const sentences = brief.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);
  const hasQuestions = sentences.some((s) => s.trim().endsWith('?') || /^(how|what|why|when|where|can|should|would|is)\b/i.test(s.trim()));
  const hasBullets = /^\s*[-*�]\s/m.test(brief);
  const hasNumberedList = /^\s*\d+[.)]\s/m.test(brief);

  if (hasQuestions) insights.push('Contains question(s) � likely seeking guidance or investigation');
  if (hasBullets || hasNumberedList) insights.push('Structured with lists � likely a requirements or task specification');

  return {
    id: generateId('anl'),
    sourceId: source.id,
    summary: `Text brief with ${wordCount} words. ${brief.slice(0, 200)}`,
    classification,
    complexity: Math.min(wordCount / 50, 5),
    risk: 2,
    confidence: Math.min(0.4 + wordCount / 200, 0.7),
    languages: techMentions.length > 0 ? [...new Set(techMentions.map((t) => t))] : undefined,
    insights,
    createdAt: now(),
  };
}

function analyzeFile(source: Source): AnalysisReport {
  const ext = source.name.split('.').pop() ?? '';
  const lang = LANGUAGE_MAP[`.${ext}`] ?? ext;
  let content = '';
  try {
    content = fs.readFileSync(source.location, 'utf-8');
  } catch {
    // ignore read errors and continue with empty content
  }

  const lines = content.length > 0 ? content.split('\n').length : 0;
  const words = content.length > 0 ? content.split(/\s+/).filter(Boolean).length : 0;
  const isNote = ext.toLowerCase() === 'md' || ext.toLowerCase() === 'txt';
  const isCode = CODE_EXTENSIONS.has(`.${ext.toLowerCase()}`);

  const insights: string[] = [];
  let deepAnalysis: DeepAnalysis | undefined;

  if (isCode && content.length > 0) {
    const relPath = source.name;
    const fileContents = new Map<string, string>([[relPath, content]]);
    const metrics = computeFileMetrics(relPath, content);
    const codeQuality = aggregateCodeQuality([metrics], fileContents);
    const depGraph = buildDependencyGraph(fileContents, path.dirname(source.location));

    insights.push(`${lang} file: ${metrics.codeLines} code lines, ${metrics.commentLines} comment lines, ${metrics.blankLines} blank`);
    insights.push(`${metrics.functions} function(s), max nesting depth: ${metrics.maxNesting}`);
    insights.push(`${metrics.imports} import(s), ${metrics.exports} export(s)`);
    if (codeQuality.anyTypeCount > 0) insights.push(`${codeQuality.anyTypeCount} uses of 'any' type`);
    if (codeQuality.emptyCatchCount > 0) insights.push(`${codeQuality.emptyCatchCount} empty catch block(s)`);
    if (codeQuality.todoCount > 0) insights.push(`${codeQuality.todoCount} TODO/FIXME comment(s)`);

    const frameworks: string[] = [];
    const patterns = detectPatterns([relPath], fileContents);
    const components = detectUsefulComponents([relPath], fileContents, frameworks, depGraph);

    deepAnalysis = {
      coreSystem: {
        summary: `Single ${lang} file "${source.name}" with ${metrics.codeLines} lines of code and ${metrics.functions} function(s).`,
        architecture: patterns.length > 0 ? patterns.join(', ') : 'Single file',
        entryPoints: [source.name],
        dataFlow: 'Single file scope',
        techStack: [lang],
        frameworks: [],
        patterns,
      },
      codeQuality,
      dependencyGraph: depGraph,
      usefulComponents: components,
      improvements: detectImprovements([relPath], fileContents, false, [], patterns, 1, codeQuality, depGraph, {}),
      uniqueness: { summary: `Single ${lang} file`, differentiators: [], novelApproaches: [] },
      optimizations: { simplification: [], alternativeStack: [], performance: [] },
    };
  } else if (isNote) {
    insights.push(`Research note (${ext}): ${words} words, ${lines} lines`);
    if (ext.toLowerCase() === 'md') {
      const headings = content.match(/^#{1,3}\s+.+$/gm) ?? [];
      if (headings.length > 0) {
        insights.push(`Structure: ${headings.length} section(s)`);
        for (const h of headings.slice(0, 5)) {
          insights.push(`  ${h.trim()}`);
        }
      }
    }
  } else {
    insights.push(`File: ${source.name} (${lines} lines)`);
  }

  const classification = isCode ? (lines > 200 ? 'extract-skill' : 'learn') : 'learn';

  return {
    id: generateId('anl'),
    sourceId: source.id,
    summary: isNote
      ? `Research note "${source.name}" (${words} words, ${lines} lines).`
      : `File "${source.name}" (${lang}, ${lines} lines)`,
    classification,
    complexity: Math.min(Math.max(lines, words / 2) / 100, 7),
    risk: 1,
    confidence: isCode ? 0.75 : (isNote ? 0.7 : 0.6),
    fileCount: 1,
    languages: lang ? [lang] : [],
    insights,
    deepAnalysis,
    createdAt: now(),
  };
}

function analyzeDirectory(source: Source, config: OperatorConfig): AnalysisReport {
  const files = collectFiles(source.location, config.maxFileAnalysisCount, config.maxFileSizeBytes);
  const productionFiles = files.filter((f) => isActionableCodePath(f.path));
  const languages = detectLanguages(productionFiles.map((f) => f.extension));
  const languageMap: Record<string, number> = {};
  for (const f of productionFiles) {
    const lang = LANGUAGE_MAP[f.extension];
    if (lang) languageMap[lang] = (languageMap[lang] ?? 0) + 1;
  }
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const codeFiles = files.filter((f) => CODE_EXTENSIONS.has(f.extension));
  const actionableCodeFiles = codeFiles.filter((f) => isActionableCodePath(f.path));
  const deepCodeFiles = config.maxDeepCodeFileCount > 0
    ? codeFiles.slice(0, config.maxDeepCodeFileCount)
    : codeFiles;

  const fileContents = new Map<string, string>();
  for (const f of deepCodeFiles) {
    try {
      fileContents.set(f.path, fs.readFileSync(path.join(source.location, f.path), 'utf-8'));
    } catch {
      // ignore file read errors in best-effort analysis
    }
  }

  const packageJson = readJsonSafe(path.join(source.location, 'package.json'));
  const tsconfigJson = readJsonSafe(path.join(source.location, 'tsconfig.json'));
  const pyprojectToml = readTextSafe(path.join(source.location, 'pyproject.toml'));
  const goMod = readTextSafe(path.join(source.location, 'go.mod'));
  const cargoToml = readTextSafe(path.join(source.location, 'Cargo.toml'));
  const gemfile = readTextSafe(path.join(source.location, 'Gemfile'));
  const requirementsTxt = readTextSafe(path.join(source.location, 'requirements.txt'))
    ?? readTextSafe(path.join(source.location, 'requirements-dev.txt'));
  const setupPy = readTextSafe(path.join(source.location, 'setup.py'));

  const nestedPkgs: Record<string, unknown>[] = [];
  for (const f of files) {
    if (f.path.endsWith('package.json') && f.path !== 'package.json' && !f.path.includes('node_modules')) {
      const nested = readJsonSafe(path.join(source.location, f.path));
      if (nested) nestedPkgs.push(nested);
    }
  }

  const filePaths = files.map((f) => f.path);
  const productionPaths = filePaths.filter((fp) => {
    const scope = classifyPathScope(fp);
    return scope === 'production' || scope === 'test';
  });
  const productionFileContents = new Map<string, string>();
  for (const [fp, content] of fileContents) {
    const scope = classifyPathScope(fp);
    if (scope === 'production' || scope === 'test') {
      productionFileContents.set(fp, content);
    }
  }
  const scopeStats = summarizePathScopes(filePaths);
  const hasTests = files.some((f) => f.path.includes('test') || f.path.includes('spec') || f.path.includes('__tests__'));
  const hasSrc = files.some((f) => f.path.startsWith('src/') || f.path.startsWith('src\\'));

  const frameworks = detectFrameworks(filePaths, packageJson, nestedPkgs, pyprojectToml, goMod, cargoToml, gemfile, requirementsTxt, setupPy);
  const patterns = detectPatterns(productionPaths, productionFileContents);
  const techStack = buildTechStack(languages, frameworks, packageJson, filePaths);

  const allFileMetrics = computeAllFileMetrics(fileContents);
  const codeQuality = aggregateCodeQuality(allFileMetrics, fileContents);
  const depGraph = buildDependencyGraph(productionFileContents, source.location);
  const configAnalysis = analyzeConfigs(tsconfigJson, packageJson, pyprojectToml, goMod, cargoToml, gemfile, requirementsTxt);

  const complexity = computeComplexity(
    files.length,
    languages.length,
    totalSize,
    codeQuality.totalFunctions,
    codeQuality.maxNestingDepth,
    depGraph.circularDeps.length,
  );

  const classification = classifyProject(files, languages, hasTests);

  const deepAnalysis = buildDeepAnalysis(
    source,
    productionPaths,
    productionFileContents,
    filePaths,
    languages,
    languageMap,
    frameworks,
    patterns,
    techStack,
    packageJson,
    files.length,
    totalSize,
    hasTests,
    hasSrc,
    codeQuality,
    depGraph,
    configAnalysis,
  );

  const analyzedCodeCoverage = codeFiles.length > 0 ? fileContents.size / codeFiles.length : 0;
  const analyzedActionableCodeCoverage = actionableCodeFiles.length > 0
    ? [...fileContents.keys()].filter((fp) => isActionableCodePath(fp)).length / actionableCodeFiles.length
    : 0;
  const highPriorityFindings = deepAnalysis.improvements.filter((i) => i.priority === 'high').length;
  const reliability = calculateReliabilityScores(
    files.length,
    actionableCodeFiles.length,
    analyzedCodeCoverage,
    analyzedActionableCodeCoverage,
    scopeStats,
    highPriorityFindings,
  );

  const insights: string[] = [];
  insights.push(`${files.length} files analyzed (${fmtSize(totalSize)} total)`);
  insights.push(`Scope breakdown: ${scopeStats.production} production, ${scopeStats.test} test, ${scopeStats.vendor + scopeStats.generated + scopeStats.build} vendor/generated/build, ${scopeStats.docs} docs`);
  const langsByCount = [...languages].sort((a, b) => (languageMap[b] ?? 0) - (languageMap[a] ?? 0));
  insights.push(`Languages: ${langsByCount.join(', ') || 'none detected'}`);
  if (techStack.includes('Node.js')) insights.push('Node.js runtime detected');
  if (frameworks.length > 0) insights.push(`Frameworks: ${frameworks.join(', ')}`);
  if (patterns.length > 0) insights.push(`Patterns: ${patterns.join(', ')}`);
  insights.push(`${codeQuality.totalFunctions} functions across ${codeQuality.totalCodeLines} code lines`);
  if (codeQuality.commentRatio > 0) insights.push(`Comment ratio: ${(codeQuality.commentRatio * 100).toFixed(1)}%`);
  if (depGraph.circularDeps.length > 0) insights.push(`${depGraph.circularDeps.length} circular dependency chain(s) detected`);
  if (depGraph.centralModules.length > 0) insights.push(`Most imported: ${depGraph.centralModules[0]?.file ?? ''} (${depGraph.centralModules[0]?.importedByCount ?? 0} dependents)`);
  if (hasTests) insights.push('Has test files');
  if (deepAnalysis.security) {
    const sec = deepAnalysis.security;
    insights.push(`Security score: ${sec.score}/100 (${sec.secretsDetected} secret(s), ${sec.vulnerabilityPatterns} vulnerability pattern(s))`);
    if (sec.summary.critical > 0) insights.push(`CRITICAL: ${sec.summary.critical} critical security finding(s)`);
  }
  if (deepAnalysis.healthScore) {
    const hs = deepAnalysis.healthScore;
    insights.push(`Health: ${hs.overall}/100 (grade ${hs.grade}, maturity: ${hs.maturity})`);
  }
  insights.push(`Analysis coverage: ${(analyzedCodeCoverage * 100).toFixed(0)}% of code files, ${(analyzedActionableCodeCoverage * 100).toFixed(0)}% of production-scoped code files`);
  insights.push(`Reliability (dynamic): architecture ${reliability.architecture.toFixed(1)}/10, pattern/risk ${reliability.patternRisk.toFixed(1)}/10, security ${reliability.security.toFixed(1)}/10, decision ${reliability.decision.toFixed(1)}/10`);

  return {
    id: generateId('anl'),
    sourceId: source.id,
    summary: `${source.type === 'git-url' ? 'Repository' : 'Directory'} "${source.name}" - ${files.length} files, ${langsByCount.length} language(s) (${langsByCount.slice(0, 3).join(', ')}). ${codeQuality.totalFunctions} functions, ${codeQuality.totalCodeLines} LOC.`,
    classification,
    complexity,
    risk: Math.min(
      complexity * 0.55 +
      depGraph.circularDeps.length * 0.4 +
      highPriorityFindings * 0.35 +
      (1 - analyzedActionableCodeCoverage) * 1.2,
      10,
    ),
    confidence: calculateAnalysisConfidence(files.length, actionableCodeFiles.length, analyzedCodeCoverage, analyzedActionableCodeCoverage),
    fileCount: files.length,
    languages: langsByCount,
    insights,
    deepAnalysis,
    createdAt: now(),
  };
}

function buildDeepAnalysis(
  source: Source,
  filePaths: string[],
  fileContents: Map<string, string>,
  allFilePaths: string[],
  languages: string[],
  languageMap: Record<string, number>,
  frameworks: string[],
  patterns: string[],
  techStack: string[],
  packageJson: Record<string, unknown> | null,
  fileCount: number,
  totalSize: number,
  hasTests: boolean,
  hasSrc: boolean,
  codeQuality: CodeQuality,
  depGraph: DependencyGraph,
  configAnalysis: ConfigAnalysis,
): DeepAnalysis {
  const improvements = detectImprovements(filePaths, fileContents, hasTests, frameworks, patterns, fileCount, codeQuality, depGraph, configAnalysis);
  const security = scanSecurity(fileContents, filePaths);
  const healthScore = computeHealthScore({
    fileList: filePaths,
    allFileList: allFilePaths,
    files: fileContents,
    codeQuality,
    dependencyGraph: depGraph,
    configAnalysis,
    improvements,
    languages: languageMap,
  });

  return {
    coreSystem: {
      summary: buildCoreSummary(source, languages, languageMap, frameworks, fileCount, totalSize, codeQuality),
      architecture: inferArchitecture(filePaths, patterns, hasSrc, fileCount),
      entryPoints: detectEntryPoints(filePaths, fileContents, packageJson),
      dataFlow: inferDataFlow(fileContents, patterns, depGraph),
      techStack,
      frameworks,
      patterns,
    },
    codeQuality,
    dependencyGraph: depGraph,
    configAnalysis,
    usefulComponents: detectUsefulComponents(filePaths, fileContents, frameworks, depGraph),
    improvements,
    uniqueness: detectUniqueness(filePaths, fileContents, frameworks, patterns, languages, codeQuality, depGraph),
    optimizations: generateOptimizations(languages, frameworks, filePaths, fileContents, fileCount, codeQuality, depGraph),
    security,
    healthScore,
  };
}

function buildCoreSummary(
  source: Source,
  languages: string[],
  languageMap: Record<string, number>,
  frameworks: string[],
  fileCount: number,
  totalSize: number,
  cq: CodeQuality,
): string {
  // Determine primary language by file count, not alphabetical order
  const primaryLang = (() => {
    const entries = Object.entries(languageMap).filter(([l]) => !['Markdown', 'JSON', 'YAML', 'TOML', 'HTML', 'CSS', 'SCSS', 'Less'].includes(l));
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? languages[0] ?? 'Unknown';
  })();
  const fwStr = frameworks.length > 0 ? ` built with ${frameworks.slice(0, 3).join(', ')}` : '';
  return `A ${primaryLang}-based project${fwStr} containing ${fileCount} files (${fmtSize(totalSize)}), ${cq.totalFunctions} functions across ${cq.totalCodeLines} lines of code. Comment coverage: ${(cq.commentRatio * 100).toFixed(1)}%. Source: "${source.name}".`;
}

function calculateAnalysisConfidence(
  totalFiles: number,
  actionableCodeFiles: number,
  analyzedCodeCoverage: number,
  analyzedActionableCoverage: number,
): number {
  if (totalFiles === 0) return 0.3;

  const base = 0.35;
  const sizeSignal = Math.min(totalFiles / 120, 0.15);
  const codeSignal = Math.min(actionableCodeFiles / 80, 0.1);
  const coverageSignal = Math.min(analyzedCodeCoverage * 0.2, 0.2);
  const actionableCoverageSignal = Math.min(analyzedActionableCoverage * 0.35, 0.35);
  const score = base + sizeSignal + codeSignal + coverageSignal + actionableCoverageSignal;
  return Math.min(Math.max(score, 0.25), 0.95);
}

function calculateReliabilityScores(
  totalFiles: number,
  actionableCodeFiles: number,
  analyzedCodeCoverage: number,
  analyzedActionableCoverage: number,
  scopeStats: ReturnType<typeof summarizePathScopes>,
  highPriorityFindings: number,
): { architecture: number; patternRisk: number; security: number; decision: number } {
  const architecture = Math.min(10, 4 + analyzedCodeCoverage * 3 + analyzedActionableCoverage * 2 + Math.min(totalFiles / 400, 1));

  const productionWeight = actionableCodeFiles / Math.max(totalFiles, 1);
  const patternRisk = Math.min(10, 3.5 + analyzedActionableCoverage * 3 + productionWeight * 1.5 - Math.min(scopeStats.generated / Math.max(totalFiles, 1), 0.8));

  const noiseRatio = (scopeStats.test + scopeStats.generated + scopeStats.vendor + scopeStats.docs) / Math.max(totalFiles, 1);
  const findingPenalty = Math.min(highPriorityFindings * 0.08, 0.7);
  const security = Math.min(10, Math.max(2.5, 6.5 + analyzedActionableCoverage * 1.5 - noiseRatio * 2.2 - findingPenalty));

  const decision = Math.min(10, architecture * 0.35 + patternRisk * 0.35 + security * 0.3);
  return { architecture, patternRisk, security, decision };
}

function detectEntryPoints(
  filePaths: string[],
  fileContents: Map<string, string>,
  packageJson: Record<string, unknown> | null,
): string[] {
  const entries: string[] = [];

  if (packageJson) {
    if (typeof packageJson.main === 'string') entries.push(`package.json main: ${packageJson.main}`);
    if (typeof packageJson.bin === 'string') entries.push(`package.json bin: ${packageJson.bin}`);
    if (typeof packageJson.bin === 'object' && packageJson.bin !== null) {
      for (const [name, p] of Object.entries(packageJson.bin as Record<string, string>)) {
        entries.push(`bin "${name}": ${p}`);
      }
    }
    const scripts = packageJson.scripts as Record<string, string> | undefined;
    if (scripts?.start) entries.push(`npm start: ${scripts.start}`);
    if (scripts?.dev) entries.push(`npm dev: ${scripts.dev}`);
  }

  const entryFiles = [
    'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js',
    'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js', 'src/app.ts', 'src/app.js',
    'src/cli/index.ts', 'src/web/server.ts', 'manage.py', 'main.go', 'cmd/main.go', 'src/main.rs',
  ];
  for (const ep of entryFiles) {
    const normalized = ep.replace(/\//g, path.sep);
    if (filePaths.some((f) => f === ep || f === normalized)) entries.push(ep);
  }

  for (const [fp, content] of fileContents) {
    if (entries.length >= 10) break;
    // Skip test files as entry points — they're test runners, not real entry points
    if (/(?:^|\/)(?:tests?\/|test_|spec_|__tests__\/)/i.test(fp)) continue;
    if (content.includes('.listen(') && !entries.some((e) => e.includes(fp))) entries.push(`HTTP server: ${fp}`);
    if ((content.includes('program.parse') || content.includes('.command(')) && !entries.some((e) => e.includes(fp))) entries.push(`CLI entry: ${fp}`);
  }

  return [...new Set(entries)].slice(0, 10);
}

function inferDataFlow(
  fileContents: Map<string, string>,
  patterns: string[],
  depGraph: DependencyGraph,
): string {
  const flows: string[] = [];

  if (patterns.includes('REST API')) flows.push('HTTP request/response cycle');
  if (patterns.includes('GraphQL')) flows.push('GraphQL query/mutation resolution');
  if (patterns.includes('CLI Architecture')) flows.push('CLI command -> handler -> service');
  if (patterns.includes('Middleware Chain')) flows.push('Request -> middleware chain -> handler -> response');
  if (patterns.includes('Event-Driven')) flows.push('Event emitter/listener pub-sub');
  if (patterns.includes('Repository Pattern')) flows.push('Service -> Repository -> Database');

  const sample = [...fileContents.values()].slice(0, 50).join('\n');
  if (/sqlite|better-sqlite|sequelize|knex|typeorm|prisma|drizzle/i.test(sample)) flows.push('Application -> ORM/Query Builder -> Database');
  if (/mongoose|mongodb/i.test(sample)) flows.push('Application -> Mongoose -> MongoDB');
  if (/redis/i.test(sample)) flows.push('Cache layer via Redis');

  if (depGraph.centralModules.length >= 2) {
    const top2 = depGraph.centralModules.slice(0, 2).map((m) => m.file);
    flows.push(`Central modules: ${top2.join(', ')} (highest import count)`);
  }

  return flows.length > 0 ? flows.join(' | ') : 'Linear data processing pipeline';
}

function inferArchitecture(filePaths: string[], patterns: string[], hasSrc: boolean, fileCount: number): string {
  const traits: string[] = [];
  if (patterns.includes('Monorepo')) traits.push('Monorepo');
  if (filePaths.some((f) => f.includes('frontend')) && filePaths.some((f) => f.includes('backend'))) traits.push('Full-stack');
  if (patterns.includes('CLI Architecture')) traits.push('CLI application');
  if (patterns.includes('REST API')) traits.push('REST API');
  if (patterns.includes('GraphQL')) traits.push('GraphQL API');
  if (patterns.includes('Domain-Driven Design')) traits.push('Domain-driven');
  if (hasSrc) traits.push('Organized src/ layout');

  const dirs = new Set(filePaths.map((f) => path.dirname(f)));
  const maxDepth = Math.max(0, ...[...dirs].map((d) => d.split(/[\\/]/).length));
  if (maxDepth >= 5) traits.push('Deeply nested');
  if (fileCount > 100) traits.push('Large-scale');
  else if (fileCount > 30) traits.push('Medium-scale');
  else traits.push('Small/focused');

  return traits.join(', ') || 'Flat file structure';
}
