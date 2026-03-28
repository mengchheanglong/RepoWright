import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../src/domain/schemas.js';
import { generateTasks } from '../../src/planning/generate.js';

function makeAnalysis(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: 'anl_test',
    sourceId: 'src_test',
    summary: 'A test project for testing',
    classification: 'learn',
    complexity: 3,
    risk: 2,
    confidence: 0.7,
    insights: ['Has tests'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('generateTasks', () => {
  it('generates exactly 3 tasks', () => {
    const tasks = generateTasks(makeAnalysis());
    expect(tasks).toHaveLength(3);
  });

  it('assigns orders 1, 2, 3', () => {
    const tasks = generateTasks(makeAnalysis());
    expect(tasks.map((t) => t.order)).toEqual([1, 2, 3]);
  });

  it('includes required fields on each task', () => {
    const tasks = generateTasks(makeAnalysis());
    for (const t of tasks) {
      expect(t.id).toMatch(/^tsk_/);
      expect(t.title).toBeTruthy();
      expect(t.rationale).toBeTruthy();
      expect(t.expectedValue).toBeTruthy();
      expect(t.difficulty).toBeTruthy();
      expect(t.definitionOfDone).toBeTruthy();
      expect(t.riskNotes).toBeTruthy();
      expect(t.whyNow).toBeTruthy();
      expect(t.confidence).toBeGreaterThan(0);
      expect(t.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(t.alternatives)).toBe(true);
      expect(t.executionContract?.intent).toBeTruthy();
      expect(t.executionContract?.verification.length).toBeGreaterThan(0);
    }
  });

  it('generates different tasks for different classifications', () => {
    const learnTasks = generateTasks(makeAnalysis({ classification: 'learn' }));
    const bugfixTasks = generateTasks(makeAnalysis({ classification: 'bugfix' }));
    expect(learnTasks[0]?.title).not.toBe(bugfixTasks[0]?.title);
  });

  it('generates tasks for all classification types', () => {
    const classifications = [
      'learn',
      'extract-skill',
      'improve-architecture',
      'prototype',
      'bugfix',
      'ignore',
    ] as const;
    for (const c of classifications) {
      const tasks = generateTasks(makeAnalysis({ classification: c }));
      expect(tasks).toHaveLength(3);
    }
  });

  it('keeps findings-driven task fit heuristic below certainty and explains evidence strength', () => {
    const tasks = generateTasks(makeAnalysis({
      deepAnalysis: {
        coreSystem: {
          summary: 'Test system',
          architecture: 'REST API',
          entryPoints: [],
          dataFlow: 'request -> handler',
          techStack: ['TypeScript'],
          frameworks: ['Express'],
          patterns: ['REST API'],
        },
        codeQuality: {
          totalCodeLines: 400,
          totalCommentLines: 40,
          commentRatio: 0.1,
          totalFunctions: 30,
          avgFunctionLength: 20,
          maxFileLines: 420,
          maxFilePath: 'src/app.ts',
          maxNestingDepth: 9,
          maxNestingFile: 'src/app.ts',
          anyTypeCount: 4,
          anyTypeFiles: ['src/app.ts (4)'],
          emptyCatchCount: 6,
          emptyCatchFiles: ['src/app.ts (6)'],
          todoCount: 1,
          largeFiles: [{ path: 'src/app.ts', lines: 420 }],
          topFilesBySize: [{ path: 'src/app.ts', lines: 420 }],
        },
        dependencyGraph: {
          nodes: [],
          centralModules: [],
          circularDeps: [['src/a.ts', 'src/b.ts', 'src/a.ts']],
          orphanFiles: [],
          externalDepCount: 2,
          internalImportCount: 12,
        },
        configAnalysis: {},
        usefulComponents: [],
        improvements: [
          {
            area: 'Error Handling',
            issue: '6 empty catch block(s)',
            suggestion: 'Log or rethrow errors',
            priority: 'high',
            files: ['src/app.ts'],
            estimatedMinutes: 20,
          },
          {
            area: 'Code Complexity',
            issue: 'Maximum nesting depth of 9',
            suggestion: 'Extract helper functions',
            priority: 'high',
            files: ['src/app.ts'],
            estimatedMinutes: 30,
          },
        ],
        uniqueness: { summary: 'n/a', differentiators: [], novelApproaches: [] },
        optimizations: { simplification: [], alternativeStack: [], performance: [] },
      },
    }));

    expect(tasks[0]?.confidence).toBeLessThanOrEqual(0.82);
    expect(tasks[0]?.whyNow).toContain('evidence');
    expect(tasks[0]?.whyNow).not.toContain('% confidence');
  });
});
