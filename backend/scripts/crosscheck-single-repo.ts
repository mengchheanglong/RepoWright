import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeSource } from '../src/analysis/analyze/index.js';
import { loadConfig } from '../src/core/config.js';
import type { Source, WorkClassification } from '../src/domain/schemas.js';

type TruthRecord = {
  repoName: string;
  repoPath: string;
  truth: {
    languages: string[];
    frameworks: string[];
    patterns: string[];
    classification: WorkClassification;
    security_titles: string[];
  };
  notes?: string;
};

type SetComparison = {
  expected: string[];
  actual: string[];
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
  precision: number;
  recall: number;
  f1: number;
};

const root = path.resolve(process.cwd(), '..');
const truthPath = process.argv[2] ?? path.join(root, 'evaluation', 'benchmark', 'truth', 'self-backend-truth.json');
const outputPath = process.argv[3] ?? path.join(root, 'evaluation', 'results', 'self-backend-crosscheck.json');

const truth = JSON.parse(fs.readFileSync(truthPath, 'utf-8')) as TruthRecord;
const config = loadConfig({ dataDir: path.join(os.tmpdir(), `repowright-crosscheck-${Date.now()}`), maxDeepCodeFileCount: 0 });

function compareSet(expected: string[], actual: string[]): SetComparison {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const truePositives = actual.filter((item) => expectedSet.has(item));
  const falsePositives = actual.filter((item) => !expectedSet.has(item));
  const falseNegatives = expected.filter((item) => !actualSet.has(item));

  const precision = actual.length === 0 ? 1 : truePositives.length / (truePositives.length + falsePositives.length);
  const recall = expected.length === 0 ? 1 : truePositives.length / (truePositives.length + falseNegatives.length);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    expected,
    actual,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
  };
}

const source: Source = {
  id: 'crosscheck_repo',
  type: 'directory',
  location: truth.repoPath,
  name: truth.repoName,
  createdAt: new Date().toISOString(),
};

const startedAt = Date.now();
const report = analyzeSource(source, config);
const runtimeMs = Date.now() - startedAt;

const actual = {
  languages: report.languages ?? [],
  frameworks: report.deepAnalysis?.coreSystem.frameworks ?? [],
  patterns: report.deepAnalysis?.coreSystem.patterns ?? [],
  classification: report.classification,
  security_titles: [...new Set((report.deepAnalysis?.security?.findings ?? []).map((finding) => finding.title))],
};

const comparison = {
  repoName: truth.repoName,
  repoPath: truth.repoPath,
  runtimeMs,
  confidence: report.confidence,
  notes: truth.notes ?? '',
  classification: {
    expected: truth.truth.classification,
    actual: actual.classification,
    correct: truth.truth.classification === actual.classification,
  },
  capabilities: {
    languages: compareSet(truth.truth.languages, actual.languages),
    frameworks: compareSet(truth.truth.frameworks, actual.frameworks),
    patterns: compareSet(truth.truth.patterns, actual.patterns),
    security_titles: compareSet(truth.truth.security_titles, actual.security_titles),
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(comparison, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
