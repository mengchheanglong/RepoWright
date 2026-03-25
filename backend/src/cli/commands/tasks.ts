import chalk from 'chalk';
import { SourceNotFoundError } from '../../core/errors.js';
import { getContext } from '../context.js';

export async function handleTasks(sourceId: string): Promise<void> {
  const { repo } = getContext();

  const source = repo.getSource(sourceId);
  if (!source) throw new SourceNotFoundError(sourceId);

  const tasks = repo.getTasksBySource(sourceId);
  if (tasks.length === 0) {
    console.log(
      chalk.dim(
        'No tasks found for this source. Run "operator ingest" or "operator analyze" first.',
      ),
    );
    return;
  }

  console.log(chalk.bold(`\nTasks for source: ${source.name} (${sourceId})\n`));
  for (const t of tasks) {
    console.log(`  ${chalk.yellow(`[${t.order}]`)} ${chalk.bold(t.title)}  ${chalk.dim(t.id)}`);
    console.log(`      Difficulty: ${t.difficulty}`);
    console.log(`      Rationale: ${t.rationale}`);
    console.log(`      Value: ${t.expectedValue}`);
    console.log(`      Done when: ${t.definitionOfDone}`);
    console.log(`      Risks: ${t.riskNotes}`);
    console.log('');
  }
}
