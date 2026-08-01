/**
 * Multi-shard thread resolution (re-review Codex 2026-08-01, P1).
 *
 * Contract: each shard read resolves `null` when the shard does NOT own the
 * thread (see ZeroDriver.getThreadIfPresent — no sync side effect, never a
 * truthy empty object). The FIRST NON-NULL result wins, no matter how fast
 * the misses answer; misses and per-shard errors only count towards "absent
 * everywhere", which resolves `null`.
 */

export type ShardThreadRead<T> = {
  shardId: string;
  read: () => Promise<T | null | undefined>;
};

export async function resolveThreadAcrossShards<T>(
  shards: ShardThreadRead<T>[],
  onShardError?: (shardId: string, error: unknown) => void,
): Promise<{ result: T; shardId: string } | null> {
  if (shards.length === 0) return null;

  return await new Promise((resolve) => {
    let pending = shards.length;
    let settled = false;

    const miss = () => {
      pending -= 1;
      if (!settled && pending === 0) {
        settled = true;
        resolve(null);
      }
    };

    for (const shard of shards) {
      shard.read().then(
        (result) => {
          if (!settled && result !== null && result !== undefined) {
            settled = true;
            resolve({ result, shardId: shard.shardId });
            return;
          }
          miss();
        },
        (error) => {
          onShardError?.(shard.shardId, error);
          miss();
        },
      );
    }
  });
}
