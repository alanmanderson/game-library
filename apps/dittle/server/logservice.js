/**
 * Node.js SDK for the centralized logging service (plain-ESM port of
 * services/logservice/sdk/node.ts).
 *
 * Usage (Express):
 *   import { LogService, expressErrorLogger } from './logservice.js';
 *   const logService = new LogService('dittle');
 *   // After all routes:
 *   app.use(expressErrorLogger(logService));
 *
 * Buffers entries and flushes every 5s or every 20 entries. Only WARNING and
 * above are meant to be sent. Logging failures never affect the application.
 */

const LOG_SERVICE_URL = process.env.LOG_SERVICE_URL ?? '';
const LOG_SERVICE_KEY = process.env.LOG_SERVICE_API_KEY ?? '';

export class LogService {
  constructor(service, endpoint = LOG_SERVICE_URL) {
    this.service = service;
    this.endpoint = endpoint;
    this.buffer = [];
    this.timer = null;
    this.flushInterval = 5000;
    this.maxBuffer = 20;
    process.on('beforeExit', () => this.flush());
  }

  error(message, extra) {
    this.enqueue('error', message, extra);
  }

  warn(message, context) {
    this.enqueue('warn', message, { context });
  }

  fatal(message, extra) {
    this.enqueue('fatal', message, extra);
  }

  enqueue(level, message, extra) {
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

  flush() {
    if (this.buffer.length === 0 || !this.endpoint) return;
    const entries = this.buffer.splice(0);

    const headers = { 'Content-Type': 'application/json' };
    if (LOG_SERVICE_KEY) {
      headers['Authorization'] = `Bearer ${LOG_SERVICE_KEY}`;
    }

    fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ entries }),
    }).catch(() => {
      // Never let logging failures affect the application.
    });
  }
}

/**
 * Express error-handling middleware. Place after all routes:
 *   app.use(expressErrorLogger(logService));
 * Express identifies error handlers by their 4-parameter arity.
 */
export function expressErrorLogger(logService) {
  return function logError(err, req, _res, next) {
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
