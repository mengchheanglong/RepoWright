import type { AnalysisReport, CandidateTask, ExecutionRun, MemoryEntry, ReviewReport } from '../domain/index.js';
import type { Repository } from '../storage/repository.js';
import { generateId, now } from '../utils/id.js';
import { getLogger } from '../utils/logger.js';

export interface SaveMemoryInput {
  category: string;
  title: string;
  content: string;
  tags: string[];
  sourceId?: string;
}

export function saveMemoryEntry(input: SaveMemoryInput, repo: Repository): MemoryEntry {
  const logger = getLogger();
  const entry: MemoryEntry = {
    id: generateId('mem'),
    category: input.category,
    title: input.title,
    content: input.content,
    tags: input.tags,
    sourceId: input.sourceId,
    createdAt: now(),
  };
  repo.saveMemory(entry);
  logger.info(`Memory saved: ${entry.title} [${entry.category}]`);
  return entry;
}

export function listMemoryEntries(repo: Repository, category?: string): MemoryEntry[] {
  return repo.listMemory(category);
}

export function searchMemoryEntries(repo: Repository, keyword: string): MemoryEntry[] {
  return repo.searchMemory(keyword);
}

// ---------------------------------------------------------------------------
// Auto-save: analysis findings
// ---------------------------------------------------------------------------
// Only saves high-signal, non-rediscoverable findings. Max 3 entries per
// analysis to prevent flooding the memory store.
// ---------------------------------------------------------------------------

export function autoSaveAnalysisFindings(
  report: AnalysisReport,
  repo: Repository,
): MemoryEntry[] {
  const logger = getLogger();
  const entries: MemoryEntry[] = [];
  const deep = report.deepAnalysis;

  if (!deep) return entries;

  // 1. Architecture & tech stack combo (if non-trivial)
  if (deep.coreSystem.techStack.length > 0 || deep.coreSystem.patterns.length > 0) {
    const techParts: string[] = [];
    if (deep.coreSystem.techStack.length > 0) {
      techParts.push(`Tech stack: ${deep.coreSystem.techStack.join(', ')}`);
    }
    if (deep.coreSystem.frameworks.length > 0) {
      techParts.push(`Frameworks: ${deep.coreSystem.frameworks.join(', ')}`);
    }
    if (deep.coreSystem.patterns.length > 0) {
      techParts.push(`Patterns: ${deep.coreSystem.patterns.join(', ')}`);
    }
    techParts.push(`Architecture: ${deep.coreSystem.architecture}`);

    entries.push(
      saveMemoryEntry(
        {
          category: 'architecture',
          title: `Architecture: ${deep.coreSystem.summary.slice(0, 80)}`,
          content: techParts.join('\n'),
          tags: [
            ...deep.coreSystem.techStack.slice(0, 3),
            ...deep.coreSystem.frameworks.slice(0, 3),
            report.classification,
          ],
          sourceId: report.sourceId,
        },
        repo,
      ),
    );
  }

  // 2. High-priority improvements with file attribution
  const highPriority = deep.improvements.filter((imp) => imp.priority === 'high');
  if (highPriority.length > 0 && entries.length < 3) {
    const content = highPriority
      .map((imp) => {
        const fileRef = imp.files && imp.files.length > 0 ? ` (${imp.files.join(', ')})` : '';
        return `- ${imp.area}: ${imp.issue}${fileRef}\n  Suggestion: ${imp.suggestion}`;
      })
      .join('\n');

    entries.push(
      saveMemoryEntry(
        {
          category: 'improvement',
          title: `${highPriority.length} high-priority improvement(s)`,
          content,
          tags: ['high-priority', report.classification],
          sourceId: report.sourceId,
        },
        repo,
      ),
    );
  }

  // 3. Circular dependencies (specific file chains — hard to rediscover quickly)
  if (deep.dependencyGraph && deep.dependencyGraph.circularDeps.length > 0 && entries.length < 3) {
    const chains = deep.dependencyGraph.circularDeps
      .map((chain) => `- ${chain.join(' → ')}`)
      .join('\n');

    entries.push(
      saveMemoryEntry(
        {
          category: 'issue',
          title: `${deep.dependencyGraph.circularDeps.length} circular dependency chain(s)`,
          content: chains,
          tags: ['circular-dependency', 'architecture'],
          sourceId: report.sourceId,
        },
        repo,
      ),
    );
  }

  if (entries.length > 0) {
    logger.info(`Auto-saved ${entries.length} memory entries from analysis`);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Auto-save: execution outcome
// ---------------------------------------------------------------------------
// Only saves if doneScore >= 0.5 (successful enough to be worth remembering).
// ---------------------------------------------------------------------------

export function autoSaveExecutionOutcome(
  run: ExecutionRun,
  task: CandidateTask,
  review: ReviewReport,
  repo: Repository,
): MemoryEntry | null {
  const logger = getLogger();

  // Only remember successful executions
  if (!review.doneScore || review.doneScore < 0.5) {
    logger.info(`Skipping memory auto-save: doneScore ${review.doneScore?.toFixed(2) ?? 'N/A'} below threshold`);
    return null;
  }

  const contentParts: string[] = [];
  contentParts.push(`Result: ${review.succeeded}`);
  if (review.findings && review.findings.length > 0) {
    contentParts.push(`Findings: ${review.findings.join('; ')}`);
  }
  contentParts.push(`Quality: ${(review.doneScore * 100).toFixed(0)}%`);

  const entry = saveMemoryEntry(
    {
      category: 'execution',
      title: task.title,
      content: contentParts.join('\n'),
      tags: [task.difficulty, run.backend],
      sourceId: run.sourceId,
    },
    repo,
  );

  logger.info(`Auto-saved execution outcome: ${task.title}`);
  return entry;
}
