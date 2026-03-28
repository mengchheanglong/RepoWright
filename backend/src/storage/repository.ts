import { desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  AnalysisReport,
  CandidateTask,
  DeepAnalysis,
  ExecutionRun,
  ReviewReport,
  RunArtifact,
  RunStatus,
  Source,
} from '../domain/index.js';
import * as schema from './schema.js';

export class Repository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  // --- Sources ---

  saveSource(source: Source): void {
    this.db
      .insert(schema.sources)
      .values({
        id: source.id,
        type: source.type,
        location: source.location,
        name: source.name,
        metadata: source.metadata ? JSON.stringify(source.metadata) : null,
        fingerprint: source.fingerprint ?? null,
        createdAt: source.createdAt,
      })
      .run();
  }

  getSource(id: string): Source | null {
    const row = this.db.select().from(schema.sources).where(eq(schema.sources.id, id)).get();
    return row ? mapSource(row) : null;
  }

  listSources(): Source[] {
    const rows = this.db
      .select()
      .from(schema.sources)
      .orderBy(desc(schema.sources.createdAt))
      .all();
    return rows.map(mapSource);
  }

  updateSourceMetadata(sourceId: string, metadata: Record<string, unknown>): void {
    this.db
      .update(schema.sources)
      .set({ metadata: JSON.stringify(metadata) })
      .where(eq(schema.sources.id, sourceId))
      .run();
  }

  deleteSourceCascade(sourceId: string): {
    deletedSource: boolean;
    runIds: string[];
    taskIds: string[];
    analysisIds: string[];
  } {
    const runRows = this.db.select({ id: schema.runs.id }).from(schema.runs).where(eq(schema.runs.sourceId, sourceId)).all();
    const taskRows = this.db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.sourceId, sourceId)).all();
    const analysisRows = this.db
      .select({ id: schema.analyses.id })
      .from(schema.analyses)
      .where(eq(schema.analyses.sourceId, sourceId))
      .all();

    const runIds = runRows.map((r) => r.id);
    const taskIds = taskRows.map((t) => t.id);
    const analysisIds = analysisRows.map((a) => a.id);

    // Delete child rows first to satisfy foreign key constraints.
    for (const runId of runIds) {
      this.db.delete(schema.artifacts).where(eq(schema.artifacts.runId, runId)).run();
      this.db.delete(schema.reviews).where(eq(schema.reviews.runId, runId)).run();
    }

    this.db.delete(schema.runs).where(eq(schema.runs.sourceId, sourceId)).run();
    this.db.delete(schema.tasks).where(eq(schema.tasks.sourceId, sourceId)).run();
    this.db.delete(schema.analyses).where(eq(schema.analyses.sourceId, sourceId)).run();
    const deleted = this.db.delete(schema.sources).where(eq(schema.sources.id, sourceId)).run();

    return {
      deletedSource: deleted.changes > 0,
      runIds,
      taskIds,
      analysisIds,
    };
  }

  // --- Analyses ---

  saveAnalysis(report: AnalysisReport): void {
    this.db
      .insert(schema.analyses)
      .values({
        id: report.id,
        sourceId: report.sourceId,
        summary: report.summary,
        classification: report.classification,
        complexity: report.complexity,
        risk: report.risk,
        confidence: report.confidence,
        fileCount: report.fileCount ?? null,
        languages: report.languages ? JSON.stringify(report.languages) : null,
        insights: JSON.stringify(report.insights),
        deepAnalysis: report.deepAnalysis ? JSON.stringify(report.deepAnalysis) : null,
        createdAt: report.createdAt,
      })
      .run();
  }

  getAnalysis(id: string): AnalysisReport | null {
    const row = this.db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).get();
    return row ? mapAnalysis(row) : null;
  }

  getAnalysisBySource(sourceId: string): AnalysisReport | null {
    const row = this.db
      .select()
      .from(schema.analyses)
      .where(eq(schema.analyses.sourceId, sourceId))
      .orderBy(desc(schema.analyses.createdAt))
      .limit(1)
      .get();
    return row ? mapAnalysis(row) : null;
  }

  listAnalysesBySource(sourceId: string): AnalysisReport[] {
    const rows = this.db
      .select()
      .from(schema.analyses)
      .where(eq(schema.analyses.sourceId, sourceId))
      .orderBy(desc(schema.analyses.createdAt))
      .all();
    return rows.map(mapAnalysis);
  }

  // --- Tasks ---

  saveTasks(taskList: CandidateTask[]): void {
    for (const t of taskList) {
      this.db
        .insert(schema.tasks)
        .values({
          id: t.id,
          analysisId: t.analysisId,
          sourceId: t.sourceId,
          title: t.title,
          rationale: t.rationale,
          whyNow: t.whyNow ?? null,
          confidence: t.confidence ?? null,
          expectedValue: t.expectedValue,
          alternatives: t.alternatives ? JSON.stringify(t.alternatives) : null,
          executionContract: t.executionContract ? JSON.stringify(t.executionContract) : null,
          difficulty: t.difficulty,
          definitionOfDone: t.definitionOfDone,
          riskNotes: t.riskNotes,
          order: t.order,
          createdAt: t.createdAt,
        })
        .run();
    }
  }

  getTask(id: string): CandidateTask | null {
    const row = this.db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    return row ? mapTask(row) : null;
  }

  getTasksByAnalysis(analysisId: string): CandidateTask[] {
    const rows = this.db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.analysisId, analysisId))
      .orderBy(schema.tasks.order)
      .all();
    return rows.map(mapTask);
  }

  getTasksBySource(sourceId: string): CandidateTask[] {
    const rows = this.db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.sourceId, sourceId))
      .orderBy(desc(schema.tasks.createdAt), schema.tasks.order)
      .all();
    return rows.map(mapTask);
  }

  // --- Runs ---

  saveRun(run: ExecutionRun): void {
    this.db
      .insert(schema.runs)
      .values({
        id: run.id,
        taskId: run.taskId,
        sourceId: run.sourceId,
        idempotencyKey: run.idempotencyKey ?? null,
        status: run.status,
        backend: run.backend,
        workspacePath: run.workspacePath,
        startedAt: run.startedAt ?? null,
        completedAt: run.completedAt ?? null,
        error: run.error ?? null,
        createdAt: run.createdAt,
      })
      .run();
  }

  updateRunStatus(runId: string, status: RunStatus, error?: string): void {
    const updates: Record<string, unknown> = { status };
    if (status === 'executing') updates.startedAt = new Date().toISOString();
    if (status === 'completed' || status === 'failed')
      updates.completedAt = new Date().toISOString();
    if (error) updates.error = error;

    this.db.update(schema.runs).set(updates).where(eq(schema.runs.id, runId)).run();
  }

  getRun(id: string): ExecutionRun | null {
    const row = this.db.select().from(schema.runs).where(eq(schema.runs.id, id)).get();
    return row ? mapRun(row) : null;
  }

  getRunByTaskAndIdempotency(taskId: string, idempotencyKey: string): ExecutionRun | null {
    const row = this.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.taskId, taskId))
      .all()
      .find((candidate) => candidate.idempotencyKey === idempotencyKey);
    return row ? mapRun(row) : null;
  }

  listRuns(): ExecutionRun[] {
    const rows = this.db.select().from(schema.runs).orderBy(desc(schema.runs.createdAt)).all();
    return rows.map(mapRun);
  }

  // --- Artifacts ---

  saveArtifact(artifact: RunArtifact): void {
    this.db
      .insert(schema.artifacts)
      .values({
        id: artifact.id,
        runId: artifact.runId,
        type: artifact.type,
        path: artifact.path,
        description: artifact.description ?? null,
        createdAt: artifact.createdAt,
      })
      .run();
  }

  getArtifactsByRun(runId: string): RunArtifact[] {
    const rows = this.db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.runId, runId))
      .orderBy(schema.artifacts.createdAt)
      .all();
    return rows.map(mapArtifact);
  }

  // --- Reviews ---

  saveReview(review: ReviewReport): void {
    this.db
      .insert(schema.reviews)
      .values({
        id: review.id,
        runId: review.runId,
        attempted: review.attempted,
        changed: review.changed,
        succeeded: review.succeeded,
        failed: review.failed,
        confidence: review.confidence,
        nextAction: review.nextAction,
        doneScore: review.doneScore ?? null,
        findings: review.findings ? JSON.stringify(review.findings) : null,
        createdAt: review.createdAt,
      })
      .run();
  }

  getReview(runId: string): ReviewReport | null {
    const row = this.db.select().from(schema.reviews).where(eq(schema.reviews.runId, runId)).get();
    return row ? mapReview(row) : null;
  }

}

// --- Mappers ---

type SourceRow = typeof schema.sources.$inferSelect;
type AnalysisRow = typeof schema.analyses.$inferSelect;
type TaskRow = typeof schema.tasks.$inferSelect;
type RunRow = typeof schema.runs.$inferSelect;
type ArtifactRow = typeof schema.artifacts.$inferSelect;
type ReviewRow = typeof schema.reviews.$inferSelect;
function mapSource(r: SourceRow): Source {
  return {
    id: r.id,
    type: r.type as Source['type'],
    location: r.location,
    name: r.name,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    fingerprint: r.fingerprint ?? undefined,
    createdAt: r.createdAt,
  };
}

function mapAnalysis(r: AnalysisRow): AnalysisReport {
  return {
    id: r.id,
    sourceId: r.sourceId,
    summary: r.summary,
    classification: r.classification as AnalysisReport['classification'],
    complexity: r.complexity,
    risk: r.risk,
    confidence: r.confidence,
    fileCount: r.fileCount ?? undefined,
    languages: r.languages ? JSON.parse(r.languages) : undefined,
    insights: JSON.parse(r.insights),
    deepAnalysis: r.deepAnalysis ? (JSON.parse(r.deepAnalysis) as DeepAnalysis) : undefined,
    createdAt: r.createdAt,
  };
}

function mapTask(r: TaskRow): CandidateTask {
  return {
    id: r.id,
    analysisId: r.analysisId,
    sourceId: r.sourceId,
    title: r.title,
    rationale: r.rationale,
    whyNow: r.whyNow ?? undefined,
    confidence: r.confidence ?? undefined,
    expectedValue: r.expectedValue,
    alternatives: r.alternatives ? JSON.parse(r.alternatives) : undefined,
    executionContract: r.executionContract ? JSON.parse(r.executionContract) : undefined,
    difficulty: r.difficulty as CandidateTask['difficulty'],
    definitionOfDone: r.definitionOfDone,
    riskNotes: r.riskNotes,
    order: r.order,
    createdAt: r.createdAt,
  };
}

function mapRun(r: RunRow): ExecutionRun {
  return {
    id: r.id,
    taskId: r.taskId,
    sourceId: r.sourceId,
    idempotencyKey: r.idempotencyKey ?? undefined,
    status: r.status as ExecutionRun['status'],
    backend: r.backend as ExecutionRun['backend'],
    workspacePath: r.workspacePath,
    startedAt: r.startedAt ?? undefined,
    completedAt: r.completedAt ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.createdAt,
  };
}

function mapArtifact(r: ArtifactRow): RunArtifact {
  return {
    id: r.id,
    runId: r.runId,
    type: r.type,
    path: r.path,
    description: r.description ?? undefined,
    createdAt: r.createdAt,
  };
}

function mapReview(r: ReviewRow): ReviewReport {
  return {
    id: r.id,
    runId: r.runId,
    attempted: r.attempted,
    changed: r.changed,
    succeeded: r.succeeded,
    failed: r.failed,
    confidence: r.confidence,
    nextAction: r.nextAction,
    doneScore: r.doneScore ?? undefined,
    findings: r.findings ? JSON.parse(r.findings) : undefined,
    createdAt: r.createdAt,
  };
}
