import chalk from 'chalk';
import { getContext } from '../context.js';

export async function handleList(): Promise<void> {
  const { repo } = getContext();

  const sources = repo.listSources();
  const runs = repo.listRuns();

  if (sources.length === 0 && runs.length === 0) {
    console.log(
      chalk.dim('No sources or runs yet. Use "operator ingest <source>" to get started.'),
    );
    return;
  }

  if (sources.length > 0) {
    console.log(chalk.bold('\nSources:\n'));
    for (const s of sources) {
      console.log(`  ${chalk.dim(s.id)}  ${chalk.yellow(s.type.padEnd(12))}  ${s.name}`);
    }
  }

  if (runs.length > 0) {
    console.log(chalk.bold('\nRuns:\n'));
    for (const r of runs) {
      const statusColor =
        r.status === 'completed' ? chalk.green : r.status === 'failed' ? chalk.red : chalk.yellow;
      console.log(`  ${chalk.dim(r.id)}  ${statusColor(r.status.padEnd(10))}  ${r.backend}`);
    }
  }
}
