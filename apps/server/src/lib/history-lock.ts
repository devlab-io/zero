/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// lib/history-lock.ts — pure decision logic behind the Gmail history-notification
// idempotency lock in pipelines.ts's `runZeroWorkflow` (pitbull, axe Robustesse: "le
// verrou d'idempotence du webhook Gmail est mort"). The previous guard checked
// `(await env.gmail_processing_threads.put(key, 'true', {...})) !== null` — but
// KVNamespace.put() is typed `Promise<void>` and always resolves to `undefined`, on a
// first write AND on an overwrite of an existing key (KV has no compare-and-set). So
// `response !== null` was `undefined !== null`, i.e. `true`, on every single call: the
// lock was reported "acquired" unconditionally and never once blocked a redelivery. On
// top of that, the key was deleted at the end of a *successful* run, so even a
// hypothetically-working lock would not have survived a post-success redelivery.
//
// The fix moves the lock (and the "last processed historyId" cursor, previously a
// second KV key updated non-atomically with the lock) into the ShardRegistry Durable
// Object's transactional SQL storage — see routes/agent/shard-registry.ts. That DO is
// keyed 1:1 per connection (`connection:{connectionId}:registry`) and, unlike
// ZeroDriver, never shards/rolls over, so it is the correct grain for "one Gmail
// notification stream, one lock". Storage operations against a single DO instance are
// serialized by the runtime, giving the atomic read-then-write a KV check-then-put can
// never provide.
//
// This module holds only the pure decision — given what's currently stored for a
// notification's historyId, do we claim it or skip it, and why — so it can be unit
// tested without a DurableObjectState/SqlStorage double, the same way trpc-guards.ts
// extracts the tRPC gate bodies out of their AsyncLocalStorage-bound procedures.

export type HistoryLockRecord =
  | { status: 'processing'; claimedAt: number }
  | { status: 'done'; completedAt: number };

export type HistoryLockReason =
  | 'first-arrival'
  | 'concurrent'
  | 'stale-processing-reclaimed'
  | 'post-success-window'
  | 'post-success-window-expired';

export type HistoryLockDecision =
  | {
      action: 'claim';
      reason: 'first-arrival' | 'stale-processing-reclaimed' | 'post-success-window-expired';
    }
  | { action: 'skip'; reason: 'concurrent' | 'post-success-window' };

/**
 * Flat shape of `HistoryLockDecision` for crossing a Durable Object RPC boundary.
 * Cloudflare's RPC stub typing wraps each property of a returned object in its own
 * thenable, which fails to unify with a discriminated union of two differently-shaped
 * objects (TS2769 across `action`/`reason`'s field sets). A single object with a
 * string-literal union per field carries the exact same information and type-checks
 * cleanly through `DurableObjectStub` — see `ShardRegistry.claimHistoryNotification`.
 */
export type HistoryLockRpcResult = {
  action: HistoryLockDecision['action'];
  reason: HistoryLockDecision['reason'];
};

/**
 * A run left in `processing` past this age is presumed crashed — the worker was
 * evicted, or threw somewhere that bypassed the release path — and is safe to
 * reclaim rather than block the connection's sync forever. Matches the original KV
 * lock's `expirationTtl: 3600`.
 */
export const PROCESSING_STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * A completed run's mark must outlive Gmail/Pub/Sub's redelivery window: a
 * redelivery that arrives *after* a successful run has to be ignored, not replayed
 * against the mailbox a second time. 24h is deliberately generous — Pub/Sub does not
 * document a hard redelivery ceiling, and the failure mode of skipping one truly-new
 * notification that reuses a stale historyId is far cheaper than replaying history.
 */
export const DONE_MARK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Decide what to do with a Gmail history notification given whatever lock record is
 * currently stored for its historyId (undefined if this is the first time we've ever
 * seen it).
 *
 * - No record                                   -> claim (first arrival).
 * - `processing`, claimed recently               -> skip (a concurrent attempt owns it).
 * - `processing`, claimed long ago (stale/crash)  -> claim (reclaim it).
 * - `done`, completed recently                    -> skip (post-success redelivery).
 * - `done`, completed long ago                    -> claim (past the retention window).
 */
export function decideHistoryLockAction(
  existing: HistoryLockRecord | undefined,
  now: number,
): HistoryLockDecision {
  if (!existing) {
    return { action: 'claim', reason: 'first-arrival' };
  }

  if (existing.status === 'processing') {
    const age = now - existing.claimedAt;
    if (age < PROCESSING_STALE_AFTER_MS) {
      return { action: 'skip', reason: 'concurrent' };
    }
    return { action: 'claim', reason: 'stale-processing-reclaimed' };
  }

  const age = now - existing.completedAt;
  if (age < DONE_MARK_TTL_MS) {
    return { action: 'skip', reason: 'post-success-window' };
  }
  return { action: 'claim', reason: 'post-success-window-expired' };
}
