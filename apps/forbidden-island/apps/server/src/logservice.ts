/**
 * Node.js SDK for the centralized logging service.
 * Works with Express and Fastify backends.
 *
 * Usage (Express):
 *   import { LogService, expressErrorLogger } from './logservice';
 *   const logService = new LogService('telestrations');
 *   // After all routes:
 *   app.use(expressErrorLogger(logService));
 *
 * Usage (Fastify):
 *   import { LogService } from './logservice';
 *   const logService = new LogService('forbidden-island');
 *   app.addHook('onError', (request, reply, error, done) => {
 *     logService.error(error.message, { error_type: error.name, stack_trace: error.stack });
 *     done();
 *   });
 */

const LOG_SERVICE_URL = process.env.LOG_SERVICE_URL ?? '';
const LOG_SERVICE_KEY = process.env.LOG_SERVICE_API_KEY ?? '';

interface LogEntry {
  service: string;
  source: 'backend';
  level: string;
  message: string;
  error_type?: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

export class LogService {
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushInterval = 5000;
  private readonly maxBuffer = 20;

  constructor(
    private service: string,
    private endpoint: string = LOG_SERVICE_URL,
  ) {
    process.on('beforeExit', () => this.flush());
  }

  error(
    message: string,
    extra?: {
      error_type?: string;
      stack_trace?: string;
      context?: Record<string, unknown>;
    },
  ): void {
    this.enqueue('error', message, extra);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.enqueue('warn', message, { context });
  }

  fatal(
    message: string,
    extra?: {
      error_type?: string;
      stack_trace?: string;
      context?: Record<string, unknown>;
    },
  ): void {
    this.enqueue('fatal', message, extra);
  }

  private enqueue(
    level: string,
    message: string,
    extra?: {
      error_type?: string;
      stack_trace?: string;
      context?: Record<string, unknown>;
    },
  ): void {
    this.buffer.push({
      service: this.service,
      source: 'backend',
      level,
      message,
      error_type: extra?.error_type,
      stack_trace: extra?.stack_trace,
      context: extra?.context,
      timestamp: new Date().toISOString(),
    });

    if (this.buffer.length >= this.maxBuffer) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.flushInterval);
    }
  }

  flush(): void {
    if (this.buffer.length === 0 || !this.endpoint) return;
    const entries = this.buffer.splice(0);

    const payload = JSON.stringify({ entries });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (LOG_SERVICE_KEY) {
      headers['Authorization'] = `Bearer ${LOG_SERVICE_KEY}`;
    }

    fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: payload,
    }).catch(() => {
      // Never let logging failures affect the application
    });
  }
}

/**
 * Express error-handling middleware that logs errors to the log service.
 * Place after all routes: app.use(expressErrorLogger(logService));
 *
 * Uses `any` for req/res/next so the SDK doesn't need express as a dependency.
 * Express recognizes 4-arg middleware as error handlers by arity.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expressErrorLogger(logService: LogService): any {
  // Express identifies error handlers by their 4-parameter arity
  return function logError(err: Error, req: any, _res: any, next: any): void {
    logService.error(err.message, {
      error_type: err.name,
      stack_trace: err.stack,
      context: {
        method: req.method,
        path: req.url,
        user_agent: req.headers?.['user-agent'],
      },
    });
    next(err);
  };
}
