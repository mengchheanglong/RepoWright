import { beforeEach, describe, expect, it } from 'vitest';
import type { AnalysisReport, CandidateTask, Source } from '../../src/domain/schemas.js';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { Repository } from '../../src/storage/repository.js';

describe('Repository', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createInMemoryDatabase();
    repo = new Repository(db);
  });

  const testSource: Source = {
    id: 'src_test1',
    type: 'text-brief',
    location: 'inline',
    name: 'test brief',
    metadata: { brief: 'hello world' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const testAnalysis: AnalysisReport = {
    id: 'anl_test1',
    sourceId: 'src_test1',
    summary: 'A test brief',
    classification: 'learn',
    complexity: 2,
    risk: 1,
    confidence: 0.6,
    insights: ['Short brief'],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  describe('sources', () => {
    it('saves and retrieves a source', () => {
      repo.saveSource(testSource);
      const retrieved = repo.getSource('src_test1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('src_test1');
      expect(retrieved?.type).toBe('text-brief');
      expect(retrieved?.name).toBe('test brief');
    });

    it('lists sources in reverse chronological order', () => {
      repo.saveSource(testSource);
      repo.saveSource({
        ...testSource,
        id: 'src_test2',
        name: 'second',
        createdAt: '2026-01-02T00:00:00.000Z',
      });
      const list = repo.listSources();
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe('src_test2');
    });

    it('returns null for nonexistent source', () => {
      expect(repo.getSource('nope')).toBeNull();
    });
  });

  describe('analyses', () => {
    it('saves and retrieves an analysis', () => {
      repo.saveSource(testSource);
      repo.saveAnalysis(testAnalysis);
      const retrieved = repo.getAnalysis('anl_test1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.classification).toBe('learn');
      expect(retrieved?.insights).toEqual(['Short brief']);
    });

    it('gets analysis by source', () => {
      repo.saveSource(testSource);
      repo.saveAnalysis(testAnalysis);
      const retrieved = repo.getAnalysisBySource('src_test1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('anl_test1');
    });
  });

  describe('tasks', () => {
    const testTasks: CandidateTask[] = [
      {
        id: 'tsk_1',
        analysisId: 'anl_test1',
        sourceId: 'src_test1',
        title: 'Task 1',
        rationale: 'r1',
        expectedValue: 'v1',
        difficulty: 'easy',
        definitionOfDone: 'd1',
        riskNotes: 'n1',
        order: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'tsk_2',
        analysisId: 'anl_test1',
        sourceId: 'src_test1',
        title: 'Task 2',
        rationale: 'r2',
        expectedValue: 'v2',
        difficulty: 'moderate',
        definitionOfDone: 'd2',
        riskNotes: 'n2',
        order: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    it('saves and retrieves tasks', () => {
      repo.saveSource(testSource);
      repo.saveAnalysis(testAnalysis);
      repo.saveTasks(testTasks);

      const task = repo.getTask('tsk_1');
      expect(task).not.toBeNull();
      expect(task?.title).toBe('Task 1');
    });

    it('gets tasks by source', () => {
      repo.saveSource(testSource);
      repo.saveAnalysis(testAnalysis);
      repo.saveTasks(testTasks);

      const tasks = repo.getTasksBySource('src_test1');
      expect(tasks).toHaveLength(2);
    });
  });

  describe('runs', () => {
    it('supports idempotent run lookup by task and key', () => {
      repo.saveSource(testSource);
      repo.saveAnalysis(testAnalysis);
      repo.saveTasks([
        {
          id: 'tsk_run',
          analysisId: 'anl_test1',
          sourceId: 'src_test1',
          title: 'Run task',
          rationale: 'r',
          expectedValue: 'v',
          difficulty: 'easy',
          definitionOfDone: 'd',
          riskNotes: 'n',
          order: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

      repo.saveRun({
        id: 'run_1',
        taskId: 'tsk_run',
        sourceId: 'src_test1',
        idempotencyKey: 'idemp-123',
        status: 'created',
        backend: 'internal-planner',
        workspacePath: '/tmp/workspace',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      const existing = repo.getRunByTaskAndIdempotency('tsk_run', 'idemp-123');
      expect(existing?.id).toBe('run_1');
      expect(existing?.idempotencyKey).toBe('idemp-123');
    });
  });
});
