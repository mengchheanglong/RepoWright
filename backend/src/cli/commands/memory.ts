import chalk from 'chalk';
import type { MemoryEntry } from '../../domain/index.js';
import { listMemoryEntries, searchMemoryEntries } from '../../memory/index.js';
import { getContext } from '../context.js';

interface MemoryOptions {
  category?: string;
  search?: string;
}

export async function handleMemory(options: MemoryOptions): Promise<void> {
  const { repo } = getContext();

  let entries: MemoryEntry[];

  if (options.search) {
    entries = searchMemoryEntries(repo, options.search);
    console.log(chalk.bold(`\nMemory search: "${options.search}" (${entries.length} results)\n`));
  } else {
    entries = listMemoryEntries(repo, options.category);
    const label = options.category ? `category: ${options.category}` : 'all';
    console.log(chalk.bold(`\nMemory entries (${label}): ${entries.length}\n`));
  }

  if (entries.length === 0) {
    console.log(chalk.dim('No memory entries found.'));
    return;
  }

  for (const entry of entries) {
    console.log(
      `  ${chalk.dim(entry.id)}  ${chalk.yellow(entry.category.padEnd(12))}  ${chalk.bold(entry.title)}`,
    );
    if (entry.tags.length > 0) {
      console.log(`    tags: ${entry.tags.join(', ')}`);
    }
    console.log('');
  }
}
