import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSource, compareAnalyses } from '../analysis/index.js';
import { exportToCsv, exportToJson, exportToMarkdown } from '../analysis/export.js';
import { loadConfig } from '../core/config.js';
import { executeTask } from '../execution/index.js';
import { ingestSource } from '../intake/index.js';
import { generateTasks } from '../planning/index.js';
import { generateReview } from '../review/index.js';
import { listBackendCapabilities } from '../routing/router.js';
import { closeDatabase, getDatabase } from '../storage/database.js';
import { Repository } from '../storage/repository.js';
import { initLogger } from '../utils/logger.js';

export interface ApiServerOptions {
  port?: number;
}

const app = express();
const defaultPort = Number(
  process.env.REPOWRIGHT_API_PORT ?? process.env.OPERATOR_API_PORT ?? 8787,
);

const config = loadConfig();
initLogger(config.logLevel);
const db = getDatabase(config.dbPath);
const repo = new Repository(db);

app.use(express.json({ limit: '1mb' }));

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    dataDir: config.dataDir,
    runsDir: config.runsDir,
  });
});

app.get('/api/capabilities', (_req: Request, res: Response) => {
  res.json({
    apiVersion: '2026-03-26',
    runRequestSchemaVersion: '1.1.0',
    runIdempotency: { supported: true, field: 'idempotencyKey' },
    backends: listBackendCapabilities(),
  });
});

app.get('/api/sources', (_req: Request, res: Response) => {
  res.json({ sources: repo.listSources() });
});

app.get('/api/runs', (_req: Request, res: Response) => {
  res.json({ runs: repo.listRuns() });
});

app.delete('/api/sources/:sourceId', (req: Request, res: Response) => {
  try {
    const sourceId = pickParam(req.params.sourceId);
    if (!sourceId) {
      return res.status(400).json({ error: 'Missing source ID.' });
    }

    const source = repo.getSource(sourceId);
    if (!source) {
      return res.status(404).json({ error: `Source not found: ${sourceId}` });
    }

    const runs = repo.listRuns().filter((run) => run.sourceId === sourceId);
    const runDirs = runs.map((run) => path.dirname(run.workspacePath));

    const result = repo.deleteSourceCascade(sourceId);

    for (const dir of runDirs) {
      removeDirIfInside(dir, config.runsDir);
    }

    if (source.type === 'git-url') {
      const clonesDir = path.join(config.dataDir, 'clones');
      removeDirIfInside(source.location, clonesDir);
    }

    return res.json({
      deletedSourceId: sourceId,
      deleted: result,
      cleanedRunDirs: runDirs.length,
    });
  } catch (error) {
    return handleError(error, res);
  }
});

app.get('/api/tasks/:sourceId', (req: Request, res: Response) => {
  const sourceId = pickParam(req.params.sourceId);
  const source = sourceId ? repo.getSource(sourceId) : null;
  if (!source) {
    return res.status(404).json({ error: `Source not found: ${sourceId ?? 'unknown'}` });
  }
  return res.json({ tasks: repo.getTasksBySource(source.id) });
});

app.get('/api/next-task/:sourceId', (req: Request, res: Response) => {
  const sourceId = pickParam(req.params.sourceId);
  if (!sourceId) {
    return res.status(400).json({ error: 'Source ID is required.' });
  }

  const source = repo.getSource(sourceId);
  if (!source) {
    return res.status(404).json({ error: `Source not found: ${sourceId}` });
  }

  const tasks = repo.getTasksBySource(sourceId);
  const runs = repo.listRuns().filter((run) => run.sourceId === sourceId);
  const runSet = new Set(runs.map((run) => run.taskId));
  const pending = tasks.filter((task) => !runSet.has(task.id));
  const nextTask = pending.sort((a, b) => a.order - b.order)[0] ?? null;

  return res.json({
    sourceId,
    nextTask,
    summary: nextTask
      ? `Next suggested task is #${nextTask.order}: ${nextTask.title}`
      : 'No pending tasks remain for this source.',
    pendingTaskCount: pending.length,
    runCount: runs.length,
  });
});

app.get('/api/review/:runId', (req: Request, res: Response) => {
  const runId = pickParam(req.params.runId);
  const run = runId ? repo.getRun(runId) : null;
  if (!run) {
    return res.status(404).json({ error: `Run not found: ${runId ?? 'unknown'}` });
  }
  const review = repo.getReview(run.id);
  if (!review) {
    return res.status(404).json({ error: `No review found for run: ${runId}` });
  }
  return res.json({ review });
});

app.get('/api/review-document/:runId', (req: Request, res: Response) => {
  const runId = pickParam(req.params.runId);
  const run = runId ? repo.getRun(runId) : null;
  if (!run) {
    return res.status(404).json({ error: `Run not found: ${runId ?? 'unknown'}` });
  }

  const review = repo.getReview(run.id);
  if (!review) {
    return res.status(404).json({ error: `No review found for run: ${run.id}` });
  }

  const source = repo.getSource(run.sourceId);
  const analysis = repo.getAnalysisBySource(run.sourceId);
  const task = repo.getTask(run.taskId);
  const tasks = repo.getTasksBySource(run.sourceId);
  const artifacts = repo.getArtifactsByRun(run.id);
  const runDir = path.dirname(run.workspacePath);

  const payload = {
    run,
    review,
    source,
    analysis,
    task,
    tasks,
    usefulness: analysis ? summarizeUsefulness(analysis.classification, analysis.confidence) : null,
    documents: {
      runSummary: readTextFile(path.join(runDir, 'summary.md')),
      reviewNotes: readTextFile(path.join(runDir, 'review.md')),
      executionPlan: readTextFile(path.join(run.workspacePath, 'execution-plan.md')),
      executionSummary: readTextFile(path.join(run.workspacePath, 'summary.md')),
      inventory: readTextFile(path.join(run.workspacePath, 'file-inventory.md')),
    },
    artifacts,
  };

  return res.json(payload);
});

app.get('/api/analysis/:sourceId', (req: Request, res: Response) => {
  const sourceId = pickParam(req.params.sourceId);
  const analysis = sourceId ? repo.getAnalysisBySource(sourceId) : null;
  if (!analysis) {
    return res.status(404).json({ error: `Analysis not found for source: ${sourceId ?? 'unknown'}` });
  }
  return res.json({ analysis });
});

app.get('/api/export/:sourceId', (req: Request, res: Response) => {
  try {
    const sourceId = pickParam(req.params.sourceId);
    const format = typeof req.query.format === 'string' ? req.query.format : 'markdown';
    if (!sourceId) {
      return res.status(400).json({ error: 'Source ID is required.' });
    }

    const analysis = repo.getAnalysisBySource(sourceId);
    if (!analysis) {
      return res.status(404).json({ error: `Analysis not found for source: ${sourceId}` });
    }

    if (format === 'json') {
      return res.json({
        format,
        files: [
          {
            name: `analysis-${sourceId}.json`,
            mimeType: 'application/json',
            content: exportToJson(analysis, analysis.deepAnalysis),
          },
        ],
      });
    }

    if (format === 'csv') {
      const csv = exportToCsv(analysis, analysis.deepAnalysis);
      return res.json({
        format,
        files: [
          {
            name: `analysis-${sourceId}-metrics.csv`,
            mimeType: 'text/csv',
            content: csv.metrics,
          },
          {
            name: `analysis-${sourceId}-findings.csv`,
            mimeType: 'text/csv',
            content: csv.findings,
          },
          {
            name: `analysis-${sourceId}-improvements.csv`,
            mimeType: 'text/csv',
            content: csv.improvements,
          },
        ],
      });
    }

    return res.json({
      format: 'markdown',
      files: [
        {
          name: `analysis-${sourceId}.md`,
          mimeType: 'text/markdown',
          content: exportToMarkdown(analysis, analysis.deepAnalysis),
        },
      ],
    });
  } catch (error) {
    return handleError(error, res);
  }
});

app.get('/api/compare/:idA/:idB', (req: Request, res: Response) => {
  try {
    const idA = pickParam(req.params.idA);
    const idB = pickParam(req.params.idB);
    if (!idA || !idB) {
      return res.status(400).json({ error: 'Both IDs are required.' });
    }

    const analysisA = repo.getAnalysis(idA) ?? repo.getAnalysisBySource(idA);
    const analysisB = repo.getAnalysis(idB) ?? repo.getAnalysisBySource(idB);

    if (!analysisA) {
      return res.status(404).json({ error: `No analysis found for: ${idA}` });
    }
    if (!analysisB) {
      return res.status(404).json({ error: `No analysis found for: ${idB}` });
    }

    const sourceA = repo.getSource(analysisA.sourceId);
    const sourceB = repo.getSource(analysisB.sourceId);

    const comparison = compareAnalyses(
      analysisA,
      analysisB,
      sourceA?.name ?? analysisA.sourceId,
      sourceB?.name ?? analysisB.sourceId,
    );

    return res.json({ comparison });
  } catch (error) {
    return handleError(error, res);
  }
});

app.post('/api/ingest', (req: Request, res: Response) => {
  try {
    const sourceInput = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
    if (!sourceInput) {
      return res.status(400).json({ error: 'Request field "source" is required.' });
    }

    const source = ingestSource(sourceInput, config);
    repo.saveSource(source);

    const analysis = analyzeSource(source, config);
    repo.saveAnalysis(analysis);

    const tasks = generateTasks(analysis);
    repo.saveTasks(tasks);

    return res.status(201).json({ source, analysis, tasks });
  } catch (error) {
    return handleError(error, res);
  }
});

app.post('/api/run', async (req: Request, res: Response) => {
  try {
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string'
      ? req.body.idempotencyKey.trim()
      : '';
    if (!taskId) {
      return res.status(400).json({ error: 'Request field "taskId" is required.' });
    }

    const task = repo.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: `Task not found: ${taskId}` });
    }

    const source = repo.getSource(task.sourceId);
    if (!source) {
      return res.status(404).json({ error: `Source not found for task: ${task.sourceId}` });
    }

    const analysis = repo.getAnalysisBySource(task.sourceId);
    if (!analysis) {
      return res.status(400).json({ error: `No analysis found for source: ${task.sourceId}` });
    }

    if (idempotencyKey) {
      const existing = repo.getRunByTaskAndIdempotency(task.id, idempotencyKey);
      if (existing) {
        const review = repo.getReview(existing.id);
        return res.status(200).json({
          run: existing,
          review,
          reused: true,
          message: 'Idempotency key matched an existing run.',
        });
      }
    }

    const run = await executeTask({ task, source, analysis, config, repo, idempotencyKey: idempotencyKey || undefined });
    const review = generateReview({ run, task, analysis, repo });

    return res.status(201).json({ run, review, reused: false });
  } catch (error) {
    return handleError(error, res);
  }
});

export function startApiServer(options: ApiServerOptions = {}) {
  const port = options.port ?? defaultPort;
  const server = app.listen(port, () => {
    // Keep this plain for easy discovery in terminal output.
    console.log(`RepoWright API running at http://localhost:${port}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

function handleError(error: unknown, res: Response): Response {
  if (error instanceof Error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(500).json({ error: String(error) });
}

function pickParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function readTextFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function summarizeUsefulness(classification: string, confidence: number): string {
  const strength = confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'moderate' : 'low';

  switch (classification) {
    case 'learn':
      return `Useful for learning and onboarding with ${strength} confidence.`;
    case 'extract-skill':
      return `Useful for extracting reusable patterns and techniques with ${strength} confidence.`;
    case 'improve-architecture':
      return `Useful for architecture refactoring and structural improvements with ${strength} confidence.`;
    case 'prototype':
      return `Useful for fast experimentation and prototyping with ${strength} confidence.`;
    case 'bugfix':
      return `Useful for defect investigation and targeted fixes with ${strength} confidence.`;
    case 'ignore':
      return `Likely low immediate value and can be deprioritized with ${strength} confidence.`;
    default:
      return `Usefulness estimated as ${strength} confidence.`;
  }
}

function removeDirIfInside(targetPath: string, parentPath: string): void {
  try {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedParent = path.resolve(parentPath);
    if (!resolvedTarget.startsWith(`${resolvedParent}${path.sep}`)) return;
    if (!fs.existsSync(resolvedTarget)) return;
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
  } catch {
    // Cleanup is best effort; DB delete still succeeds.
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startApiServer();
}
