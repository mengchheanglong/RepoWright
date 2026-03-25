import type { AnalysisReport, CandidateTask, Source } from '../domain/index.js';

/**
 * Builds a structured prompt for external AI CLI backends.
 * Used by both codex-cli and claude-cli adapters.
 */
export function buildTaskPrompt(
  task: CandidateTask,
  source: Source,
  analysis: AnalysisReport,
): string {
  const sections = [
    '# Task Execution Request',
    '',
    `## Task: ${task.title}`,
    '',
    `**Rationale:** ${task.rationale}`,
    `**Expected Value:** ${task.expectedValue}`,
    `**Difficulty:** ${task.difficulty}`,
    `**Definition of Done:** ${task.definitionOfDone}`,
    `**Risk Notes:** ${task.riskNotes}`,
    '',
    '## Source Context',
    '',
    `- **Name:** ${source.name}`,
    `- **Type:** ${source.type}`,
    `- **Location:** ${source.location}`,
    '',
    '## Analysis',
    '',
    `- **Classification:** ${analysis.classification}`,
    `- **Complexity:** ${analysis.complexity}/10`,
    `- **Risk:** ${analysis.risk.toFixed(1)}/10`,
    `- **Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
    `- **Summary:** ${analysis.summary}`,
    '',
    '### Insights',
    ...analysis.insights.map((i) => `- ${i}`),
    '',
    '## Instructions',
    '',
    'Work in the current directory. Complete the task described above.',
    'Follow the definition of done precisely.',
    'Create or modify files as needed.',
    'Do not modify files outside the current working directory.',
    'When done, summarize what you changed and why.',
  ];

  return sections.join('\n');
}
