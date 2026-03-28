import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSource, compareAnalyses } from '../analysis/index.js';
import { exportToCsv, exportToJson, exportToMarkdown } from '../analysis/export.js';
import { loadConfig } from '../core/config.js';
import type { Source } from '../domain/index.js';
import { executeTask } from '../execution/index.js';
import { ingestSource } from '../intake/index.js';
import { generateTasks } from '../planning/index.js';
import { generateReview } from '../review/index.js';
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

// ── Next-task recommendation with score breakdown ────────────

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
  const analysis = repo.getAnalysisBySource(sourceId);
  const gitHotspots = analysis?.deepAnalysis?.gitHistory?.hotspots ?? [];

  const scored = pending
    .map((task) => ({
      task,
      breakdown: computeTaskPriorityScore(task, allReviews, gitHotspots),
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total || a.task.order - b.task.order);

  const top = scored[0] ?? null;

  return res.json({
    sourceId,
    nextTask: top?.task ?? null,
    scoreBreakdown: top?.breakdown ?? null,
    summary: top
      ? `Next suggested task is #${top.task.order}: ${top.task.title}`
      : 'No pending tasks remain for this source.',
    pendingTaskCount: pending.length,
    runCount: runs.length,
  });
});

// ── Portfolio triage with health scores ──────────────────────

app.get('/api/portfolio-triage', (_req: Request, res: Response) => {
  const sources = dedupeSourcesForPortfolio(repo.listSources());
  const rows = sources.map((source) => {
    const tasks = repo.getTasksBySource(source.id);
    const runs = repo.listRuns().filter((run) => run.sourceId === source.id);
    const reviews = runs
      .map((run) => repo.getReview(run.id))
      .filter((review): review is NonNullable<typeof review> => Boolean(review));
    const analysis = repo.getAnalysisBySource(source.id);
    const healthScore = analysis?.deepAnalysis?.healthScore?.overall ?? 50;
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
        (healthScore / 100) * 1.5
      ).toFixed(2),
    );
    return {
      sourceId: source.id,
      name: source.name,
      healthScore,
      pendingTaskCount: pendingTasks.length,
      runCount: runs.length,
      failureRate: Number(failureRate.toFixed(2)),
      avgDoneScore: Number(avgDoneScore.toFixed(2)),
      portfolioScore,
    };
  });

  const sorted = rows.sort((a, b) => b.portfolioScore - a.portfolioScore);
  return res.json({
    summary: 'Portfolio triage ranked by expected payoff, health, and execution reliability.',
    items: sorted,
  });
});

// ── Trust envelope ───────────────────────────────────────────

app.get('/api/trust-envelope/:runId', (req: Request, res: Response) => {
  const runId = pickParam(req.params.runId);
  const run = runId ? repo.getRun(runId) : null;
  if (!run) return res.status(404).json({ error: `Run not found: ${runId ?? 'unknown'}` });

  return res.json({ envelope: buildTrustEnvelope(run) });
});

// ── Proof of value with health delta ─────────────────────────

app.get('/api/proof-of-value/:sourceId', (req: Request, res: Response) => {
  const sourceId = pickParam(req.params.sourceId);
  if (!sourceId) return res.status(400).json({ error: 'Source ID is required.' });
  const source = repo.getSource(sourceId);
  if (!source) return res.status(404).json({ error: `Source not found: ${sourceId}` });

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

  const analyses = repo.listAnalysesBySource(sourceId);
  const latestHealth = analyses[0]?.deepAnalysis?.healthScore?.overall ?? null;
  const earliestHealth = analyses.length > 1
    ? analyses[analyses.length - 1]?.deepAnalysis?.healthScore?.overall ?? null
    : null;
  const healthDelta = latestHealth !== null && earliestHealth !== null
    ? Number((latestHealth - earliestHealth).toFixed(1))
    : null;

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
      healthScoreCurrent: latestHealth,
      healthScoreDelta: healthDelta,
    },
  });
});

// ── Reviews & run documents ──────────────────────────────────

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
    trustEnvelope: buildTrustEnvelope(run),
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

// ── Analysis & export ────────────────────────────────────────

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
    const labelA = sourceA?.name ?? analysisA.sourceId;
    const labelB = sourceB?.name ?? analysisB.sourceId;

    const comparison = compareAnalyses(
      analysisA,
      analysisB,
      labelA,
      labelB,
    );

    return res.json({ comparison });
  } catch (error) {
    return handleError(error, res);
  }
});

// ── Ingest & run ─────────────────────────────────────────────

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

    const run = await executeTask({
      task,
      source,
      analysis,
      config,
      repo,
      idempotencyKey: idempotencyKey || undefined,
    });
    const review = generateReview({ run, task, analysis, repo });

    return res.status(201).json({ run, review, reused: false });
  } catch (error) {
    return handleError(error, res);
  }
});

// ── Server lifecycle ─────────────────────────────────────────

export function startApiServer(options: ApiServerOptions = {}) {
  const port = options.port ?? defaultPort;
  const server = app.listen(port, () => {
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

// ── Helpers ──────────────────────────────────────────────────

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

function dedupeSourcesForPortfolio(sources: Source[]): Source[] {
  const byIdentity = new Map<string, Source>();
  for (const source of sources) {
    const key = getSourceIdentityKey(source);
    const existing = byIdentity.get(key);
    if (!existing || existing.createdAt < source.createdAt) {
      byIdentity.set(key, source);
    }
  }
  return [...byIdentity.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getSourceIdentityKey(source: Source): string {
  if (source.fingerprint) return `fingerprint:${source.fingerprint}`;
  if (source.location) {
    const normalizedLocation = source.location.replace(/\\/g, '/').toLowerCase();
    return `location:${source.type}:${normalizedLocation}`;
  }
  return `name:${source.type}:${source.name.toLowerCase()}`;
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

interface TaskScoreBreakdown {
  total: number;
  taskConfidence: number;
  historicalQuality: number;
  historicalReliability: number;
  explainability: number;
  orderDecay: number;
  difficultyFactor: number;
  hotspotBoost: number;
}

function computeTaskPriorityScore(
  task: {
    order: number;
    difficulty: string;
    confidence?: number;
    whyNow?: string;
    title: string;
    executionContract?: { scope?: string } | null;
  },
  reviews: Array<{ confidence: number; doneScore?: number }>,
  hotspots?: Array<{ file: string; changeCount: number }>,
): TaskScoreBreakdown {
  const historicalDone = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + (review.doneScore ?? 0), 0) / reviews.length
    : 0.55;
  const historicalConfidence = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + review.confidence, 0) / reviews.length
    : 0.6;
  const taskConfidence = task.confidence ?? 0.55;
  const difficultyFactor =
    task.difficulty === 'hard' || task.difficulty === 'complex'
      ? 0.8
      : task.difficulty === 'moderate'
        ? 0.9
        : 1;
  const explainability = task.whyNow ? 0.1 : 0;
  const orderDecay = 1 / (task.order + 0.5);

  // Hotspot boost: if the task targets frequently-changed files, boost its priority
  // CodeScene research shows fixing hotspots delivers 3-6x more value
  let hotspotBoost = 0;
  if (hotspots && hotspots.length > 0) {
    const scope = task.executionContract?.scope ?? task.title;
    const topHotspotFiles = new Set(hotspots.slice(0, 10).map((h) => h.file));
    for (const file of topHotspotFiles) {
      const basename = file.split('/').pop() ?? file;
      if (scope.includes(basename) || scope.includes(file)) {
        hotspotBoost = 0.15; // Significant boost for targeting hotspot files
        break;
      }
    }
  }

  const raw =
    taskConfidence * 0.40 +
    historicalDone * 0.20 +
    historicalConfidence * 0.15 +
    explainability +
    orderDecay * 0.1 +
    hotspotBoost;

  return {
    total: Number((raw * difficultyFactor).toFixed(3)),
    taskConfidence: Number((taskConfidence * 0.40).toFixed(3)),
    historicalQuality: Number((historicalDone * 0.20).toFixed(3)),
    historicalReliability: Number((historicalConfidence * 0.15).toFixed(3)),
    explainability: Number(explainability.toFixed(3)),
    orderDecay: Number((orderDecay * 0.1).toFixed(3)),
    difficultyFactor,
    hotspotBoost: Number(hotspotBoost.toFixed(3)),
  };
}

function buildTrustEnvelope(run: {
  id: string;
  taskId: string;
  sourceId: string;
  status: string;
  error?: string;
}) {
  const task = repo.getTask(run.taskId);
  const review = repo.getReview(run.id);
  const artifacts = repo.getArtifactsByRun(run.id);
  const analysis = repo.getAnalysisBySource(run.sourceId);

  const analysisConfidence = task?.confidence ?? null;
  const executionConfidence = review?.confidence ?? null;

  // --- Multi-signal trust decomposition ---
  // Each signal is 0-1 and represents confidence from a different perspective

  // 1. Static analysis signal: how thorough was the analysis?
  const staticAnalysisSignal = analysis?.confidence ?? 0.5;

  // 2. Execution signal: did the run succeed and produce quality output?
  const executionSignal = run.status === 'completed'
    ? Math.min(1, (review?.doneScore ?? 0.3) * 0.7 + (artifacts.length > 0 ? 0.3 : 0))
    : run.status === 'failed' ? 0.1 : 0.3;

  // 3. Review signal: what does the post-run review say?
  const reviewSignal = review
    ? (review.confidence * 0.5 + (review.doneScore ?? 0) * 0.5)
    : 0.4;

  // 4. Evidence signal: how much supporting evidence exists?
  const evidenceSignal = Math.min(1, artifacts.length * 0.25 +
    (review?.findings?.length ?? 0) * 0.1);

  let unresolvedRiskCount = 0;
  const riskSignals: string[] = [];
  if (task?.riskNotes) {
    unresolvedRiskCount += 1;
    riskSignals.push('Task has documented risks');
  }
  if (run.status === 'failed' || run.error) {
    unresolvedRiskCount += 2;
    riskSignals.push(run.error ? `Execution error: ${run.error.slice(0, 80)}` : 'Run failed');
  }
  if (review?.doneScore !== undefined && review.doneScore < 0.5) {
    unresolvedRiskCount += 1;
    riskSignals.push(`Low quality score (${Math.round(review.doneScore * 100)}%)`);
  }
  if (review?.failed && review.failed.toLowerCase() !== 'none' && review.failed.toLowerCase() !== 'no failures') {
    unresolvedRiskCount += 1;
    riskSignals.push('Review reported failures');
  }

  // Weighted trust computation
  const merged = (
    staticAnalysisSignal * 0.25 +
    executionSignal * 0.35 +
    reviewSignal * 0.25 +
    evidenceSignal * 0.15
  );

  let trustLevel: 'high' | 'moderate' | 'low' = 'moderate';
  if (run.status === 'failed') trustLevel = 'low';
  else if (merged >= 0.7 && unresolvedRiskCount === 0) trustLevel = 'high';
  else if (merged < 0.45 || unresolvedRiskCount >= 3) trustLevel = 'low';

  return {
    runId: run.id,
    status: run.status,
    analysisConfidence,
    executionConfidence,
    evidenceCoverage: artifacts.length,
    unresolvedRiskCount,
    trustLevel,
    // Multi-signal breakdown (new)
    signals: {
      staticAnalysis: Number(staticAnalysisSignal.toFixed(2)),
      execution: Number(executionSignal.toFixed(2)),
      review: Number(reviewSignal.toFixed(2)),
      evidence: Number(evidenceSignal.toFixed(2)),
    },
    riskSignals,
    mergedScore: Number(merged.toFixed(3)),
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
