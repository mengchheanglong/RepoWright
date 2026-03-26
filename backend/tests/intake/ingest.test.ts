import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { detectSourceType, ingestSource } from '../../src/intake/ingest.js';

describe('detectSourceType', () => {
  it('detects git URLs', () => {
    expect(detectSourceType('https://github.com/user/repo')).toBe('git-url');
    expect(detectSourceType('https://github.com/user/repo.git')).toBe('git-url');
    expect(detectSourceType('git@github.com:user/repo.git')).toBe('git-url');
  });

  it('detects directories', () => {
    expect(detectSourceType(os.tmpdir())).toBe('directory');
  });

  it('defaults to text-brief for non-existent paths', () => {
    expect(detectSourceType('Build a REST API')).toBe('text-brief');
    expect(detectSourceType('fix the login bug')).toBe('text-brief');
  });
});

describe('ingestSource', () => {
  const config = loadConfig({ dataDir: path.join(os.tmpdir(), `repowright-test-${Date.now()}`) });

  it('ingests a text brief', () => {
    const source = ingestSource('Build a rate limiter for Node.js', config);
    expect(source.type).toBe('text-brief');
    expect(source.id).toMatch(/^src_/);
    expect(source.location).toBe('inline');
    expect(source.metadata?.brief).toBe('Build a rate limiter for Node.js');
  });

  it('ingests a directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'console.log("hello")');

    const source = ingestSource(tmpDir, config);
    expect(source.type).toBe('directory');
    expect(source.name).toBeTruthy();
    expect(source.location).toBe(tmpDir);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('ingests a single file', () => {
    const tmpFile = path.join(os.tmpdir(), `op-test-${Date.now()}.ts`);
    fs.writeFileSync(tmpFile, 'export const x = 1;');

    const source = ingestSource(tmpFile, config);
    expect(source.type).toBe('file');
    expect(source.name).toContain('.ts');

    fs.unlinkSync(tmpFile);
  });
});
