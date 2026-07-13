/**
 * Read-query retry policy (issue #34, check point 4).
 *
 * Read (idempotent) queries retry at most twice with a capped exponential delay
 * plus full jitter. Non-idempotent mutations are NOT covered here — react-query
 * mutations default to zero retries and query-provider keeps them that way.
 *
 * This is the SINGLE source of truth: query-provider wires it into the query
 * client and the robustness soak imports the very same functions (no reimplementation).
 */

export const READ_RETRY_MAX = 2;

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

/** 4xx client errors are deterministic — retrying can't help. 408/429 are the exceptions. */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

function extractHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const direct = (error as { data?: unknown }).data;
  if (
    direct &&
    typeof direct === 'object' &&
    typeof (direct as { httpStatus?: unknown }).httpStatus === 'number'
  ) {
    return (direct as { httpStatus: number }).httpStatus;
  }
  const shape = (error as { shape?: unknown }).shape;
  if (shape && typeof shape === 'object') {
    const shapeData = (shape as { data?: unknown }).data;
    if (
      shapeData &&
      typeof shapeData === 'object' &&
      typeof (shapeData as { httpStatus?: unknown }).httpStatus === 'number'
    ) {
      return (shapeData as { httpStatus: number }).httpStatus;
    }
  }
  return null;
}

/**
 * react-query `retry` predicate for read queries. Retries transient failures up
 * to {@link READ_RETRY_MAX}; never retries deterministic 4xx (except 408/429).
 */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= READ_RETRY_MAX) return false;
  const status = extractHttpStatus(error);
  if (status !== null && status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status)) {
    return false;
  }
  return true;
}

/**
 * react-query `retryDelay`. Capped exponential backoff with full jitter:
 * delay ∈ [0, min(MAX, BASE·2^attempt)]. `attemptIndex` is 0-based.
 */
export function readRetryDelay(attemptIndex: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attemptIndex);
  return Math.round(Math.min(MAX_DELAY_MS, Math.random() * ceiling));
}

/** Upper bound of the jitter window for a given attempt — used by tests/soak to assert the cap. */
export function readRetryDelayCeiling(attemptIndex: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attemptIndex);
}
