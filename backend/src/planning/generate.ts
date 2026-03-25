import type { AnalysisReport, CandidateTask, Difficulty } from '../domain/index.js';
import { generateId, now } from '../utils/id.js';
import { getLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Findings-driven task generation
// ---------------------------------------------------------------------------
// Groups analysis findings into 3 task buckets: Code Health, Architecture,
// Docs & Maintenance. Falls back to classification-based templates when
// deepAnalysis is unavailable.
// ---------------------------------------------------------------------------

interface FindingsBucket {
  label: string;
  items: { issue: string; files: string[] }[];
  difficulty: Difficulty;
}

/**
 * Generate tasks from an analysis report. If deepAnalysis is present, derives
 * specific, actionable tasks from the findings. Otherwise falls back to
 * generic classification-based templates for backward compatibility.
 */
export function generateTasks(report: AnalysisReport): CandidateTask[] {
  const logger = getLogger();
  logger.info(`Generating tasks for classification: ${report.classification}`);

  const deep = report.deepAnalysis;
  if (deep) {
    const findingsTasks = generateFindingsDrivenTasks(report);
    if (findingsTasks.length > 0) {
      logger.info(`Generated ${findingsTasks.length} findings-driven task(s)`);
      return findingsTasks;
    }
  }

  // Fallback: classification-based templates
  return generateClassificationTasks(report);
}

// ---------------------------------------------------------------------------
// Findings-driven approach — 3 buckets
// ---------------------------------------------------------------------------

function generateFindingsDrivenTasks(report: AnalysisReport): CandidateTask[] {
  const deep = report.deepAnalysis!;
  const cq = deep.codeQuality;
  const dg = deep.dependencyGraph;
  const cfg = deep.configAnalysis;

  // --- Bucket 1: Code Health ---
  const codeHealth: FindingsBucket = { label: 'Code Health', items: [], difficulty: 'moderate' };

  if (cq) {
    if (cq.anyTypeCount > 0) {
      codeHealth.items.push({
        issue: `${cq.anyTypeCount} uses of \`any\` type`,
        files: cq.anyTypeFiles,
      });
    }
    if (cq.emptyCatchCount > 0) {
      codeHealth.items.push({
        issue: `${cq.emptyCatchCount} empty catch block(s)`,
        files: cq.emptyCatchFiles,
      });
    }
    if (cq.maxNestingDepth > 6) {
      codeHealth.items.push({
        issue: `deeply nested code (depth ${cq.maxNestingDepth})`,
        files: [cq.maxNestingFile],
      });
    }
    if (cq.avgFunctionLength > 30) {
      codeHealth.items.push({
        issue: `average function length ${cq.avgFunctionLength} lines (target: ≤30)`,
        files: [],
      });
    }
  }

  // --- Bucket 2: Architecture ---
  const architecture: FindingsBucket = { label: 'Architecture', items: [], difficulty: 'hard' };

  if (dg) {
    if (dg.circularDeps.length > 0) {
      for (const chain of dg.circularDeps) {
        architecture.items.push({
          issue: `circular dependency: ${chain.join(' → ')}`,
          files: chain,
        });
      }
    }
    if (dg.orphanFiles.length > 5) {
      architecture.items.push({
        issue: `${dg.orphanFiles.length} orphan/dead-code files`,
        files: dg.orphanFiles.slice(0, 5),
      });
    }
  }
  if (cq && cq.largeFiles.length > 0) {
    architecture.items.push({
      issue: `${cq.largeFiles.length} oversized file(s) (>350 LOC)`,
      files: cq.largeFiles.map((f) => f.path),
    });
  }
  if (cfg) {
    const configIssues = collectConfigIssues(cfg);
    if (configIssues.length > 0) {
      architecture.items.push({
        issue: `${configIssues.length} configuration issue(s): ${configIssues.slice(0, 3).join('; ')}`,
        files: [],
      });
    }
  }

  // --- Bucket 3: Documentation & Maintenance ---
  const docsMaint: FindingsBucket = { label: 'Documentation & Maintenance', items: [], difficulty: 'easy' };

  if (cq) {
    if (cq.todoCount > 0) {
      docsMaint.items.push({
        issue: `${cq.todoCount} TODO/FIXME comment(s)`,
        files: [],
      });
    }
    if (cq.commentRatio < 0.05 && cq.totalCodeLines > 100) {
      docsMaint.items.push({
        issue: `low comment ratio (${(cq.commentRatio * 100).toFixed(1)}%)`,
        files: [],
      });
    }
  }

  // Collect improvement items from deep analysis as potential doc/maintenance tasks
  const highPriorityImprovements = deep.improvements.filter((imp) => imp.priority === 'high');
  if (highPriorityImprovements.length > 0) {
    for (const imp of highPriorityImprovements.slice(0, 3)) {
      const bucket = imp.area.toLowerCase().includes('doc') || imp.area.toLowerCase().includes('test')
        ? docsMaint
        : architecture;
      bucket.items.push({
        issue: `${imp.area}: ${imp.issue}`,
        files: imp.files ?? [],
      });
    }
  }

  // --- Build tasks from non-empty buckets ---
  const buckets = [codeHealth, architecture, docsMaint].filter((b) => b.items.length > 0);
  const timestamp = now();

  return buckets.map((bucket, i) => {
    const totalIssueCount = bucket.items.length;
    const issueList = bucket.items.map((it) => it.issue).join(', ');
    const allFiles = [...new Set(bucket.items.flatMap((it) => it.files))];
    const fileRef = allFiles.length > 0
      ? ` in ${allFiles.slice(0, 5).join(', ')}${allFiles.length > 5 ? ` (+${allFiles.length - 5} more)` : ''}`
      : '';

    const difficulty = deriveDifficulty(bucket);

    return {
      id: generateId('tsk'),
      analysisId: report.id,
      sourceId: report.sourceId,
      title: `Fix ${totalIssueCount} ${bucket.label.toLowerCase()} issue(s): ${issueList.slice(0, 120)}`,
      rationale: `Analysis found ${totalIssueCount} ${bucket.label.toLowerCase()} finding(s)${fileRef}. Addressing these improves code quality and maintainability.`,
      expectedValue: `Resolved ${bucket.label.toLowerCase()} issues with measurable metric improvements.`,
      difficulty,
      definitionOfDone: buildDefinitionOfDone(bucket),
      riskNotes: buildRiskNotes(bucket, allFiles),
      order: (i + 1) as 1 | 2 | 3,
      createdAt: timestamp,
    };
  });
}

function collectConfigIssues(cfg: NonNullable<AnalysisReport['deepAnalysis']>['configAnalysis']): string[] {
  if (!cfg) return [];
  const issues: string[] = [];
  if (cfg.typescript?.issues) issues.push(...cfg.typescript.issues);
  if (cfg.python?.issues) issues.push(...cfg.python.issues);
  if (cfg.go?.issues) issues.push(...cfg.go.issues);
  if (cfg.rust?.issues) issues.push(...cfg.rust.issues);
  return issues;
}

function deriveDifficulty(bucket: FindingsBucket): Difficulty {
  const count = bucket.items.length;
  if (count <= 1) return 'easy';
  if (count <= 3) return 'moderate';
  return bucket.difficulty;
}

function buildDefinitionOfDone(bucket: FindingsBucket): string {
  const parts: string[] = [];
  for (const item of bucket.items) {
    if (item.issue.includes('any')) parts.push('Reduce `any` type count to 0');
    else if (item.issue.includes('empty catch')) parts.push('Add error handling to all empty catch blocks');
    else if (item.issue.includes('circular dep')) parts.push('Break all circular dependency chains');
    else if (item.issue.includes('orphan')) parts.push('Remove or integrate orphan files');
    else if (item.issue.includes('oversized')) parts.push('Split oversized files below 350 LOC');
    else if (item.issue.includes('TODO')) parts.push('Resolve all TODO/FIXME comments');
    else if (item.issue.includes('comment ratio')) parts.push('Increase comment ratio above 5%');
    else if (item.issue.includes('nesting')) parts.push('Reduce max nesting depth to ≤6');
    else if (item.issue.includes('config')) parts.push('Fix configuration issues');
    else parts.push(`Address: ${item.issue}`);
  }
  return [...new Set(parts)].join('. ') + '.';
}

function buildRiskNotes(bucket: FindingsBucket, files: string[]): string {
  const notes: string[] = [];
  if (bucket.label === 'Code Health') notes.push('Type changes may cascade through dependent modules.');
  if (bucket.label === 'Architecture') notes.push('Structural changes may break imports across the codebase.');
  if (bucket.label === 'Documentation & Maintenance') notes.push('Documentation changes are low risk.');
  if (files.length > 0) {
    notes.push(`Affected files: ${files.slice(0, 5).join(', ')}.`);
  }
  return notes.join(' ');
}

// ---------------------------------------------------------------------------
// Classification-based fallback templates
// ---------------------------------------------------------------------------

interface TaskTemplate {
  titleFn: (report: AnalysisReport) => string;
  rationaleFn: (report: AnalysisReport) => string;
  valueFn: (report: AnalysisReport) => string;
  difficulty: Difficulty;
  doneFn: (report: AnalysisReport) => string;
  riskFn: (report: AnalysisReport) => string;
}

const TASK_TEMPLATES: Record<string, TaskTemplate[]> = {
  learn: [
    {
      titleFn: (r) => `Create study notes for "${r.summary.slice(0, 50)}"`,
      rationaleFn: () => 'Structured notes accelerate retention and future reference.',
      valueFn: () => 'Reusable knowledge artifact that persists beyond this session.',
      difficulty: 'easy',
      doneFn: () => 'Markdown study notes file with key concepts, patterns, and questions.',
      riskFn: () => 'May be too surface-level without deeper exploration.',
    },
    {
      titleFn: (r) => `Map architecture and key abstractions in "${r.summary.slice(0, 40)}"`,
      rationaleFn: () => 'Understanding structure before details prevents getting lost.',
      valueFn: () => 'Architecture map that serves as navigation reference.',
      difficulty: 'moderate',
      doneFn: () => 'Architecture summary document listing modules, dependencies, and data flow.',
      riskFn: () => 'Large codebases may need multiple passes.',
    },
    {
      titleFn: () => 'Identify and extract reusable patterns',
      rationaleFn: () => 'Good patterns are worth saving for reuse in other projects.',
      valueFn: () => 'Pattern library entries that can be applied elsewhere.',
      difficulty: 'moderate',
      doneFn: () => 'At least 3 documented patterns with context and applicability notes.',
      riskFn: () => 'Patterns may be too context-specific to generalize.',
    },
  ],
  'extract-skill': [
    {
      titleFn: () => 'Extract and document key technical patterns',
      rationaleFn: () => 'Formalizing patterns makes implicit knowledge explicit and transferable.',
      valueFn: () => 'Skill entries in knowledge store for future reference.',
      difficulty: 'moderate',
      doneFn: () => 'Documented patterns with usage examples and tradeoffs.',
      riskFn: () => 'May oversimplify nuanced patterns.',
    },
    {
      titleFn: () => 'Create a decision log of architectural choices',
      rationaleFn: () =>
        'Understanding why decisions were made is as valuable as the decisions themselves.',
      valueFn: () => 'Decision log useful for similar future projects.',
      difficulty: 'easy',
      doneFn: () => 'Decision log with at least 5 entries including context and alternatives.',
      riskFn: () => 'Decisions may not be inferrable from code alone.',
    },
    {
      titleFn: () => 'Build a minimal reproduction of the core technique',
      rationaleFn: () =>
        'Isolated reproductions prove understanding and create reusable templates.',
      valueFn: () => 'Working minimal example that demonstrates the key technique.',
      difficulty: 'hard',
      doneFn: () => 'Standalone runnable example with README explaining the technique.',
      riskFn: () => 'May require environment setup or dependencies.',
    },
  ],
  'improve-architecture': [
    {
      titleFn: () => 'Audit module boundaries and coupling',
      rationaleFn: () => 'Identifying coupling issues early prevents expensive refactors later.',
      valueFn: () => 'Actionable list of architecture improvements.',
      difficulty: 'moderate',
      doneFn: () => 'Report listing coupled modules with specific improvement suggestions.',
      riskFn: () => 'Some coupling may be intentional and necessary.',
    },
    {
      titleFn: () => 'Create test coverage analysis and improvement plan',
      rationaleFn: () => 'Tests enable safe refactoring and catch regressions.',
      valueFn: () => 'Test plan that enables confident future changes.',
      difficulty: 'moderate',
      doneFn: () => 'Test plan document with priority-ordered testing targets.',
      riskFn: () => 'Test strategy may conflict with existing practices.',
    },
    {
      titleFn: () => 'Propose a refactoring roadmap',
      rationaleFn: () =>
        'Structured refactoring avoids scope creep and ensures incremental improvement.',
      valueFn: () => 'Prioritized, phased refactoring plan.',
      difficulty: 'hard',
      doneFn: () => 'Refactoring roadmap with phases, dependencies, and risk assessment.',
      riskFn: () => 'Roadmap may be too ambitious without deep domain knowledge.',
    },
  ],
  prototype: [
    {
      titleFn: (r) => `Scaffold a prototype for "${r.summary.slice(0, 40)}"`,
      rationaleFn: () => 'Getting to a working skeleton quickly validates feasibility.',
      valueFn: () => 'Working prototype that proves the concept.',
      difficulty: 'moderate',
      doneFn: () => 'Runnable prototype with core functionality and README.',
      riskFn: () => 'Prototype quality may not match production needs.',
    },
    {
      titleFn: () => 'Define data model and interfaces',
      rationaleFn: () => 'Clean interfaces make the prototype extensible.',
      valueFn: () => 'Type definitions and interface contracts ready for implementation.',
      difficulty: 'easy',
      doneFn: () => 'TypeScript types/interfaces with validation schemas.',
      riskFn: () => 'Models may need revision after prototyping reveals new requirements.',
    },
    {
      titleFn: () => 'Create a test harness for the prototype',
      rationaleFn: () => 'Even prototypes benefit from basic automated verification.',
      valueFn: () => 'Test infrastructure that carries forward into production.',
      difficulty: 'easy',
      doneFn: () => 'Test setup with at least 3 test cases covering core behavior.',
      riskFn: () => 'Tests may become stale as prototype evolves.',
    },
  ],
  bugfix: [
    {
      titleFn: () => 'Reproduce and document the bug',
      rationaleFn: () => 'A reliable reproduction is half the fix.',
      valueFn: () => 'Clear reproduction steps that enable focused debugging.',
      difficulty: 'easy',
      doneFn: () => 'Bug report with reproduction steps, expected vs actual behavior.',
      riskFn: () => 'Bug may be environment-specific.',
    },
    {
      titleFn: () => 'Identify root cause and propose fix',
      rationaleFn: () => 'Understanding root cause prevents recurring issues.',
      valueFn: () => 'Root cause analysis with proposed fix strategy.',
      difficulty: 'moderate',
      doneFn: () => 'Analysis document identifying the faulty code and fix approach.',
      riskFn: () => 'Root cause may span multiple components.',
    },
    {
      titleFn: () => 'Implement fix and regression test',
      rationaleFn: () => 'A fix without a test is a fix that can regress.',
      valueFn: () => 'Fixed code with test preventing recurrence.',
      difficulty: 'moderate',
      doneFn: () => 'Code change with at least one regression test.',
      riskFn: () => 'Fix may have side effects in untested paths.',
    },
  ],
  ignore: [
    {
      titleFn: () => 'Quick triage: confirm source can be ignored',
      rationaleFn: () => 'Confirming irrelevance prevents wasted attention later.',
      valueFn: () => 'Documented decision to skip this source.',
      difficulty: 'trivial',
      doneFn: () => 'Triage note explaining why this source was deprioritized.',
      riskFn: () => 'May miss hidden value.',
    },
    {
      titleFn: () => 'Extract any salvageable value',
      rationaleFn: () => 'Even low-priority sources may contain useful fragments.',
      valueFn: () => 'Any reusable snippets or references extracted.',
      difficulty: 'easy',
      doneFn: () => 'Notes file with any extracted value, or explicit "nothing useful" conclusion.',
      riskFn: () => 'Time invested may not justify output.',
    },
    {
      titleFn: () => 'Archive with metadata for future reference',
      rationaleFn: () => 'Proper archiving beats deletion — you might need it later.',
      valueFn: () => 'Searchable archive entry.',
      difficulty: 'trivial',
      doneFn: () => 'Memory entry with source metadata and triage decision.',
      riskFn: () => 'Archive may accumulate noise.',
    },
  ],
};

function generateClassificationTasks(report: AnalysisReport): CandidateTask[] {
  const templates = TASK_TEMPLATES[report.classification] ?? TASK_TEMPLATES.learn ?? [];
  const timestamp = now();

  return templates.map((tmpl, i) => ({
    id: generateId('tsk'),
    analysisId: report.id,
    sourceId: report.sourceId,
    title: tmpl.titleFn(report),
    rationale: tmpl.rationaleFn(report),
    expectedValue: tmpl.valueFn(report),
    difficulty: tmpl.difficulty,
    definitionOfDone: tmpl.doneFn(report),
    riskNotes: tmpl.riskFn(report),
    order: (i + 1) as 1 | 2 | 3,
    createdAt: timestamp,
  }));
}
