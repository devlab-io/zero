// lib/logger.ts — structured server logger (A5 observability).
//
// One `console.*` sink per level: on Cloudflare Workers, stdout/stderr is the log
// transport captured by `wrangler tail` / logpush, so a structured JSON line through
// `console` IS the structured-logging mechanism. Centralising it here means the rest of
// `apps/server/src` routes through `logger.*` instead of scattered `console.*` calls.
//
// Deliberately dependency-free (no @sentry import): unhandled errors on the request path
// are captured by the Sentry request wrapper in main.ts (lib/sentry.ts), so the logger
// stays a pure, no-op-safe structured sink that never throws. Rationale for a dedicated
// logger vs lib/logging-service.ts is recorded in docs/adr/0004-structured-logger.md.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function safeString(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function serializeError(err: Error): Record<string, unknown> {
  return { name: err.name, message: err.message, stack: err.stack };
}

function normalize(rest: unknown[]): unknown[] {
  return rest.map((r) => (r instanceof Error ? serializeError(r) : r));
}

function write(level: LogLevel, message: unknown, rest: unknown[]): void {
  const entry: Record<string, unknown> = {
    level,
    msg: typeof message === 'string' ? message : safeString(message),
    time: new Date().toISOString(),
  };
  if (rest.length) entry.data = normalize(rest);

  let line: string;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = `${level} ${entry.msg as string}`;
  }

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  debug(message: unknown, ...rest: unknown[]): void {
    write('debug', message, rest);
  },
  info(message: unknown, ...rest: unknown[]): void {
    write('info', message, rest);
  },
  warn(message: unknown, ...rest: unknown[]): void {
    write('warn', message, rest);
  },
  error(message: unknown, ...rest: unknown[]): void {
    write('error', message, rest);
  },
};
