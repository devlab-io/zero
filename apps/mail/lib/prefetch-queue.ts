// Devlab: bounded-concurrency drain used by the thread-body prefetcher
// (hooks/use-thread-prefetch.ts). Pure so the scheduling contract — never more than
// `concurrency` fetches in flight, stop promptly once cancelled — is unit-tested.
export async function drainPrefetchQueue(
  ids: readonly string[],
  prefetchOne: (id: string) => Promise<unknown>,
  concurrency: number,
  isCancelled: () => boolean,
): Promise<number> {
  const queue = [...ids];
  let started = 0;

  const worker = async () => {
    while (queue.length > 0 && !isCancelled()) {
      const id = queue.shift();
      if (id === undefined) return;
      started += 1;
      await prefetchOne(id);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return started;
}
