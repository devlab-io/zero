import { consumeSlidingWindow, evaluateRateLimit } from './rate-limit';
import { describe, expect, it, vi } from 'vitest';

const limitOk = vi.fn(async () => ({ success: true, limit: 20, remaining: 19, reset: 1 }));
const limitHit = vi.fn(async () => ({ success: false, limit: 20, remaining: 0, reset: 1 }));

describe('evaluateRateLimit — strict identity', () => {
  it('a missing identifier is an identity error, never a shared bucket', async () => {
    for (const identifier of [null, undefined, '']) {
      expect(
        await evaluateRateLimit({
          hasRemoteRedis: true,
          isProduction: true,
          failClosed: true,
          identifier,
          limit: limitOk,
        }),
      ).toEqual({ outcome: 'missing-identity' });
    }
    expect(limitOk).not.toHaveBeenCalled();
  });
});

describe('evaluateRateLimit — fail-closed without Redis', () => {
  it('PRODUCTION without remote Redis DENIES a fail-closed surface', async () => {
    expect(
      await evaluateRateLimit({
        hasRemoteRedis: false,
        isProduction: true,
        failClosed: true,
        identifier: 'user-1',
        limit: limitOk,
      }),
    ).toEqual({ outcome: 'unavailable' });
  });

  it('non-production without Redis keeps the historical no-op (local dev)', async () => {
    expect(
      await evaluateRateLimit({
        hasRemoteRedis: false,
        isProduction: false,
        failClosed: true,
        identifier: 'user-1',
        limit: limitOk,
      }),
    ).toEqual({ outcome: 'skip' });
  });

  it('fail-open surfaces skip without Redis even in production (historical default)', async () => {
    expect(
      await evaluateRateLimit({
        hasRemoteRedis: false,
        isProduction: true,
        failClosed: false,
        identifier: 'user-1',
        limit: limitOk,
      }),
    ).toEqual({ outcome: 'skip' });
  });
});

describe('evaluateRateLimit — with Redis', () => {
  it('allows under the limit and exposes headers', async () => {
    const decision = await evaluateRateLimit({
      hasRemoteRedis: true,
      isProduction: true,
      failClosed: true,
      identifier: 'user-1',
      limit: limitOk,
    });
    expect(decision).toEqual({
      outcome: 'allowed',
      headers: { limit: 20, remaining: 19, reset: 1 },
    });
    expect(limitOk).toHaveBeenCalledWith('user-1');
  });

  it('limits over the limit', async () => {
    const decision = await evaluateRateLimit({
      hasRemoteRedis: true,
      isProduction: false,
      failClosed: false,
      identifier: 'user-1',
      limit: limitHit,
    });
    expect(decision.outcome).toBe('limited');
  });
});

describe('evaluateRateLimit — durable per-user fallback (prod fix 2026-08-01)', () => {
  const primaryLimit = vi.fn(async () => ({ success: true, limit: 20, remaining: 19, reset: 1 }));
  const base = {
    hasRemoteRedis: false,
    isProduction: true,
    failClosed: true,
    identifier: 'user-1',
    limit: primaryLimit,
  };
  const fallbackAllowed = { allowed: true, limit: 20, remaining: 19, reset: 42 };

  it('no remote Redis in prod + fallback ALLOWED → allowed with the fallback headers', async () => {
    primaryLimit.mockClear();
    const durableFallback = vi.fn(async () => fallbackAllowed);
    expect(await evaluateRateLimit({ ...base, durableFallback })).toEqual({
      outcome: 'allowed',
      headers: { limit: 20, remaining: 19, reset: 42 },
    });
    // The Upstash primary was never touched: no Redis is configured.
    expect(primaryLimit).not.toHaveBeenCalled();
  });

  it('fallback DENIES the 21st call → limited (429 at the surface)', async () => {
    const durableFallback = vi.fn(async () => ({
      allowed: false,
      limit: 20,
      remaining: 0,
      reset: 99,
    }));
    expect(await evaluateRateLimit({ ...base, durableFallback })).toEqual({
      outcome: 'limited',
      headers: { limit: 20, remaining: 0, reset: 99 },
    });
  });

  it('fallback FAILURE stays fail-closed (unavailable), never fail-open', async () => {
    const durableFallback = vi.fn(async () => {
      throw new Error('DO unreachable');
    });
    expect(await evaluateRateLimit({ ...base, durableFallback })).toEqual({
      outcome: 'unavailable',
    });
  });

  it('without a fallback the historical fail-closed denial is unchanged', async () => {
    expect(await evaluateRateLimit(base)).toEqual({ outcome: 'unavailable' });
  });

  it('remote Redis stays PRIMARY: the fallback is never consulted when Redis exists', async () => {
    const durableFallback = vi.fn(async () => fallbackAllowed);
    const decision = await evaluateRateLimit({
      ...base,
      hasRemoteRedis: true,
      durableFallback,
    });
    expect(decision.outcome).toBe('allowed');
    expect(durableFallback).not.toHaveBeenCalled();
  });

  it('non-production without Redis keeps the historical skip — fallback untouched', async () => {
    const durableFallback = vi.fn(async () => fallbackAllowed);
    expect(await evaluateRateLimit({ ...base, isProduction: false, durableFallback })).toEqual({
      outcome: 'skip',
    });
    expect(durableFallback).not.toHaveBeenCalled();
  });
});

describe('consumeSlidingWindow — exact 20/5min bucket, pure', () => {
  const WINDOW = 5 * 60 * 1000;
  const NOW = 1_000_000_000;

  it('counts up to the limit, then denies with the oldest-timestamp reset', () => {
    let stored: readonly number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const result = consumeSlidingWindow(stored, NOW + i, 20, WINDOW);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(20 - (i + 1));
      stored = result.timestamps;
    }
    const denied = consumeSlidingWindow(stored, NOW + 20, 20, WINDOW);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.reset).toBe(NOW + WINDOW); // oldest call leaves the window
    expect(denied.timestamps).toHaveLength(20); // nothing consumed on denial
  });

  it('purges expired timestamps — a full bucket frees up after the window', () => {
    const exhausted = Array.from({ length: 20 }, (_, i) => NOW + i);
    const later = consumeSlidingWindow(exhausted, NOW + WINDOW + 20, 20, WINDOW);
    expect(later.allowed).toBe(true);
    // Every expired entry was purged; only the fresh grant remains.
    expect(later.timestamps).toEqual([NOW + WINDOW + 20]);
    expect(later.remaining).toBe(19);
  });

  it('a PARTIALLY expired window frees exactly the expired slots', () => {
    const half = [
      ...Array.from({ length: 10 }, (_, i) => NOW - WINDOW + i), // expired at NOW+10
      ...Array.from({ length: 10 }, (_, i) => NOW + i), // still live
    ];
    const result = consumeSlidingWindow(half, NOW + 10, 20, WINDOW);
    expect(result.allowed).toBe(true);
    expect(result.timestamps).toHaveLength(11); // 10 live + the new grant
  });
});
