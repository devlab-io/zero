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
  /**
   * Durable per-user fallback (prod fix 2026-08-01): consulted ONLY when no
   * remote Redis exists AND the surface is fail-closed in production —
   * exactly the case that used to 503 unconditionally. Upstash stays PRIMARY
   * whenever configured; a fallback failure stays fail-closed (unavailable).
   * The callback must be structurally scoped (per-user DO) — it receives no
   * identifier.
   */
  durableFallback?: () => Promise<{
    allowed: boolean;
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
    if (check.failClosed && check.isProduction) {
      if (!check.durableFallback) return { outcome: 'unavailable' };
      try {
        const { allowed, limit, remaining, reset } = await check.durableFallback();
        return { outcome: allowed ? 'allowed' : 'limited', headers: { limit, remaining, reset } };
      } catch {
        // The durable fallback itself failed: NEVER fail open.
        return { outcome: 'unavailable' };
      }
    }
    return { outcome: 'skip' };
  }

  const { success, limit, remaining, reset } = await check.limit(check.identifier);
  return {
    outcome: success ? 'allowed' : 'limited',
    headers: { limit, remaining, reset },
  };
}

export type SlidingWindowResult = {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the oldest counted call leaves the window. */
  reset: number;
  /** Timestamps to persist back (expired entries purged; grant appended). */
  timestamps: number[];
};

/**
 * Exact sliding window over persisted timestamps (pure — the ZeroDB Durable
 * Object wraps it in a storage transaction). No PII: timestamps only.
 */
export function consumeSlidingWindow(
  stored: readonly number[],
  now: number,
  limit: number,
  windowMs: number,
): SlidingWindowResult {
  const live = stored.filter((t) => t > now - windowMs);
  if (live.length >= limit) {
    return { allowed: false, remaining: 0, reset: Math.min(...live) + windowMs, timestamps: live };
  }
  const timestamps = [...live, now];
  return {
    allowed: true,
    remaining: limit - timestamps.length,
    reset: (timestamps[0] ?? now) + windowMs,
    timestamps,
  };
}
