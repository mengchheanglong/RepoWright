import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSource, compareAnalyses } from '../analysis/index.js';
import { loadConfig } from '../core/config.js';
import { executeTask } from '../execution/index.js';
import { ingestSource } from '../intake/index.js';
import { autoSaveAnalysisFindings, autoSaveExecutionOutcome, listMemoryEntries, searchMemoryEntries } from '../memory/index.js';
import { generateTasks } from '../planning/index.js';
import { generateReview } from '../review/index.js';
import { listBackends } from '../routing/router.js';
import { closeDatabase, getDatabase } from '../storage/database.js';
import { Repository } from '../storage/repository.js';
import { initLogger } from '../utils/logger.js';

type BackendOption = 'internal-planner' | 'codex-cli' | 'claude-cli';

const app = express();
const port = Number(process.env.OPERATOR_API_PORT ?? 8787);

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

app.get('/api/backends', (_req: Request, res: Response) => {
  res.json({ backends: listBackends() });
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

app.get('/api/reviews', (_req: Request, res: Response) => {
  const runs = repo.listRuns();
  const items = runs
    .map((run) => {
      const review = repo.getReview(run.id);
      if (!review) return null;

      const artifacts = repo.getArtifactsByRun(run.id);
      return {
        run,
        review,
        artifactCount: artifacts.length,
      };
    })
    .filter((item) => item !== null);

  return res.json({ items });
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
    autoSaveAnalysisFindings(analysis, repo);

    return res.status(201).json({ source, analysis, tasks });
  } catch (error) {
    return handleError(error, res);
  }
});

app.post('/api/run', async (req: Request, res: Response) => {
  try {
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
    const backend = req.body?.backend as BackendOption | undefined;
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

    const run = await executeTask({ task, source, analysis, config, repo, backend });
    const review = generateReview({ run, task, analysis, repo });

    // Auto-save execution outcome to memory
    autoSaveExecutionOutcome(run, task, review, repo);

    return res.status(201).json({ run, review });
  } catch (error) {
    return handleError(error, res);
  }
});

app.get('/api/memory', (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const entries = search ? searchMemoryEntries(repo, search) : listMemoryEntries(repo, category);
    return res.json({ entries });
  } catch (error) {
    return handleError(error, res);
  }
});

const server = app.listen(port, () => {
  // Keep this plain for easy discovery in terminal output.
  console.log(`Operator API running at http://localhost:${port}`);
});

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

function shutdown(): void {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
