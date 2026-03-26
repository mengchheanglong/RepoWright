import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSource } from '../../src/analysis/analyze/index.js';
import { loadConfig } from '../../src/core/config.js';
import type { Source } from '../../src/domain/schemas.js';

const config = loadConfig({ dataDir: path.join(os.tmpdir(), `repowright-test-${Date.now()}`) });

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src_test',
    type: 'text-brief',
    location: 'inline',
    name: 'test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('analyzeSource', () => {
  it('analyzes a text brief', () => {
    const source = makeSource({
      type: 'text-brief',
      metadata: { brief: 'Learn how React hooks work under the hood' },
    });
    const report = analyzeSource(source, config);

    expect(report.id).toMatch(/^anl_/);
    expect(report.sourceId).toBe('src_test');
    expect(report.classification).toBe('learn');
    expect(report.complexity).toBeGreaterThanOrEqual(0);
    expect(report.confidence).toBeGreaterThan(0);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  it('classifies bug-related briefs as bugfix', () => {
    const source = makeSource({
      type: 'text-brief',
      metadata: { brief: 'Fix the authentication bug in the login flow' },
    });
    const report = analyzeSource(source, config);
    expect(report.classification).toBe('bugfix');
  });

  it('classifies prototype briefs as prototype', () => {
    const source = makeSource({
      type: 'text-brief',
      metadata: { brief: 'Build a new CLI tool for managing configs' },
    });
    const report = analyzeSource(source, config);
    expect(report.classification).toBe('prototype');
  });

  it('analyzes a directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-'));
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'utils.ts'), 'export function foo() {}\n');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "test"}');

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'test-dir' });
    const report = analyzeSource(source, config);

    expect(report.fileCount).toBe(3);
    expect(report.languages).toContain('TypeScript');
    expect(report.insights.some((i) => i.includes('Node.js'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not suggest native acceleration for orchestration-only Python repos', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-py-orch-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.py'),
      [
        'import argparse',
        'import json',
        '',
        'def run(config_path: str) -> None:',
        '    with open(config_path, "r", encoding="utf-8") as f:',
        '        cfg = json.load(f)',
        '    print(cfg.get("model", "o3-mini"))',
        '',
        'if __name__ == "__main__":',
        '    parser = argparse.ArgumentParser()',
        '    parser.add_argument("--config", required=True)',
        '    args = parser.parse_args()',
        '    run(args.config)',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'openai\nrequests\n');

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'py-orchestration' });
    const report = analyzeSource(source, config);
    const alt = report.deepAnalysis?.optimizations.alternativeStack ?? [];

    expect(alt.some((s) => /native acceleration path|pyo3|c extensions/i.test(s.strategy + ' ' + s.description))).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('suggests native acceleration when Python hotspot evidence exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-py-hot-'));
    fs.writeFileSync(
      path.join(tmpDir, 'hotspot.py'),
      [
        'import re',
        'import json',
        'import numpy as np',
        '',
        'def crunch(records):',
        '    out = []',
        '    for row in records:',
        '        for token in row.split():',
        '            for frag in re.findall(r"[a-zA-Z0-9_]+", token):',
        '                out.append(frag)',
        '        for token2 in row.split():',
        '            for frag2 in re.findall(r"[a-zA-Z0-9_]+", token2):',
        '                out.append(frag2)',
        '        parsed = json.loads("{\\"x\\":1,\\"y\\":2}")',
        '        out.append(str(parsed["x"]))',
        '        out.extend(re.findall(r"\\d+", row))',
        '        out.extend(re.findall(r"[A-Z]+", row))',
        '        out.extend(re.findall(r"[a-z]+", row))',
        '        out.extend(re.findall(r"\\w+", row))',
        '    return np.array(out)',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(tmpDir, 'benchmark_notes.py'), 'PERFORMANCE = "throughput benchmark optimization"\n');
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'numpy\n');

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'py-hotspot' });
    const report = analyzeSource(source, config);
    const alt = report.deepAnalysis?.optimizations.alternativeStack ?? [];

    expect(alt.some((s) => /native acceleration path/i.test(s.strategy))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not infer CLI architecture from folder names alone', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-cli-noise-'));
    fs.mkdirSync(path.join(tmpDir, 'src', 'cli'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'cli', 'helpers.ts'),
      'export function formatLabel(value: string) { return value.trim(); }\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'commands', 'registry.ts'),
      'export const commandRegistry = new Map<string, string>();\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'server.ts'),
      'import express from "express";\nconst app = express();\napp.get("/health", (_req, res) => res.json({ ok: true }));\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cli-noise', dependencies: { express: '^5.0.0' } }),
    );

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'cli-noise' });
    const report = analyzeSource(source, config);
    const patterns = report.deepAnalysis?.coreSystem.patterns ?? [];
    const architecture = report.deepAnalysis?.coreSystem.architecture ?? '';

    expect(patterns).not.toContain('CLI Architecture');
    expect(architecture).not.toContain('CLI application');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('detects CLI architecture when command parsing evidence exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-cli-real-'));
    fs.mkdirSync(path.join(tmpDir, 'src', 'cli'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'cli', 'index.ts'),
      [
        'import { Command } from "commander";',
        'const program = new Command();',
        'program.command("scan").action(() => console.log("scan"));',
        'program.parse(process.argv);',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cli-real', dependencies: { commander: '^12.0.0' } }),
    );

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'cli-real' });
    const report = analyzeSource(source, config);
    const patterns = report.deepAnalysis?.coreSystem.patterns ?? [];
    const entryPoints = report.deepAnalysis?.coreSystem.entryPoints ?? [];

    expect(patterns).toContain('CLI Architecture');
    expect(entryPoints.some((entry) => entry.includes('CLI entry'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
