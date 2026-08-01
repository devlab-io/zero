/**
 * Multi-shard thread resolution (re-reviews Codex 2026-08-01, P1/P2).
 *
 * Contract: each shard read resolves `null` when the shard does NOT own the
 * thread (see ZeroDriver.getThreadIfPresent — no sync side effect, never a
 * truthy empty object). The FIRST NON-NULL result wins, no matter how fast
 * the misses answer. `null` (absent) is returned ONLY when EVERY shard
 * answered null; if nothing was found and at least one shard ERRORED, the
 * thread may live on that shard — the resolution is UNAVAILABLE and an
 * AggregateError propagates instead of a silent false "not found".
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

  return await new Promise((resolve, reject) => {
    let pending = shards.length;
    let settled = false;
    const errors: unknown[] = [];

    const settleIfDone = () => {
      if (settled || pending > 0) return;
      settled = true;
      if (errors.length > 0) {
        reject(
          new AggregateError(
            errors,
            `thread resolution unavailable: ${errors.length} shard(s) failed and none owned the thread`,
          ),
        );
        return;
      }
      resolve(null);
    };

    for (const shard of shards) {
      shard.read().then(
        (result) => {
          pending -= 1;
          if (!settled && result !== null && result !== undefined) {
            settled = true;
            resolve({ result, shardId: shard.shardId });
            return;
          }
          settleIfDone();
        },
        (error) => {
          pending -= 1;
          onShardError?.(shard.shardId, error);
          errors.push(error);
          settleIfDone();
        },
      );
    }
  });
}
