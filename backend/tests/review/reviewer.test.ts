import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AnalysisReport,
  CandidateTask,
  ExecutionRun,
  RunArtifact,
} from '../../src/domain/schemas.js';
import { generateReview } from '../../src/review/reviewer.js';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { Repository } from '../../src/storage/repository.js';

function makeTestData() {
  const ts = new Date().toISOString();

  const analysis: AnalysisReport = {
    id: 'anl_test1',
    sourceId: 'src_test1',
    summary: 'Test analysis',
    classification: 'prototype',
    complexity: 3,
    risk: 2,
    confidence: 0.7,
    insights: ['insight 1'],
    createdAt: ts,
  };

  const task: CandidateTask = {
    id: 'tsk_test1',
    analysisId: 'anl_test1',
    sourceId: 'src_test1',
    title: 'Test task',
    rationale: 'Test rationale',
    expectedValue: 'Test value',
    difficulty: 'moderate',
    definitionOfDone: 'Done when tests pass',
    riskNotes: 'Low risk',
    order: 1,
    createdAt: ts,
  };

  const run: ExecutionRun = {
    id: 'run_test1',
    taskId: 'tsk_test1',
    sourceId: 'src_test1',
    status: 'completed',
    backend: 'internal-planner',
    workspacePath: '/tmp/test/workspace',
    startedAt: ts,
    completedAt: ts,
    createdAt: ts,
  };

  const artifact: RunArtifact = {
    id: 'art_test1',
    runId: 'run_test1',
    type: 'plan',
    path: '/tmp/test/workspace/plan.md',
    description: 'Execution plan',
    createdAt: ts,
  };

  return { analysis, task, run, artifact };
}

describe('generateReview', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createInMemoryDatabase();
    repo = new Repository(db);
  });

  it('generates a review for a completed run', () => {
    const { analysis, task, run, artifact } = makeTestData();

    repo.saveSource({
      id: 'src_test1',
      type: 'text-brief',
      location: 'inline',
      name: 'test',
      createdAt: new Date().toISOString(),
    });
    repo.saveAnalysis(analysis);
    repo.saveTasks([task]);
    repo.saveRun(run);
    repo.saveArtifact(artifact);

    const review = generateReview({ run, task, analysis, repo });

    expect(review.runId).toBe('run_test1');
    expect(review.confidence).toBe(0.7);
    expect(review.attempted).toContain('Test task');
    expect(review.changed).toContain('1 artifact');
    expect(review.succeeded).toContain('successfully');
  });

  it('generates a review for a failed run', () => {
    const { analysis, task, run } = makeTestData();
    const failedRun: ExecutionRun = { ...run, status: 'failed', error: 'Something went wrong' };

    repo.saveSource({
      id: 'src_test1',
      type: 'text-brief',
      location: 'inline',
      name: 'test',
      createdAt: new Date().toISOString(),
    });
    repo.saveAnalysis(analysis);
    repo.saveTasks([task]);
    repo.saveRun(failedRun);

    const review = generateReview({ run: failedRun, task, analysis, repo });

    expect(review.confidence).toBe(0.35); // 0.7 * 0.5
    expect(review.succeeded).toContain('did not complete');
    expect(review.nextAction).toContain('Investigate');
  });

  it('saves the review to the database', () => {
    const { analysis, task, run, artifact } = makeTestData();

    repo.saveSource({
      id: 'src_test1',
      type: 'text-brief',
      location: 'inline',
      name: 'test',
      createdAt: new Date().toISOString(),
    });
    repo.saveAnalysis(analysis);
    repo.saveTasks([task]);
    repo.saveRun(run);
    repo.saveArtifact(artifact);

    generateReview({ run, task, analysis, repo });

    const saved = repo.getReview(run.id);
    expect(saved).not.toBeNull();
    expect(saved?.runId).toBe(run.id);
  });
});
