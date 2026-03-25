import chalk from 'chalk';
import type { CandidateTask, ExecutionRun, Source } from '../../domain/index.js';
import type { Repository } from '../../storage/repository.js';
import { getContext } from '../context.js';

export async function handleShow(id: string): Promise<void> {
  const { repo } = getContext();

  const source = repo.getSource(id);
  if (source) return showSource(source, repo);

  const run = repo.getRun(id);
  if (run) return showRun(run, repo);

  const task = repo.getTask(id);
  if (task) return showTask(task);

  console.log(chalk.red(`Nothing found with ID: ${id}`));
}

function showSource(source: Source, repo: Repository): void {
  console.log(chalk.bold('\nSource'));
  console.log(`  ID:       ${source.id}`);
  console.log(`  Type:     ${source.type}`);
  console.log(`  Name:     ${source.name}`);
  console.log(`  Location: ${source.location}`);
  console.log(`  Created:  ${source.createdAt}`);
  if (source.metadata) {
    console.log(`  Metadata: ${JSON.stringify(source.metadata, null, 2)}`);
  }

  const analysis = repo.getAnalysisBySource(source.id);
  if (analysis) {
    console.log(chalk.bold('\n  Latest Analysis'));
    console.log(`    Classification: ${analysis.classification}`);
    console.log(`    Complexity:     ${analysis.complexity}/10`);
    console.log(`    Summary:        ${analysis.summary}`);
  }

  const tasks = repo.getTasksBySource(source.id);
  if (tasks.length > 0) {
    console.log(chalk.bold(`\n  Tasks (${tasks.length}):`));
    for (const t of tasks) {
      console.log(`    [${t.order}] ${t.title}  ${chalk.dim(t.id)}`);
    }
  }
}

function showRun(run: ExecutionRun, repo: Repository): void {
  console.log(chalk.bold('\nRun'));
  console.log(`  ID:        ${run.id}`);
  console.log(`  Task:      ${run.taskId}`);
  console.log(`  Status:    ${run.status}`);
  console.log(`  Backend:   ${run.backend}`);
  console.log(`  Workspace: ${run.workspacePath}`);
  console.log(`  Created:   ${run.createdAt}`);
  if (run.startedAt) console.log(`  Started:   ${run.startedAt}`);
  if (run.completedAt) console.log(`  Completed: ${run.completedAt}`);
  if (run.error) console.log(`  Error:     ${chalk.red(run.error)}`);

  const artifacts = repo.getArtifactsByRun(run.id);
  if (artifacts.length > 0) {
    console.log(chalk.bold(`\n  Artifacts (${artifacts.length}):`));
    for (const a of artifacts) {
      console.log(`    ${a.type}: ${a.path}`);
    }
  }
}

function showTask(task: CandidateTask): void {
  console.log(chalk.bold('\nTask'));
  console.log(`  ID:         ${task.id}`);
  console.log(`  Title:      ${task.title}`);
  console.log(`  Difficulty:  ${task.difficulty}`);
  console.log(`  Rationale:  ${task.rationale}`);
  console.log(`  Value:      ${task.expectedValue}`);
  console.log(`  Done when:  ${task.definitionOfDone}`);
  console.log(`  Risks:      ${task.riskNotes}`);
}
