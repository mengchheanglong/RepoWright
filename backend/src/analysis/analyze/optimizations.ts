import type { CodeQuality, DeepAnalysis, DependencyGraph, OptimizationSuggestion } from '../../domain/index.js';

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
  filePaths: string[],
  fileContents: Map<string, string>,
  _fileCount: number,
  cq: CodeQuality,
  depGraph: DependencyGraph,
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

  if (frameworks.includes('Express') && !frameworks.includes('NestJS') && filePaths.filter((f) => /server|api|route/i.test(f)).length >= 3) {
    simplification.push({ strategy: 'Evaluate lighter HTTP runtime', description: 'Express is used across several server/API modules. If startup/latency is a constraint, benchmark a lighter router/runtime before migration.', impact: 'medium', effort: 'medium' });
  }

  const reactFiles = filePaths.filter((f) => f.endsWith('.jsx') || f.endsWith('.tsx'));
  // Also count .js files that actually contain React/JSX patterns
  const reactJsFiles = [...fileContents.entries()].filter(([fp, content]) =>
    fp.endsWith('.js') && /React\.|createElement\(|ReactDOM|useState|useEffect/i.test(content),
  ).length;
  const totalReactFiles = reactFiles.length + reactJsFiles;
  if (frameworks.includes('React') && totalReactFiles <= 3 && totalReactFiles > 0) {
    simplification.push({ strategy: 'Replace React with Preact or vanilla JS', description: `Only ${totalReactFiles} component file(s) found. Preact (3KB) or vanilla JS would cut bundle size dramatically.`, impact: 'medium', effort: 'medium' });
  }

  if (sample.includes('commander') || sample.includes('Commander')) {
    simplification.push({ strategy: 'Replace Commander.js with Citty or built-in parseArgs', description: 'Node.js 18+ has util.parseArgs built in. Citty is 0-dep. Removes a dependency.', impact: 'low', effort: 'low' });
  }

  if (depGraph.orphanFiles.length > 10) {
    simplification.push({ strategy: `Remove ${depGraph.orphanFiles.length} potentially dead files`, description: 'These files are not imported anywhere. Removing them reduces cognitive overhead and bundle size.', impact: 'medium', effort: 'low' });
  }

  if (cq.largeFiles.length > 3) {
    simplification.push({ strategy: `Split ${cq.largeFiles.length} oversized files`, description: `Files like ${cq.largeFiles[0]?.path ?? ''} (${cq.largeFiles[0]?.lines ?? 0} lines) should be broken into focused modules of < 200 lines.`, impact: 'medium', effort: 'medium' });
  }

  if (primaryLang === 'TypeScript' || primaryLang === 'JavaScript') {
    if (perfMentions > 0 || hasBenchmarks) {
      alternativeStack.push({ strategy: 'Evaluate Bun runtime compatibility', description: 'Performance signals were found (bench/perf mentions). Run benchmark parity tests before considering a Node.js runtime swap.', impact: 'medium', effort: 'medium' });
    }
    if ((cq.totalCodeLines > 2000 && perfMentions > 0) || hasBenchmarks) {
      alternativeStack.push({ strategy: 'Isolate hot paths into compiled service/module', description: 'Repo size and performance signals suggest a few hotspots may benefit from a compiled language path (for example Go/Rust) while keeping existing orchestration.', impact: 'high', effort: 'high' });
    }
    if (cq.totalCodeLines > 5000 && hasBenchmarks && perfMentions > 1) {
      alternativeStack.push({ strategy: 'Rewrite performance-critical modules in Rust', description: 'Rust excels at file analysis at scale (see ripgrep). Consider hybrid: Rust for core analysis, TS for UI/orchestration.', impact: 'high', effort: 'high' });
    }
  }
  if (primaryLang === 'Python') {
    const hasStrongPythonEvidence = hasNativeInterop || pythonHotspots.score >= 3 || (pythonHotspots.score >= 2 && (hasBenchmarks || perfMentions > 1));
    if (hasStrongPythonEvidence) {
      const reasonText = pythonHotspots.reasons.length > 0 ? ` Evidence: ${pythonHotspots.reasons.join('; ')}.` : '';
      alternativeStack.push({ strategy: 'Evaluate native acceleration path for hotspots', description: `Python project shows concrete compute/performance signals. Consider PyO3/C extensions only for measured bottlenecks, not broad rewrites.${reasonText}`, impact: 'medium', effort: 'medium' });
    }
    if (sample.includes('flask') || sample.includes('Flask')) {
      alternativeStack.push({ strategy: 'Migrate Flask to FastAPI', description: 'FastAPI provides async support, automatic OpenAPI docs, and Pydantic validation. Similar routing API.', impact: 'medium', effort: 'medium' });
    }
  }
  if (primaryLang === 'Go') {
    if (cq.totalCodeLines > 3000 && (hasBenchmarks || perfMentions > 0)) {
      alternativeStack.push({ strategy: 'Extract hot paths to Rust via CGO/FFI', description: 'For CPU-intensive tasks like parsing or crypto, Rust via CGO can provide 2-5x speedup over pure Go.', impact: 'medium', effort: 'high' });
    }
  }
  if (primaryLang === 'Ruby') {
    if (hasBenchmarks || perfMentions > 0) {
      alternativeStack.push({ strategy: 'Consider Crystal or Go for performance-critical services', description: 'Crystal has Ruby-like syntax but compiles to native code. Go provides similar simplicity with better concurrency.', impact: 'high', effort: 'high' });
    }
  }
  if (primaryLang === 'Java') {
    if (hasBenchmarks || perfMentions > 0) {
      alternativeStack.push({ strategy: 'Consider Kotlin or GraalVM native-image', description: 'Kotlin reduces boilerplate while remaining fully interop. GraalVM native-image eliminates JVM startup cost.', impact: 'medium', effort: 'medium' });
    }
  }

  if (sample.includes('readFileSync') || sample.includes('readdirSync')) {
    const syncCount = (sample.match(/readFileSync|readdirSync|writeFileSync|existsSync/g) ?? []).length;
    performance.push({ strategy: 'Replace sync fs calls with async', description: `Found ~${syncCount} sync filesystem calls. Switch to fs.promises + worker_threads for parallel I/O. Critical for repos with 100+ files.`, impact: 'high', effort: 'medium' });
  }

  if (cq.totalFunctions > 100 && cq.avgFunctionLength > 25) {
    performance.push({ strategy: 'Refactor long functions for JIT optimization', description: `${cq.totalFunctions} functions averaging ${cq.avgFunctionLength} lines. V8/Bun optimize short, monomorphic functions better.`, impact: 'medium', effort: 'medium' });
  }

  if (depGraph.centralModules.length > 0 && (depGraph.centralModules[0]?.importedByCount ?? 0) > 10) {
    const central = depGraph.centralModules[0]!;
    performance.push({ strategy: `Lazy-load ${central.file}`, description: `Imported by ${central.importedByCount} modules. Consider splitting or lazy-loading to reduce startup bundle.`, impact: 'medium', effort: 'low' });
  }

  if (frameworks.includes('React') && totalReactFiles > 5) {
    performance.push({ strategy: 'Add React code splitting', description: `${totalReactFiles} component files — use React.lazy + Suspense for route-level code splitting.`, impact: 'medium', effort: 'low' });
  }

  if (filePaths.length > 30 || depGraph.internalImportCount > 100) {
    performance.push({ strategy: 'Cache analysis results by fingerprint', description: 'Hash source fingerprints and skip re-analysis for unchanged sources. This is high impact in medium/large repositories.', impact: 'high', effort: 'low' });
  }

  return { simplification, alternativeStack, performance };
}
