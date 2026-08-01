/**
 * Ask Reta cancellation CONTRACT (review 02-cancel-contract) — the honest one:
 *
 * - The transport and the pipeline are interrupted immediately: no further
 *   step, no further dependency call, and any late result is DISCARDED.
 * - A provider/DO operation ALREADY DISPATCHED may keep running on the
 *   Cloudflare side when its API has no abort contract (env.AI.run ignores
 *   signals; DO RPC helpers have none). We never claim that call is killed.
 * - Providers whose API is abortable (fetch-based BYOK) get 'native' abort by
 *   passing the signal through; Workers AI is 'cooperative': signal checked
 *   before dispatch and after await, nothing more is possible.
 */

export class AskRetaAbortedError extends Error {
  constructor(reason: 'aborted' | 'deadline' = 'aborted') {
    super(reason === 'deadline' ? 'Ask Reta deadline exceeded' : 'Ask Reta request aborted');
    this.name = 'AskRetaAbortedError';
  }
}

/**
 * Cooperative discipline for a NON-abortable dependency (DO RPC, Workers AI):
 * refuse to dispatch after abort, and discard a late result after abort. The
 * underlying call, once dispatched, is NOT cancelled — only ignored.
 */
export async function guardWithSignal<T>(
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (signal?.aborted) throw new AskRetaAbortedError('aborted');
  const value = await run();
  if (signal?.aborted) throw new AskRetaAbortedError('aborted');
  return value;
}
