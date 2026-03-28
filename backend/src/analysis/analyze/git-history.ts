import { execSync } from 'node:child_process';
import type { GitHistory, FileHotspot } from '../../domain/index.js';
import { getLogger } from '../../utils/logger.js';
import { isActionableCodePath } from './scoping.js';

/**
 * Analyze git history for a repository to extract behavioral signals:
 * - Change frequency per file (hotspots)
 * - Temporal coupling (files that always change together)
 * - Bus factor (knowledge distribution)
 * - Recent activity
 *
 * Inspired by CodeScene/code-maat behavioral code analysis.
 */
export function analyzeGitHistory(repoPath: string, codeFiles: string[]): GitHistory | null {
  const logger = getLogger();

  if (!isGitRepo(repoPath)) {
    logger.info('Not a git repository, skipping git history analysis');
    return null;
  }

  // Try to unshallow if the repo is a shallow clone
  if (isShallowRepo(repoPath)) {
    try {
      execSync('git fetch --unshallow', { cwd: repoPath, stdio: 'pipe', timeout: 60000 });
      logger.info('Unshallowed git repository for full history analysis');
    } catch {
      logger.info('Could not unshallow repository — analysis will use available history');
    }
  }

  try {
    const log = getGitLog(repoPath);
    if (log.length === 0) return null;

    const changeFrequency = computeChangeFrequency(log, codeFiles);
    const authorsByFile = computeAuthorsByFile(log, codeFiles);
    const coupling = computeTemporalCoupling(log, codeFiles);
    const busFactor = computeBusFactor(log);
    const recentActivity = computeRecentActivity(log);
    const totalCommits = log.length;
    const activeContributors = new Set(log.map((c) => c.author)).size;

    const hotspots = buildHotspots(changeFrequency, authorsByFile, coupling, codeFiles);

    return {
      totalCommits,
      activeContributors,
      hotspots: hotspots.slice(0, 20),
      temporalCoupling: coupling.slice(0, 15),
      busFactor,
      recentActivityWeeks: recentActivity,
    };
  } catch (err) {
    logger.info(`Git history analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// --- Types ---

interface CommitEntry {
  hash: string;
  author: string;
  date: string;
  files: string[];
}

// --- Git parsing ---

function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isShallowRepo(dir: string): boolean {
  try {
    const result = execSync('git rev-parse --is-shallow-repository', { cwd: dir, stdio: 'pipe' }).toString().trim();
    return result === 'true';
  } catch {
    return false;
  }
}

function getGitLog(repoPath: string): CommitEntry[] {
  // Get last 500 commits with changed files
  const raw = execSync(
    'git log --pretty=format:"COMMIT|%H|%an|%aI" --name-only -n 500',
    { cwd: repoPath, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 },
  ).toString();

  const commits: CommitEntry[] = [];
  let current: CommitEntry | null = null;

  for (const line of raw.split('\n')) {
    if (line.startsWith('COMMIT|')) {
      if (current && current.files.length > 0) commits.push(current);
      const parts = line.split('|');
      current = {
        hash: parts[1] ?? '',
        author: parts[2] ?? '',
        date: parts[3] ?? '',
        files: [],
      };
    } else if (current && line.trim().length > 0) {
      const normalized = line.trim().replace(/\\/g, '/');
      current.files.push(normalized);
    }
  }
  if (current && current.files.length > 0) commits.push(current);

  return commits;
}

// --- Analysis functions ---

function computeChangeFrequency(
  commits: CommitEntry[],
  codeFiles: string[],
): Map<string, number> {
  const codeFileSet = new Set(codeFiles.map((f) => f.replace(/\\/g, '/')));
  const freq = new Map<string, number>();

  for (const commit of commits) {
    for (const file of commit.files) {
      if (codeFileSet.has(file) && isActionableCodePath(file)) {
        freq.set(file, (freq.get(file) ?? 0) + 1);
      }
    }
  }

  return freq;
}

function computeAuthorsByFile(
  commits: CommitEntry[],
  codeFiles: string[],
): Map<string, Set<string>> {
  const codeFileSet = new Set(codeFiles.map((f) => f.replace(/\\/g, '/')));
  const authors = new Map<string, Set<string>>();

  for (const commit of commits) {
    for (const file of commit.files) {
      if (codeFileSet.has(file)) {
        if (!authors.has(file)) authors.set(file, new Set());
        authors.get(file)!.add(commit.author);
      }
    }
  }

  return authors;
}

function computeTemporalCoupling(
  commits: CommitEntry[],
  codeFiles: string[],
): Array<{ fileA: string; fileB: string; couplingScore: number }> {
  const codeFileSet = new Set(codeFiles.map((f) => f.replace(/\\/g, '/')));
  const pairCount = new Map<string, number>();
  const fileCount = new Map<string, number>();

  for (const commit of commits) {
    const relevant = commit.files.filter((f) => codeFileSet.has(f) && isActionableCodePath(f));
    for (const file of relevant) {
      fileCount.set(file, (fileCount.get(file) ?? 0) + 1);
    }
    // Only analyze commits with 2-15 files (skip merge commits / large refactors)
    if (relevant.length >= 2 && relevant.length <= 15) {
      for (let i = 0; i < relevant.length; i++) {
        for (let j = i + 1; j < relevant.length; j++) {
          const key = [relevant[i], relevant[j]].sort().join('|||');
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const results: Array<{ fileA: string; fileB: string; couplingScore: number }> = [];

  for (const [key, count] of pairCount) {
    if (count < 3) continue; // Minimum 3 co-changes to be meaningful
    const [fileA, fileB] = key.split('|||');
    if (!fileA || !fileB) continue;
    const maxChanges = Math.max(fileCount.get(fileA) ?? 1, fileCount.get(fileB) ?? 1);
    const score = Number((count / maxChanges).toFixed(2));
    if (score >= 0.3) {
      results.push({ fileA, fileB, couplingScore: score });
    }
  }

  return results.sort((a, b) => b.couplingScore - a.couplingScore);
}

function computeBusFactor(commits: CommitEntry[]): number {
  // Bus factor = minimum number of developers who have authored 50% of changes
  const authorCommits = new Map<string, number>();
  for (const commit of commits) {
    authorCommits.set(commit.author, (authorCommits.get(commit.author) ?? 0) + 1);
  }

  const sorted = [...authorCommits.entries()].sort((a, b) => b[1] - a[1]);
  const total = commits.length;
  const threshold = total * 0.5;
  let cumulative = 0;
  let busFactor = 0;

  for (const [, count] of sorted) {
    cumulative += count;
    busFactor++;
    if (cumulative >= threshold) break;
  }

  return busFactor;
}

function computeRecentActivity(commits: CommitEntry[]): number {
  if (commits.length === 0) return 0;

  const now = Date.now();
  const latestDate = new Date(commits[0]!.date).getTime();
  const weeksAgo = Math.round((now - latestDate) / (7 * 24 * 60 * 60 * 1000));

  // Count commits in the last 4 weeks
  const fourWeeksAgo = now - 4 * 7 * 24 * 60 * 60 * 1000;
  const recentCommits = commits.filter((c) => new Date(c.date).getTime() > fourWeeksAgo).length;

  // Return a 0-4 score: 0 = no recent activity, 4 = very active
  if (recentCommits === 0) return weeksAgo > 26 ? 0 : 1;
  if (recentCommits < 5) return 1;
  if (recentCommits < 20) return 2;
  if (recentCommits < 50) return 3;
  return 4;
}

function buildHotspots(
  changeFrequency: Map<string, number>,
  authorsByFile: Map<string, Set<string>>,
  coupling: Array<{ fileA: string; fileB: string; couplingScore: number }>,
  _codeFiles: string[],
): FileHotspot[] {
  const couplingMap = new Map<string, string[]>();
  for (const c of coupling) {
    if (!couplingMap.has(c.fileA)) couplingMap.set(c.fileA, []);
    if (!couplingMap.has(c.fileB)) couplingMap.set(c.fileB, []);
    couplingMap.get(c.fileA)!.push(c.fileB);
    couplingMap.get(c.fileB)!.push(c.fileA);
  }

  const hotspots: FileHotspot[] = [];

  for (const [file, changes] of changeFrequency) {
    if (changes < 2) continue;
    hotspots.push({
      file,
      changeCount: changes,
      authorCount: authorsByFile.get(file)?.size ?? 1,
      lastChanged: '', // populated from git log if needed
      coupledFiles: couplingMap.get(file)?.slice(0, 5) ?? [],
    });
  }

  // Sort by change count descending — most changed files first
  return hotspots.sort((a, b) => b.changeCount - a.changeCount);
}
