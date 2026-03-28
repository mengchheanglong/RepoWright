import fs from 'node:fs';
import path from 'node:path';
import type { ExecutionResult } from '../backends/adapter.js';
import type { OperatorConfig } from '../core/config.js';
import { ExecutionError } from '../core/errors.js';
import type {
  AnalysisReport,
  BackendType,
  CandidateTask,
  ExecutionRun,
  RunArtifact,
  Source,
} from '../domain/index.js';
import { backendDisplayName, selectBackend } from '../routing/router.js';
import type { Repository } from '../storage/repository.js';
import { copyDirRecursive, ensureDir, writeJson, writeMarkdown } from '../utils/fs.js';
import { generateId, now } from '../utils/id.js';
import { getLogger } from '../utils/logger.js';
import {
  captureWorkspaceDiff,
  captureWorkspaceDiffStat,
  initWorkspaceGit,
} from './git-tracking.js';

interface RunCommandRecord {
  timestamp: string;
  stage: 'prepare' | 'execute';
  command: string;
  status: 'completed' | 'failed';
}

export interface ExecuteOptions {
  task: CandidateTask;
  source: Source;
  analysis: AnalysisReport;
  config: OperatorConfig;
  repo: Repository;
  backend?: BackendType;
  idempotencyKey?: string;
  safetyProfile?: 'conservative' | 'balanced' | 'aggressive';
}

export async function executeTask(opts: ExecuteOptions): Promise<ExecutionRun> {
  const { task, source, analysis, config, repo } = opts;
  const logger = getLogger();

  const runId = generateId('run');
  const runDir = path.join(config.runsDir, runId);
  const workspacePath = path.join(runDir, 'workspace');
  ensureDir(runDir);
  ensureDir(workspacePath);

  const selectedBackend = selectBackend(opts.backend);

  const run: ExecutionRun = {
    id: runId,
    taskId: task.id,
    sourceId: source.id,
    idempotencyKey: opts.idempotencyKey,
    status: 'created',
    backend: selectedBackend.type,
    workspacePath,
    createdAt: now(),
  };
  repo.saveRun(run);

  const safetyProfile = opts.safetyProfile ?? 'balanced';

  const commandLog: RunCommandRecord[] = [];

  logger.setLogFile(path.join(runDir, 'logs.jsonl'));
  prepareWorkspace(source, workspacePath, commandLog);
  initWorkspaceGit(workspacePath);
  commandLog.push({
    timestamp: now(),
    stage: 'prepare',
    command: 'git init (workspace bootstrap)',
    status: 'completed',
  });

  writeJson(path.join(runDir, 'analysis.json'), analysis);
  writeJson(path.join(runDir, 'tasks.json'), [task]);
  writeJson(path.join(runDir, 'source.json'), source);
  writeJson(path.join(runDir, 'execution-safety.json'), {
    profile: safetyProfile,
    controls: describeSafetyProfile(safetyProfile),
  });

  repo.updateRunStatus(runId, 'executing');
  logger.info(`Run ${runId}: executing task "${task.title}"`);

  try {
    const result = await selectedBackend.execute(task, source, analysis, workspacePath);
    commandLog.push({
      timestamp: now(),
      stage: 'execute',
      command: `${selectedBackend.type}.execute(${task.id})`,
      status: 'completed',
    });
    const artifactRecords = saveResultArtifacts(result, runId, workspacePath, repo);
    saveDiffArtifacts(workspacePath, runDir, runId, repo, artifactRecords);
    saveCommandLogArtifact(runDir, runId, repo, artifactRecords, commandLog);
    saveRunMetadata(
      runDir,
      runId,
      run,
      task,
      source,
      result,
      artifactRecords,
      safetyProfile,
    );
    finalizeRunStatus(runId, result, repo, logger);

    const completedRun = repo.getRun(runId);
    if (!completedRun) throw new ExecutionError(`Run ${runId} not found after execution`);
    return completedRun;
  } catch (err) {
    commandLog.push({
      timestamp: now(),
      stage: 'execute',
      command: `${selectedBackend.type}.execute(${task.id})`,
      status: 'failed',
    });
    saveCommandLogArtifact(runDir, runId, repo, [], commandLog);
    const message = err instanceof Error ? err.message : String(err);
    repo.updateRunStatus(runId, 'failed', message);
    logger.error(`Run ${runId}: execution error — ${message}`);
    throw new ExecutionError(`Task execution failed: ${message}`, err);
  }
}

function prepareWorkspace(
  source: Source,
  workspacePath: string,
  commandLog: RunCommandRecord[],
): void {
  if (
    (source.type === 'directory' || source.type === 'git-url') &&
    fs.existsSync(source.location)
  ) {
    getLogger().info(`Copying source to workspace: ${source.location} → ${workspacePath}`);
    copyDirRecursive(source.location, workspacePath);
    commandLog.push({
      timestamp: now(),
      stage: 'prepare',
      command: `copyDirRecursive(${source.location} -> ${workspacePath})`,
      status: 'completed',
    });
  }
}

function saveCommandLogArtifact(
  runDir: string,
  runId: string,
  repo: Repository,
  artifactRecords: RunArtifact[],
  commandLog: RunCommandRecord[],
): void {
  const commandLogPath = path.join(runDir, 'commands.json');
  writeJson(commandLogPath, commandLog);

  const commandArtifact: RunArtifact = {
    id: generateId('art'),
    runId,
    type: 'command-log',
    path: commandLogPath,
    description: 'Execution command log',
    createdAt: now(),
  };
  repo.saveArtifact(commandArtifact);
  artifactRecords.push(commandArtifact);
}

function saveResultArtifacts(
  result: ExecutionResult,
  runId: string,
  workspacePath: string,
  repo: Repository,
): RunArtifact[] {
  const records: RunArtifact[] = [];
  for (const a of result.artifacts) {
    const artifact: RunArtifact = {
      id: generateId('art'),
      runId,
      type: a.type,
      path: path.join(workspacePath, a.filename),
      description: `${a.type}: ${a.filename}`,
      createdAt: now(),
    };
    repo.saveArtifact(artifact);
    records.push(artifact);
  }
  return records;
}

function saveDiffArtifacts(
  workspacePath: string,
  runDir: string,
  runId: string,
  repo: Repository,
  artifactRecords: RunArtifact[],
): void {
  const logger = getLogger();
  const diff = captureWorkspaceDiff(workspacePath);
  if (diff) {
    const diffFile = path.join(runDir, 'changes.patch');
    fs.writeFileSync(diffFile, diff);
    const diffArtifact: RunArtifact = {
      id: generateId('art'),
      runId,
      type: 'diff',
      path: diffFile,
      description: 'Git diff of workspace changes',
      createdAt: now(),
    };
    repo.saveArtifact(diffArtifact);
    artifactRecords.push(diffArtifact);
    logger.info(`Workspace diff saved: ${diffFile}`);
  }

  const stat = captureWorkspaceDiffStat(workspacePath);
  if (stat) {
    fs.writeFileSync(path.join(runDir, 'changes-stat.txt'), stat);
  }
}

function saveRunMetadata(
  runDir: string,
  runId: string,
  run: ExecutionRun,
  task: CandidateTask,
  source: Source,
  result: ExecutionResult,
  artifactRecords: RunArtifact[],
  safetyProfile: 'conservative' | 'balanced' | 'aggressive',
): void {
  writeJson(path.join(runDir, 'run.json'), {
    ...run,
    status: result.success ? 'completed' : 'failed',
    completedAt: now(),
    artifactCount: artifactRecords.length,
    output: result.output,
  });

  const status = result.success ? 'completed' : 'failed';
  const artifactList = artifactRecords.map((a) => `- ${a.description}`).join('\n');
  writeMarkdown(
    path.join(runDir, 'summary.md'),
    `# Run ${runId}\n\n**Task:** ${task.title}\n**Source:** ${source.name}\n**Status:** ${status}\n**Execution Engine:** ${backendDisplayName(run.backend)}\n**Safety Profile:** ${safetyProfile}\n\n## Output\n${result.output}\n\n## Artifacts\n${artifactList}\n`,
  );
}

function describeSafetyProfile(profile: 'conservative' | 'balanced' | 'aggressive'): string[] {
  if (profile === 'conservative') {
    return [
      'Prefer minimal file edits and bounded scope.',
      'Prioritize verification artifacts before broader modifications.',
      'Escalate on ambiguous ownership or missing context.',
    ];
  }
  if (profile === 'aggressive') {
    return [
      'Allow broader refactor scope when confidence is high.',
      'Favor fast execution with post-run verification.',
      'Permit multi-file changes in a single run.',
    ];
  }
  return [
    'Balance scope control with delivery speed.',
    'Require clear verification checks for changed areas.',
    'Escalate only when confidence drops significantly.',
  ];
}

function finalizeRunStatus(
  runId: string,
  result: ExecutionResult,
  repo: Repository,
  logger: ReturnType<typeof getLogger>,
): void {
  if (result.success) {
    repo.updateRunStatus(runId, 'completed');
    logger.info(`Run ${runId}: completed successfully`);
  } else {
    repo.updateRunStatus(runId, 'failed', result.error);
    logger.error(`Run ${runId}: failed — ${result.error}`);
  }
}
