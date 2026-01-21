/**
 * Structured logging for Task Center Electron app
 * Provides JSON logging with rotation and colored console output
 */
import * as fs from 'fs';
import * as path from 'path';

// Log levels
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  module?: string;
  data?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

// Colors for console output
const COLORS = {
  reset: '\x1b[0m',
  debug: '\x1b[36m',   // Cyan
  info: '\x1b[32m',    // Green
  warn: '\x1b[33m',    // Yellow
  error: '\x1b[31m',   // Red
  dim: '\x1b[2m',
};

class Logger {
  private logDir: string;
  private minLevel: LogLevel;
  private currentDate: string;
  private logStream: fs.WriteStream | null = null;

  constructor() {
    this.logDir = path.join(
      process.env.USERPROFILE || '',
      'Task_Center',
      'logs'
    );
    this.minLevel = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO;
    this.currentDate = '';
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  private getStream(): fs.WriteStream {
    const dateStr = this.getDateString();

    // Rotate log file daily
    if (dateStr !== this.currentDate || !this.logStream) {
      if (this.logStream) {
        this.logStream.end();
      }
      this.currentDate = dateStr;
      const logFile = path.join(this.logDir, `task-center-${dateStr}.log`);
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }

    return this.logStream;
  }

  private formatConsole(level: string, message: string, module?: string): string {
    const time = new Date().toLocaleTimeString('ru-RU');
    const levelColor = COLORS[level.toLowerCase() as keyof typeof COLORS] || COLORS.reset;
    const moduleStr = module ? `${COLORS.dim}[${module}]${COLORS.reset} ` : '';
    return `${COLORS.dim}${time}${COLORS.reset} ${levelColor}${level.toUpperCase()}${COLORS.reset} ${moduleStr}${message}`;
  }

  private log(level: LogLevel, levelName: string, message: string, data?: Record<string, unknown>, module?: string): void {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      module,
      data
    };

    // Console output (colored)
    const consoleMsg = this.formatConsole(levelName, message, module);
    if (level >= LogLevel.ERROR) {
      console.error(consoleMsg);
      if (data) console.error(data);
    } else if (level >= LogLevel.WARN) {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }

    // File output (JSON)
    try {
      const stream = this.getStream();
      stream.write(JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  debug(message: string, data?: Record<string, unknown>, module?: string): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data, module);
  }

  info(message: string, data?: Record<string, unknown>, module?: string): void {
    this.log(LogLevel.INFO, 'INFO', message, data, module);
  }

  warn(message: string, data?: Record<string, unknown>, module?: string): void {
    this.log(LogLevel.WARN, 'WARN', message, data, module);
  }

  error(message: string, error?: Error | unknown, module?: string): void {
    const data: Record<string, unknown> = {};

    if (error instanceof Error) {
      data.error = error.message;
      data.stack = error.stack;
    } else if (error) {
      data.error = String(error);
    }

    this.log(LogLevel.ERROR, 'ERROR', message, data, module);
  }

  // Create a child logger with a fixed module name
  child(module: string): ChildLogger {
    return new ChildLogger(this, module);
  }

  // Timer for measuring operations
  time(operation: string, module?: string): () => void {
    const start = Date.now();
    this.debug(`Starting: ${operation}`, undefined, module);

    return () => {
      const duration = Date.now() - start;
      this.info(`Completed: ${operation} (${duration}ms)`, { duration_ms: duration }, module);
    };
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

class ChildLogger {
  constructor(private parent: Logger, private module: string) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.parent.debug(message, data, this.module);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.parent.info(message, data, this.module);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.parent.warn(message, data, this.module);
  }

  error(message: string, error?: Error | unknown): void {
    this.parent.error(message, error, this.module);
  }

  time(operation: string): () => void {
    return this.parent.time(operation, this.module);
  }
}

// Singleton instance
const logger = new Logger();

export default logger;
export { Logger, ChildLogger };
