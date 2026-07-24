import { describe, it, expect } from 'vitest';
import { TtlCache } from './ttl-cache';

/**
 * Unit proof of the shared TTL cache used by the listThreads isolate cache
 * (server-utils), the sendDoState throttle, and the R2 thread-body cache
 * (projection): expiry, LRU eviction bound, and explicit invalidation.
 * `now` is injected so the tests stay deterministic.
 */
describe('TtlCache', () => {
  it('returns a stored value before the TTL elapses', () => {
    const cache = new TtlCache<string>(5_000, 10);
    cache.set('k', 'v', 1_000);
    expect(cache.get('k', 5_999)).toBe('v');
  });

  it('expires entries at the TTL boundary', () => {
    const cache = new TtlCache<string>(5_000, 10);
    cache.set('k', 'v', 1_000);
    expect(cache.get('k', 6_000)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least-recently-used entry beyond maxEntries', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    // Touch 'a' so 'b' becomes the oldest.
    cache.get('a', 1);
    cache.set('c', 3, 2);

    expect(cache.get('b', 3)).toBeUndefined();
    expect(cache.get('a', 3)).toBe(1);
    expect(cache.get('c', 3)).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('overwrites an existing key without growing the map', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1, 0);
    cache.set('a', 2, 0);
    expect(cache.size).toBe(1);
    expect(cache.get('a', 1)).toBe(2);
  });

  it('delete() invalidates a fresh entry immediately', () => {
    const cache = new TtlCache<string>(60_000, 10);
    cache.set('k', 'v', 0);
    cache.delete('k');
    expect(cache.get('k', 1)).toBeUndefined();
  });

  it('does not refresh expiry on read (fixed TTL from write)', () => {
    const cache = new TtlCache<string>(5_000, 10);
    cache.set('k', 'v', 1_000);
    cache.get('k', 5_999);
    expect(cache.get('k', 6_000)).toBeUndefined();
  });
});
