#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import { closeDatabase } from '../storage/database.js';
import { handleAnalyze } from './commands/analyze.js';
import { handleBackends } from './commands/backends.js';
import { handleCompare } from './commands/compare.js';
import { handleExport } from './commands/export.js';
import { handleIngest } from './commands/ingest.js';
import { handleList } from './commands/list.js';
import { handleMemory } from './commands/memory.js';
import { handleReview } from './commands/review.js';
import { handleRun } from './commands/run.js';
import { handleShow } from './commands/show.js';
import { handleTasks } from './commands/tasks.js';

const program = new Command();

program
  .name('sourcelens')
  .description('SourceLens — source code analyzer and engineering knowledge workbench')
  .version('0.1.0');

program
  .command('ingest')
  .description(
    'Ingest a source (directory, git URL, or text brief), analyze it, and generate tasks',
  )
  .argument('<source>', 'Path, git URL, or text brief to ingest')
  .option('-b, --backend <type>', 'execution backend (internal-planner, codex-cli, claude-cli)')
  .action(wrap(handleIngest));

program
  .command('analyze')
  .description('Analyze a source or show existing analysis')
  .argument('<source-or-id>', 'Source path/URL/text or existing source ID')
  .action(wrap(handleAnalyze));

program
  .command('tasks')
  .description('List candidate tasks for a source')
  .argument('<source-id>', 'Source ID')
  .action(wrap(handleTasks));

program
  .command('run')
  .description('Execute a task in an isolated workspace')
  .argument('<task-id>', 'Task ID to execute')
  .option('-b, --backend <type>', 'execution backend (internal-planner, codex-cli, claude-cli)')
  .action(wrap(handleRun));

program
  .command('review')
  .description('Show review report for a run')
  .argument('<run-id>', 'Run ID')
  .action(wrap(handleReview));

program.command('list').description('List all sources and runs').action(wrap(handleList));

program
  .command('show')
  .description('Show details for a source, task, or run by ID')
  .argument('<id>', 'Source, task, or run ID')
  .action(wrap(handleShow));

program
  .command('memory')
  .description('List or search memory entries')
  .option('-c, --category <category>', 'filter by category (analysis, lesson, outcome)')
  .option('-s, --search <keyword>', 'search memory by keyword')
  .action(wrap(handleMemory));

program
  .command('backends')
  .description('List available execution backends')
  .action(wrap(handleBackends));

program
  .command('compare')
  .description('Compare two analyses — diff metrics between sources or over time')
  .argument('<id-a>', 'First source ID or analysis ID')
  .argument('<id-b>', 'Second source ID or analysis ID')
  .action(wrap(handleCompare));

program
  .command('export')
  .description('Export analysis report as Markdown, JSON, or CSV')
  .argument('<source-id>', 'Source ID to export analysis for')
  .option('-f, --format <format>', 'output format: markdown, json, csv', 'markdown')
  .option('-o, --output <dir>', 'output directory', '.')
  .action(wrap(handleExport));

// biome-ignore lint/suspicious/noExplicitAny: commander passes mixed arg types
function wrap(fn: (...args: any[]) => Promise<void>): (...args: any[]) => Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: commander passes mixed arg types
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof Error) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (process.env.OPERATOR_DEBUG) {
          console.error(err.stack);
        }
      } else {
        console.error(chalk.red(`Error: ${String(err)}`));
      }
      process.exitCode = 1;
    } finally {
      closeDatabase();
    }
  };
}

program.parse();
