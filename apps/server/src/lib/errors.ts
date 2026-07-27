// lib/errors.ts — central error taxonomy (A5 observability / error handling).
//
// One place that maps a small set of stable business error codes to:
//   - a tRPC error code (for procedures), and
//   - a normalised Hono JSON response (for HTTP routes).
//
// Contract: a known business error keeps a STABLE code across the boundary; an unknown
// error is coerced to a generic 500 that NEVER leaks the underlying message or stack to
// the client. Tested in lib/errors.test.ts.
//
// Ce module a longtemps existé SANS AUCUN importateur de production (constat pitbull :
// 151 lignes, 6 tests verts, zéro appelant hors de son propre test). Pendant ce temps les
// décisions d'authentification se prenaient par COMPARAISON DE CHAÎNES à travers la
// frontière réseau — `message.includes('invalid_grant')` côté serveur,
// `err.message === 'Required scopes missing'` côté client. Il est désormais branché aux
// deux extrémités :
//   - `trpc/trpc.ts` : `errorFormatter` publie `data.appCode` sur CHAQUE erreur tRPC ;
//   - `routes/index.ts` : `api.onError` répond via `toHonoResponse` ;
//   - `lib/connection-context.ts` et `lib/trpc-guards.ts` lèvent des `AppError` typées ;
//   - `apps/mail/providers/query-provider.tsx` discrimine sur `appCode`, plus sur le texte.

import { TRPCError, type TRPCDefaultErrorShape } from '@trpc/server';

export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM: 'UPSTREAM', // failure of an external provider (Gmail, Resend, …)
  /** Panne transitoire d'infrastructure (RPC Durable Object, réseau) : rejouable. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** L'octroi OAuth ne porte pas les scopes requis : réautorisation nécessaire. */
  MISSING_SCOPES: 'MISSING_SCOPES',
  /** L'octroi OAuth est révoqué ou expiré : reconnexion du compte nécessaire. */
  CONNECTION_EXPIRED: 'CONNECTION_EXPIRED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

type TrpcCode = ConstructorParameters<typeof TRPCError>[0]['code'];

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  UNAVAILABLE: 503,
  // Statuts conservés à l'identique de l'existant : seul le CODE devient stable, la
  // sémantique HTTP du fil ne bouge pas (aucune rupture pour un client déjà déployé).
  MISSING_SCOPES: 400,
  CONNECTION_EXPIRED: 401,
  INTERNAL: 500,
};

const TRPC_CODE: Record<ErrorCode, TrpcCode> = {
  VALIDATION: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'TOO_MANY_REQUESTS',
  UPSTREAM: 'BAD_GATEWAY',
  UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  MISSING_SCOPES: 'BAD_REQUEST',
  CONNECTION_EXPIRED: 'UNAUTHORIZED',
  INTERNAL: 'INTERNAL_SERVER_ERROR',
};

const TRPC_TO_APP: Partial<Record<string, ErrorCode>> = {
  BAD_REQUEST: 'VALIDATION',
  PARSE_ERROR: 'VALIDATION',
  UNPROCESSABLE_CONTENT: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'RATE_LIMITED',
  BAD_GATEWAY: 'UPSTREAM',
  SERVICE_UNAVAILABLE: 'UNAVAILABLE',
  GATEWAY_TIMEOUT: 'UPSTREAM',
};

const GENERIC_MESSAGE = 'Internal server error';

export interface AppErrorOptions {
  context?: Record<string, unknown>;
  cause?: unknown;
  /** Whether the message is safe to expose to the client. Defaults to false for INTERNAL. */
  expose?: boolean;
}

/** A typed business error carrying a stable {@link ErrorCode}. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly context?: Record<string, unknown>;
  readonly expose: boolean;

  constructor(code: ErrorCode, message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    this.context = opts.context;
    this.expose = opts.expose ?? code !== 'INTERNAL';
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }

  static validation(message: string, opts?: AppErrorOptions): AppError {
    return new AppError('VALIDATION', message, opts);
  }
  static unauthorized(message = 'Unauthorized', opts?: AppErrorOptions): AppError {
    return new AppError('UNAUTHORIZED', message, opts);
  }
  static forbidden(message = 'Forbidden', opts?: AppErrorOptions): AppError {
    return new AppError('FORBIDDEN', message, opts);
  }
  static notFound(message = 'Not found', opts?: AppErrorOptions): AppError {
    return new AppError('NOT_FOUND', message, opts);
  }
  static conflict(message: string, opts?: AppErrorOptions): AppError {
    return new AppError('CONFLICT', message, opts);
  }
  static upstream(message: string, opts?: AppErrorOptions): AppError {
    return new AppError('UPSTREAM', message, opts);
  }
  static unavailable(message = 'Temporarily unavailable', opts?: AppErrorOptions): AppError {
    return new AppError('UNAVAILABLE', message, opts);
  }
  static missingScopes(message = 'Required scopes missing', opts?: AppErrorOptions): AppError {
    return new AppError('MISSING_SCOPES', message, opts);
  }
  static connectionExpired(
    message = 'Connection expired. Please reconnect.',
    opts?: AppErrorOptions,
  ): AppError {
    return new AppError('CONNECTION_EXPIRED', message, opts);
  }
  static internal(message = GENERIC_MESSAGE, opts?: AppErrorOptions): AppError {
    return new AppError('INTERNAL', message, { ...opts, expose: false });
  }
}

/**
 * Code stable pour n'importe quelle valeur levée, quelle que soit la couche qui l'a
 * produite. C'est le seul point d'où sort le `appCode` publié sur le fil : un client n'a
 * donc plus besoin de comparer des messages pour savoir ce qui s'est passé.
 * Un `TRPCError` construit à partir d'une `AppError` conserve le code de sa cause.
 */
export function resolveErrorCode(err: unknown): ErrorCode {
  if (err instanceof AppError) return err.code;
  if (err instanceof TRPCError) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof AppError) return cause.code;
    return TRPC_TO_APP[err.code] ?? 'INTERNAL';
  }
  return 'INTERNAL';
}

/**
 * Corps de l'`errorFormatter` tRPC (voir `trpc/trpc.ts`) : publie le CODE STABLE sur
 * `data.appCode` de CHAQUE erreur qui sort d'une procédure. C'est la seule chose que le
 * client relit (`apps/mail/lib/error-codes.ts`) — plus aucun message n'est comparé.
 *
 * Extrait ici pour qu'un test puisse éprouver la chaîne complète avec le formateur RÉEL,
 * sans monter tout `trpc.ts` (hono/AsyncLocalStorage, Redis, rate limiter).
 */
export function withAppCode(shape: TRPCDefaultErrorShape, error: unknown) {
  return { ...shape, data: { ...shape.data, appCode: resolveErrorCode(error) } };
}

/** Maps any thrown value to a TRPCError with a stable code; unknown → generic 500. */
export function toTRPCError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  if (err instanceof AppError) {
    return new TRPCError({
      code: TRPC_CODE[err.code],
      message: err.expose ? err.message : GENERIC_MESSAGE,
      cause: err,
    });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: GENERIC_MESSAGE, cause: err });
}

// ---------------------------------------------------------------------------
// Verdict d'initialisation d'un driver, transporté à travers la frontière RPC d'un
// Durable Object.
// ---------------------------------------------------------------------------

/**
 * Codes qu'un échec de `ZeroDriver.setupAuth` peut porter. Volontairement restreint :
 * ce canal ne sert qu'à faire survivre la DISCRIMINATION, pas à republier la taxonomie.
 */
export type DriverSetupFailureCode = Extract<
  ErrorCode,
  'CONNECTION_EXPIRED' | 'NOT_FOUND' | 'INTERNAL'
>;

/**
 * Résultat de `ZeroDriver.setName` / `setupAuth`.
 *
 * MÊME MESURE que `ScheduledSendAttemptRpcResult` (lib/send-reservation.ts) : une erreur
 * JETÉE depuis une méthode de Durable Object arrive côté Worker en `Error` NU — propriétés
 * propres `['stack','message','remote']`, ni `code`, ni `cause`, ni le prototype. Une
 * `AppError.connectionExpired` levée dans le DO y perdait donc sa CLASSE, `getShardClient`
 * la ré-emballait en `new Error('Shard initialization failed: …')`, `resolveErrorCode`
 * rendait `INTERNAL`, et le client ne se voyait plus jamais proposer de se reconnecter.
 *
 * Seule une VALEUR DE RETOUR sérialisable traverse fidèlement. Forme PLATE pour la raison
 * déjà documentée sur `SendReservationRpcResult` : le typage des stubs enveloppe chaque
 * propriété d'un objet retourné dans son propre thenable, ce qui ne s'unifie pas avec une
 * union discriminée (TS2769).
 */
export type DriverSetupRpcResult = {
  ok: boolean;
  code: DriverSetupFailureCode | null;
  message: string | null;
};

const DRIVER_SETUP_CODES: ReadonlySet<string> = new Set<DriverSetupFailureCode>([
  'CONNECTION_EXPIRED',
  'NOT_FOUND',
  'INTERNAL',
]);

export const driverSetupSucceeded: DriverSetupRpcResult = { ok: true, code: null, message: null };

/** Classe un échec de `setupAuth` DANS le Durable Object, où l'erreur est encore entière. */
export function toDriverSetupResult(error: unknown): DriverSetupRpcResult {
  const code = resolveErrorCode(error);
  return {
    ok: false,
    code: DRIVER_SETUP_CODES.has(code) ? (code as DriverSetupFailureCode) : 'INTERNAL',
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Rehausse le verdict en `AppError` TYPÉE, côté Worker. La classe est reconstruite ici,
 * dans l'isolate qui va la propager : `resolveErrorCode` la reconnaît, et l'`errorFormatter`
 * tRPC publie donc `CONNECTION_EXPIRED` sur le fil au lieu d'`INTERNAL`.
 */
export function fromDriverSetupResult(result: DriverSetupRpcResult): AppError {
  const message = result.message ?? 'Driver setup failed';
  switch (result.code) {
    case 'CONNECTION_EXPIRED':
      return AppError.connectionExpired(message);
    case 'NOT_FOUND':
      return AppError.notFound(message);
    default:
      return AppError.internal(message);
  }
}

export interface NormalizedErrorBody {
  error: { code: ErrorCode; message: string };
}

export interface NormalizedErrorResponse {
  status: number;
  body: NormalizedErrorBody;
}

/** Maps any thrown value to a normalised Hono JSON response; unknown → generic 500. */
export function toHonoResponse(err: unknown): NormalizedErrorResponse {
  if (err instanceof AppError) {
    return {
      status: err.httpStatus,
      body: { error: { code: err.code, message: err.expose ? err.message : GENERIC_MESSAGE } },
    };
  }
  if (err instanceof TRPCError) {
    const code = TRPC_TO_APP[err.code] ?? 'INTERNAL';
    return {
      status: HTTP_STATUS[code],
      body: { error: { code, message: code === 'INTERNAL' ? GENERIC_MESSAGE : err.message } },
    };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: GENERIC_MESSAGE } } };
}
