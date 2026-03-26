import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeMarkdown(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}


export function copyDirRecursive(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

interface FileEntry {
  path: string;
  size: number;
  extension: string;
}

function isSkippable(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules' || name === '__pycache__' || name === '.mypy_cache';
}

function readDirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function tryFileEntry(fullPath: string, basePath: string, maxSizeBytes: number): FileEntry | null {
  const stats = fs.statSync(fullPath);
  if (maxSizeBytes > 0 && stats.size > maxSizeBytes) return null;
  return {
    path: path.relative(basePath, fullPath),
    size: stats.size,
    extension: path.extname(fullPath).toLowerCase(),
  };
}

function processEntry(
  entry: fs.Dirent,
  dir: string,
  basePath: string,
  maxSizeBytes: number,
  stack: string[],
): FileEntry | null {
  if (isSkippable(entry.name)) return null;
  const fullPath = path.join(dir, entry.name);
  if (entry.isDirectory()) {
    stack.push(fullPath);
    return null;
  }
  if (entry.isFile()) return tryFileEntry(fullPath, basePath, maxSizeBytes);
  return null;
}

export function collectFiles(dirPath: string, maxCount: number, maxSizeBytes: number): FileEntry[] {
  const results: FileEntry[] = [];
  const stack = [dirPath];
  const hasCountLimit = maxCount > 0;

  while (stack.length > 0 && (!hasCountLimit || results.length < maxCount)) {
    const dir = stack.pop() as string;
    for (const entry of readDirSafe(dir)) {
      if (hasCountLimit && results.length >= maxCount) break;
      const file = processEntry(entry, dir, dirPath, maxSizeBytes, stack);
      if (file) results.push(file);
    }
  }

  return results;
}
