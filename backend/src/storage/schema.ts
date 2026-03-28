import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  location: text('location').notNull(),
  name: text('name').notNull(),
  metadata: text('metadata'), // JSON string
  fingerprint: text('fingerprint'),
  createdAt: text('created_at').notNull(),
});

export const analyses = sqliteTable('analyses', {
  id: text('id').primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  summary: text('summary').notNull(),
  classification: text('classification').notNull(),
  complexity: real('complexity').notNull(),
  risk: real('risk').notNull(),
  confidence: real('confidence').notNull(),
  fileCount: integer('file_count'),
  languages: text('languages'), // JSON array string
  insights: text('insights').notNull(), // JSON array string
  deepAnalysis: text('deep_analysis'), // JSON string of DeepAnalysis
  createdAt: text('created_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  analysisId: text('analysis_id')
    .notNull()
    .references(() => analyses.id),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  whyNow: text('why_now'),
  confidence: real('confidence'),
  expectedValue: text('expected_value').notNull(),
  alternatives: text('alternatives'), // JSON array string
  executionContract: text('execution_contract'), // JSON string
  difficulty: text('difficulty').notNull(),
  definitionOfDone: text('definition_of_done').notNull(),
  riskNotes: text('risk_notes').notNull(),
  order: integer('order').notNull(),
  createdAt: text('created_at').notNull(),
});

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  idempotencyKey: text('idempotency_key'),
  status: text('status').notNull(),
  backend: text('backend').notNull(),
  workspacePath: text('workspace_path').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id),
  type: text('type').notNull(),
  path: text('path').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
});

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id),
  attempted: text('attempted').notNull(),
  changed: text('changed').notNull(),
  succeeded: text('succeeded').notNull(),
  failed: text('failed').notNull(),
  confidence: real('confidence').notNull(),
  nextAction: text('next_action').notNull(),
  doneScore: real('done_score'),
  findings: text('findings'), // JSON array string
  createdAt: text('created_at').notNull(),
});
