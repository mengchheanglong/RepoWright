import chalk from 'chalk';
import { listBackends } from '../../routing/router.js';

export async function handleBackends(): Promise<void> {
  const backends = listBackends();

  console.log(chalk.bold('\nAvailable backends:\n'));
  for (const b of backends) {
    const status = b.available ? chalk.green('available') : chalk.dim('not available');
    console.log(`  ${chalk.bold(b.type.padEnd(20))} ${b.name.padEnd(30)} ${status}`);
  }
}
