import type { ZeroEnv } from '../env';

/**
 * Structural subset of better-auth's `SecondaryStorage` (the interface lives in
 * `@better-auth/core/db`, which is not a direct dependency — keep it structural).
 */
export interface AuthSecondaryStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

/**
 * Cloudflare KV rejects `expirationTtl` below 60 seconds. Sub-minute logical
 * expiries (e.g. a session updated near its expiresAt) are clamped up; better-auth
 * validates `expiresAt` inside the stored payload, so over-retention is harmless.
 */
export const KV_MIN_TTL_SECONDS = 60;

/**
 * Real remote Redis only: Upstash REST endpoints are always https. This
 * structurally rejects `redis://`/localhost values like the ones that broke
 * staging OAuth on 2026-07-30 — a misconfigured local URL degrades to the next
 * backend instead of taking Better Auth down.
 */
export const hasRemoteRedis = (env: Pick<ZeroEnv, 'REDIS_URL' | 'REDIS_TOKEN'>): boolean =>
  Boolean(env.REDIS_URL?.startsWith('https://') && env.REDIS_TOKEN);

export type SecondaryStorageKind = 'kv' | 'redis';

export interface SecondaryStorageSelection {
  kind: SecondaryStorageKind;
  storage: AuthSecondaryStorage;
}

export const createKvSecondaryStorage = (kv: KVNamespace): AuthSecondaryStorage => ({
  get: (key) => kv.get(key),
  set: async (key, value, ttl) => {
    await kv.put(key, value, ttl ? { expirationTtl: Math.max(ttl, KV_MIN_TTL_SECONDS) } : {});
  },
  delete: (key) => kv.delete(key),
});

/** Subset of `@upstash/redis` used here, injectable for tests. */
export interface RedisStringCommands {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string, opts?: { ex: number }) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

export const createRedisSecondaryStorage = (redis: RedisStringCommands): AuthSecondaryStorage => ({
  get: async (key) => {
    const value = await redis.get(key);
    return typeof value === 'string' ? value : value ? JSON.stringify(value) : null;
  },
  set: async (key, value, ttl) => {
    if (ttl) await redis.set(key, value, { ex: ttl });
    else await redis.set(key, value);
  },
  delete: async (key) => {
    await redis.del(key);
  },
});

/**
 * Backend priority: dedicated AUTH_CACHE KV binding, else real remote Redis,
 * else none (better-auth runs on Postgres alone). `makeRedis` is lazy so the
 * Redis client is only constructed when it is actually selected.
 */
export const selectSecondaryStorage = (
  env: Pick<ZeroEnv, 'REDIS_URL' | 'REDIS_TOKEN' | 'AUTH_CACHE'>,
  makeRedis: () => RedisStringCommands,
): SecondaryStorageSelection | null => {
  if (env.AUTH_CACHE) return { kind: 'kv', storage: createKvSecondaryStorage(env.AUTH_CACHE) };
  if (hasRemoteRedis(env))
    return { kind: 'redis', storage: createRedisSecondaryStorage(makeRedis()) };
  return null;
};
