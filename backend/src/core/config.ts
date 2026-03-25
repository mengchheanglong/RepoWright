import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

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
  if (process.env.OPERATOR_DATA_DIR) {
    return process.env.OPERATOR_DATA_DIR;
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) {
    return path.join(workspaceRoot, 'operator-data');
  }

  return path.join(os.homedir(), '.operator');
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
    dbPath: overrides.dbPath ?? path.join(dataDir, 'operator.db'),
    logLevel: overrides.logLevel ?? 'info',
    // 0 means unlimited.
    maxDeepCodeFileCount: overrides.maxDeepCodeFileCount ?? 0,
    maxFileAnalysisCount: overrides.maxFileAnalysisCount ?? 0,
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? 0,
  };
}
