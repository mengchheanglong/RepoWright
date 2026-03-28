import { useEffect, useState } from 'react';
import { request } from './api.js';
import { sourceLabel, downloadTextFile } from './utils.js';
import {
  AnalysisStatsBar,
  BasicAnalysisSection,
  CodeQualitySection,
  ComponentsSection,
  ConfigAnalysisSection,
  CoreSystemSection,
  DependencyGraphSection,
  HealthScoreSection,
  ImprovementsSection,
  OptimizationsSection,
  SecuritySection,
  UniquenessSection,
} from './components/AnalysisReport.jsx';
import {
  ComparisonPanel,
  RunDocumentModal,
  RunsPanel,
  TasksSection,
} from './components/WorkspacePanels.jsx';

export default function App() {
  const [sourceInput, setSourceInput] = useState('');
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeSourceId, setActiveSourceId] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [compareTargetId, setCompareTargetId] = useState('');
  const [runDocument, setRunDocument] = useState(null);
  const [pendingDeleteSource, setPendingDeleteSource] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [nextTaskHint, setNextTaskHint] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [intentInput, setIntentInput] = useState('');
  const [safetyProfile, setSafetyProfile] = useState('balanced');
  const [portfolioTriage, setPortfolioTriage] = useState([]);
  const [proofOfValue, setProofOfValue] = useState(null);
  const [latestTrustEnvelope, setLatestTrustEnvelope] = useState(null);

  // ── Data loading ─────────────────────────────────────────────

  async function refresh() {
    const [sourcesResponse, runsResponse] = await Promise.all([
      request('/sources'),
      request('/runs').catch(() => ({ runs: [] })),
    ]);
    const nextSources = sourcesResponse.sources ?? [];
    setSources(nextSources);
    setRuns(runsResponse.runs ?? []);

    if (activeSourceId && !nextSources.some((s) => s.id === activeSourceId)) {
      setActiveSourceId('');
      setAnalysis(null);
      setTasks([]);
      setComparison(null);
      setRunDocument(null);
    }

    if (!capabilities) {
      const meta = await request('/capabilities').catch(() => null);
      if (meta) setCapabilities(meta);
    }

    const triage = await request('/portfolio-triage').catch(() => ({ items: [] }));
    setPortfolioTriage(triage.items ?? []);
  }

  useEffect(() => {
    setBusy(true);
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!activeSourceId) return;
    if (compareTargetId && compareTargetId !== activeSourceId) return;
    const fallback = sources.find((s) => s.id !== activeSourceId)?.id ?? '';
    if (fallback !== compareTargetId) setCompareTargetId(fallback);
  }, [activeSourceId, compareTargetId, sources]);

  useEffect(() => {
    if (!activeSourceId) {
      setNextTaskHint(null);
      return;
    }
    request(`/next-task/${activeSourceId}`)
      .then((payload) => setNextTaskHint(payload))
      .catch(() => setNextTaskHint(null));
  }, [activeSourceId, runs.length, tasks.length]);

  useEffect(() => {
    if (!activeSourceId) {
      setProofOfValue(null);
      return;
    }
    request(`/proof-of-value/${activeSourceId}`)
      .then((payload) => setProofOfValue(payload))
      .catch(() => setProofOfValue(null));
  }, [activeSourceId, runs.length]);

  // ── Action handlers ──────────────────────────────────────────

  async function onIngest(event) {
    event.preventDefault();
    if (!sourceInput.trim()) return;
    setBusy(true);
    setError('');
    setStatus('Analyzing source...');
    try {
      const payload = await request('/ingest', {
        method: 'POST',
        body: JSON.stringify({ source: sourceInput.trim(), intent: intentInput.trim() || undefined }),
      });
      const source = payload.source ?? null;
      const nextAnalysis = payload.analysis ?? null;
      const nextTasks = payload.tasks ?? [];
      if (!source || !nextAnalysis) throw new Error('Analysis response was incomplete.');
      setActiveSourceId(source.id);
      setAnalysis(nextAnalysis);
      setTasks(nextTasks);
      setSourceInput('');
      setIntentInput('');
      setComparison(null);
      setStatus(`Analysis complete for "${source.name ?? source.id}".`);
      await refresh();
    } catch (err) {
      setError(err.message);
      setStatus('Analysis failed.');
    } finally {
      setBusy(false);
    }
  }

  async function loadAnalysis(sourceId) {
    setBusy(true);
    setError('');
    setStatus('Loading analysis...');
    try {
      const [analysisPayload, tasksPayload] = await Promise.all([
        request(`/analysis/${sourceId}`),
        request(`/tasks/${sourceId}`).catch(() => ({ tasks: [] })),
      ]);
      setAnalysis(analysisPayload.analysis ?? null);
      setTasks(tasksPayload.tasks ?? []);
      setActiveSourceId(sourceId);
      setComparison(null);
      setStatus('Analysis loaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runTask(task) {
    setBusy(true);
    setRunningTaskId(task.id);
    setError('');
    setStatus(`Executing "${task.title}"...`);
    try {
      const idempotencyKey = `task:${task.id}:source:${task.sourceId}`;
      const payload = await request('/run', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id, idempotencyKey, safetyProfile }),
      });
      const nextRun = payload.run ?? null;
      if (!nextRun) throw new Error('Run response was incomplete.');
      setStatus(payload.reused ? `Run ${nextRun.id} reused (idempotent replay).` : `Run ${nextRun.id} completed.`);
      const trust = await request(`/trust-envelope/${nextRun.id}`).catch(() => null);
      if (trust?.envelope) setLatestTrustEnvelope(trust.envelope);
      await refresh();
      await openRunDocument(nextRun.id);
    } catch (err) {
      setError(err.message);
      setStatus('Task execution failed.');
    } finally {
      setRunningTaskId(null);
      setBusy(false);
    }
  }

  async function openRunDocument(runId) {
    try {
      const payload = await request(`/review-document/${runId}`);
      setRunDocument(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  async function exportAnalysis(format) {
    if (!activeSourceId) return;
    setBusy(true);
    setError('');
    setStatus(`Exporting ${format}...`);
    try {
      const payload = await request(`/export/${activeSourceId}?format=${format}`);
      const files = payload.files ?? [];
      for (const file of files) {
        downloadTextFile(file.name, file.content, file.mimeType);
      }
      setStatus(`Exported ${files.length} file${files.length === 1 ? '' : 's'} as ${format}.`);
    } catch (err) {
      setError(err.message);
      setStatus('Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function compareSources() {
    if (!activeSourceId || !compareTargetId) return;
    setBusy(true);
    setError('');
    setStatus('Comparing analyses...');
    try {
      const payload = await request(`/compare/${activeSourceId}/${compareTargetId}`);
      setComparison(payload.comparison ?? null);
      setStatus('Comparison ready.');
    } catch (err) {
      setError(err.message);
      setStatus('Comparison failed.');
    } finally {
      setBusy(false);
    }
  }

  async function createWorkOrder() {
    if (!activeSourceId || !intentInput.trim()) return;
    setBusy(true);
    setError('');
    try {
      const payload = await request('/work-order', {
        method: 'POST',
        body: JSON.stringify({ sourceId: activeSourceId, intent: intentInput.trim() }),
      });
      setTasks(payload.tasks ?? tasks);
      setStatus(payload.summary ?? 'Work order created.');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteSource(source) {
    setPendingDeleteSource(source);
  }

  async function confirmDeleteSource() {
    if (!pendingDeleteSource) return;
    setBusy(true);
    setError('');
    try {
      await request(`/sources/${pendingDeleteSource.id}`, { method: 'DELETE' });
      if (activeSourceId === pendingDeleteSource.id) {
        setActiveSourceId('');
        setAnalysis(null);
        setTasks([]);
        setComparison(null);
        setRunDocument(null);
      }
      setStatus(`Deleted source "${sourceLabel(pendingDeleteSource)}".`);
      setPendingDeleteSource(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Derived state ────────────────────────────────────────────

  const deep = analysis?.deepAnalysis;
  const activeSource = sources.find((s) => s.id === activeSourceId) ?? null;
  const sourceRuns = runs
    .filter((r) => r.sourceId === activeSourceId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const recommendedTask = nextTaskHint?.nextTask ?? null;

  function applyPreset(preset) {
    setSourceInput(preset);
  }

  // ── Layout ───────────────────────────────────────────────────

  return (
    <main className="shell">
      <section className="hero card">
        <p className="label">RepoWright</p>
        <h1>Analysis, execution, and review in one workspace</h1>
        <p className="subtext">
          Ingest a codebase, inspect its architecture, run generated tasks,
          compare sources, and export reports.
        </p>
        <div className="hero-presets">
          <span className="core-label">Quick input presets</span>
          <div className="hero-preset-actions">
            <button type="button" className="ghost" onClick={() => applyPreset('.')}>Current folder</button>
            <button type="button" className="ghost" onClick={() => applyPreset('../')}>Parent folder</button>
            <button type="button" className="ghost" onClick={() => applyPreset('https://github.com/owner/repo.git')}>Git URL</button>
          </div>
        </div>
        <form onSubmit={onIngest} className="ingest-form">
          <input
            type="text"
            value={sourceInput}
            placeholder="Path to project, git URL, or text brief"
            onChange={(e) => setSourceInput(e.target.value)}
          />
          <input
            type="text"
            value={intentInput}
            placeholder="Optional intent (e.g., reduce CI flakiness)"
            onChange={(e) => setIntentInput(e.target.value)}
          />
          <select value={safetyProfile} onChange={(e) => setSafetyProfile(e.target.value)}>
            <option value="conservative">Conservative safety</option>
            <option value="balanced">Balanced safety</option>
            <option value="aggressive">Aggressive safety</option>
          </select>
          <button type="submit" disabled={busy}>Analyze</button>
          {activeSourceId && (
            <button type="button" onClick={createWorkOrder} disabled={busy || !intentInput.trim()} className="ghost">
              Create Work Order
            </button>
          )}
          <button type="button" onClick={refresh} disabled={busy} className="ghost">Refresh</button>
        </form>
        {activeSource && (
          <div className="hero-actions">
            <button type="button" className="secondary-action" onClick={() => exportAnalysis('markdown')} disabled={busy}>
              Export Markdown
            </button>
            <button type="button" className="secondary-action" onClick={() => exportAnalysis('json')} disabled={busy}>
              Export JSON
            </button>
            <button type="button" className="secondary-action" onClick={() => exportAnalysis('csv')} disabled={busy}>
              Export CSV
            </button>
          </div>
        )}
        <p className="status">{status}</p>
        {error && <p className="error">{error}</p>}
        {capabilities && (
          <p className="meta">
            API {capabilities.apiVersion} | Run schema {capabilities.runRequestSchemaVersion} | Idempotency {capabilities.runIdempotency?.supported ? 'enabled' : 'disabled'}
          </p>
        )}
      </section>

      <div className="main-layout">
        <aside className="sources-sidebar card">
          <header>
            <h2>Sources</h2>
            <span>{sources.length}</span>
          </header>
          <div className="list">
            {sources.map((source) => (
              <div key={source.id} className={`list-item ${activeSourceId === source.id ? 'active' : ''}`}>
                <button className="source-main" onClick={() => loadAnalysis(source.id)} type="button">
                  <strong>{sourceLabel(source)}</strong>
                  <small>{source.type || 'source'} | {source.id}</small>
                </button>
                <button
                  className="delete-btn"
                  type="button"
                  onClick={() => requestDeleteSource(source)}
                  disabled={busy}
                  aria-label={`Delete ${sourceLabel(source)}`}
                  title="Delete source"
                >
                  <svg viewBox="0 0 24 24" className="trash-icon" aria-hidden="true">
                    <path
                      d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 11h8a2 2 0 0 0 2-2V9H6v9a2 2 0 0 0 2 2z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
            ))}
            {sources.length === 0 && <p className="empty">No sources yet. Analyze one above.</p>}
          </div>
        </aside>

        <div className="report-area">
          {recommendedTask && (
            <section className="report-section card">
              <h3>Recommended Next Task</h3>
              <p>{nextTaskHint?.summary}</p>
              <button type="button" className="secondary-action" onClick={() => runTask(recommendedTask)} disabled={busy}>
                Run Recommended Task
              </button>
            </section>
          )}
          {latestTrustEnvelope && (
            <section className="report-section card">
              <h3>Run Trust Envelope</h3>
              <p>Trust: <strong>{latestTrustEnvelope.trustLevel}</strong> | Risk signals: {latestTrustEnvelope.unresolvedRiskCount}</p>
              <p>Analysis confidence: {latestTrustEnvelope.analysisConfidence ?? 'n/a'} | Execution confidence: {latestTrustEnvelope.executionConfidence ?? 'n/a'}</p>
            </section>
          )}
          {proofOfValue?.metrics && (
            <section className="report-section card">
              <h3>Proof of Value</h3>
              <p>Runs: {proofOfValue.metrics.runCount} | Completion rate: {Math.round((proofOfValue.metrics.completionRate ?? 0) * 100)}%</p>
              <p>Average done score: {proofOfValue.metrics.averageDoneScore} | Avg review confidence: {proofOfValue.metrics.averageReviewConfidence}</p>
            </section>
          )}
          {portfolioTriage.length > 0 && (
            <section className="report-section card">
              <h3>Portfolio Triage</h3>
              <ul>
                {portfolioTriage.slice(0, 5).map((item) => (
                  <li key={item.sourceId}>
                    <strong>{item.name}</strong> — score {item.portfolioScore} ({item.pendingTaskCount} pending)
                  </li>
                ))}
              </ul>
            </section>
          )}
          {analysis && !deep && <BasicAnalysisSection analysis={analysis} />}
          {analysis && deep && (
            <>
              <AnalysisStatsBar analysis={analysis} deep={deep} />
              <CoreSystemSection core={deep.coreSystem} />
              <ComponentsSection components={deep.usefulComponents} />
              <ImprovementsSection improvements={deep.improvements} />
              <UniquenessSection uniqueness={deep.uniqueness} />
              <OptimizationsSection optimizations={deep.optimizations} />
              <CodeQualitySection cq={deep.codeQuality} />
              <DependencyGraphSection depGraph={deep.dependencyGraph} />
              <ConfigAnalysisSection configAnalysis={deep.configAnalysis} />
              <HealthScoreSection healthScore={deep.healthScore} />
              <SecuritySection security={deep.security} />
            </>
          )}

          <TasksSection tasks={tasks} onRunTask={runTask} busy={busy} runningTaskId={runningTaskId} />
          <RunsPanel runs={sourceRuns} onOpenRun={openRunDocument} />
          <ComparisonPanel
            sources={sources}
            activeSourceId={activeSourceId}
            compareTargetId={compareTargetId}
            onCompareTargetChange={setCompareTargetId}
            onCompare={compareSources}
            comparison={comparison}
            busy={busy}
          />

          {!analysis && (
            <div className="empty-state card">
              <h2>No source selected</h2>
              <p>Enter a project path, git URL, or text brief above, or select a source from the sidebar.</p>
            </div>
          )}
        </div>
      </div>

      {pendingDeleteSource && (
        <section className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="confirm-card">
            <h3 id="delete-title">Delete source?</h3>
            <p>You are deleting <strong>{sourceLabel(pendingDeleteSource)}</strong>.</p>
            <p className="confirm-note">
              This will remove related analyses, tasks, runs, and local artifacts for this source.
            </p>
            <div className="confirm-actions">
              <button type="button" className="ghost" onClick={() => setPendingDeleteSource(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="delete-confirm-btn" onClick={confirmDeleteSource} disabled={busy}>
                {busy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </section>
      )}

      <RunDocumentModal data={runDocument} onClose={() => setRunDocument(null)} />
    </main>
  );
}
