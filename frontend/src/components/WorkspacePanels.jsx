// Components that render the workflow layer: tasks, runs,
// comparisons, and modals. These receive callbacks from App for actions.

import { SectionHeader } from './ui.jsx';
import { formatDateTime } from '../utils.js';

// ── Tasks ────────────────────────────────────────────────────────

export function TasksSection({ tasks, onRunTask, busy, runningTaskId }) {
  if (!tasks?.length) return null;
  const diffBadge = (d) => {
    const cls = d === 'hard' ? 'badge-high' : d === 'moderate' ? 'badge-medium' : 'badge-low';
    return <span className={`badge ${cls}`}>{d}</span>;
  };
  return (
    <section className="report-section">
      <SectionHeader number="⚡" title="Generated Tasks" count={tasks.length} />
      <div className="tasks-list">
        {tasks.map((t) => {
          const isRunning = runningTaskId === t.id;
          return (
            <div key={t.id} className="task-card">
              <div className="task-card-header">
                <span className="task-order">#{t.order}</span>
                <strong>{t.title}</strong>
                {diffBadge(t.difficulty)}
              </div>
              <p className="task-rationale">{t.rationale}</p>
              {t.whyNow && <p className="task-rationale"><strong>Why now:</strong> {t.whyNow}</p>}
              <div className="task-meta">
                <div>
                  <span className="core-label">Definition of Done</span>
                  <p className="task-dod">{t.definitionOfDone}</p>
                </div>
                {typeof t.confidence === 'number' && (
                  <div>
                    <span className="core-label">Task Confidence</span>
                    <p className="task-dod">{Math.round(t.confidence * 100)}%</p>
                  </div>
                )}
                {t.riskNotes && (
                  <div>
                    <span className="core-label">Risk</span>
                    <p className="task-risk">{t.riskNotes}</p>
                  </div>
                )}
                {Array.isArray(t.alternatives) && t.alternatives.length > 0 && (
                  <div>
                    <span className="core-label">Why not alternatives</span>
                    <ul>
                      {t.alternatives.slice(0, 2).map((alt) => (
                        <li key={`${t.id}-${alt.title}`}>
                          <strong>{alt.title}:</strong> {alt.reasonDeferred}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {onRunTask && (
                <div className="task-actions">
                  <button type="button" className="secondary-action" onClick={() => onRunTask(t)} disabled={busy}>
                    {isRunning ? 'Working...' : 'Run Task'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Runs ─────────────────────────────────────────────────────────

export function RunsPanel({ runs, onOpenRun }) {
  if (!runs?.length) return null;
  return (
    <section className="report-section">
      <SectionHeader number="RN" title="Runs" count={runs.length} />
      <div className="runs-list">
        {runs.map((run) => (
          <div key={run.id} className="run-card">
            <div className="run-card-header">
              <div>
                <strong>{run.status}</strong>
                <p className="meta">{formatDateTime(run.createdAt)}</p>
              </div>
              <button type="button" className="secondary-action" onClick={() => onOpenRun(run.id)}>
                Open
              </button>
            </div>
            <div className="run-meta-grid">
              <div>
                <span className="core-label">Run ID</span>
                <code>{run.id}</code>
              </div>
              <div>
                <span className="core-label">Task ID</span>
                <code>{run.taskId}</code>
              </div>
            </div>
            {run.error && <p className="run-error">{run.error}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Comparison ───────────────────────────────────────────────────

export function ComparisonPanel({
  sources,
  activeSourceId,
  compareTargetId,
  onCompareTargetChange,
  onCompare,
  comparison,
  busy,
}) {
  if (!activeSourceId || sources.length < 2) return null;
  const candidates = sources.filter((source) => source.id !== activeSourceId);
  return (
    <section className="report-section">
      <SectionHeader number="CP" title="Comparison" />
      <div className="toolbar-grid">
        <label className="control-card">
          <span className="core-label">Compare Against</span>
          <select value={compareTargetId} onChange={(e) => onCompareTargetChange(e.target.value)}>
            <option value="">Select a source</option>
            {candidates.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name || source.id}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={onCompare}
            disabled={busy || !compareTargetId}
          >
            {busy ? 'Working...' : 'Compare'}
          </button>
        </div>
      </div>

      {comparison && (
        <div className="comparison-panel">
          <p className="comparison-summary">{comparison.summary}</p>
          <div className="comparison-header-grid">
            <div className="comparison-source-card">
              <span className="core-label">Source A</span>
              <strong>{comparison.sourceA.name}</strong>
              <small>{formatDateTime(comparison.sourceA.analyzedAt)}</small>
            </div>
            <div className="comparison-source-card">
              <span className="core-label">Source B</span>
              <strong>{comparison.sourceB.name}</strong>
              <small>{formatDateTime(comparison.sourceB.analyzedAt)}</small>
            </div>
          </div>
          <div className="comparison-deltas">
            {comparison.deltas.map((delta) => (
              <div key={`${delta.metric}-${delta.before}-${delta.after}`} className="comparison-delta">
                <span className={`delta-indicator delta-${delta.direction}`}>{delta.direction}</span>
                <strong>{delta.metric}</strong>
                <code>{String(delta.before)}</code>
                <span className="delta-arrow">-&gt;</span>
                <code>{String(delta.after)}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Run document modal ───────────────────────────────────────────

export function RunDocumentModal({ data, onClose }) {
  if (!data) return null;
  const docSections = [
    ['Run Summary', data.documents?.runSummary],
    ['Review Notes', data.documents?.reviewNotes],
    ['Execution Plan', data.documents?.executionPlan],
    ['Execution Summary', data.documents?.executionSummary],
    ['Inventory', data.documents?.inventory],
  ].filter(([, content]) => typeof content === 'string' && content.trim().length > 0);

  return (
    <section className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="run-doc-title">
      <div className="detail-modal">
        <div className="detail-modal-header">
          <div>
            <h3 id="run-doc-title">Run Detail</h3>
            <p className="meta">
              {data.run?.id} | {data.run?.status}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        <div className="detail-modal-body">
          <div className="detail-meta-grid">
            {data.source && (
              <div className="detail-card">
                <span className="core-label">Source</span>
                <strong>{data.source.name}</strong>
                <small>{data.source.id}</small>
              </div>
            )}
            {data.task && (
              <div className="detail-card">
                <span className="core-label">Task</span>
                <strong>{data.task.title}</strong>
                <small>{data.task.difficulty}</small>
              </div>
            )}
            {data.review && (
              <div className="detail-card">
                <span className="core-label">Next Action</span>
                <strong>{data.review.nextAction}</strong>
                <small>{Math.round((data.review.confidence ?? 0) * 100)}% confidence</small>
              </div>
            )}
          </div>

          {docSections.length > 0 && (
            <div className="detail-docs">
              {docSections.map(([label, content]) => (
                <div key={label} className="detail-doc-card">
                  <span className="core-label">{label}</span>
                  <pre>{content}</pre>
                </div>
              ))}
            </div>
          )}

          {data.artifacts?.length > 0 && (
            <div className="detail-artifacts">
              <span className="core-label">Artifacts</span>
              <div className="imp-files">
                {data.artifacts.map((artifact) => <code key={artifact.id}>{artifact.type}</code>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
