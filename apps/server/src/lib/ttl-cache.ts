/**
 * Minimal in-memory TTL cache with an LRU-style size bound, for Worker isolate
 * and Durable Object caches. Entries expire after `ttlMs`; when `maxEntries` is
 * exceeded the least-recently-used entry is evicted (Map insertion order, with
 * recency refreshed on hit). No timers: expiry is checked lazily on access.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string, now: number = Date.now()): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency so hot keys survive eviction.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, now: number = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
