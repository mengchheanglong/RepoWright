export class OperatorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OperatorError';
  }
}

export class SourceNotFoundError extends OperatorError {
  constructor(id: string) {
    super(`Source not found: ${id}`, 'SOURCE_NOT_FOUND');
  }
}

export class TaskNotFoundError extends OperatorError {
  constructor(id: string) {
    super(`Task not found: ${id}`, 'TASK_NOT_FOUND');
  }
}

export class RunNotFoundError extends OperatorError {
  constructor(id: string) {
    super(`Run not found: ${id}`, 'RUN_NOT_FOUND');
  }
}

export class InvalidSourceError extends OperatorError {
  constructor(message: string) {
    super(message, 'INVALID_SOURCE');
  }
}

export class ExecutionError extends OperatorError {
  constructor(message: string, cause?: unknown) {
    super(message, 'EXECUTION_ERROR', cause);
  }
}
