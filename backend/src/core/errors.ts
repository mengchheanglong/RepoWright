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
