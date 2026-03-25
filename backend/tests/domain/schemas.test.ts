import { describe, expect, it } from 'vitest';
import {
  AnalysisReport,
  CandidateTask,
  ExecutionRun,
  RunStatus,
  Source,
  SourceType,
  WorkClassification,
} from '../../src/domain/schemas.js';

describe('SourceType enum', () => {
  it('accepts valid types', () => {
    expect(SourceType.parse('directory')).toBe('directory');
    expect(SourceType.parse('git-url')).toBe('git-url');
    expect(SourceType.parse('text-brief')).toBe('text-brief');
    expect(SourceType.parse('file')).toBe('file');
  });

  it('rejects invalid types', () => {
    expect(() => SourceType.parse('invalid')).toThrow();
  });
});

describe('Source schema', () => {
  it('validates a well-formed source', () => {
    const result = Source.safeParse({
      id: 'src_abc123',
      type: 'directory',
      location: '/tmp/test',
      name: 'test-project',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects source with missing fields', () => {
    const result = Source.safeParse({ id: 'src_abc' });
    expect(result.success).toBe(false);
  });

  it('accepts optional metadata and fingerprint', () => {
    const result = Source.safeParse({
      id: 'src_abc123',
      type: 'git-url',
      location: '/tmp/cloned',
      name: 'repo',
      metadata: { gitUrl: 'https://github.com/test/repo' },
      fingerprint: 'sha256:abc',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('AnalysisReport schema', () => {
  it('validates a well-formed analysis', () => {
    const result = AnalysisReport.safeParse({
      id: 'anl_abc',
      sourceId: 'src_abc',
      summary: 'A test project',
      classification: 'learn',
      complexity: 3.5,
      risk: 2.0,
      confidence: 0.7,
      insights: ['Has tests', 'Uses TypeScript'],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects out-of-range complexity', () => {
    const result = AnalysisReport.safeParse({
      id: 'anl_abc',
      sourceId: 'src_abc',
      summary: 'test',
      classification: 'learn',
      complexity: 15, // max is 10
      risk: 2,
      confidence: 0.7,
      insights: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkClassification enum', () => {
  it('accepts all valid classifications', () => {
    const valid = [
      'learn',
      'extract-skill',
      'improve-architecture',
      'prototype',
      'bugfix',
      'ignore',
    ];
    for (const v of valid) {
      expect(WorkClassification.parse(v)).toBe(v);
    }
  });
});

describe('RunStatus enum', () => {
  it('accepts all valid statuses', () => {
    const valid = ['created', 'analyzed', 'planned', 'executing', 'completed', 'failed', 'aborted'];
    for (const v of valid) {
      expect(RunStatus.parse(v)).toBe(v);
    }
  });
});
