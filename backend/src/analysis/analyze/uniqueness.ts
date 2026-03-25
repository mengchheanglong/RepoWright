import type { CodeQuality, DeepAnalysis, DependencyGraph } from '../../domain/index.js';

export function detectUniqueness(
  filePaths: string[],
  fileContents: Map<string, string>,
  frameworks: string[],
  patterns: string[],
  languages: string[],
  cq: CodeQuality,
  depGraph: DependencyGraph,
): DeepAnalysis['uniqueness'] {
  const differentiators: string[] = [];
  const novelApproaches: string[] = [];

  const codeLangs = languages.filter((l) => !['Markdown', 'JSON', 'YAML', 'TOML', 'HTML', 'CSS', 'SCSS', 'Less'].includes(l));
  if (codeLangs.length >= 3) differentiators.push(`Polyglot project using ${codeLangs.join(', ')}`);

  if (patterns.includes('CLI Architecture') && patterns.includes('REST API')) differentiators.push('Dual interface: CLI and REST API sharing core logic');
  if (patterns.includes('Plugin/Adapter Pattern')) novelApproaches.push('Pluggable adapter architecture for extensibility');
  if (patterns.includes('CQRS')) novelApproaches.push('CQRS pattern separating reads from writes');

  const sample = [...fileContents.values()].slice(0, 30).join('\n');
  if (/sqlite|better-sqlite/i.test(sample) && !/postgres|mysql/i.test(sample)) differentiators.push('Local-first architecture with embedded SQLite');
  if (/workspace.*isolat|sandbox/i.test(sample)) novelApproaches.push('Isolated workspace execution model');
  if (/deterministic|offline/i.test(sample)) novelApproaches.push('Deterministic, offline-capable processing');

  if (patterns.includes('Monorepo')) differentiators.push('Monorepo workspace structure');
  if (patterns.includes('Domain-Driven Design')) novelApproaches.push('Domain-driven type system');

  if (cq.commentRatio > 0.2) differentiators.push(`Unusually well-documented code (${(cq.commentRatio * 100).toFixed(0)}% comments)`);
  if (depGraph.circularDeps.length === 0 && depGraph.internalImportCount > 20) differentiators.push('Clean dependency graph — zero circular dependencies despite complex module structure');
  if (cq.anyTypeCount === 0 && cq.totalCodeLines > 500 && filePaths.some((f) => f.endsWith('.ts'))) differentiators.push('Fully typed TypeScript — zero uses of any');
  if (frameworks.length >= 4) differentiators.push(`Rich framework stack: ${frameworks.slice(0, 5).join(', ')}`);

  if (differentiators.length === 0) differentiators.push('Standard project structure following common conventions');
  if (novelApproaches.length === 0) novelApproaches.push('Uses conventional patterns for its stack');

  const first = differentiators[0] ?? 'Conventional project';
  const summary = differentiators.length > 1
    ? `This project has ${differentiators.length} distinctive characteristics, notably ${first.toLowerCase()}`
    : first;

  return { summary, differentiators, novelApproaches };
}
