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
 * Claude CLI backend adapter.
 * Invokes the `claude` CLI (Claude Code) in the workspace with a structured prompt.
 *
 * Requires: `claude` installed and on PATH.
 * Runs in non-interactive mode with --print flag.
 */
export class ClaudeCliBackend implements BackendAdapter {
  readonly name = 'Claude CLI';
  readonly type = 'claude-cli' as const;

  private available: boolean | null = null;

  isAvailable(): boolean {
    if (this.available === null) {
      this.available = isCliAvailable('claude');
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
          'Claude CLI is not installed or not on PATH. Install with: npm install -g @anthropic-ai/claude-code',
      };
    }

    const prompt = buildTaskPrompt(task, source, analysis);
    const promptFile = path.join(workspacePath, '.operator-prompt.md');
    fs.writeFileSync(promptFile, prompt);

    logger.info(`[claude-cli] Executing: ${task.title}`);
    logger.info(`[claude-cli] Workspace: ${workspacePath}`);

    try {
      // Use --print for non-interactive single-shot execution
      // Use --dangerously-skip-permissions to allow file writes in workspace
      const result = execSync(
        `claude --print --dangerously-skip-permissions "${prompt.replace(/"/g, '\\"')}"`,
        {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 300000, // 5 minutes
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        },
      );

      const output = result.trim();
      logger.info(`[claude-cli] Completed with output (${output.length} chars)`);

      const outputFile = 'claude-output.md';
      fs.writeFileSync(path.join(workspacePath, outputFile), `# Claude Output\n\n${output}\n`);

      const artifacts: ExecutionResult['artifacts'] = [
        { type: 'prompt', filename: '.operator-prompt.md', content: prompt },
        { type: 'claude-output', filename: outputFile, content: output },
      ];

      // Detect any new/modified files in workspace
      const changedFiles = detectChangedFiles(workspacePath, ['.operator-prompt.md', outputFile]);
      if (changedFiles.length > 0) {
        const manifest = changedFiles.map((f) => `- ${f}`).join('\n');
        const manifestFile = 'changed-files.md';
        fs.writeFileSync(
          path.join(workspacePath, manifestFile),
          `# Files Changed by Claude\n\n${manifest}\n`,
        );
        artifacts.push({ type: 'manifest', filename: manifestFile, content: manifest });
      }

      return { success: true, output, artifacts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[claude-cli] Execution failed: ${message}`);

      return {
        success: false,
        output: '',
        artifacts: [{ type: 'prompt', filename: '.operator-prompt.md', content: prompt }],
        error: `Claude CLI failed: ${message}`,
      };
    }
  }
}
