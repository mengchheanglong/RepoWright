import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR_NAME = 'repowright-data';
const LEGACY_DATA_DIR_NAMES = ['operator-data'] as const;
const HOME_DATA_DIR_NAME = '.repowright';
const LEGACY_HOME_DATA_DIR_NAMES = ['.operator'] as const;
const DB_FILENAME = 'repowright.db';
const LEGACY_DB_FILENAMES = ['operator.db'] as const;

export interface OperatorConfig {
  dataDir: string;
  runsDir: string;
  dbPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxDeepCodeFileCount: number;
  maxFileAnalysisCount: number;
  maxFileSizeBytes: number;
}

function resolveDataDir(): string {
  const explicitDataDir =
    process.env.REPOWRIGHT_DATA_DIR ??
    process.env.OPERATOR_DATA_DIR;
  if (explicitDataDir) {
    return explicitDataDir;
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) {
    for (const legacyDirName of LEGACY_DATA_DIR_NAMES) {
      const legacyDataDir = path.join(workspaceRoot, legacyDirName);
      if (fs.existsSync(legacyDataDir)) {
        return legacyDataDir;
      }
    }
    return path.join(workspaceRoot, DATA_DIR_NAME);
  }

  for (const legacyDirName of LEGACY_HOME_DATA_DIR_NAMES) {
    const legacyHomeDir = path.join(os.homedir(), legacyDirName);
    if (fs.existsSync(legacyHomeDir)) {
      return legacyHomeDir;
    }
  }
  return path.join(os.homedir(), HOME_DATA_DIR_NAME);
}

function findWorkspaceRoot(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function loadConfig(overrides: Partial<OperatorConfig> = {}): OperatorConfig {
  const dataDir = overrides.dataDir ?? resolveDataDir();
  return {
    dataDir,
    runsDir: overrides.runsDir ?? path.join(dataDir, 'runs'),
    dbPath: overrides.dbPath ?? resolveDbPath(dataDir),
    logLevel: overrides.logLevel ?? 'info',
    // 0 means unlimited.
    maxDeepCodeFileCount: overrides.maxDeepCodeFileCount ?? 0,
    maxFileAnalysisCount: overrides.maxFileAnalysisCount ?? 0,
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? 0,
  };
}

function resolveDbPath(dataDir: string): string {
  for (const legacyDbFilename of LEGACY_DB_FILENAMES) {
    const legacyDbPath = path.join(dataDir, legacyDbFilename);
    if (fs.existsSync(legacyDbPath)) {
      return legacyDbPath;
    }
  }
  return path.join(dataDir, DB_FILENAME);
}
