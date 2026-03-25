import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import type { AnalysisReport, CandidateTask, Source } from '../../src/domain/schemas.js';
import { executeTask } from '../../src/execution/executor.js';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { Repository } from '../../src/storage/repository.js';

function makeTestSource(): Source {
  return {
    id: 'src_test1',
    type: 'text-brief',
    location: 'inline',
    name: 'test brief',
    metadata: { brief: 'Test building a CLI tool' },
    createdAt: new Date().toISOString(),
  };
}

function makeTestAnalysis(sourceId: string): AnalysisReport {
  return {
    id: 'anl_test1',
    sourceId,
    summary: 'Test brief with 5 words.',
    classification: 'prototype',
    complexity: 2,
    risk: 1,
    confidence: 0.6,
    insights: ['Test insight'],
    createdAt: new Date().toISOString(),
  };
}

function makeTestTask(analysisId: string, sourceId: string): CandidateTask {
  return {
    id: 'tsk_test1',
    analysisId,
    sourceId,
    title: 'Scaffold a prototype',
    rationale: 'Get to a working skeleton quickly.',
    expectedValue: 'Working prototype.',
    difficulty: 'moderate',
    definitionOfDone: 'Runnable prototype with core functionality.',
    riskNotes: 'Prototype quality may not match production needs.',
    order: 1,
    createdAt: new Date().toISOString(),
  };
}

describe('executeTask', () => {
  let repo: Repository;
  let config: ReturnType<typeof loadConfig>;
  let tmpDir: string;

  beforeEach(() => {
    const db = createInMemoryDatabase();
    repo = new Repository(db);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-test-'));
    config = loadConfig({
      dataDir: tmpDir,
      runsDir: path.join(tmpDir, 'runs'),
      logLevel: 'error',
    });
  });

  it('creates a run and completes successfully', async () => {
    const source = makeTestSource();
    const analysis = makeTestAnalysis(source.id);
    const task = makeTestTask(analysis.id, source.id);

    repo.saveSource(source);
    repo.saveAnalysis(analysis);
    repo.saveTasks([task]);

    const run = await executeTask({ task, source, analysis, config, repo });

    expect(run.status).toBe('completed');
    expect(run.taskId).toBe(task.id);
    expect(run.backend).toBe('internal-planner');
    expect(fs.existsSync(run.workspacePath)).toBe(true);
  });

  it('saves artifacts to the run directory', async () => {
    const source = makeTestSource();
    const analysis = makeTestAnalysis(source.id);
    const task = makeTestTask(analysis.id, source.id);

    repo.saveSource(source);
    repo.saveAnalysis(analysis);
    repo.saveTasks([task]);

    const run = await executeTask({ task, source, analysis, config, repo });
    const runDir = path.dirname(run.workspacePath);

    expect(fs.existsSync(path.join(runDir, 'analysis.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'tasks.json'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(runDir, 'run.json'))).toBe(true);
  });

  it('records artifacts in the database', async () => {
    const source = makeTestSource();
    const analysis = makeTestAnalysis(source.id);
    const task = makeTestTask(analysis.id, source.id);

    repo.saveSource(source);
    repo.saveAnalysis(analysis);
    repo.saveTasks([task]);

    const run = await executeTask({ task, source, analysis, config, repo });
    const artifacts = repo.getArtifactsByRun(run.id);

    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some((a) => a.type === 'plan')).toBe(true);
    expect(artifacts.some((a) => a.type === 'summary')).toBe(true);
  });
});
