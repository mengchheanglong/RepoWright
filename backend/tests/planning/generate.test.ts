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
});
