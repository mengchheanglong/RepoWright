import chalk from 'chalk';
import { RunNotFoundError } from '../../core/errors.js';
import { getContext } from '../context.js';

export async function handleReview(runId: string): Promise<void> {
  const { repo } = getContext();

  const run = repo.getRun(runId);
  if (!run) throw new RunNotFoundError(runId);

  const review = repo.getReview(runId);
  if (!review) {
    console.log(chalk.dim('No review found for this run. It may not have been reviewed yet.'));
    return;
  }

  console.log(chalk.bold(`\nReview for run: ${runId}\n`));
  console.log(`  ${chalk.blue('Attempted:')}  ${review.attempted}`);
  console.log(`  ${chalk.blue('Changed:')}    ${review.changed}`);
  console.log(`  ${chalk.green('Succeeded:')}  ${review.succeeded}`);
  console.log(`  ${chalk.red('Failed:')}     ${review.failed}`);
  console.log(`  ${chalk.yellow('Confidence:')} ${(review.confidence * 100).toFixed(0)}%`);
  console.log(`  ${chalk.bold('Next:')}       ${review.nextAction}`);
}
