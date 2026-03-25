import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisReport, CandidateTask, Source } from '../domain/index.js';
import { getLogger } from '../utils/logger.js';
import type { BackendAdapter, ExecutionResult } from './adapter.js';
import { isCliAvailable } from './cli-detect.js';
import { detectChangedFiles } from './file-detect.js';
import { buildTaskPrompt } from './prompt-builder.js';

/**
 * Codex CLI backend adapter.
 * Invokes the `codex` CLI in the workspace directory with a structured prompt.
 *
 * Requires: `codex` installed and on PATH.
 * Runs in quiet/non-interactive mode with --approval-mode full-auto.
 */
export class CodexCliBackend implements BackendAdapter {
  readonly name = 'Codex CLI';
  readonly type = 'codex-cli' as const;

  private available: boolean | null = null;

  isAvailable(): boolean {
    if (this.available === null) {
      this.available = isCliAvailable('codex');
    }
    return this.available;
  }

  async execute(
    task: CandidateTask,
    source: Source,
    analysis: AnalysisReport,
    workspacePath: string,
  ): Promise<ExecutionResult> {
    const logger = getLogger();

    if (!this.isAvailable()) {
      return {
        success: false,
        output: '',
        artifacts: [],
        error:
          'Codex CLI is not installed or not on PATH. Install with: npm install -g @openai/codex',
      };
    }

    const prompt = buildTaskPrompt(task, source, analysis);
    const promptFile = path.join(workspacePath, '.operator-prompt.md');
    fs.writeFileSync(promptFile, prompt);

    logger.info(`[codex-cli] Executing: ${task.title}`);
    logger.info(`[codex-cli] Workspace: ${workspacePath}`);

    try {
      const result = execSync(
        `codex --approval-mode full-auto --quiet "${prompt.replace(/"/g, '\\"')}"`,
        {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 300000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        },
      );

      const output = result.trim();
      logger.info(`[codex-cli] Completed with output (${output.length} chars)`);

      const outputFile = 'codex-output.md';
      fs.writeFileSync(path.join(workspacePath, outputFile), `# Codex Output\n\n${output}\n`);

      const artifacts: ExecutionResult['artifacts'] = [
        { type: 'prompt', filename: '.operator-prompt.md', content: prompt },
        { type: 'codex-output', filename: outputFile, content: output },
      ];

      const changedFiles = detectChangedFiles(workspacePath, ['.operator-prompt.md', outputFile]);
      if (changedFiles.length > 0) {
        const manifest = changedFiles.map((f) => `- ${f}`).join('\n');
        const manifestFile = 'changed-files.md';
        fs.writeFileSync(
          path.join(workspacePath, manifestFile),
          `# Files Changed by Codex\n\n${manifest}\n`,
        );
        artifacts.push({ type: 'manifest', filename: manifestFile, content: manifest });
      }

      return { success: true, output, artifacts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[codex-cli] Execution failed: ${message}`);

      return {
        success: false,
        output: '',
        artifacts: [{ type: 'prompt', filename: '.operator-prompt.md', content: prompt }],
        error: `Codex CLI failed: ${message}`,
      };
    }
  }
}
