// Components that render the core analysis data returned by the analysis engine.
// These have no knowledge of app state, API calls, or workflow actions.

import { ImpactBadge, PriorityBadge, SectionHeader } from './ui.jsx';

// ── Stats bar ────────────────────────────────────────────────────

export function AnalysisStatsBar({ analysis, deep }) {
  return (
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
          <span
            className="stat-value stat-grade"
            style={{
              color:
                deep.healthScore.grade === 'A' || deep.healthScore.grade === 'B'
                  ? 'var(--green)'
                  : deep.healthScore.grade === 'C'
                    ? 'var(--yellow)'
                    : 'var(--red)',
            }}
          >
            {deep.healthScore.grade} ({Math.round(deep.healthScore.overall)})
          </span>
        </div>
      )}
      {deep.security && (
        <div className="stat">
          <span className="stat-label">Security Findings</span>
          <span
            className="stat-value"
            style={{
              color:
                deep.security.score >= 80
                  ? 'var(--green)'
                  : deep.security.score >= 50
                    ? 'var(--yellow)'
                    : 'var(--red)',
            }}
          >
            {deep.security.score}/100
          </span>
        </div>
      )}
      {deep.techDebt && (
        <div className="stat">
          <span className="stat-label">Debt Signal</span>
          <span
            className="stat-value"
            style={{
              color:
                deep.techDebt.grade === 'A' || deep.techDebt.grade === 'B'
                  ? 'var(--green)'
                  : deep.techDebt.grade === 'C'
                    ? 'var(--yellow)'
                    : 'var(--red)',
            }}
          >
            {deep.techDebt.grade} ({Math.round(deep.techDebt.totalRemediationMinutes / 60)}h)
          </span>
        </div>
      )}
      {deep.gitHistory && (
        <div className="stat">
          <span className="stat-label">Bus Factor</span>
          <span
            className="stat-value"
            style={{ color: deep.gitHistory.busFactor <= 1 ? 'var(--red)' : deep.gitHistory.busFactor <= 2 ? 'var(--yellow)' : 'var(--green)' }}
          >
            {deep.gitHistory.busFactor}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Basic analysis (no deep analysis available) ──────────────────

export function BasicAnalysisSection({ analysis }) {
  return (
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
  );
}

// ── Deep analysis sections ───────────────────────────────────────

export function CoreSystemSection({ core }) {
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

export function ComponentsSection({ components }) {
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

export function ImprovementsSection({ improvements }) {
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
                  {imp.estimatedMinutes != null && (
                    <span className="imp-time">~{imp.estimatedMinutes >= 60 ? `${Math.round(imp.estimatedMinutes / 60)}h` : `${imp.estimatedMinutes}m`}</span>
                  )}
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

export function UniquenessSection({ uniqueness }) {
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

export function OptimizationsSection({ optimizations }) {
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

export function CodeQualitySection({ cq }) {
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
        {cq.cognitiveComplexity != null && (
          <div className="cq-stat">
            <span className="cq-num">{cq.cognitiveComplexity}</span>
            <span className="cq-label">Cognitive Complexity</span>
          </div>
        )}
        {cq.duplicateBlockCount != null && cq.duplicateBlockCount > 0 && (
          <div className="cq-stat">
            <span className="cq-num">{cq.duplicateBlockCount}</span>
            <span className="cq-label">Duplicate Blocks</span>
          </div>
        )}
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

export function DependencyGraphSection({ depGraph }) {
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

export function ConfigAnalysisSection({ configAnalysis }) {
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
                {ts.issues.map((issue, i) => <p key={i} className="config-issue">{issue}</p>)}
              </div>
            )}
          </div>
        )}
        {python && (
          <div className="config-card">
            <span className="core-label">Python</span>
            {python.version && <div className="config-row"><span>Requires Python</span><span>{python.version}</span></div>}
            {python.buildSystem && <div className="config-row"><span>Build System</span><span>{python.buildSystem}</span></div>}
            {python.packages?.length > 0 && <div className="config-row"><span>Packages</span><span>{python.packages.length}</span></div>}
            {python.issues?.length > 0 && (
              <div className="config-issues">
                {python.issues.map((issue, i) => <p key={i} className="config-issue">{issue}</p>)}
              </div>
            )}
          </div>
        )}
        {go && (
          <div className="config-card">
            <span className="core-label">Go</span>
            {go.version && <div className="config-row"><span>Go Version</span><span>{go.version}</span></div>}
            {go.modulePath && <div className="config-row"><span>Module</span><span>{go.modulePath}</span></div>}
            <div className="config-row"><span>Dependencies</span><span>{go.dependencies}</span></div>
            {go.issues?.length > 0 && (
              <div className="config-issues">
                {go.issues.map((issue, i) => <p key={i} className="config-issue">{issue}</p>)}
              </div>
            )}
          </div>
        )}
        {rust && (
          <div className="config-card">
            <span className="core-label">Rust</span>
            {rust.edition && <div className="config-row"><span>Edition</span><span>{rust.edition}</span></div>}
            {rust.name && <div className="config-row"><span>Crate</span><span>{rust.name}</span></div>}
            <div className="config-row"><span>Dependencies</span><span>{rust.dependencies}</span></div>
            {rust.issues?.length > 0 && (
              <div className="config-issues">
                {rust.issues.map((issue, i) => <p key={i} className="config-issue">{issue}</p>)}
              </div>
            )}
          </div>
        )}
        {ruby && (
          <div className="config-card">
            <span className="core-label">Ruby</span>
            {ruby.version && <div className="config-row"><span>Ruby Version</span><span>{ruby.version}</span></div>}
            <div className="config-row"><span>Gems</span><span>{ruby.gems?.length ?? 0}</span></div>
          </div>
        )}
        {(packageManager || nodeVersion) && (
          <div className="config-card">
            <span className="core-label">Node.js</span>
            {packageManager && <div className="config-row"><span>Package Manager</span><span>{packageManager}</span></div>}
            {nodeVersion && <div className="config-row"><span>Node Version</span><span>{nodeVersion}</span></div>}
            {configAnalysis.depCount && (
              <>
                <div className="config-row"><span>Production Deps</span><span>{configAnalysis.depCount.production}</span></div>
                <div className="config-row"><span>Dev Deps</span><span>{configAnalysis.depCount.dev}</span></div>
              </>
            )}
          </div>
        )}
      </div>
      {scripts?.length > 0 && (
        <div className="config-scripts">
          <span className="core-label">Scripts</span>
          <div className="scripts-list">
            {scripts.map((s) => (
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

export function HealthScoreSection({ healthScore }) {
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

export function SecuritySection({ security }) {
  if (!security) return null;
  const total = security.findings.length;
  const scoreColor = security.score >= 80 ? 'var(--green)' : security.score >= 50 ? 'var(--yellow)' : 'var(--red)';

  const grouped = { critical: [], high: [], medium: [], low: [], info: [] };
  for (const f of security.findings) {
    grouped[f.severity]?.push(f);
  }

  return (
    <section className="report-section">
      <SectionHeader number="10" title="Security Findings" count={total} />
      <div className="security-overview">
        <div className="security-score-ring" style={{ '--sec-color': scoreColor }}>
          <span className="security-score-num">{security.score}</span>
          <span className="security-score-label">Findings Score</span>
        </div>
        <div className="security-summary-grid">
          {[
            { key: 'critical', label: 'Critical', color: security.summary.critical > 0 ? 'var(--red)' : 'var(--muted)' },
            { key: 'high', label: 'High', color: security.summary.high > 0 ? 'var(--red)' : 'var(--muted)' },
            { key: 'medium', label: 'Medium', color: security.summary.medium > 0 ? 'var(--yellow)' : 'var(--muted)' },
            { key: 'low', label: 'Low', color: security.summary.low > 0 ? 'var(--green)' : 'var(--muted)' },
          ].map(({ key, label, color }) => (
            <div key={key} className="sec-stat">
              <span className="sec-stat-num" style={{ color }}>{security.summary[key]}</span>
              <span className="sec-stat-label">{label}</span>
            </div>
          ))}
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

      {total === 0 && <p className="sec-clean">No security findings detected.</p>}
    </section>
  );
}

// ── Git History (Behavioral Analysis) ───────────────────────────

export function GitHistorySection({ gitHistory }) {
  if (!gitHistory) return null;
  return (
    <section className="report-section">
      <SectionHeader number="11" title="Git History" />
      <p className="section-note">Behavioral signals from commit history — identifies hotspots, coupling, and knowledge distribution.</p>
      <div className="cq-stats-grid">
        <div className="cq-stat">
          <span className="cq-num">{gitHistory.totalCommits}</span>
          <span className="cq-label">Commits</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{gitHistory.activeContributors}</span>
          <span className="cq-label">Contributors</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num" style={{ color: gitHistory.busFactor <= 1 ? 'var(--red)' : gitHistory.busFactor <= 2 ? 'var(--yellow)' : 'var(--green)' }}>
            {gitHistory.busFactor}
          </span>
          <span className="cq-label">Bus Factor</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{gitHistory.recentActivityWeeks}/4</span>
          <span className="cq-label">Activity Level</span>
        </div>
      </div>

      {gitHistory.hotspots?.length > 0 && (
        <div className="dep-section">
          <span className="core-label">Hotspots (most frequently changed)</span>
          <small className="metric-note">Files that change often are where improvements deliver the most value.</small>
          <div className="file-bar-list">
            {gitHistory.hotspots.slice(0, 10).map((h) => (
              <div key={h.file} className="file-bar-item">
                <code>{h.file}</code>
                <span className="file-bar-count">
                  {h.changeCount} changes, {h.authorCount} author{h.authorCount !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gitHistory.temporalCoupling?.length > 0 && (
        <div className="dep-section">
          <span className="core-label">Temporal Coupling (files that always change together)</span>
          <small className="metric-note">High coupling suggests these files should be in the same module or need decoupling.</small>
          {gitHistory.temporalCoupling.slice(0, 8).map((c, i) => (
            <div key={i} className="circular-chain">
              <code>{c.fileA}</code>
              <span className="chain-arrow">&harr;</span>
              <code>{c.fileB}</code>
              <span className="file-bar-count">{Math.round(c.couplingScore * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Tech Debt Summary ───────────────────────────────────────────

export function TechDebtSection({ techDebt, cq }) {
  if (!techDebt) return null;
  const hours = Math.round(techDebt.totalRemediationMinutes / 60);
  const gradeColor = { A: 'var(--green)', B: 'var(--green)', C: 'var(--yellow)', D: 'var(--red)', F: 'var(--red)' };
  return (
    <section className="report-section">
      <SectionHeader number="12" title="Tech Debt" />
      <p className="section-note">Estimated remediation effort blended with structural burden. Use this for triage, not budgeting.</p>
      <div className="cq-stats-grid">
        <div className="cq-stat">
          <span className="cq-num" style={{ color: gradeColor[techDebt.grade] ?? 'var(--muted)' }}>{techDebt.grade}</span>
          <span className="cq-label">Debt Grade</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{hours}h</span>
          <span className="cq-label">Remediation</span>
        </div>
        <div className="cq-stat">
          <span className="cq-num">{(techDebt.debtRatio * 100).toFixed(1)}%</span>
          <span className="cq-label">Raw Debt Ratio</span>
        </div>
        {techDebt.structuralBurden != null && (
          <div className="cq-stat">
            <span className="cq-num">{Math.round(techDebt.structuralBurden * 100)}%</span>
            <span className="cq-label">Structural Burden</span>
          </div>
        )}
        {cq?.maxCognitiveComplexity != null && (
          <div className="cq-stat">
            <span className="cq-num" style={{ color: cq.maxCognitiveComplexity > 30 ? 'var(--red)' : cq.maxCognitiveComplexity > 15 ? 'var(--yellow)' : 'var(--green)' }}>
              {cq.maxCognitiveComplexity}
            </span>
            <span className="cq-label">Peak Complexity</span>
          </div>
        )}
      </div>
      {techDebt.gradeRationale?.length > 0 && (
        <div className="uniqueness-list">
          <span className="core-label">Why this grade</span>
          <ul>{techDebt.gradeRationale.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

// ── Dependency Audit ────────────────────────────────────────────

export function DepAuditSection({ depAudit }) {
  if (!depAudit) return null;
  return (
    <section className="report-section">
      <SectionHeader number="13" title="Dependency Audit" count={depAudit.totalVulnerabilities} />
      <p className="section-note">Known vulnerabilities in project dependencies via {depAudit.auditSource}.</p>
      {depAudit.totalVulnerabilities === 0 ? (
        <p className="sec-clean">No known vulnerabilities detected.</p>
      ) : (
        <>
          <div className="cq-stats-grid">
            <div className="cq-stat">
              <span className="cq-num" style={{ color: depAudit.criticalCount > 0 ? 'var(--red)' : 'var(--muted)' }}>{depAudit.criticalCount}</span>
              <span className="cq-label">Critical</span>
            </div>
            <div className="cq-stat">
              <span className="cq-num" style={{ color: depAudit.highCount > 0 ? 'var(--red)' : 'var(--muted)' }}>{depAudit.highCount}</span>
              <span className="cq-label">High</span>
            </div>
            <div className="cq-stat">
              <span className="cq-num" style={{ color: depAudit.moderateCount > 0 ? 'var(--yellow)' : 'var(--muted)' }}>{depAudit.moderateCount}</span>
              <span className="cq-label">Moderate</span>
            </div>
            <div className="cq-stat">
              <span className="cq-num">{depAudit.totalVulnerabilities}</span>
              <span className="cq-label">Total</span>
            </div>
          </div>
          {depAudit.vulnerabilities?.length > 0 && (
            <div className="dep-section">
              {depAudit.vulnerabilities.slice(0, 10).map((v, i) => (
                <div key={i} className="sec-finding-item">
                  <div className="sec-finding-header">
                    <strong>{v.package}</strong>
                    <span className={`badge badge-${v.severity === 'critical' || v.severity === 'high' ? 'high' : v.severity === 'moderate' ? 'medium' : 'low'}`}>
                      {v.severity}
                    </span>
                    {v.fixAvailable && <span className="badge badge-low">fix available</span>}
                  </div>
                  <p className="sec-finding-desc">{v.title}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
