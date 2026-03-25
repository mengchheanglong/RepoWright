import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisReport, CandidateTask, ExecutionRun, ReviewReport, RunArtifact } from '../domain/index.js';
import type { Repository } from '../storage/repository.js';
import { writeJson, writeMarkdown } from '../utils/fs.js';
import { generateId, now } from '../utils/id.js';
import { getLogger } from '../utils/logger.js';

export interface ReviewInput {
  run: ExecutionRun;
  task: CandidateTask;
  analysis: AnalysisReport;
  repo: Repository;
}

export function generateReview(input: ReviewInput): ReviewReport {
  const { run, task, analysis, repo } = input;
  const logger = getLogger();
  logger.info(`Generating review for run ${run.id}`);

  const artifacts = repo.getArtifactsByRun(run.id);
  const succeeded = run.status === 'completed';

  // Evaluate artifact quality
  const evaluation = evaluateArtifacts(run, artifacts);

  const review: ReviewReport = {
    id: generateId('rev'),
    runId: run.id,
    attempted: `Task "${task.title}" was executed via ${run.backend} backend.`,
    changed: evaluation.changedSummary,
    succeeded: succeeded
      ? `Task completed successfully. Definition of done: "${task.definitionOfDone}".`
      : 'Task did not complete successfully.',
    failed:
      run.error ?? (succeeded ? 'No failures.' : 'Execution did not produce expected results.'),
    confidence: succeeded ? analysis.confidence : analysis.confidence * 0.5,
    nextAction: deriveNextAction(run, task, succeeded, evaluation.doneScore),
    doneScore: evaluation.doneScore,
    findings: evaluation.findings,
    createdAt: now(),
  };

  repo.saveReview(review);

  // Write review markdown to run directory
  const runDir = path.dirname(run.workspacePath);
  const markdown = formatReviewMarkdown(review, task, run, artifacts.length);
  writeMarkdown(path.join(runDir, 'review.md'), markdown);
  writeJson(path.join(runDir, 'review.json'), review);

  logger.info(`Review ${review.id} saved for run ${run.id} (doneScore: ${evaluation.doneScore.toFixed(2)})`);
  return review;
}

// ---------------------------------------------------------------------------
// Artifact evaluation — structural quality checks
// ---------------------------------------------------------------------------

interface ArtifactEvaluation {
  doneScore: number;
  findings: string[];
  changedSummary: string;
}

function evaluateArtifacts(run: ExecutionRun, artifacts: RunArtifact[]): ArtifactEvaluation {
  const findings: string[] = [];
  let totalLines = 0;
  let hasHeadings = false;
  let hasCodeBlocks = false;
  let readableArtifacts = 0;

  for (const artifact of artifacts) {
    const content = readArtifactContent(artifact.path, run.workspacePath);
    if (!content) continue;

    readableArtifacts++;
    const lines = content.split('\n').length;
    totalLines += lines;

    if (/^#{1,6}\s+.+$/m.test(content)) hasHeadings = true;
    if (/```/.test(content)) hasCodeBlocks = true;
  }

  // Build findings
  findings.push(`Produced ${artifacts.length} artifact(s) totaling ${totalLines} lines`);

  if (hasHeadings) {
    findings.push('Artifacts contain structured headings');
  } else if (readableArtifacts > 0) {
    findings.push('Artifacts lack structured headings');
  }

  if (hasCodeBlocks) {
    findings.push('Contains code examples or blocks');
  } else if (readableArtifacts > 0) {
    findings.push('No code examples found in artifacts');
  }

  if (totalLines < 20 && readableArtifacts > 0) {
    findings.push('Output appears minimal — artifacts are very short');
  }

  if (readableArtifacts === 0 && artifacts.length > 0) {
    findings.push('Could not read any artifact files from disk');
  }

  // Compute doneScore (0-1)
  const succeeded = run.status === 'completed';
  let doneScore = 0;

  // Base score
  if (succeeded) doneScore += 0.3;

  // Artifact count
  if (artifacts.length >= 2) doneScore += 0.2;
  else if (artifacts.length === 1) doneScore += 0.1;

  // Content volume
  if (totalLines > 50) doneScore += 0.2;
  else if (totalLines > 20) doneScore += 0.1;

  // Structure
  if (hasHeadings) doneScore += 0.15;

  // Code content
  if (hasCodeBlocks) doneScore += 0.15;

  // Build changed summary
  let changedSummary: string;
  if (artifacts.length > 0) {
    const types = [...new Set(artifacts.map((a) => a.type))].join(', ');
    changedSummary = `Produced ${artifacts.length} artifact(s) (${types}) totaling ${totalLines} lines.`;
    if (hasHeadings) changedSummary += ' Output is well-structured with headings.';
    if (hasCodeBlocks) changedSummary += ' Includes code examples.';
  } else {
    changedSummary = 'No artifacts were produced.';
  }

  return { doneScore, findings, changedSummary };
}

function readArtifactContent(artifactPath: string, _workspacePath: string): string | null {
  try {
    // Try the path as-is first
    if (fs.existsSync(artifactPath)) {
      return fs.readFileSync(artifactPath, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveNextAction(
  run: ExecutionRun,
  task: CandidateTask,
  succeeded: boolean,
  doneScore: number,
): string {
  if (!succeeded) {
    return `Investigate failure for task "${task.title}". Check logs at ${run.workspacePath}. Consider re-running with a different approach.`;
  }
  if (doneScore < 0.5) {
    return `Task completed but output quality is low (score: ${(doneScore * 100).toFixed(0)}%). Review artifacts in ${path.dirname(run.workspacePath)} and consider re-running with more specific guidance.`;
  }
  return `Review generated artifacts in ${path.dirname(run.workspacePath)}. Quality score: ${(doneScore * 100).toFixed(0)}%. Consider extracting reusable knowledge to memory.`;
}

function formatReviewMarkdown(
  review: ReviewReport,
  task: CandidateTask,
  run: ExecutionRun,
  artifactCount: number,
): string {
  const findingsSection =
    review.findings && review.findings.length > 0
      ? review.findings.map((f) => `- ${f}`).join('\n')
      : 'No specific findings.';

  return `# Review: ${task.title}

## Run: ${run.id}
- **Backend:** ${run.backend}
- **Status:** ${run.status}
- **Started:** ${run.startedAt ?? 'N/A'}
- **Completed:** ${run.completedAt ?? 'N/A'}

## What was attempted
${review.attempted}

## What changed
${review.changed}

## What succeeded
${review.succeeded}

## What failed
${review.failed}

## Quality Score: ${review.doneScore !== undefined ? `${(review.doneScore * 100).toFixed(0)}%` : 'N/A'}
## Confidence: ${(review.confidence * 100).toFixed(0)}%

## Findings
${findingsSection}

## Recommended next action
${review.nextAction}

## Artifacts produced: ${artifactCount}

---
*Review generated at ${review.createdAt}*
`;
}
