import type { AnalysisReport, CandidateTask, Source } from '../domain/index.js';

export interface ExecutionResult {
  success: boolean;
  output: string;
  artifacts: { type: string; filename: string; content: string }[];
  error?: string;
}

export interface BackendAdapter {
  readonly name: string;
  readonly type: 'internal-planner' | 'codex-cli' | 'claude-cli';

  /** Returns true if this backend is available for execution */
  isAvailable(): boolean;

  /** Execute the given task against the source in the workspace */
  execute(
    task: CandidateTask,
    source: Source,
    analysis: AnalysisReport,
    workspacePath: string,
  ): Promise<ExecutionResult>;
}
