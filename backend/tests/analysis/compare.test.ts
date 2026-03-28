import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../src/domain/schemas.js';
import { compareAnalyses } from '../../src/analysis/compare/index.js';

function makeAnalysis(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: 'anl_base',
    sourceId: 'src_repo',
    summary: 'baseline',
    classification: 'improve-architecture',
    complexity: 7,
    risk: 6,
    confidence: 0.7,
    insights: [],
    createdAt: '2026-03-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('compareAnalyses', () => {
  it('includes before/after testing metrics for the same source over time', () => {
    const baseline = makeAnalysis({
      id: 'anl_before',
      deepAnalysis: {
        coreSystem: {
          summary: 'baseline',
          architecture: 'REST API',
          entryPoints: [],
          dataFlow: 'request -> handler',
          techStack: ['TypeScript'],
          frameworks: ['Express'],
          patterns: ['REST API'],
        },
        codeQuality: {
          totalCodeLines: 300,
          totalCommentLines: 30,
          commentRatio: 0.1,
          totalFunctions: 20,
          avgFunctionLength: 18,
          maxFileLines: 200,
          maxFilePath: 'src/app.ts',
          maxNestingDepth: 8,
          maxNestingFile: 'src/app.ts',
          anyTypeCount: 3,
          anyTypeFiles: ['src/app.ts (3)'],
          emptyCatchCount: 5,
          emptyCatchFiles: ['src/app.ts (5)'],
          todoCount: 4,
          largeFiles: [{ path: 'src/app.ts', lines: 420 }],
          topFilesBySize: [{ path: 'src/app.ts', lines: 420 }],
        },
        dependencyGraph: {
          nodes: [],
          centralModules: [],
          circularDeps: [['src/a.ts', 'src/b.ts', 'src/a.ts']],
          orphanFiles: ['src/orphan.ts'],
          externalDepCount: 3,
          internalImportCount: 20,
        },
        configAnalysis: {},
        usefulComponents: [],
        improvements: [],
        uniqueness: { summary: '', differentiators: [], novelApproaches: [] },
        optimizations: { simplification: [], alternativeStack: [], performance: [] },
        security: {
          score: 40,
          findings: [
            {
              type: 'vulnerability',
              severity: 'medium',
              title: 'Unsafe innerHTML',
              description: 'xss risk',
              filePath: 'src/app.ts',
              line: 10,
              pattern: 'innerHTML',
              confidence: 'high',
            },
          ],
          summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
          hasSecurityPolicy: false,
          hasLockFile: true,
          secretsDetected: 0,
          vulnerabilityPatterns: 1,
        },
        healthScore: {
          overall: 55,
          grade: 'D',
          maturity: 'growing',
          dimensions: [],
        },
        techDebt: {
          totalRemediationMinutes: 480,
          debtRatio: 0.2,
          grade: 'C',
        },
      },
    });

    const improved = makeAnalysis({
      id: 'anl_after',
      createdAt: '2026-03-28T01:00:00.000Z',
      confidence: 0.8,
      deepAnalysis: {
        coreSystem: {
          summary: 'after',
          architecture: 'REST API',
          entryPoints: [],
          dataFlow: 'request -> handler',
          techStack: ['TypeScript'],
          frameworks: ['Express'],
          patterns: ['REST API'],
        },
        codeQuality: {
          totalCodeLines: 290,
          totalCommentLines: 35,
          commentRatio: 0.12,
          totalFunctions: 19,
          avgFunctionLength: 15,
          maxFileLines: 180,
          maxFilePath: 'src/app.ts',
          maxNestingDepth: 4,
          maxNestingFile: 'src/app.ts',
          anyTypeCount: 0,
          anyTypeFiles: [],
          emptyCatchCount: 1,
          emptyCatchFiles: ['src/app.ts (1)'],
          todoCount: 1,
          largeFiles: [],
          topFilesBySize: [{ path: 'src/app.ts', lines: 180 }],
        },
        dependencyGraph: {
          nodes: [],
          centralModules: [],
          circularDeps: [],
          orphanFiles: [],
          externalDepCount: 3,
          internalImportCount: 18,
        },
        configAnalysis: {},
        usefulComponents: [],
        improvements: [],
        uniqueness: { summary: '', differentiators: [], novelApproaches: [] },
        optimizations: { simplification: [], alternativeStack: [], performance: [] },
        security: {
          score: 80,
          findings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          hasSecurityPolicy: true,
          hasLockFile: true,
          secretsDetected: 0,
          vulnerabilityPatterns: 0,
        },
        healthScore: {
          overall: 74,
          grade: 'C',
          maturity: 'stable',
          dimensions: [],
        },
        techDebt: {
          totalRemediationMinutes: 120,
          debtRatio: 0.05,
          grade: 'B',
        },
      },
    });

    const comparison = compareAnalyses(
      baseline,
      improved,
      'Repo snapshot (before)',
      'Repo snapshot (after)',
    );

    expect(comparison.sourceA.analysisId).toBe('anl_before');
    expect(comparison.sourceB.analysisId).toBe('anl_after');
    expect(comparison.deltas.find((delta) => delta.metric === 'Health Score')?.direction).toBe('improved');
    expect(comparison.deltas.find((delta) => delta.metric === 'Security Findings')?.direction).toBe('improved');
    expect(comparison.deltas.find((delta) => delta.metric === 'Debt Ratio')?.direction).toBe('improved');
  });
});
