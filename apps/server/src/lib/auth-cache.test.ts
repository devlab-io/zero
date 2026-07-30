import {
  KV_MIN_TTL_SECONDS,
  createKvSecondaryStorage,
  createRedisSecondaryStorage,
  hasRemoteRedis,
  selectSecondaryStorage,
  type RedisStringCommands,
} from './auth-cache';
import { describe, it, expect, vi } from 'vitest';

/**
 * Unit proof of the better-auth secondary-storage cascade: dedicated AUTH_CACHE
 * KV first, real remote Redis second, nothing (Postgres alone) last — plus the
 * two adapter contracts (KV TTL floor, Upstash stringification). The remote-only
 * Redis predicate is the regression test for the 2026-07-30 staging incident,
 * where localhost REDIS_URL/TOKEN secrets took Better Auth down.
 */

const makeKvMock = () => {
  const kv = {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
  return { kv, asNamespace: kv as unknown as KVNamespace };
};

const makeRedisMock = (getValue: unknown = null) => {
  const redis = {
    get: vi.fn(async () => getValue),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  };
  return redis satisfies RedisStringCommands;
};

describe('hasRemoteRedis', () => {
  it('accepts an https REST URL with a token', () => {
    expect(
      hasRemoteRedis({ REDIS_URL: 'https://eu1-example.upstash.io', REDIS_TOKEN: 'tok' }),
    ).toBe(true);
  });

  it('rejects localhost-style URLs (staging incident 2026-07-30)', () => {
    expect(hasRemoteRedis({ REDIS_URL: 'http://localhost:6379', REDIS_TOKEN: 'tok' })).toBe(false);
    expect(hasRemoteRedis({ REDIS_URL: 'redis://127.0.0.1:6379', REDIS_TOKEN: 'tok' })).toBe(false);
  });

  it('rejects missing URL or token', () => {
    expect(hasRemoteRedis({ REDIS_URL: '', REDIS_TOKEN: 'tok' })).toBe(false);
    expect(hasRemoteRedis({ REDIS_URL: 'https://eu1-example.upstash.io', REDIS_TOKEN: '' })).toBe(
      false,
    );
  });
});

describe('selectSecondaryStorage', () => {
  it('prefers the AUTH_CACHE KV binding and never constructs the Redis client', () => {
    const { asNamespace } = makeKvMock();
    const makeRedis = vi.fn(() => makeRedisMock());
    const selection = selectSecondaryStorage(
      { AUTH_CACHE: asNamespace, REDIS_URL: 'https://eu1-example.upstash.io', REDIS_TOKEN: 'tok' },
      makeRedis,
    );
    expect(selection?.kind).toBe('kv');
    expect(makeRedis).not.toHaveBeenCalled();
  });

  it('falls back to Redis when only remote credentials are configured', () => {
    const selection = selectSecondaryStorage(
      { AUTH_CACHE: undefined, REDIS_URL: 'https://eu1-example.upstash.io', REDIS_TOKEN: 'tok' },
      () => makeRedisMock(),
    );
    expect(selection?.kind).toBe('redis');
  });

  it('returns null with neither backend (Postgres alone)', () => {
    const selection = selectSecondaryStorage(
      { AUTH_CACHE: undefined, REDIS_URL: '', REDIS_TOKEN: '' },
      () => makeRedisMock(),
    );
    expect(selection).toBeNull();
  });

  it('returns null when only local Redis values are present', () => {
    const selection = selectSecondaryStorage(
      { AUTH_CACHE: undefined, REDIS_URL: 'http://localhost:6379', REDIS_TOKEN: 'tok' },
      () => makeRedisMock(),
    );
    expect(selection).toBeNull();
  });
});

describe('createKvSecondaryStorage', () => {
  it('clamps sub-minute TTLs to the Cloudflare KV floor', async () => {
    const { kv, asNamespace } = makeKvMock();
    await createKvSecondaryStorage(asNamespace).set('k', 'v', 30);
    expect(kv.put).toHaveBeenCalledWith('k', 'v', { expirationTtl: KV_MIN_TTL_SECONDS });
  });

  it('passes through TTLs at or above the floor', async () => {
    const { kv, asNamespace } = makeKvMock();
    await createKvSecondaryStorage(asNamespace).set('k', 'v', 3600);
    expect(kv.put).toHaveBeenCalledWith('k', 'v', { expirationTtl: 3600 });
  });

  it('writes without expiration when no TTL is given', async () => {
    const { kv, asNamespace } = makeKvMock();
    await createKvSecondaryStorage(asNamespace).set('k', 'v');
    expect(kv.put).toHaveBeenCalledWith('k', 'v', {});
  });

  it('delegates get and delete to the namespace', async () => {
    const { kv, asNamespace } = makeKvMock();
    const storage = createKvSecondaryStorage(asNamespace);
    await storage.get('k');
    await storage.delete('k');
    expect(kv.get).toHaveBeenCalledWith('k');
    expect(kv.delete).toHaveBeenCalledWith('k');
  });
});

describe('createRedisSecondaryStorage', () => {
  it('returns strings as-is and null when absent', async () => {
    expect(await createRedisSecondaryStorage(makeRedisMock('raw')).get('k')).toBe('raw');
    expect(await createRedisSecondaryStorage(makeRedisMock(null)).get('k')).toBeNull();
  });

  it('re-stringifies values Upstash auto-deserialized', async () => {
    expect(await createRedisSecondaryStorage(makeRedisMock({ a: 1 })).get('k')).toBe('{"a":1}');
  });

  it('sets with and without TTL using Upstash options', async () => {
    const redis = makeRedisMock();
    const storage = createRedisSecondaryStorage(redis);
    await storage.set('k', 'v', 120);
    expect(redis.set).toHaveBeenCalledWith('k', 'v', { ex: 120 });
    await storage.set('k', 'v');
    expect(redis.set).toHaveBeenLastCalledWith('k', 'v');
  });

  it('delegates delete to del', async () => {
    const redis = makeRedisMock();
    await createRedisSecondaryStorage(redis).delete('k');
    expect(redis.del).toHaveBeenCalledWith('k');
  });
});
