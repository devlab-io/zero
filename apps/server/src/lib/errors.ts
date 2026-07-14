// lib/errors.ts — central error taxonomy (A5 observability / error handling).
//
// One place that maps a small set of stable business error codes to:
//   - a tRPC error code (for procedures), and
//   - a normalised Hono JSON response (for HTTP routes).
//
// Contract: a known business error keeps a STABLE code across the boundary; an unknown
// error is coerced to a generic 500 that NEVER leaks the underlying message or stack to
// the client. Tested in lib/errors.test.ts.

import { TRPCError } from '@trpc/server';

export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM: 'UPSTREAM', // failure of an external provider (Gmail, Resend, …)
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
  SERVICE_UNAVAILABLE: 'UPSTREAM',
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
  static internal(message = GENERIC_MESSAGE, opts?: AppErrorOptions): AppError {
    return new AppError('INTERNAL', message, { ...opts, expose: false });
  }
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
