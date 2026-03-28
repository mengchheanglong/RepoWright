import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { OperatorConfig } from '../core/config.js';
import { InvalidSourceError } from '../core/errors.js';
import type { Source, SourceType } from '../domain/index.js';
import { ensureDir } from '../utils/fs.js';
import { generateId, now } from '../utils/id.js';
import { getLogger } from '../utils/logger.js';

export function detectSourceType(input: string): SourceType {
  if (input.match(/^https?:\/\//) || input.match(/^git@/)) {
    return 'git-url';
  }
  if (fs.existsSync(input)) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) return 'directory';
    if (stat.isFile()) return 'file';
  }
  // If it's not a path that exists and not a URL, treat as text brief
  return 'text-brief';
}

export function ingestSource(input: string, config: OperatorConfig): Source {
  const logger = getLogger();
  const type = detectSourceType(input);
  logger.info(`Detected source type: ${type}`, { input });

  switch (type) {
    case 'directory':
      return ingestDirectory(input);
    case 'git-url':
      return ingestGitUrl(input, config);
    case 'file':
      return ingestFile(input);
    case 'text-brief':
      return ingestTextBrief(input);
  }
}

function ingestDirectory(dirPath: string): Source {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    throw new InvalidSourceError(`Directory not found: ${resolved}`);
  }
  return {
    id: generateId('src'),
    type: 'directory',
    location: resolved,
    name: path.basename(resolved),
    metadata: { originalPath: resolved },
    fingerprint: fingerprintDirectory(resolved),
    createdAt: now(),
  };
}

function ingestGitUrl(url: string, config: OperatorConfig): Source {
  const logger = getLogger();
  const repoName = extractRepoName(url);
  const clonesDir = path.join(config.dataDir, 'clones');
  ensureDir(clonesDir);
  const cloneDir = path.join(clonesDir, `${repoName}_${Date.now()}`);

  logger.info(`Cloning ${url} into ${cloneDir}`);
  const cloneArgs = ['clone', '--depth', '500', url, cloneDir];
  const cloneCommand = process.platform === 'win32'
    ? `git -c core.longpaths=true ${cloneArgs.join(' ')}`
    : `git ${cloneArgs.join(' ')}`;
  try {
    const args = process.platform === 'win32'
      ? ['-c', 'core.longpaths=true', ...cloneArgs]
      : cloneArgs;

    execFileSync('git', args, {
      stdio: 'pipe',
    });
  } catch (err) {
    // Clean up partial clone directory on failure
    try {
      if (fs.existsSync(cloneDir)) {
        fs.rmSync(cloneDir, { recursive: true, force: true });
        logger.info(`Cleaned up failed clone directory: ${cloneDir}`);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw new InvalidSourceError(
      `Failed to clone ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    id: generateId('src'),
    type: 'git-url',
    location: cloneDir,
    name: repoName,
    metadata: {
      gitUrl: url,
      clonedTo: cloneDir,
      ingestCommand: cloneCommand,
    },
    fingerprint: fingerprintGitClone(cloneDir),
    createdAt: now(),
  };
}

function ingestFile(filePath: string): Source {
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  const noteType =
    ext === '.md'
      ? 'markdown'
      : ext === '.txt'
        ? 'text'
        : ext === '.pdf'
          ? 'pdf'
          : 'code-or-other';

  return {
    id: generateId('src'),
    type: 'file',
    location: resolved,
    name: path.basename(resolved),
    metadata: {
      originalPath: resolved,
      noteType,
      pdfPlaceholder: ext === '.pdf',
    },
    fingerprint: fingerprintFile(resolved),
    createdAt: now(),
  };
}

function ingestTextBrief(text: string): Source {
  return {
    id: generateId('src'),
    type: 'text-brief',
    location: 'inline',
    name:
      text
        .slice(0, 60)
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim() || 'text-brief',
    metadata: { brief: text },
    fingerprint: fingerprintText(text),
    createdAt: now(),
  };
}

function extractRepoName(url: string): string {
  const match = url.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? 'repo';
}

function fingerprintText(input: string): string {
  return `sha256:${crypto.createHash('sha256').update(input).digest('hex')}`;
}

function fingerprintFile(filePath: string): string | undefined {
  try {
    const bytes = fs.readFileSync(filePath);
    return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  } catch {
    return undefined;
  }
}

function fingerprintDirectory(dirPath: string): string | undefined {
  try {
    const entries: string[] = [];
    walkDirectory(dirPath, dirPath, entries, 1500);
    return fingerprintText(entries.join('\n'));
  } catch {
    return undefined;
  }
}

function walkDirectory(
  root: string,
  current: string,
  entries: string[],
  maxEntries: number,
): void {
  if (entries.length >= maxEntries) return;

  const dirents = fs.readdirSync(current, { withFileTypes: true });
  for (const dirent of dirents) {
    if (entries.length >= maxEntries) return;
    if (dirent.name === 'node_modules' || dirent.name.startsWith('.git')) continue;

    const fullPath = path.join(current, dirent.name);
    const relPath = path.relative(root, fullPath);
    const stats = fs.statSync(fullPath);
    entries.push(`${relPath}|${stats.size}|${stats.mtimeMs.toFixed(0)}`);

    if (dirent.isDirectory()) {
      walkDirectory(root, fullPath, entries, maxEntries);
    }
  }
}

function fingerprintGitClone(cloneDir: string): string | undefined {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: cloneDir,
      stdio: 'pipe',
      timeout: 5000,
    })
      .toString('utf-8')
      .trim();
    if (!commit) return undefined;
    return `git:${commit}`;
  } catch {
    return undefined;
  }
}
