import chalk from 'chalk';
import { compareAnalyses, formatComparisonMarkdown } from '../../analysis/index.js';
import { getContext } from '../context.js';

export async function handleCompare(idA: string, idB: string): Promise<void> {
  const { repo } = getContext();

  // Try to resolve IDs as source IDs first, then as analysis IDs
  const analysisA = repo.getAnalysis(idA) ?? repo.getAnalysisBySource(idA);
  const analysisB = repo.getAnalysis(idB) ?? repo.getAnalysisBySource(idB);

  if (!analysisA) {
    console.log(chalk.red(`No analysis found for: ${idA}`));
    return;
  }
  if (!analysisB) {
    console.log(chalk.red(`No analysis found for: ${idB}`));
    return;
  }

  // Resolve source names
  const sourceA = repo.getSource(analysisA.sourceId);
  const sourceB = repo.getSource(analysisB.sourceId);

  const comparison = compareAnalyses(
    analysisA,
    analysisB,
    sourceA?.name ?? analysisA.sourceId,
    sourceB?.name ?? analysisB.sourceId,
  );

  // Print formatted comparison
  console.log('');
  console.log(chalk.bold('Analysis Comparison'));
  console.log(`  A: ${chalk.blue(comparison.sourceA.name)} (${comparison.sourceA.analyzedAt})`);
  console.log(`  B: ${chalk.blue(comparison.sourceB.name)} (${comparison.sourceB.analyzedAt})`);
  console.log('');
  console.log(chalk.bold(comparison.summary));
  console.log('');

  for (const delta of comparison.deltas) {
    const arrow =
      delta.direction === 'improved'
        ? chalk.green('↑')
        : delta.direction === 'regressed'
          ? chalk.red('↓')
          : chalk.dim('=');
    const beforeStr = typeof delta.before === 'number'
      ? Number.isInteger(delta.before) ? String(delta.before) : delta.before.toFixed(2)
      : delta.before;
    const afterStr = typeof delta.after === 'number'
      ? Number.isInteger(delta.after) ? String(delta.after) : delta.after.toFixed(2)
      : delta.after;

    console.log(`  ${arrow} ${delta.metric.padEnd(25)} ${String(beforeStr).padEnd(12)} → ${afterStr}`);
  }

  // If comparing same source over time, show history count
  if (analysisA.sourceId === analysisB.sourceId) {
    const history = repo.listAnalysesBySource(analysisA.sourceId);
    console.log(`\n  ${chalk.dim(`(${history.length} total analyses for this source)`)}`);
  }

  // Also produce the markdown output hint
  console.log(`\n${chalk.dim('Tip: Use the API at GET /api/compare/:idA/:idB for structured JSON output.')}`);

  // Suppress unused import warning — formatComparisonMarkdown is exported for API/programmatic use
  void formatComparisonMarkdown;
}
