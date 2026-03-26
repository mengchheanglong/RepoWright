import type { AnalysisComparison, AnalysisDelta, AnalysisReport } from '../../domain/index.js';

/**
 * Compare two analysis reports and produce a structured delta.
 * Supports comparing different sources or the same source over time.
 */
export function compareAnalyses(
  a: AnalysisReport,
  b: AnalysisReport,
  sourceAName?: string,
  sourceBName?: string,
): AnalysisComparison {
  const deltas: AnalysisDelta[] = [];

  // --- Numeric metrics (lower = better) ---
  addNumericDelta(deltas, 'Complexity', a.complexity, b.complexity, 'lower');
  addNumericDelta(deltas, 'Risk', a.risk, b.risk, 'lower');

  // --- Numeric metrics (higher = better) ---
  addNumericDelta(deltas, 'Confidence', a.confidence, b.confidence, 'higher');

  // --- File count ---
  if (a.fileCount !== undefined && b.fileCount !== undefined) {
    addNumericDelta(deltas, 'File Count', a.fileCount, b.fileCount, 'neutral');
  }

  // --- Code quality deltas ---
  const cqA = a.deepAnalysis?.codeQuality;
  const cqB = b.deepAnalysis?.codeQuality;
  if (cqA && cqB) {
    addNumericDelta(deltas, 'Code Lines', cqA.totalCodeLines, cqB.totalCodeLines, 'neutral');
    addNumericDelta(deltas, 'Functions', cqA.totalFunctions, cqB.totalFunctions, 'higher');
    addNumericDelta(deltas, 'Comment Ratio', cqA.commentRatio, cqB.commentRatio, 'higher');
    addNumericDelta(deltas, 'Any Type Count', cqA.anyTypeCount, cqB.anyTypeCount, 'lower');
    addNumericDelta(deltas, 'Empty Catches', cqA.emptyCatchCount, cqB.emptyCatchCount, 'lower');
    addNumericDelta(deltas, 'TODO Count', cqA.todoCount, cqB.todoCount, 'lower');
    addNumericDelta(deltas, 'Max Nesting', cqA.maxNestingDepth, cqB.maxNestingDepth, 'lower');
    addNumericDelta(deltas, 'Avg Function Length', cqA.avgFunctionLength, cqB.avgFunctionLength, 'lower');
    addNumericDelta(deltas, 'Large Files', cqA.largeFiles.length, cqB.largeFiles.length, 'lower');
  }

  // --- Dependency graph deltas ---
  const dgA = a.deepAnalysis?.dependencyGraph;
  const dgB = b.deepAnalysis?.dependencyGraph;
  if (dgA && dgB) {
    addNumericDelta(deltas, 'Circular Dependencies', dgA.circularDeps.length, dgB.circularDeps.length, 'lower');
    addNumericDelta(deltas, 'Orphan Files', dgA.orphanFiles.length, dgB.orphanFiles.length, 'lower');
    addNumericDelta(deltas, 'Internal Imports', dgA.internalImportCount, dgB.internalImportCount, 'neutral');
    addNumericDelta(deltas, 'External Deps', dgA.externalDepCount, dgB.externalDepCount, 'neutral');
  }

  // --- String deltas ---
  addStringDelta(deltas, 'Classification', a.classification, b.classification);

  if (a.languages && b.languages) {
    addStringDelta(deltas, 'Languages', a.languages.join(', '), b.languages.join(', '));
  }

  // --- Summary ---
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  for (const d of deltas) {
    if (d.direction === 'improved') improved++;
    else if (d.direction === 'regressed') regressed++;
    else unchanged++;
  }

  return {
    sourceA: {
      id: a.sourceId,
      name: sourceAName ?? a.sourceId,
      analyzedAt: a.createdAt,
    },
    sourceB: {
      id: b.sourceId,
      name: sourceBName ?? b.sourceId,
      analyzedAt: b.createdAt,
    },
    deltas,
    summary: `${improved} improved, ${regressed} regressed, ${unchanged} unchanged`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BetterDirection = 'lower' | 'higher' | 'neutral';

function addNumericDelta(
  deltas: AnalysisDelta[],
  metric: string,
  before: number,
  after: number,
  better: BetterDirection,
): void {
  let direction: AnalysisDelta['direction'];

  if (before === after) {
    direction = 'unchanged';
  } else if (better === 'lower') {
    direction = after < before ? 'improved' : 'regressed';
  } else if (better === 'higher') {
    direction = after > before ? 'improved' : 'regressed';
  } else {
    direction = 'unchanged';
  }

  deltas.push({ metric, before, after, direction });
}

function addStringDelta(
  deltas: AnalysisDelta[],
  metric: string,
  before: string,
  after: string,
): void {
  deltas.push({
    metric,
    before,
    after,
    direction: before === after ? 'unchanged' : 'regressed',
  });
}
