import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

let db: BetterSQLite3Database<typeof schema> | null = null;
let rawDb: Database.Database | null = null;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  location TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata TEXT,
  fingerprint TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  summary TEXT NOT NULL,
  classification TEXT NOT NULL,
  complexity REAL NOT NULL,
  risk REAL NOT NULL,
  confidence REAL NOT NULL,
  file_count INTEGER,
  languages TEXT,
  insights TEXT NOT NULL,
  deep_analysis TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  definition_of_done TEXT NOT NULL,
  risk_notes TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL,
  backend TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  attempted TEXT NOT NULL,
  changed TEXT NOT NULL,
  succeeded TEXT NOT NULL,
  failed TEXT NOT NULL,
  confidence REAL NOT NULL,
  next_action TEXT NOT NULL,
  done_score REAL,
  findings TEXT,
  created_at TEXT NOT NULL
);
`;

export function getDatabase(dbPath: string): BetterSQLite3Database<typeof schema> {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  rawDb = new Database(dbPath);
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('foreign_keys = ON');
  rawDb.exec(CREATE_TABLES_SQL);
  migrateSchema(rawDb);

  db = drizzle(rawDb, { schema });
  return db;
}

export function createInMemoryDatabase(): BetterSQLite3Database<typeof schema> {
  const memRawDb = new Database(':memory:');
  memRawDb.pragma('foreign_keys = ON');
  memRawDb.exec(CREATE_TABLES_SQL);
  migrateSchema(memRawDb);
  return drizzle(memRawDb, { schema });
}

function migrateSchema(database: Database.Database): void {
  ensureColumn(database, 'analyses', 'deep_analysis', 'TEXT');
  ensureColumn(database, 'reviews', 'done_score', 'REAL');
  ensureColumn(database, 'reviews', 'findings', 'TEXT');
}

function ensureColumn(
  database: Database.Database,
  tableName: string,
  columnName: string,
  columnType: string,
): void {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const exists = rows.some((row) => row.name === columnName);
  if (exists) return;

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

export function closeDatabase(): void {
  if (rawDb) {
    rawDb.close();
    rawDb = null;
    db = null;
  }
}
