import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

export class Logger {
  private minLevel: number;
  private logFilePath: string | null = null;

  constructor(level: LogLevel = 'info', logFile?: string) {
    this.minLevel = LEVEL_ORDER[level];
    if (logFile) {
      this.logFilePath = logFile;
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
    }
  }

  setLogFile(filePath: string): void {
    this.logFilePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    };

    // Console output (readable)
    const label = LEVEL_LABELS[level];
    const prefix = `[${label}]`;
    if (level === 'error') {
      console.error(`${prefix} ${message}`);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    // File output (structured JSONL)
    if (this.logFilePath) {
      fs.appendFileSync(this.logFilePath, `${JSON.stringify(entry)}\n`);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }
}

let defaultLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger('info');
  }
  return defaultLogger;
}

export function initLogger(level: LogLevel, logFile?: string): Logger {
  defaultLogger = new Logger(level, logFile);
  return defaultLogger;
}
