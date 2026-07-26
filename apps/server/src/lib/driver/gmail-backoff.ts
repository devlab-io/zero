/*
 * gmail-backoff.ts — résilience du chemin chaud Gmail (issue devlab-io/zero#31).
 *
 * Remplace la stratégie « flat 60 s » (lib/gmail-rate-limit.ts, hors périmètre, consommée
 * par routes/agent/sync-worker.ts) par un backoff EXPONENTIEL avec JITTER au niveau du
 * seam de dispatch unique (`GmailTransport.execute`). Purs et injectables : `sleep` et
 * `random` sont paramétrables pour des tests unitaires déterministes, sans réseau ni
 * timers réels (ruling : quotas Gmail gelés — 429/403-rate/5xx = retryable, le batch
 * réduit les round-trips, pas le quota).
 */

/** Codes de statut serveur transitoires côté Gmail (retry autorisé). */
const TRANSIENT_5XX = new Set([500, 502, 503, 504]);

/**
 * 408 Request Timeout : la requête n'a jamais été traitée, la rejouer est sûr et c'est le
 * seul 4xx dans ce cas. Il était classé NON rejouable, comme tous les 4xx.
 */
const TRANSIENT_4XX = new Set([408]);

/**
 * Codes d'erreur de TRANSPORT. Sur Workers, `fetch` échoue en `TypeError('fetch failed')`
 * portant la cause réelle dans `err.cause` — jamais un statut HTTP. Le classifieur ne
 * regardait QUE le statut : la panne la plus fréquente du chemin chaud (socket coupée,
 * connexion réinitialisée, DNS momentané) sortait donc du backoff à la première tentative.
 */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENETRESET',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/** Formulations de panne de transport, quand aucun code machine n'est porté. */
const NETWORK_MESSAGE_PATTERNS: RegExp[] = [
  /fetch failed/i,
  /network connection lost/i,
  /connection (?:was )?(?:reset|closed|refused|aborted)/i,
  /socket hang ?up/i,
  /request timed? out/i,
  /terminated/i,
];

/** Profondeur maximale parcourue dans la chaîne `cause` (undici imbrique la vraie cause). */
const MAX_CAUSE_DEPTH = 5;

function hasNetworkSignature(err: unknown, depth = 0): boolean {
  if (err === null || typeof err !== 'object' || depth > MAX_CAUSE_DEPTH) return false;
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  if (typeof e.code === 'string' && RETRYABLE_NETWORK_CODES.has(e.code)) return true;
  if (
    typeof e.message === 'string' &&
    NETWORK_MESSAGE_PATTERNS.some((p) => p.test(e.message as string))
  ) {
    return true;
  }
  return hasNetworkSignature(e.cause, depth + 1);
}

/** `true` si l'échec vient du transport, pas d'une réponse Gmail. */
export function isNetworkError(err: unknown): boolean {
  return hasNetworkSignature(err);
}

/** Raisons 403 signalant un dépassement de quota utilisateur (retryable). */
const RATE_LIMIT_REASONS = new Set([
  'userRateLimitExceeded',
  'rateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
  'backendError',
  'limitExceeded',
]);

type GmailErrorShape = {
  code?: number | string;
  status?: number;
  response?: {
    status?: number;
    headers?: Record<string, string | string[] | undefined>;
    data?: { error?: { errors?: { reason?: string }[] } };
  };
  errors?: { reason?: string }[];
};

/** Extrait un code HTTP numérique quelle que soit la forme d'erreur googleapis/gaxios. */
export function extractStatus(err: unknown): number | undefined {
  const e = (err ?? {}) as GmailErrorShape;
  const raw = e.code ?? e.status ?? e.response?.status;
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * `true` si l'erreur est un rate-limit (429 ou 403 avec raison quota), un 5xx transitoire,
 * un 408, ou une panne de TRANSPORT (`fetch failed`, ECONNRESET, socket coupée).
 *
 * Mesuré avant correction : `TypeError('fetch failed')`, `ECONNRESET` et le statut 408
 * renvoyaient tous `false` — c'est-à-dire que le transitoire le plus fréquent sur Workers
 * n'était jamais rejoué. Le classifieur ne lisait qu'un statut HTTP ; une panne de
 * transport n'en porte aucun.
 */
export function isRetryableGmailError(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 429) return true;
  if (status !== undefined && (TRANSIENT_5XX.has(status) || TRANSIENT_4XX.has(status))) return true;
  if (status === 403) {
    const e = (err ?? {}) as GmailErrorShape;
    const errors = e.errors ?? e.response?.data?.error?.errors ?? [];
    if (errors.some((x) => RATE_LIMIT_REASONS.has(x.reason ?? ''))) return true;
  }
  // Un 4xx déterministe (400/401/404…) ne doit jamais être requalifié en panne réseau à
  // cause d'un mot de son libellé : le transport n'est consulté que sans statut serveur.
  if (status !== undefined) return false;
  return isNetworkError(err);
}

/**
 * Retry-After serveur en millisecondes, s'il est présent (secondes ou date HTTP).
 * `now` injectable pour tester la variante date sans horloge réelle.
 */
export function parseRetryAfterMs(err: unknown, now: () => number = Date.now): number | undefined {
  const e = (err ?? {}) as GmailErrorShape;
  const header = e.response?.headers?.['retry-after'] ?? e.response?.headers?.['Retry-After'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - now());
  return undefined;
}

export interface BackoffOptions {
  /** Nombre maximal de retries (tentatives = maxRetries + 1). Défaut 5. */
  maxRetries: number;
  /** Délai de base en ms. Défaut 500. */
  baseMs: number;
  /** Facteur exponentiel. Défaut 2. */
  factor: number;
  /** Plafond du délai calculé en ms. Défaut 8000 (jamais le 60 s plat). */
  maxMs: number;
  /** Plafond appliqué à un Retry-After serveur en ms. Défaut 30000. */
  retryAfterCapMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  maxRetries: 5,
  baseMs: 500,
  factor: 2,
  maxMs: 8000,
  retryAfterCapMs: 30000,
};

/**
 * Délai avant la tentative `attempt` (0-indexé), backoff exponentiel + « equal jitter » :
 * plafond = min(maxMs, baseMs·factor^attempt) ; délai ∈ [plafond/2, plafond]. Jamais 0,
 * jamais 60 s. `random` ∈ [0,1) injectable → schedule testable déterministe.
 */
export function computeBackoffDelayMs(
  attempt: number,
  opts: BackoffOptions,
  random: () => number,
): number {
  const cap = Math.min(opts.maxMs, opts.baseMs * Math.pow(opts.factor, attempt));
  const half = cap / 2;
  return Math.round(half + random() * half);
}

export interface BackoffDeps {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

const realDeps: BackoffDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/**
 * Exécute `fn` avec retry sur erreurs Gmail transitoires (429/403-rate/5xx). Honore un
 * Retry-After serveur (plafonné), sinon backoff expo + jitter. Toute autre erreur est
 * relancée immédiatement. `onRetry` reçoit chaque délai (observabilité/tests).
 */
export async function withGmailBackoff<T>(
  fn: () => Promise<T>,
  opts: BackoffOptions = DEFAULT_BACKOFF,
  deps: BackoffDeps = realDeps,
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= opts.maxRetries || !isRetryableGmailError(error)) throw error;
      const serverMs = parseRetryAfterMs(error);
      const delayMs =
        serverMs !== undefined
          ? Math.min(serverMs, opts.retryAfterCapMs)
          : computeBackoffDelayMs(attempt, opts, deps.random);
      onRetry?.({ attempt, delayMs, error });
      await deps.sleep(delayMs);
    }
  }
  // Inatteignable : la boucle retourne ou relance toujours. Satisfait le typage.
  throw lastError;
}

/**
 * Applique `fn` à `items` avec une concurrence bornée (`limit`), en préservant l'ordre
 * des résultats. Aucune dépendance externe (pas de p-limit) : borne le fan-out sur le
 * chemin chaud (batch chunks, fetch d'attachments inline) sans saturer les quotas.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from({ length: items.length }) as R[];
  const bound = Math.max(1, Math.min(limit, items.length || 1));
  let cursor = 0;
  const workers = Array.from({ length: bound }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
