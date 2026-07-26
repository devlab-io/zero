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

// Central redaction (pitbull A1, axe 10). Logs on Workers go to `wrangler tail` and
// logpush, i.e. to durable third-party storage, so a bearer token or a session cookie
// written here is a leaked credential. Call sites are expected to log safe summaries,
// but this net catches the ones that forget: any key whose NAME looks like a credential
// has its value masked, whatever the depth.
export const REDACTED = '[redacted]';

const SENSITIVE_KEY =
  /(^|[-_.])(authorization|cookie|token|secret|password|passwd|credential|bearer|jwt|signature|api[-_.]?key|private[-_.]?key)([-_.]|$)|token$|secret$|password$|credential$/i;

const MAX_DEPTH = 6;

// Deuxième filet, sur la VALEUR. Le filet ci-dessus est indexé sur les NOMS de clés : une
// chaîne nue lui échappe entièrement — c'est exactement ce qui laissait passer le JSON du
// compte de service Google (`private_key` incluse) journalisé en argument positionnel par
// lib/factories/google-subscription.factory.ts. Ces motifs reconnaissent le secret lui-même,
// où qu'il se trouve : message, chaîne imbriquée, fragment au milieu d'une phrase.
const SECRET_VALUE_PATTERNS: [RegExp, string][] = [
  // Clé privée PEM (compte de service, certificat). Le corps est multiligne.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED],
  // En-tête d'autorisation porté dans une chaîne libre.
  [/\bBearer\s+[A-Za-z0-9\-._~+/]{8,}={0,2}/gi, `Bearer ${REDACTED}`],
  // Jeton d'accès Google OAuth.
  [/\bya29\.[A-Za-z0-9\-._~+/]{8,}={0,2}/g, REDACTED],
  // Jeton de rafraîchissement Google.
  [/\b1\/\/[A-Za-z0-9\-._~+/]{16,}={0,2}/g, REDACTED],
  // JWT / objet JSON encodé en base64url : commence toujours par `eyJ`.
  [/\beyJ[A-Za-z0-9_=-]{8,}(?:\.[A-Za-z0-9_=-]+){0,2}/g, REDACTED],
  // URL de connexion portant des identifiants (`postgres://user:pass@host`).
  [/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, `$1://${REDACTED}@`],
];

/** Masque les secrets reconnaissables À LEUR FORME dans une chaîne, sans la jeter entière. */
export function maskSecretValues(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskSecretValues(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    // `Array.from(headers.entries())` and friends serialise as [key, value] pairs; mask
    // the value when the pair's key is a credential name.
    if (value.length === 2 && typeof value[0] === 'string' && isSensitiveKey(value[0])) {
      return [value[0], REDACTED];
    }
    return value.map((item) => redact(item, depth + 1));
  }

  if (value instanceof Error) return serializeError(value);
  // Dates serialise to ISO strings on their own; walking their (empty) key set would
  // flatten them to `{}`.
  if (value instanceof Date) return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(source[key], depth + 1);
  }
  return out;
}

function normalize(rest: unknown[]): unknown[] {
  return rest.map((r) => (r instanceof Error ? redact(serializeError(r)) : redact(r)));
}

/**
 * Safe, loggable summary of a request. Replaces `Array.from(request.headers.entries())`
 * on the authentication paths, which serialised the Authorization header and the whole
 * session cookie in clear text.
 */
export function describeRequest(request: Request): Record<string, unknown> {
  const authorization = request.headers.get('Authorization');
  let path: string;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = '<unparseable>';
  }
  return {
    method: request.method,
    path,
    userAgent: request.headers.get('User-Agent') ?? undefined,
    hasAuthorization: Boolean(authorization),
    authorizationLength: authorization?.length ?? 0,
    hasCookie: Boolean(request.headers.get('Cookie')),
  };
}

function write(level: LogLevel, message: unknown, rest: unknown[]): void {
  const entry: Record<string, unknown> = {
    level,
    // Le message aussi : `logger.error(someSecretString)` passait entièrement à travers,
    // puisque seul `rest` traversait la redaction.
    msg: maskSecretValues(typeof message === 'string' ? message : safeString(message)),
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
