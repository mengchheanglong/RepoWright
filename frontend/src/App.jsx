import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

function PriorityBadge({ priority }) {
  const cls = `badge badge-${priority}`;
  return <span className={cls}>{priority}</span>;
}

function ImpactBadge({ impact, effort }) {
  return (
    <span className="impact-badges">
      <span className={`badge badge-${impact}`}>Impact: {impact}</span>
      <span className={`badge badge-${effort}`}>Effort: {effort}</span>
    </span>
  );
}

function SectionHeader({ number, title, count }) {
  return (
    <header className="section-header">
      <span className="section-num">{number}</span>
      <h3>{title}</h3>
      {count !== undefined && <span className="section-count">{count}</span>}
    </header>
  );
}

function CoreSystemSection({ core }) {
  if (!core) return null;
  return (
    <section className="report-section">
      <SectionHeader number="01" title="Core System" />
      <p className="core-summary">{core.summary}</p>
      <div className="core-grid">
        <div className="core-item">
          <span className="core-label">Architecture</span>
          <p>{core.architecture}</p>
        </div>
        <div className="core-item">
          <span className="core-label">Data Flow</span>
          <p>{core.dataFlow}</p>
        </div>
      </div>
      {core.techStack?.length > 0 && (
        <div className="tag-list">
          <span className="core-label">Tech Stack</span>
          <div className="tags">{core.techStack.map((t) => <span key={t} className="tag">{t}</span>)}</div>
        </div>
      )}
      {core.frameworks?.length > 0 && (
        <div className="tag-list">
          <span className="core-label">Frameworks</span>
          <div className="tags">{core.frameworks.map((f) => <span key={f} className="tag tag-fw">{f}</span>)}</div>
        </div>
      )}
      {core.patterns?.length > 0 && (
        <div className="tag-list">
          <span className="core-label">Patterns</span>
          <div className="tags">{core.patterns.map((p) => <span key={p} className="tag tag-pattern">{p}</span>)}</div>
        </div>
      )}
      {core.entryPoints?.length > 0 && (
        <div className="entry-points">
          <span className="core-label">Entry Points</span>
          <ul>{core.entryPoints.map((ep) => <li key={ep}><code>{ep}</code></li>)}</ul>
        </div>
      )}
    </section>
  );
}

function ComponentsSection({ components }) {
  if (!components?.length) return null;
  return (
    <section className="report-section">
      <SectionHeader number="02" title="Useful Components" count={components.length} />
      <div className="components-grid">
        {components.map((c) => (
          <div key={`${c.name}-${c.location}`} className="component-card">
            <div className="component-header">
              <strong>{c.name}</strong>
              <span className={`reuse-badge reuse-${c.reusability}`}>{c.reusability}</span>
            </div>
            <p>{c.description}</p>
            <code className="comp-location">{c.location}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImprovementsSection({ improvements }) {
  if (!improvements?.length) return null;
  const grouped = { high: [], medium: [], low: [] };
  for (const imp of improvements) {
    grouped[imp.priority]?.push(imp);
  }
  return (
    <section className="report-section">
      <SectionHeader number="03" title="Improvements" count={improvements.length} />
      {['high', 'medium', 'low'].map((priority) =>
        grouped[priority].length > 0 ? (
          <div key={priority} className="improvement-group">
            <h4 className="priority-heading"><PriorityBadge priority={priority} /> Priority</h4>
            {grouped[priority].map((imp, i) => (
              <div key={i} className="improvement-item">
                <div className="imp-header">
                  <strong>{imp.area}</strong>
                </div>
                <p className="imp-issue">{imp.issue}</p>
                <p className="imp-suggestion">{imp.suggestion}</p>
                {imp.files?.length > 0 && (
                  <div className="imp-files">
                    {imp.files.map((f, j) => <code key={j}>{f}</code>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null,
      )}
    </section>
  );
}

function UniquenessSection({ uniqueness }) {
  if (!uniqueness) return null;
  return (
    <section className="report-section">
      <SectionHeader number="04" title="Uniqueness" />
      <p className="core-summary">{uniqueness.summary}</p>
      {uniqueness.differentiators?.length > 0 && (
        <div className="uniqueness-list">
          <span className="core-label">Differentiators</span>
          <ul>{uniqueness.differentiators.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      {uniqueness.novelApproaches?.length > 0 && (
        <div className="uniqueness-list">
          <span className="core-label">Novel Approaches</span>
          <ul>{uniqueness.novelApproaches.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function OptimizationsSection({ optimizations }) {
  if (!optimizations) return null;
  const categories = [
    { key: 'simplification', title: 'Simplification', items: optimizations.simplification },
    { key: 'alternativeStack', title: 'Alternative Frameworks / Languages', items: optimizations.alternativeStack },
    { key: 'performance', title: 'Performance', items: optimizations.performance },
  ];
  const totalCount = categories.reduce((sum, c) => sum + (c.items?.length ?? 0), 0);

  return (
    <section className="report-section">
      <SectionHeader number="05" title="How to Improve" count={totalCount} />
      {categories.map(({ key, title, items }) =>
        items?.length > 0 ? (
          <div key={key} className="opt-category">
            <h4 className="opt-heading">{title}</h4>
            {items.map((opt, i) => (
              <div key={i} className="opt-item">
                <div className="opt-header">
                  <strong>{opt.strategy}</strong>
                  <ImpactBadge impact={opt.impact} effort={opt.effort} />
                </div>
                <p>{opt.description}</p>
              </div>
            ))}
          </div>
        ) : null,
      )}
    </section>
  );
}

function CodeQualitySection({ cq }) {
  if (!cq) return null;
  return (
    <section className="report-section">
      <SectionHeader number="06" title="Code Quality" />
      <div className="cq-stats-grid">
        <div className="cq-stat">
          <span className="cq-num">{cq.totalCodeLines.toLocaleString()}</span>
          <span className="cq-label">Code Lines</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{cq.totalFunctions}</span>
          <span className="cq-label">Functions</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{Math.round(cq.commentRatio * 100)}%</span>
          <span className="cq-label">Comment Ratio</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{cq.avgFunctionLength.toFixed(0)}</span>
          <span className="cq-label">Avg Func Length</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{cq.maxNestingDepth}</span>
          <span className="cq-label">Max Nesting</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{cq.todoCount}</span>
          <span className="cq-label">TODOs</span>
        </div>
      </div>

      {(cq.anyTypeCount > 0 || cq.emptyCatchCount > 0) && (
        <div className="cq-issues">
          <span className="core-label">Issues Detected</span>
          {cq.anyTypeCount > 0 && (
            <div className="cq-issue-item">
              <span className="badge badge-high">any</span>
              <span>{cq.anyTypeCount} usages of <code>any</code> type</span>
              <div className="imp-files">
                {cq.anyTypeFiles.map((f, i) => <code key={i}>{f}</code>)}
              </div>
            </div>
          )}
          {cq.emptyCatchCount > 0 && (
            <div className="cq-issue-item">
              <span className="badge badge-medium">catch</span>
              <span>{cq.emptyCatchCount} empty catch blocks</span>
              <div className="imp-files">
                {cq.emptyCatchFiles.map((f, i) => <code key={i}>{f}</code>)}
              </div>
            </div>
          )}
        </div>
      )}

      {cq.largeFiles?.length > 0 && (
        <div className="cq-large-files">
          <span className="core-label">Large Files ({'>'}300 lines)</span>
          <div className="file-bar-list">
            {cq.largeFiles.map((f) => (
              <div key={f.path} className="file-bar-item">
                <code>{f.path}</code>
                <span className="file-bar-count">{f.lines} lines</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cq.maxFilePath && (
        <div className="cq-highlight">
          <span className="core-label">Largest File</span>
          <code>{cq.maxFilePath}</code> &mdash; {cq.maxFileLines} lines
        </div>
      )}
      {cq.maxNestingFile && (
        <div className="cq-highlight">
          <span className="core-label">Deepest Nesting</span>
          <code>{cq.maxNestingFile}</code> &mdash; {cq.maxNestingDepth} levels
        </div>
      )}
    </section>
  );
}

function DependencyGraphSection({ depGraph }) {
  if (!depGraph) return null;
  return (
    <section className="report-section">
      <SectionHeader number="07" title="Dependency Graph" />
      <div className="cq-stats-grid">
        <div className="cq-stat">
          <span className="cq-num">{depGraph.internalImportCount}</span>
          <span className="cq-label">Internal Imports</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{depGraph.externalDepCount}</span>
          <span className="cq-label">External Deps</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{depGraph.orphanFiles?.length ?? 0}</span>
          <span className="cq-label">Orphan Files</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{depGraph.circularDeps?.length ?? 0}</span>
          <span className="cq-label">Circular Deps</span>
        </div>
      </div>

      {depGraph.centralModules?.length > 0 && (
        <div className="dep-section">
          <span className="core-label">Central Modules (most imported)</span>
          <div className="file-bar-list">
            {depGraph.centralModules.map((m) => (
              <div key={m.file} className="file-bar-item">
                <code>{m.file}</code>
                <span className="file-bar-count">{m.importedByCount} importers</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {depGraph.circularDeps?.length > 0 && (
        <div className="dep-section">
          <span className="core-label warning-label">Circular Dependencies</span>
          {depGraph.circularDeps.map((cycle, i) => (
            <div key={i} className="circular-chain">
              {cycle.map((file, j) => (
                <span key={j}>
                  <code>{file}</code>
                  {j < cycle.length - 1 && <span className="chain-arrow">&rarr;</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {depGraph.orphanFiles?.length > 0 && (
        <div className="dep-section">
          <span className="core-label">Orphan Files (not imported by anything)</span>
          <div className="orphan-list">
            {depGraph.orphanFiles.map((f) => <code key={f}>{f}</code>)}
          </div>
        </div>
      )}
    </section>
  );
}

function HealthScoreSection({ healthScore }) {
  if (!healthScore) return null;
  const gradeColor = { A: 'var(--green)', B: 'var(--green)', C: 'var(--yellow)', D: 'var(--red)', F: 'var(--red)' };
  return (
    <section className="report-section">
      <SectionHeader number="09" title="Health Score" />
      <div className="health-hero">
        <div className="health-grade" style={{ '--grade-color': gradeColor[healthScore.grade] ?? 'var(--muted)' }}>
          <span className="health-grade-letter">{healthScore.grade}</span>
          <span className="health-grade-score">{Math.round(healthScore.overall)}/100</span>
        </div>
        <div className="health-meta">
          <span className="health-maturity-badge">{healthScore.maturity.replace('-', ' ')}</span>
        </div>
      </div>
      <div className="health-dimensions">
        {healthScore.dimensions.map((dim) => (
          <div key={dim.name} className="health-dim">
            <div className="health-dim-header">
              <span className="health-dim-name">{dim.name}</span>
              <span className="health-dim-score">{Math.round(dim.score)}</span>
            </div>
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{
                  width: `${Math.round(dim.score)}%`,
                  background: dim.score >= 70 ? 'var(--green)' : dim.score >= 40 ? 'var(--yellow)' : 'var(--red)',
                }}
              />
            </div>
            {dim.details.length > 0 && (
              <ul className="health-dim-details">
                {dim.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SecuritySection({ security }) {
  if (!security) return null;
  const total = security.findings.length;
  const scoreColor = security.score >= 80 ? 'var(--green)' : security.score >= 50 ? 'var(--yellow)' : 'var(--red)';

  const grouped = { critical: [], high: [], medium: [], low: [], info: [] };
  for (const f of security.findings) {
    grouped[f.severity]?.push(f);
  }

  return (
    <section className="report-section">
      <SectionHeader number="10" title="Security" count={total} />
      <div className="security-overview">
        <div className="security-score-ring" style={{ '--sec-color': scoreColor }}>
          <span className="security-score-num">{security.score}</span>
          <span className="security-score-label">Score</span>
        </div>
        <div className="security-summary-grid">
          <div className="sec-stat">
            <span className="sec-stat-num" style={{ color: security.summary.critical > 0 ? 'var(--red)' : 'var(--muted)' }}>
              {security.summary.critical}
            </span>
            <span className="sec-stat-label">Critical</span>
          </div>
          <div className="sec-stat">
            <span className="sec-stat-num" style={{ color: security.summary.high > 0 ? 'var(--red)' : 'var(--muted)' }}>
              {security.summary.high}
            </span>
            <span className="sec-stat-label">High</span>
          </div>
          <div className="sec-stat">
            <span className="sec-stat-num" style={{ color: security.summary.medium > 0 ? 'var(--yellow)' : 'var(--muted)' }}>
              {security.summary.medium}
            </span>
            <span className="sec-stat-label">Medium</span>
          </div>
          <div className="sec-stat">
            <span className="sec-stat-num" style={{ color: security.summary.low > 0 ? 'var(--green)' : 'var(--muted)' }}>
              {security.summary.low}
            </span>
            <span className="sec-stat-label">Low</span>
          </div>
        </div>
        <div className="security-flags">
          <span className={`sec-flag ${security.hasSecurityPolicy ? 'sec-flag-ok' : 'sec-flag-missing'}`}>
            {security.hasSecurityPolicy ? '✓' : '✗'} SECURITY.md
          </span>
          <span className={`sec-flag ${security.hasLockFile ? 'sec-flag-ok' : 'sec-flag-missing'}`}>
            {security.hasLockFile ? '✓' : '✗'} Lock file
          </span>
        </div>
      </div>

      {total > 0 && (
        <div className="security-findings">
          {['critical', 'high', 'medium', 'low', 'info'].map((severity) => {
            const items = grouped[severity];
            if (!items || items.length === 0) return null;
            return (
              <div key={severity} className="sec-finding-group">
                <h4 className="priority-heading">
                  <span className={`badge badge-${severity === 'critical' || severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low'}`}>
                    {severity}
                  </span>
                  {items.length} finding{items.length !== 1 ? 's' : ''}
                </h4>
                {items.map((f, i) => (
                  <div key={i} className="sec-finding-item">
                    <div className="sec-finding-header">
                      <strong>{f.title}</strong>
                      <span className={`badge badge-${f.confidence === 'high' ? 'high' : f.confidence === 'medium' ? 'medium' : 'low'}`}>
                        {f.confidence}
                      </span>
                    </div>
                    <p className="sec-finding-desc">{f.description}</p>
                    <div className="sec-finding-meta">
                      <code>{f.filePath}:{f.line}</code>
                      <span className="tag">{f.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {total === 0 && (
        <p className="sec-clean">No security findings detected.</p>
      )}
    </section>
  );
}

function ConfigAnalysisSection({ configAnalysis }) {
  if (!configAnalysis) return null;
  const { typescript: ts, python, go, rust, ruby, packageManager, nodeVersion, scripts } = configAnalysis;
  const hasContent = ts || python || go || rust || ruby || packageManager || nodeVersion || scripts?.length > 0;
  if (!hasContent) return null;
  return (
    <section className="report-section">
      <SectionHeader number="08" title="Configuration" />
      <div className="config-grid">
        {ts && (
          <div className="config-card">
            <span className="core-label">TypeScript</span>
            <div className="config-row">
              <span>Strict</span>
              <span className={ts.strict ? 'config-good' : 'config-warn'}>{ts.strict ? 'Yes' : 'No'}</span>
            </div>
            <div className="config-row">
              <span>Target</span>
              <span>{ts.target}</span>
            </div>
            <div className="config-row">
              <span>Module</span>
              <span>{ts.module}</span>
            </div>
            {ts.issues?.length > 0 && (
              <div className="config-issues">
                {ts.issues.map((issue, i) => (
                  <p key={i} className="config-issue">{issue}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {configAnalysis.python && (
          <div className="config-card">
            <span className="core-label">Python</span>
            {configAnalysis.python.version && (
              <div className="config-row">
                <span>Requires Python</span>
                <span>{configAnalysis.python.version}</span>
              </div>
            )}
            {configAnalysis.python.buildSystem && (
              <div className="config-row">
                <span>Build System</span>
                <span>{configAnalysis.python.buildSystem}</span>
              </div>
            )}
            {configAnalysis.python.packages?.length > 0 && (
              <div className="config-row">
                <span>Packages</span>
                <span>{configAnalysis.python.packages.length}</span>
              </div>
            )}
            {configAnalysis.python.issues?.length > 0 && (
              <div className="config-issues">
                {configAnalysis.python.issues.map((issue, i) => (
                  <p key={i} className="config-issue">{issue}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {configAnalysis.go && (
          <div className="config-card">
            <span className="core-label">Go</span>
            {configAnalysis.go.version && (
              <div className="config-row">
                <span>Go Version</span>
                <span>{configAnalysis.go.version}</span>
              </div>
            )}
            {configAnalysis.go.modulePath && (
              <div className="config-row">
                <span>Module</span>
                <span>{configAnalysis.go.modulePath}</span>
              </div>
            )}
            <div className="config-row">
              <span>Dependencies</span>
              <span>{configAnalysis.go.dependencies}</span>
            </div>
            {configAnalysis.go.issues?.length > 0 && (
              <div className="config-issues">
                {configAnalysis.go.issues.map((issue, i) => (
                  <p key={i} className="config-issue">{issue}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {configAnalysis.rust && (
          <div className="config-card">
            <span className="core-label">Rust</span>
            {configAnalysis.rust.edition && (
              <div className="config-row">
                <span>Edition</span>
                <span>{configAnalysis.rust.edition}</span>
              </div>
            )}
            {configAnalysis.rust.name && (
              <div className="config-row">
                <span>Crate</span>
                <span>{configAnalysis.rust.name}</span>
              </div>
            )}
            <div className="config-row">
              <span>Dependencies</span>
              <span>{configAnalysis.rust.dependencies}</span>
            </div>
            {configAnalysis.rust.issues?.length > 0 && (
              <div className="config-issues">
                {configAnalysis.rust.issues.map((issue, i) => (
                  <p key={i} className="config-issue">{issue}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {configAnalysis.ruby && (
          <div className="config-card">
            <span className="core-label">Ruby</span>
            {configAnalysis.ruby.version && (
              <div className="config-row">
                <span>Ruby Version</span>
                <span>{configAnalysis.ruby.version}</span>
              </div>
            )}
            <div className="config-row">
              <span>Gems</span>
              <span>{configAnalysis.ruby.gems?.length ?? 0}</span>
            </div>
          </div>
        )}
        {(configAnalysis.packageManager || configAnalysis.nodeVersion) && (
          <div className="config-card">
            <span className="core-label">Node.js</span>
            {configAnalysis.packageManager && (
              <div className="config-row">
                <span>Package Manager</span>
                <span>{configAnalysis.packageManager}</span>
              </div>
            )}
            {configAnalysis.nodeVersion && (
              <div className="config-row">
                <span>Node Version</span>
                <span>{configAnalysis.nodeVersion}</span>
              </div>
            )}
            {configAnalysis.depCount && (
              <>
                <div className="config-row">
                  <span>Production Deps</span>
                  <span>{configAnalysis.depCount.production}</span>
                </div>
                <div className="config-row">
                  <span>Dev Deps</span>
                  <span>{configAnalysis.depCount.dev}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {configAnalysis.scripts?.length > 0 && (
        <div className="config-scripts">
          <span className="core-label">Scripts</span>
          <div className="scripts-list">
            {configAnalysis.scripts.map((s) => (
              <div key={s.name} className="script-item">
                <code className="script-name">{s.name}</code>
                <code className="script-cmd">{s.command}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TasksSection({ tasks }) {
  if (!tasks?.length) return null;
  const diffBadge = (d) => {
    const cls = d === 'hard' ? 'badge-high' : d === 'moderate' ? 'badge-medium' : 'badge-low';
    return <span className={`badge ${cls}`}>{d}</span>;
  };
  return (
    <section className="report-section">
      <SectionHeader number="⚡" title="Generated Tasks" count={tasks.length} />
      <div className="tasks-list">
        {tasks.map((t) => (
          <div key={t.id} className="task-card">
            <div className="task-card-header">
              <span className="task-order">#{t.order}</span>
              <strong>{t.title}</strong>
              {diffBadge(t.difficulty)}
            </div>
            <p className="task-rationale">{t.rationale}</p>
            <div className="task-meta">
              <div><span className="core-label">Definition of Done</span><p className="task-dod">{t.definitionOfDone}</p></div>
              {t.riskNotes && <div><span className="core-label">Risk</span><p className="task-risk">{t.riskNotes}</p></div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewsPanel({ reviews }) {
  if (!reviews?.length) return null;
  return (
    <section className="report-section">
      <SectionHeader number="✓" title="Reviews" count={reviews.length} />
      <div className="reviews-list">
        {reviews.map((item) => {
          const r = item.review;
          const score = r.doneScore != null ? Math.round(r.doneScore * 100) : null;
          const scoreColor = score != null ? (score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)') : 'var(--muted)';
          return (
            <div key={r.id} className="review-card">
              <div className="review-header">
                <div className="review-score" style={{ '--score-color': scoreColor }}>
                  <span className="review-score-num">{score != null ? `${score}%` : '—'}</span>
                  <span className="review-score-label">Quality</span>
                </div>
                <div className="review-info">
                  <strong>{item.run.status === 'completed' ? '✓ Completed' : '✗ ' + item.run.status}</strong>
                  <small>via {item.run.backend} · {item.artifactCount} artifact{item.artifactCount !== 1 ? 's' : ''}</small>
                </div>
              </div>
              {r.findings?.length > 0 && (
                <ul className="review-findings">
                  {r.findings.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
              <p className="review-next">{r.nextAction}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}



export default function App() {
  const [sourceInput, setSourceInput] = useState('');
  const [sources, setSources] = useState([]);
  const [activeSourceId, setActiveSourceId] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [pendingDeleteSource, setPendingDeleteSource] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function sourceLabel(source) {
    if (typeof source.name === 'string' && source.name.trim().length > 0) return source.name;
    if (typeof source.location === 'string' && source.location.trim().length > 0)
      return source.location;
    return source.id;
  }

  async function refresh() {
    const [sourcesResponse, , reviewsResponse] = await Promise.all([
      request('/sources'),
      request('/health'),
      request('/reviews').catch(() => ({ items: [] })),
    ]);
    const nextSources = sourcesResponse.sources ?? [];
    setSources(nextSources);
    setReviews(reviewsResponse.items ?? []);

    // If the previously active source no longer exists, clear derived panes.
    if (activeSourceId && !nextSources.some((s) => s.id === activeSourceId)) {
      setActiveSourceId('');
      setAnalysis(null);
      setTasks([]);
    }
  }

  useEffect(() => {
    setBusy(true);
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, []);

  async function onIngest(event) {
    event.preventDefault();
    if (!sourceInput.trim()) return;

    setBusy(true);
    setError('');
    setStatus('Analyzing source...');

    try {
      const payload = await request('/ingest', {
        method: 'POST',
        body: JSON.stringify({ source: sourceInput.trim() }),
      });

      const source = payload.source ?? null;
      const nextAnalysis = payload.analysis ?? null;
      const nextTasks = payload.tasks ?? [];
      if (!source || !nextAnalysis) throw new Error('Analysis response was incomplete.');

      setActiveSourceId(source.id);
      setAnalysis(nextAnalysis);
      setTasks(nextTasks);
      setSourceInput('');
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
      setStatus('Analysis loaded.');
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

  const deep = analysis?.deepAnalysis;

  return (
    <main className="shell">
      <section className="hero card">
        <p className="label">RepoWright</p>
        <h1>Deep source analysis</h1>
        <p className="subtext">
          Ingest a codebase and get a detailed breakdown: core system, components, improvements, security scanning, health scoring, and optimization strategies.
        </p>
        <form onSubmit={onIngest} className="ingest-form">
          <input
            type="text"
            value={sourceInput}
            placeholder="Path to project, git URL, or text brief"
            onChange={(e) => setSourceInput(e.target.value)}
          />
          <button type="submit" disabled={busy}>Analyze</button>
          <button type="button" onClick={refresh} disabled={busy} className="ghost">Refresh</button>
        </form>
        <p className="status">{status}</p>
        {error && <p className="error">{error}</p>}
      </section>

      <div className="main-layout">
        {/* Source sidebar */}
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
                  <small>{source.type || 'source'} &middot; {source.id}</small>
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

        {/* Analysis report */}
        <div className="report-area">
          {analysis && !deep && (
            <section className="card report-section">
              <SectionHeader number="--" title="Basic Analysis" />
              <p>{analysis.summary}</p>
              <div className="core-grid">
                <div className="core-item">
                  <span className="core-label">Classification</span>
                  <p>{analysis.classification}</p>
                </div>
                <div className="core-item">
                  <span className="core-label">Complexity</span>
                  <p>{analysis.complexity}/10</p>
                </div>
                <div className="core-item">
                  <span className="core-label">Risk</span>
                  <p>{Number(analysis.risk).toFixed(1)}/10</p>
                </div>
                <div className="core-item">
                  <span className="core-label">Confidence</span>
                  <p>{Math.round((analysis.confidence ?? 0) * 100)}%</p>
                </div>
              </div>
              {analysis.insights?.length > 0 && (
                <div className="uniqueness-list">
                  <span className="core-label">Insights</span>
                  <ul>{analysis.insights.map((ins, i) => <li key={i}>{ins}</li>)}</ul>
                </div>
              )}
            </section>
          )}

          {deep && (
            <>
              {/* Quick stats bar */}
              <div className="stats-bar card">
                <div className="stat">
                  <span className="stat-label">Classification</span>
                  <span className="stat-value">{analysis.classification}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Complexity</span>
                  <span className="stat-value">{analysis.complexity}/10</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Files</span>
                  <span className="stat-value">{analysis.fileCount ?? '-'}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Languages</span>
                  <span className="stat-value">{analysis.languages?.length ?? 0}</span>
                </div>
                {deep.healthScore && (
                  <div className="stat">
                    <span className="stat-label">Health</span>
                    <span className="stat-value stat-grade" style={{
                      color: deep.healthScore.grade === 'A' || deep.healthScore.grade === 'B' ? 'var(--green)'
                        : deep.healthScore.grade === 'C' ? 'var(--yellow)' : 'var(--red)'
                    }}>
                      {deep.healthScore.grade} ({Math.round(deep.healthScore.overall)})
                    </span>
                  </div>
                )}
                {deep.security && (
                  <div className="stat">
                    <span className="stat-label">Security</span>
                    <span className="stat-value" style={{
                      color: deep.security.score >= 80 ? 'var(--green)'
                        : deep.security.score >= 50 ? 'var(--yellow)' : 'var(--red)'
                    }}>
                      {deep.security.score}/100
                    </span>
                  </div>
                )}
              </div>

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

          {/* Tasks from analysis */}
          <TasksSection tasks={tasks} />

          {/* Reviews for source runs */}
          <ReviewsPanel reviews={reviews.filter(r => r.run.sourceId === activeSourceId)} />

          {!analysis && (
            <div className="empty-state card">
              <h2>No analysis yet</h2>
              <p>Enter a project path, git URL, or text brief above to get started.</p>
            </div>
          )}
        </div>
      </div>

      {pendingDeleteSource && (
        <section className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="confirm-card">
            <h3 id="delete-title">Delete source?</h3>
            <p>
              You are deleting <strong>{sourceLabel(pendingDeleteSource)}</strong>.
            </p>
            <p className="confirm-note">
              This will remove related analyses, tasks, runs, reviews, and local artifacts for this source.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setPendingDeleteSource(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-confirm-btn"
                onClick={confirmDeleteSource}
                disabled={busy}
              >
                {busy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
