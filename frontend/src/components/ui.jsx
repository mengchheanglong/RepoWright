// Shared primitive UI components used across AnalysisReport and WorkspacePanels.

export function PriorityBadge({ priority }) {
  return <span className={`badge badge-${priority}`}>{priority}</span>;
}

export function ImpactBadge({ impact, effort }) {
  return (
    <span className="impact-badges">
      <span className={`badge badge-${impact}`}>Impact: {impact}</span>
      <span className={`badge badge-${effort}`}>Effort: {effort}</span>
    </span>
  );
}

export function SectionHeader({ number, title, count }) {
  return (
    <header className="section-header">
      <span className="section-num">{number}</span>
      <h3>{title}</h3>
      {count !== undefined && <span className="section-count">{count}</span>}
    </header>
  );
}
