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

  it('does not infer patterns or security issues from detector definitions alone', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-detector-noise-'));
    fs.writeFileSync(
      path.join(tmpDir, 'rules.ts'),
      [
        'export const checks = [',
        '  {',
        "    name: 'State Management',",
        "    regex: /useReducer|createStore|createSlice|zustand|recoil|jotai/i,",
        "    description: 'Looks for state management APIs',",
        '  },',
        '  {',
        "    name: 'Actor Model',",
        "    regex: /(?:Actor|spawn|send_message|Mailbox|GenServer)/i,",
        "    description: 'Looks for actor runtime signals',",
        '  },',
        '  {',
        "    name: 'CORS Wildcard Origin',",
        "    regex: /allow_origins.*\\[\"?\\*\"?\\]|Access-Control-Allow-Origin/i,",
        "    description: 'Example detector: allow_origins=[\"*\"]',",
        '  },',
        '  {',
        "    name: 'Debug Mode Enabled',",
        "    regex: /DEBUG\\s*[:=]\\s*(?:true|1)/i,",
        "    description: 'Example detector: DEBUG = true',",
        '  },',
        '];',
      ].join('\n'),
    );

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'detector-noise' });
    const report = analyzeSource(source, config);
    const patterns = report.deepAnalysis?.coreSystem.patterns ?? [];
    const securityTitles = new Set((report.deepAnalysis?.security?.findings ?? []).map((finding) => finding.title));

    expect(patterns).not.toContain('State Management');
    expect(patterns).not.toContain('Actor Model');
    expect(securityTitles.has('CORS Wildcard Origin')).toBe(false);
    expect(securityTitles.has('Debug Mode Enabled')).toBe(false);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('counts python-style test files consistently across improvements and health score', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-py-tests-'));
    fs.writeFileSync(
      path.join(tmpDir, 'app.py'),
      [
        'def add(a, b):',
        '    return a + b',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'test_app.py'),
      [
        'from app import add',
        '',
        'def test_add():',
        '    assert add(1, 2) == 3',
      ].join('\n'),
    );

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'py-tests' });
    const report = analyzeSource(source, config);
    const testingIssues = (report.deepAnalysis?.improvements ?? [])
      .filter((item) => item.area === 'Testing')
      .map((item) => item.issue);
    const testCoverage = report.deepAnalysis?.healthScore?.dimensions.find((dimension) => dimension.name === 'Test Coverage');

    expect(testingIssues.some((issue) => issue.includes('0 test files'))).toBe(false);
    expect(testCoverage?.details.some((detail) => detail.includes('1 test file(s) found'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('classifies debt-heavy repositories as improve-architecture and avoids optimistic debt grades', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-arch-debt-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'arch-debt', dependencies: { express: '^5.0.0' } }),
    );

    for (let index = 0; index < 24; index += 1) {
      fs.writeFileSync(
        path.join(tmpDir, `feature-${index}.ts`),
        `export const feature${index} = ${index};\n`,
      );
    }

    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'import { b } from "./b";\nexport const a = () => b();\n');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'import { a } from "./a";\nexport const b = () => a();\n');
    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'tests', 'architecture.test.ts'), 'export const smoke = true;\n');

    const nestedLines = [
      'export function risky(input: string) {',
      '  if (input) {',
      '    for (const outer of input.split(",")) {',
      '      if (outer) {',
      '        for (const inner of outer.split(":")) {',
      '          if (inner) {',
      '            try {',
      '              JSON.parse(inner);',
      '            } catch {',
      '            }',
      '          }',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
      '',
    ];
    for (let index = 0; index < 220; index += 1) {
      nestedLines.push(`export function filler${index}() {`);
      nestedLines.push('  try {');
      nestedLines.push('    return "ok";');
      nestedLines.push('  } catch {');
      nestedLines.push('  }');
      nestedLines.push('}');
      nestedLines.push('');
    }
    fs.writeFileSync(path.join(tmpDir, 'debt-core.ts'), nestedLines.join('\n'));

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'arch-debt' });
    const report = analyzeSource(source, config);

    expect(report.classification).toBe('improve-architecture');
    expect(report.deepAnalysis?.techDebt?.grade).not.toBe('A');
    expect(report.deepAnalysis?.healthScore?.dimensions.some((dimension) => dimension.name === 'Security Hygiene')).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not flag sqlite database.exec as command injection', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-db-exec-'));
    fs.writeFileSync(
      path.join(tmpDir, 'database.ts'),
      [
        'import Database from "better-sqlite3";',
        'const db = new Database(":memory:");',
        'db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY);");',
      ].join('\n'),
    );

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'db-exec' });
    const report = analyzeSource(source, config);
    const securityTitles = new Set((report.deepAnalysis?.security?.findings ?? []).map((finding) => finding.title));

    expect(securityTitles.has('Command Injection')).toBe(false);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('detects wildcard CORS from JavaScript header configuration', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-analyze-js-cors-'));
    fs.writeFileSync(
      path.join(tmpDir, 'server.ts'),
      [
        'import express from "express";',
        'const app = express();',
        'app.use((_req, res, next) => {',
        '  res.setHeader("Access-Control-Allow-Origin", "*");',
        '  next();',
        '});',
        'app.get("/health", (_req, res) => res.json({ ok: true }));',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'cors-server', dependencies: { express: '^5.0.0' } }),
    );

    const source = makeSource({ type: 'directory', location: tmpDir, name: 'cors-server' });
    const report = analyzeSource(source, config);
    const securityTitles = new Set((report.deepAnalysis?.security?.findings ?? []).map((finding) => finding.title));

    expect(securityTitles.has('CORS Wildcard Origin')).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('analyzes the current backend without self-echo false positives', () => {
    const source = makeSource({
      type: 'directory',
      location: process.cwd(),
      name: 'RepoWright Backend',
    });
    const report = analyzeSource(source, config);
    const patterns = report.deepAnalysis?.coreSystem.patterns ?? [];
    const securityTitles = new Set((report.deepAnalysis?.security?.findings ?? []).map((finding) => finding.title));

    expect(report.classification).toBe('improve-architecture');
    expect(patterns).toContain('REST API');
    expect(patterns).not.toContain('State Management');
    expect(patterns).not.toContain('Actor Model');
    expect(securityTitles.has('Missing Security Headers')).toBe(true);
    expect(securityTitles.has('CORS Wildcard Origin')).toBe(true);
    expect(securityTitles.has('Command Injection')).toBe(false);
    expect(securityTitles.has('Dynamic eval()')).toBe(false);
    expect(securityTitles.has('Insecure Cookie')).toBe(false);
    expect(securityTitles.has('Debug Mode Enabled')).toBe(false);
  });
});
