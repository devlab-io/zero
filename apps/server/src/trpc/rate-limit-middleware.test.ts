import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * VRAI middleware (revue Codex 2026-08-01) : on importe createRateLimiterMiddleware
 * depuis trpc.ts et on exécute la fonction middleware réellement enregistrée —
 * pas une réimplémentation. Seules les frontières lourdes (env workers, redis,
 * server-utils, conninfo) sont des fakes.
 */

const harness = vi.hoisted(() => ({
  env: { NODE_ENV: 'production' } as Record<string, unknown>,
  limit: vi.fn(async () => ({ success: true, limit: 20, remaining: 19, reset: 1 })),
}));

vi.mock('cloudflare:workers', () => ({ env: harness.env }));
vi.mock('../lib/server-utils', () => ({
  getActiveConnection: vi.fn(),
  getZeroDB: vi.fn(),
}));
vi.mock('../lib/services', () => ({ redis: () => ({}) }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    class {
      limit = harness.limit;
    },
    { slidingWindow: () => 'sliding-window-config' },
  ),
}));
vi.mock('hono/cloudflare-workers', () => ({
  getConnInfo: () => ({ remote: { address: '203.0.113.7' } }),
}));

import { createRateLimiterMiddleware } from './trpc';
import { Ratelimit } from '@upstash/ratelimit';

type MiddlewareFn = (opts: {
  next: () => Promise<unknown>;
  ctx: unknown;
  input: unknown;
}) => Promise<unknown>;

/** tRPC v11 middleware builders carry the real fn in `_middlewares`. */
const middlewareFn = (built: unknown): MiddlewareFn => {
  const candidate =
    (built as { _middlewares?: MiddlewareFn[] })._middlewares?.[0] ?? (built as MiddlewareFn);
  expect(typeof candidate).toBe('function');
  return candidate;
};

const makeCtx = (sessionUserId?: string) => ({
  sessionUser: sessionUserId ? { id: sessionUserId, name: 'T', email: 't@x.test' } : undefined,
  c: { res: { headers: { append: vi.fn() } } },
});

const buildAsk = () =>
  middlewareFn(
    createRateLimiterMiddleware({
      limiter: Ratelimit.slidingWindow(20, '5 m'),
      generatePrefix: () => 'ratelimit:copilot-ask',
      key: 'userId',
      failClosed: true,
    }),
  );

beforeEach(() => {
  harness.limit.mockClear();
  harness.env.NODE_ENV = 'production';
  delete harness.env.REDIS_URL;
  delete harness.env.REDIS_TOKEN;
});

describe('createRateLimiterMiddleware — real middleware, copilot configuration', () => {
  it('fail-closed: production WITHOUT remote Redis denies with SERVICE_UNAVAILABLE (HTTP 503, never 412)', async () => {
    const next = vi.fn(async () => 'result');
    await expect(buildAsk()({ next, ctx: makeCtx('user-1'), input: {} })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Rate limiting unavailable. Please try again later.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('prod sans Redis AVEC durableFallback : le DO autorise → next() ; refuse → TOO_MANY_REQUESTS ; panne → SERVICE_UNAVAILABLE', async () => {
    const consume = vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, reset: 1 }));
    const withFallback = () =>
      middlewareFn(
        createRateLimiterMiddleware({
          limiter: Ratelimit.slidingWindow(20, '5 m'),
          generatePrefix: () => 'ratelimit:copilot-ask',
          key: 'userId',
          failClosed: true,
          durableFallback: async () => consume(),
        }),
      );

    const next = vi.fn(async () => 'result');
    await expect(withFallback()({ next, ctx: makeCtx('user-1'), input: {} })).resolves.toBe(
      'result',
    );
    expect(consume).toHaveBeenCalledTimes(1);
    expect(harness.limit).not.toHaveBeenCalled(); // pas de Redis → pas d'Upstash

    consume.mockResolvedValueOnce({ allowed: false, limit: 20, remaining: 0, reset: 9 });
    await expect(
      withFallback()({ next: vi.fn(async () => 'x'), ctx: makeCtx('user-1'), input: {} }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

    consume.mockRejectedValueOnce(new Error('DO unreachable'));
    await expect(
      withFallback()({ next: vi.fn(async () => 'x'), ctx: makeCtx('user-1'), input: {} }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('Redis distant présent : Upstash reste PRIMAIRE, le fallback DO est ignoré', async () => {
    harness.env.REDIS_URL = 'https://upstash.example.com';
    harness.env.REDIS_TOKEN = 'token';
    const consume = vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, reset: 1 }));
    const built = middlewareFn(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(20, '5 m'),
        generatePrefix: () => 'ratelimit:copilot-ask',
        key: 'userId',
        failClosed: true,
        durableFallback: async () => consume(),
      }),
    );
    const next = vi.fn(async () => 'result');
    await expect(built({ next, ctx: makeCtx('user-1'), input: {} })).resolves.toBe('result');
    expect(harness.limit).toHaveBeenCalledTimes(1);
    expect(consume).not.toHaveBeenCalled();
  });

  it('strict userId key: a missing session user is UNAUTHORIZED, never a shared bucket', async () => {
    harness.env.REDIS_URL = 'https://real-redis.upstash.io';
    harness.env.REDIS_TOKEN = 'token';
    const next = vi.fn(async () => 'result');
    await expect(buildAsk()({ next, ctx: makeCtx(undefined), input: {} })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(harness.limit).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('limits on the USER id — not on the IP', async () => {
    harness.env.REDIS_URL = 'https://real-redis.upstash.io';
    harness.env.REDIS_TOKEN = 'token';
    const next = vi.fn(async () => 'result');
    await buildAsk()({ next, ctx: makeCtx('user-42'), input: {} });
    expect(harness.limit).toHaveBeenCalledWith('user-42');
    expect(harness.limit).not.toHaveBeenCalledWith('203.0.113.7');
    expect(next).toHaveBeenCalled();
  });

  it('throws TOO_MANY_REQUESTS when the limiter says no', async () => {
    harness.env.REDIS_URL = 'https://real-redis.upstash.io';
    harness.env.REDIS_TOKEN = 'token';
    harness.limit.mockResolvedValueOnce({ success: false, limit: 20, remaining: 0, reset: 9 });
    const next = vi.fn(async () => 'result');
    await expect(buildAsk()({ next, ctx: makeCtx('user-1'), input: {} })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('non-production without Redis keeps the historical no-op', async () => {
    harness.env.NODE_ENV = 'local';
    const next = vi.fn(async () => 'result');
    await expect(buildAsk()({ next, ctx: makeCtx('user-1'), input: {} })).resolves.toBe('result');
    expect(harness.limit).not.toHaveBeenCalled();
  });
});
