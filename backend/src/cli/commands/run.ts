import chalk from 'chalk';
import { SourceNotFoundError, TaskNotFoundError } from '../../core/errors.js';
import { executeTask } from '../../execution/index.js';
import { autoSaveExecutionOutcome } from '../../memory/index.js';
import { generateReview } from '../../review/index.js';
import { getContext } from '../context.js';

interface RunOptions {
  backend?: 'internal-planner' | 'codex-cli' | 'claude-cli';
}

export async function handleRun(taskId: string, options?: RunOptions): Promise<void> {
  const { config, repo } = getContext();

  const task = repo.getTask(taskId);
  if (!task) throw new TaskNotFoundError(taskId);

  const source = repo.getSource(task.sourceId);
  if (!source) throw new SourceNotFoundError(task.sourceId);

  const analysis = repo.getAnalysisBySource(task.sourceId);
  if (!analysis) {
    console.log(chalk.red('No analysis found for this source. Run "repowright analyze" first.'));
    return;
  }

  console.log(chalk.blue(`Executing: ${task.title}...`));
  const run = await executeTask({
    task,
    source,
    analysis,
    config,
    repo,
    backend: options?.backend,
  });
  console.log(chalk.green(`Run ${run.id}: ${run.status}`));

  console.log(chalk.blue('Generating review...'));
  const review = generateReview({ run, task, analysis, repo });

  autoSaveExecutionOutcome(run, task, review, repo);

  console.log(chalk.green(`Review complete. Confidence: ${(review.confidence * 100).toFixed(0)}%`));
  console.log(`  Next action: ${review.nextAction}`);
  console.log(`  Artifacts at: ${run.workspacePath}`);
}
