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

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|body|decodedBody|processedHtml|rawBody|accessToken|refreshToken|idToken|clientSecret|apiKey|privateKey|credential|secret|password)$/i;

function sanitizeString(value: string): string {
  return value
    .replace(/\b(?:Authorization|Proxy-Authorization):\s*[^\r\n]+/gi, `Authorization: ${REDACTED}`)
    .replace(/\b(?:Cookie|Set-Cookie):\s*[^\r\n]+/gi, `Cookie: ${REDACTED}`)
    .replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b([\w.-]*(?:session|auth|token|secret|cookie|password)[\w.-]*)=([^\s;,]+)/gi,
      `$1=${REDACTED}`,
    );
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name),
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === 'string' && SENSITIVE_KEY.test(value[0])) {
      return [value[0], REDACTED];
    }
    return value.map((item) => sanitize(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, seen);
  }
  return sanitized;
}

function safeString(value: unknown): string {
  try {
    return typeof value === 'string' ? sanitizeString(value) : JSON.stringify(sanitize(value));
  } catch {
    return '[Unserializable]';
  }
}

function serializeError(err: Error): Record<string, unknown> {
  return sanitize(err) as Record<string, unknown>;
}

function normalize(rest: unknown[]): unknown[] {
  return rest.map((r) => {
    try {
      return r instanceof Error ? serializeError(r) : sanitize(r);
    } catch {
      return '[Unserializable]';
    }
  });
}

function write(level: LogLevel, message: unknown, rest: unknown[]): void {
  const entry: Record<string, unknown> = {
    level,
    msg: typeof message === 'string' ? sanitizeString(message) : safeString(message),
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
