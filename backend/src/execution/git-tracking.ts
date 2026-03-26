import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';

/**
 * Initialize a git repo in the workspace directory and create an initial commit
 * so we can track diffs after execution.
 */
export function initWorkspaceGit(workspacePath: string): boolean {
  const logger = getLogger();

  try {
    execSync('git init', { cwd: workspacePath, stdio: 'pipe' });
    execSync('git add -A', { cwd: workspacePath, stdio: 'pipe' });
    execSync('git commit -m "repowright: initial workspace state" --allow-empty', {
      cwd: workspacePath,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'repowright',
        GIT_AUTHOR_EMAIL: 'repowright@local',
        GIT_COMMITTER_NAME: 'repowright',
        GIT_COMMITTER_EMAIL: 'repowright@local',
      },
    });
    logger.debug(`Git tracking initialized in ${workspacePath}`);
    return true;
  } catch (err) {
    logger.warn(
      `Failed to initialize git tracking: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Capture the diff of all changes made in the workspace since the initial commit.
 * Returns the diff as a string, or null if git tracking was not initialized.
 */
export function captureWorkspaceDiff(workspacePath: string): string | null {
  const logger = getLogger();

  if (!fs.existsSync(path.join(workspacePath, '.git'))) {
    return null;
  }

  try {
    // Stage all changes so we can diff them
    execSync('git add -A', { cwd: workspacePath, stdio: 'pipe' });

    const diff = execSync('git diff --cached --stat', {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const fullDiff = execSync('git diff --cached', {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!fullDiff) {
      logger.debug('No changes detected in workspace');
      return null;
    }

    logger.info(`Workspace diff captured: ${diff.split('\n').length} lines`);
    return fullDiff;
  } catch (err) {
    logger.warn(
      `Failed to capture workspace diff: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Get a short summary of changes (stat output).
 */
export function captureWorkspaceDiffStat(workspacePath: string): string | null {
  if (!fs.existsSync(path.join(workspacePath, '.git'))) {
    return null;
  }

  try {
    execSync('git add -A', { cwd: workspacePath, stdio: 'pipe' });
    const stat = execSync('git diff --cached --stat', {
      cwd: workspacePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return stat || null;
  } catch {
    return null;
  }
}
