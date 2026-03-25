import fs from 'node:fs';
import path from 'node:path';

interface WalkEntry {
  dir: string;
  prefix: string;
}

function shouldSkipEntry(name: string): boolean {
  return name.startsWith('.') && name !== '.operator-prompt.md';
}

function readDirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function processWalkEntry(
  entry: fs.Dirent,
  current: WalkEntry,
  excludeSet: Set<string>,
  stack: WalkEntry[],
  files: string[],
): void {
  if (shouldSkipEntry(entry.name)) return;
  const rel = current.prefix ? `${current.prefix}/${entry.name}` : entry.name;
  if (excludeSet.has(rel)) return;

  const fullPath = path.join(current.dir, entry.name);
  if (entry.isDirectory()) {
    stack.push({ dir: fullPath, prefix: rel });
  } else if (entry.isFile()) {
    files.push(rel);
  }
}

/**
 * Walk a directory and collect all file paths relative to the root,
 * excluding files in the exclude set and hidden files.
 */
export function detectChangedFiles(dir: string, exclude: string[]): string[] {
  const excludeSet = new Set(exclude);
  const files: string[] = [];
  const stack: WalkEntry[] = [{ dir, prefix: '' }];

  while (stack.length > 0) {
    const current = stack.pop() as WalkEntry;
    for (const entry of readDirSafe(current.dir)) {
      processWalkEntry(entry, current, excludeSet, stack, files);
    }
  }

  return files;
}
