import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { analyzeSource } from '../../analysis/index.js';
import { executeTask } from '../../execution/index.js';
import { ingestSource } from '../../intake/index.js';
import { autoSaveAnalysisFindings, autoSaveExecutionOutcome } from '../../memory/index.js';
import { generateTasks } from '../../planning/index.js';
import { generateReview } from '../../review/index.js';
import { getContext } from '../context.js';

interface IngestOptions {
  backend?: 'internal-planner' | 'codex-cli' | 'claude-cli';
}

export async function handleIngest(source: string, options?: IngestOptions): Promise<void> {
  const { config, repo } = getContext();

  console.log(chalk.blue('Ingesting source...'));
  const src = ingestSource(source, config);
  repo.saveSource(src);
  console.log(chalk.green(`Source ingested: ${src.id} (${src.type}: ${src.name})`));

  console.log(chalk.blue('\nAnalyzing...'));
  const analysis = analyzeSource(src, config);
  repo.saveAnalysis(analysis);
  console.log(chalk.green(`Analysis complete: ${analysis.classification}`));
  console.log(`  Summary: ${analysis.summary}`);
  console.log(
    `  Complexity: ${analysis.complexity}/10 | Risk: ${analysis.risk.toFixed(1)}/10 | Confidence: ${(analysis.confidence * 100).toFixed(0)}%`,
  );
  if (analysis.insights.length > 0) {
    console.log('  Insights:');
    for (const insight of analysis.insights) {
      console.log(`    - ${insight}`);
    }
  }

  console.log(chalk.blue('\nGenerating tasks...'));
  const tasks = generateTasks(analysis);
  repo.saveTasks(tasks);

  const memEntries = autoSaveAnalysisFindings(analysis, repo);
  if (memEntries.length > 0) {
    console.log(chalk.dim(`  Auto-saved ${memEntries.length} finding(s) to memory`));
  }

  console.log(chalk.green(`Generated ${tasks.length} candidate tasks:\n`));

  for (const t of tasks) {
    console.log(`  ${chalk.yellow(`[${t.order}]`)} ${chalk.bold(t.title)}`);
    console.log(`      Difficulty: ${t.difficulty} | Value: ${t.expectedValue}`);
    console.log(`      Done when: ${t.definitionOfDone}`);
    console.log('');
  }

  const choices = [
    ...tasks.map((t) => ({ name: `[${t.order}] ${t.title} (${t.difficulty})`, value: t.id })),
    { name: 'Skip - do not execute any task now', value: 'skip' },
  ];

  const selected = await select({ message: 'Select a task to execute:', choices });

  if (selected === 'skip') {
    console.log(chalk.dim('\nSkipped execution. Use "repowright run <task-id>" to run later.'));
    console.log(chalk.dim(`Source ID: ${src.id}`));
    return;
  }

  const task = tasks.find((t) => t.id === selected);
  if (!task) return;

  console.log(chalk.blue(`\nExecuting: ${task.title}...`));
  const run = await executeTask({
    task,
    source: src,
    analysis,
    config,
    repo,
    backend: options?.backend,
  });
  console.log(chalk.green(`Run ${run.id}: ${run.status}`));

  console.log(chalk.blue('\nGenerating review...'));
  const review = generateReview({ run, task, analysis, repo });

  autoSaveExecutionOutcome(run, task, review, repo);

  console.log(chalk.green('Review complete.'));
  console.log(`  Confidence: ${(review.confidence * 100).toFixed(0)}%`);
  console.log(`  Next action: ${review.nextAction}`);
  console.log(`\n  Artifacts at: ${run.workspacePath}`);
}
