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
  const allReviews = runs
    .map((run) => repo.getReview(run.id))
    .filter((review): review is NonNullable<typeof review> => Boolean(review));
  const nextTask =
    pending
      .map((task) => ({
        task,
        score: computeTaskPriorityScore(task, allReviews),
      }))
      .sort((a, b) => b.score - a.score || a.task.order - b.task.order)[0]?.task ?? null;

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

app.post('/api/work-order', (req: Request, res: Response) => {
  try {
    const sourceId = typeof req.body?.sourceId === 'string' ? req.body.sourceId.trim() : '';
    const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
    if (!sourceId || !intent) {
      return res.status(400).json({ error: 'Request fields "sourceId" and "intent" are required.' });
    }

    const source = repo.getSource(sourceId);
    if (!source) {
      return res.status(404).json({ error: `Source not found: ${sourceId}` });
    }

    const metadata = { ...(source.metadata ?? {}), intent, intentUpdatedAt: new Date().toISOString() };
    repo.updateSourceMetadata(sourceId, metadata);

    const tasks = repo.getTasksBySource(sourceId);
    const prioritized = tasks
      .map((task) => ({
        ...task,
        whyNow: `${task.whyNow ?? task.rationale} Intent focus: ${intent}.`,
      }))
      .sort((a, b) => computeIntentFitScore(b, intent) - computeIntentFitScore(a, intent));

    return res.json({
      sourceId,
      intent,
      summary: `Created intent-first work order for "${intent}"`,
      topTask: prioritized[0] ?? null,
      tasks: prioritized,
    });
  } catch (error) {
    return handleError(error, res);
  }
});

app.get('/api/portfolio-triage', (_req: Request, res: Response) => {
  const sources = repo.listSources();
  const rows = sources.map((source) => {
    const tasks = repo.getTasksBySource(source.id);
    const runs = repo.listRuns().filter((run) => run.sourceId === source.id);
    const reviews = runs
      .map((run) => repo.getReview(run.id))
      .filter((review): review is NonNullable<typeof review> => Boolean(review));
    const pendingTasks = tasks.filter((task) => !runs.some((run) => run.taskId === task.id));
    const failureRate = runs.length > 0 ? runs.filter((run) => run.status === 'failed').length / runs.length : 0;
    const avgDoneScore = reviews.length > 0
      ? reviews.reduce((sum, review) => sum + (review.doneScore ?? 0), 0) / reviews.length
      : 0;
    const portfolioScore = Number(
      (
        pendingTasks.length * 0.5 +
        (1 - failureRate) * 2 +
        avgDoneScore * 2 +
        (source.metadata?.intent ? 0.75 : 0)
      ).toFixed(2),
    );
    return {
      sourceId: source.id,
      name: source.name,
      intent: source.metadata?.intent ?? null,
      pendingTaskCount: pendingTasks.length,
      runCount: runs.length,
      failureRate: Number(failureRate.toFixed(2)),
      avgDoneScore: Number(avgDoneScore.toFixed(2)),
      portfolioScore,
    };
  });

  const sorted = rows.sort((a, b) => b.portfolioScore - a.portfolioScore);
  return res.json({
    summary: 'Portfolio triage ranked by expected payoff and execution reliability.',
    items: sorted,
  });
});

app.get('/api/trust-envelope/:runId', (req: Request, res: Response) => {
  const runId = pickParam(req.params.runId);
  const run = runId ? repo.getRun(runId) : null;
  if (!run) return res.status(404).json({ error: `Run not found: ${runId ?? 'unknown'}` });

  const task = repo.getTask(run.taskId);
  const review = repo.getReview(run.id);
  const artifacts = repo.getArtifactsByRun(run.id);
  const envelope = {
    runId: run.id,
    status: run.status,
    analysisConfidence: task?.confidence ?? null,
    executionConfidence: review?.confidence ?? null,
    evidenceCoverage: artifacts.length,
    unresolvedRiskCount: countUnresolvedRiskSignals(task, run, review),
    trustLevel: inferTrustLevel(task?.confidence, review?.confidence, run.status),
  };
  return res.json({ envelope });
});

app.get('/api/recovery-playbook/:runId', (req: Request, res: Response) => {
  const runId = pickParam(req.params.runId);
  const run = runId ? repo.getRun(runId) : null;
  if (!run) return res.status(404).json({ error: `Run not found: ${runId ?? 'unknown'}` });
  const failure = classifyFailure(run.error, run.status);
  return res.json({
    runId: run.id,
    failureCategory: failure.category,
    confidence: failure.confidence,
    playbook: failure.playbook,
  });
});

app.get('/api/outcome-graph/:sourceId', (req: Request, res: Response) => {
  const sourceId = pickParam(req.params.sourceId);
  if (!sourceId) return res.status(400).json({ error: 'Source ID is required.' });
  const source = repo.getSource(sourceId);
  if (!source) return res.status(404).json({ error: `Source not found: ${sourceId}` });
  const analysis = repo.getAnalysisBySource(sourceId);
  const tasks = repo.getTasksBySource(sourceId);
  const runs = repo.listRuns().filter((run) => run.sourceId === sourceId);
  const reviews = runs
    .map((run) => ({ runId: run.id, review: repo.getReview(run.id) }))
    .filter((entry) => entry.review);
  return res.json({
    sourceId,
    goal: source.metadata?.intent ?? analysis?.summary ?? source.name,
    evidence: analysis?.insights ?? [],
    actions: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      whyNow: task.whyNow ?? null,
      confidence: task.confidence ?? null,
    })),
    outcomes: reviews.map((entry) => ({
      runId: entry.runId,
      doneScore: entry.review?.doneScore ?? null,
      nextAction: entry.review?.nextAction ?? null,
      confidence: entry.review?.confidence ?? null,
    })),
  });
});

app.get('/api/proof-of-value/:sourceId', (req: Request, res: Response) => {
  const sourceId = pickParam(req.params.sourceId);
  if (!sourceId) return res.status(400).json({ error: 'Source ID is required.' });
  const source = repo.getSource(sourceId);
  if (!source) return res.status(404).json({ error: `Source not found: ${sourceId}` });
  const analysis = repo.getAnalysisBySource(sourceId);
  const runs = repo.listRuns().filter((run) => run.sourceId === sourceId);
  const reviews = runs
    .map((run) => repo.getReview(run.id))
    .filter((review): review is NonNullable<typeof review> => Boolean(review));

  const completed = runs.filter((run) => run.status === 'completed').length;
  const failed = runs.filter((run) => run.status === 'failed').length;
  const avgDoneScore = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + (review.doneScore ?? 0), 0) / reviews.length
    : 0;
  const avgReviewConfidence = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + review.confidence, 0) / reviews.length
    : 0;

  return res.json({
    sourceId,
    sourceName: source.name,
    metrics: {
      runCount: runs.length,
      completedRuns: completed,
      failedRuns: failed,
      completionRate: runs.length > 0 ? Number((completed / runs.length).toFixed(2)) : 0,
      averageDoneScore: Number(avgDoneScore.toFixed(2)),
      averageReviewConfidence: Number(avgReviewConfidence.toFixed(2)),
      analysisRisk: analysis?.risk ?? null,
      analysisComplexity: analysis?.complexity ?? null,
    },
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
    const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
    if (!sourceInput) {
      return res.status(400).json({ error: 'Request field "source" is required.' });
    }

    const source = ingestSource(sourceInput, config);
    if (intent) {
      source.metadata = { ...(source.metadata ?? {}), intent, intentUpdatedAt: new Date().toISOString() };
    }
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
    const safetyProfile = req.body?.safetyProfile === 'conservative' || req.body?.safetyProfile === 'aggressive'
      ? req.body.safetyProfile
      : 'balanced';
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

    const run = await executeTask({
      task,
      source,
      analysis,
      config,
      repo,
      idempotencyKey: idempotencyKey || undefined,
      safetyProfile,
    });
    const review = generateReview({ run, task, analysis, repo });

    return res.status(201).json({ run, review, reused: false, safetyProfile });
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

function computeTaskPriorityScore(
  task: {
    order: number;
    difficulty: string;
    confidence?: number;
    whyNow?: string;
    title: string;
  },
  reviews: Array<{ confidence: number; doneScore?: number }>,
): number {
  const historicalDone = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + (review.doneScore ?? 0), 0) / reviews.length
    : 0.55;
  const historicalConfidence = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + review.confidence, 0) / reviews.length
    : 0.6;
  const taskConfidence = task.confidence ?? 0.55;
  const difficultyWeight =
    task.difficulty === 'hard' || task.difficulty === 'complex'
      ? 0.8
      : task.difficulty === 'moderate'
        ? 0.9
        : 1;
  const explainabilityBoost = task.whyNow ? 0.1 : 0;
  const orderDecay = 1 / (task.order + 0.5);
  return Number(
    (
      taskConfidence * 0.45 +
      historicalDone * 0.25 +
      historicalConfidence * 0.2 +
      explainabilityBoost +
      orderDecay * 0.1
    ) * difficultyWeight,
  );
}

function computeIntentFitScore(task: { title: string; rationale: string; whyNow?: string }, intent: string): number {
  const haystack = `${task.title} ${task.rationale} ${task.whyNow ?? ''}`.toLowerCase();
  const terms = intent
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return 0;
  const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  return hits / terms.length;
}

function inferTrustLevel(
  analysisConfidence: number | undefined | null,
  executionConfidence: number | undefined | null,
  status: string,
): 'high' | 'moderate' | 'low' {
  const merged = ((analysisConfidence ?? 0.5) + (executionConfidence ?? 0.5)) / 2;
  if (status === 'failed') return 'low';
  if (merged >= 0.75) return 'high';
  if (merged >= 0.55) return 'moderate';
  return 'low';
}

function countUnresolvedRiskSignals(
  task: { riskNotes?: string } | null,
  run: { status: string; error?: string },
  review: { doneScore?: number; failed: string } | null,
): number {
  let count = 0;
  if (task?.riskNotes) count += 1;
  if (run.status === 'failed' || run.error) count += 2;
  if (review?.doneScore !== undefined && review.doneScore < 0.5) count += 1;
  if (review?.failed && review.failed.toLowerCase() !== 'none') count += 1;
  return count;
}

function classifyFailure(
  error: string | undefined,
  status: string,
): { category: string; confidence: number; playbook: string[] } {
  if (status !== 'failed') {
    return {
      category: 'no-failure',
      confidence: 1,
      playbook: ['Run completed; continue with next prioritized task.'],
    };
  }
  const msg = (error ?? '').toLowerCase();
  if (msg.includes('not found') || msg.includes('enoent') || msg.includes('missing')) {
    return {
      category: 'environment',
      confidence: 0.8,
      playbook: [
        'Validate workspace paths and required files.',
        'Re-run with conservative safety profile.',
        'Attach missing prerequisites to work order metadata.',
      ],
    };
  }
  if (msg.includes('timeout') || msg.includes('flaky')) {
    return {
      category: 'flaky-execution',
      confidence: 0.72,
      playbook: [
        'Retry once with idempotency key.',
        'Narrow task scope and isolate unstable checks.',
        'Tag run for follow-up reliability analysis.',
      ],
    };
  }
  if (msg.includes('merge') || msg.includes('conflict')) {
    return {
      category: 'merge-conflict',
      confidence: 0.78,
      playbook: [
        'Rebase or refresh source clone.',
        'Re-run with conservative safety profile and narrower scope.',
        'Split task into smaller execution contracts.',
      ],
    };
  }
  return {
    category: 'tooling-or-logic',
    confidence: 0.6,
    playbook: [
      'Inspect command log artifact for failing stage.',
      'Run with balanced profile and reduced scope.',
      'Escalate if repeated failure occurs.',
    ],
  };
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
