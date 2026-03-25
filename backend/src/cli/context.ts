import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { type OperatorConfig, loadConfig } from '../core/config.js';
import { getDatabase } from '../storage/database.js';
import { Repository } from '../storage/repository.js';
import type * as schema from '../storage/schema.js';
import { initLogger } from '../utils/logger.js';

export interface CliContext {
  config: OperatorConfig;
  db: BetterSQLite3Database<typeof schema>;
  repo: Repository;
}

let ctx: CliContext | null = null;

export function getContext(): CliContext {
  if (ctx) return ctx;

  const config = loadConfig();
  initLogger(config.logLevel);
  const db = getDatabase(config.dbPath);
  const repo = new Repository(db);

  ctx = { config, db, repo };
  return ctx;
}
