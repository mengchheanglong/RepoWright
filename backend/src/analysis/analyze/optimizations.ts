import type { CodeQuality, DeepAnalysis, DependencyGraph, ImprovementItem, OptimizationSuggestion } from '../../domain/index.js';
import type { HealthScore } from './health-score.js';

type PythonHotspotSignals = {
  score: number;
  reasons: string[];
};

function detectPythonHotspots(fileContents: Map<string, string>): PythonHotspotSignals {
  let score = 0;
  const reasons: string[] = [];
  let pyFiles = 0;
  let nestedLoopHits = 0;
  let heavyRegexCalls = 0;
  let heavySerializationLoops = 0;

  for (const [fp, content] of fileContents) {
    if (!fp.endsWith('.py')) continue;
    pyFiles++;

    if (/\b(?:numpy|pandas|torch|tensorflow|jax|scipy|sklearn|numba|cython)\b/i.test(content)) {
      score += 1;
      reasons.push('compute/ML libraries used');
    }

    nestedLoopHits += (content.match(/for\s+.+:\n(?:[ \t]{2,}.+\n){0,4}[ \t]+for\s+.+:/g) ?? []).length;
    heavyRegexCalls += (content.match(/re\.(findall|finditer|sub|search|match)\(/g) ?? []).length;

    const expensiveInsideLoop = /for\s+.+:\n(?:[ \t]{2,}.+\n){0,5}[ \t]+(?:json\.loads|json\.dumps|ast\.parse|yaml\.safe_load|pickle\.loads|re\.(?:findall|finditer|sub))\(/g;
    heavySerializationLoops += (content.match(expensiveInsideLoop) ?? []).length;
  }

  if (nestedLoopHits >= 1) {
    score += nestedLoopHits >= 3 ? 2 : 1;
    reasons.push(`${nestedLoopHits} nested-loop hotspot(s)`);
  }
  if (heavyRegexCalls >= 8) {
    score += 1;
    reasons.push(`${heavyRegexCalls} heavy regex call(s)`);
  }
  if (heavySerializationLoops >= 1) {
    score += heavySerializationLoops >= 4 ? 2 : 1;
    reasons.push(`${heavySerializationLoops} expensive parse/serialization call(s) inside loops`);
  }
  if (pyFiles >= 12) {
    score += 1;
    reasons.push(`${pyFiles} Python files in analysis scope`);
  }

  return { score, reasons: [...new Set(reasons)].slice(0, 3) };
}

export function generateOptimizations(
  languages: string[],
  frameworks: string[],
  patterns: string[],
  filePaths: string[],
  fileContents: Map<string, string>,
  _fileCount: number,
  cq: CodeQuality,
  depGraph: DependencyGraph,
  improvements?: ImprovementItem[],
  healthScore?: HealthScore,
): DeepAnalysis['optimizations'] {
  const simplification: OptimizationSuggestion[] = [];
  const alternativeStack: OptimizationSuggestion[] = [];
  const performance: OptimizationSuggestion[] = [];

  const sample = [...fileContents.values()].slice(0, 50).join('\n');
  const primaryLang = languages.find((l) => !['Markdown', 'JSON', 'YAML', 'TOML', 'HTML', 'CSS', 'SCSS', 'Less'].includes(l)) ?? '';
  const hasBenchmarks = filePaths.some((f) => /bench|benchmark|perf/i.test(f));
  const perfMentions = (sample.match(/performance|slow|latency|throughput|optimi[sz]e/gi) ?? []).length;
  const hasNativeInterop = /ffi|cffi|pyo3|maturin|napi|neon|wasm|wasm-bindgen/i.test(sample);
  const pythonHotspots = detectPythonHotspots(fileContents);
  const hasCircularDeps = depGraph.circularDeps.length > 0;
  const grade = healthScore?.grade ?? 'C';

  // ── Simplification ──────────────────────────────────────────────────

  // Orphan files — with specific file list
  if (depGraph.orphanFiles.length > 3) {
    const topOrphans = depGraph.orphanFiles.slice(0, 3).join(', ');
    simplification.push({
      strategy: `Remove ${depGraph.orphanFiles.length} potentially dead files`,
      description: `Not imported by any other module: ${topOrphans}${depGraph.orphanFiles.length > 3 ? ` and ${depGraph.orphanFiles.length - 3} more` : ''}. Verify they are unused before removing.`,
      impact: 'medium',
      effort: 'low',
    });
  }

  // Large files — with specific targets
  if (cq.largeFiles.length > 0) {
    const top = cq.largeFiles[0]!;
    const topFiles = cq.largeFiles.slice(0, 3).map((f) => `${f.path} (${f.lines})`).join(', ');
    simplification.push({
      strategy: `Split ${cq.largeFiles.length} oversized file(s)`,
      description: `Largest: ${topFiles}. Extract cohesive helper modules — aim for <300 lines per file.`,
      impact: top.lines > 1000 ? 'high' : 'medium',
      effort: cq.largeFiles.length > 5 ? 'high' : 'medium',
    });
  }

  // Circular dependencies — specific cycle-breaking suggestions
  if (hasCircularDeps) {
    const shortestCycle = depGraph.circularDeps.reduce((a, b) => a.length <= b.length ? a : b);
    simplification.push({
      strategy: `Break ${depGraph.circularDeps.length} circular dependency chain(s)`,
      description: `Example: ${shortestCycle.join(' -> ')}. Extract shared types/interfaces into a common module that both sides import.`,
      impact: 'high',
      effort: depGraph.circularDeps.length > 3 ? 'high' : 'medium',
    });
  }

  // Central module coupling — with specific module data
  if (depGraph.centralModules.length > 0) {
    const top = depGraph.centralModules[0]!;
    if (top.importedByCount > 20) {
      const pct = cq.totalFunctions > 0 ? Math.round((top.importedByCount / filePaths.length) * 100) : 0;
      simplification.push({
        strategy: `Reduce coupling to ${top.file}`,
        description: `Imported by ${top.importedByCount} modules (${pct}% of codebase). Consider splitting into focused sub-modules or using dependency injection to reduce blast radius of changes.`,
        impact: 'high',
        effort: 'medium',
      });
    }
  }

  // Framework-specific simplification
  if (frameworks.includes('Express') && !frameworks.includes('NestJS') && filePaths.filter((f) => /server|api|route/i.test(f)).length >= 3) {
    simplification.push({ strategy: 'Evaluate lighter HTTP runtime', description: 'Express is used across several server/API modules. Consider Fastify or Hono for better performance with similar API.', impact: 'medium', effort: 'medium' });
  }

  const reactFiles = filePaths.filter((f) => f.endsWith('.jsx') || f.endsWith('.tsx'));
  const reactJsFiles = [...fileContents.entries()].filter(([fp, content]) =>
    fp.endsWith('.js') && /React\.|createElement\(|ReactDOM|useState|useEffect/i.test(content),
  ).length;
  const totalReactFiles = reactFiles.length + reactJsFiles;
  if (frameworks.includes('React') && totalReactFiles <= 3 && totalReactFiles > 0) {
    simplification.push({ strategy: 'Replace React with Preact or vanilla JS', description: `Only ${totalReactFiles} component file(s) found. Preact (3KB) or vanilla JS would cut bundle size significantly.`, impact: 'medium', effort: 'medium' });
  }

  // ── Alternative Stack ───────────────────────────────────────────────

  if (primaryLang === 'TypeScript' || primaryLang === 'JavaScript') {
    if (perfMentions > 0 || hasBenchmarks) {
      alternativeStack.push({ strategy: 'Evaluate Bun runtime compatibility', description: 'Performance signals were found. Run benchmark parity tests before considering a Node.js runtime swap.', impact: 'medium', effort: 'medium' });
    }
    if ((cq.totalCodeLines > 2000 && perfMentions > 0) || hasBenchmarks) {
      alternativeStack.push({ strategy: 'Isolate hot paths into compiled service/module', description: 'Repo size and performance signals suggest a few hotspots may benefit from a compiled language path (Go/Rust) while keeping existing orchestration.', impact: 'high', effort: 'high' });
    }
  }

  if (primaryLang === 'Python') {
    const hasStrongPythonEvidence = hasNativeInterop || pythonHotspots.score >= 3 || (pythonHotspots.score >= 2 && (hasBenchmarks || perfMentions > 1));
    if (hasStrongPythonEvidence) {
      const reasonText = pythonHotspots.reasons.length > 0 ? ` Evidence: ${pythonHotspots.reasons.join('; ')}.` : '';
      alternativeStack.push({ strategy: 'Evaluate native acceleration path for hotspots', description: `Python project shows concrete compute/performance signals. Consider PyO3/C extensions only for measured bottlenecks.${reasonText}`, impact: 'medium', effort: 'medium' });
    }
    if (sample.includes('flask') || sample.includes('Flask')) {
      alternativeStack.push({ strategy: 'Migrate Flask to FastAPI', description: 'FastAPI provides async support, automatic OpenAPI docs, and Pydantic validation with similar routing API.', impact: 'medium', effort: 'medium' });
    }
  }

  if (primaryLang === 'Go' && cq.totalCodeLines > 3000 && (hasBenchmarks || perfMentions > 0)) {
    alternativeStack.push({ strategy: 'Extract hot paths to Rust via CGO/FFI', description: 'For CPU-intensive tasks like parsing or crypto, Rust via CGO can provide 2-5x speedup over pure Go.', impact: 'medium', effort: 'high' });
  }

  if (primaryLang === 'Ruby' && (hasBenchmarks || perfMentions > 0)) {
    alternativeStack.push({ strategy: 'Consider Crystal or Go for performance-critical services', description: 'Crystal has Ruby-like syntax but compiles to native code. Go provides similar simplicity with better concurrency.', impact: 'high', effort: 'high' });
  }

  if (primaryLang === 'Java' && (hasBenchmarks || perfMentions > 0)) {
    alternativeStack.push({ strategy: 'Consider Kotlin or GraalVM native-image', description: 'Kotlin reduces boilerplate while remaining fully interop. GraalVM native-image eliminates JVM startup cost.', impact: 'medium', effort: 'medium' });
  }

  // ── Performance ─────────────────────────────────────────────────────

  // Sync fs calls
  if (sample.includes('readFileSync') || sample.includes('readdirSync')) {
    const syncCount = (sample.match(/readFileSync|readdirSync|writeFileSync|existsSync/g) ?? []).length;
    performance.push({ strategy: 'Replace sync fs calls with async', description: `Found ~${syncCount} sync filesystem calls. Switch to fs.promises for parallel I/O.`, impact: 'high', effort: 'medium' });
  }

  // Long functions impeding optimization
  if (cq.totalFunctions > 100 && cq.avgFunctionLength > 25) {
    performance.push({ strategy: 'Refactor long functions', description: `${cq.totalFunctions} functions averaging ${cq.avgFunctionLength} lines. Shorter functions are easier to test, maintain, and optimize.`, impact: 'medium', effort: 'medium' });
  }

  // Central module lazy-loading — with specific module
  if (depGraph.centralModules.length > 0 && (depGraph.centralModules[0]?.importedByCount ?? 0) > 10) {
    const central = depGraph.centralModules[0]!;
    performance.push({ strategy: `Lazy-load ${central.file}`, description: `Imported by ${central.importedByCount} modules. Lazy-loading or splitting this module reduces startup time and change blast radius.`, impact: 'medium', effort: 'low' });
  }

  // React code splitting
  if (frameworks.includes('React') && totalReactFiles > 5) {
    performance.push({ strategy: 'Add React code splitting', description: `${totalReactFiles} component files found. Use React.lazy + Suspense for route-level code splitting.`, impact: 'medium', effort: 'low' });
  }

  // Pattern-specific performance suggestions
  if (patterns.includes('REST API') && cq.totalCodeLines > 1000) {
    const hasNoCache = !sample.includes('cache') && !sample.includes('Cache') && !sample.includes('redis') && !sample.includes('Redis');
    if (hasNoCache) {
      performance.push({ strategy: 'Add response caching to REST API', description: 'REST API pattern detected but no caching layer found. Consider Redis or in-memory caching for frequently accessed endpoints.', impact: 'high', effort: 'medium' });
    }
  }

  if (patterns.includes('Event-Driven') && depGraph.internalImportCount > 200) {
    performance.push({ strategy: 'Audit event handler performance', description: `Event-driven architecture with ${depGraph.internalImportCount} internal imports. Profile event handlers for blocking operations — async handlers prevent event loop starvation.`, impact: 'medium', effort: 'low' });
  }

  // Health-grade-based prioritization suggestions
  if (grade === 'F' || grade === 'D') {
    const highPriority = (improvements ?? []).filter((i) => i.priority === 'high');
    if (highPriority.length > 0) {
      const areas = [...new Set(highPriority.map((i) => i.area))].slice(0, 3).join(', ');
      performance.push({
        strategy: 'Prioritize foundational health improvements',
        description: `Health grade ${grade} with ${highPriority.length} high-priority issue(s) in: ${areas}. Address these before pursuing performance optimizations — they compound maintenance cost.`,
        impact: 'high',
        effort: 'medium',
      });
    }
  }

  // Empty catch blocks — if many, suggest centralized error handling
  if (cq.emptyCatchCount > 20) {
    performance.push({
      strategy: 'Centralize error handling',
      description: `${cq.emptyCatchCount} suppressed exception handlers detected. Implement a centralized error handler or logging middleware to catch errors consistently instead of silently swallowing them.`,
      impact: 'high',
      effort: 'medium',
    });
  }

  return { simplification, alternativeStack, performance };
}
