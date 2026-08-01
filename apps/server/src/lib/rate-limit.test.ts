import { describe, expect, it, vi } from 'vitest';
import { evaluateRateLimit } from './rate-limit';

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
