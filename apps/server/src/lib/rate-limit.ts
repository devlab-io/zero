/**
 * Rate-limit decision logic, extracted pure so the REAL semantics are unit
 * tested (revue Codex 2026-08-01): the tRPC middleware in trpc.ts is a thin
 * adapter over `evaluateRateLimit`.
 *
 * Semantics:
 * - identifier strict: a null/empty identifier is an auth error, never a
 *   shared "undefined" bucket.
 * - failClosed (expensive surfaces, e.g. copilot.ask): WITHOUT a remote Redis
 *   the call is DENIED in production — never silently unlimited. Non-prod
 *   keeps the historical no-op so local dev works without Redis.
 * - failOpen (historical default): without remote Redis, skip limiting.
 */

export type RateLimitCheck = {
  hasRemoteRedis: boolean;
  isProduction: boolean;
  failClosed: boolean;
  /** Fully-resolved limit key (e.g. the userId). Null/empty → missing-identity. */
  identifier: string | null | undefined;
  limit: (identifier: string) => Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
};

export type RateLimitDecision =
  | { outcome: 'skip' }
  | { outcome: 'missing-identity' }
  | { outcome: 'unavailable' }
  | {
      outcome: 'allowed' | 'limited';
      headers: { limit: number; remaining: number; reset: number };
    };

export async function evaluateRateLimit(check: RateLimitCheck): Promise<RateLimitDecision> {
  if (!check.identifier) return { outcome: 'missing-identity' };

  if (!check.hasRemoteRedis) {
    if (check.failClosed && check.isProduction) return { outcome: 'unavailable' };
    return { outcome: 'skip' };
  }

  const { success, limit, remaining, reset } = await check.limit(check.identifier);
  return {
    outcome: success ? 'allowed' : 'limited',
    headers: { limit, remaining, reset },
  };
}
