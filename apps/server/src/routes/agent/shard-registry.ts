/*
 * Licensed to Zero Email Inc. under one or more contributor license agreements.
 * You may not use this file except in compliance with the Apache License, Version 2.0 (the "License").
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Reuse or distribution of this file requires a license from Zero Email Inc.
 */

import {
  decideHistoryLockAction,
  DONE_MARK_TTL_MS,
  type HistoryLockRecord,
  type HistoryLockRpcResult,
} from '../../lib/history-lock';
import { DurableObject } from 'cloudflare:workers';
import { Migratable, Queryable } from 'dormroom';
import { type ZeroEnv } from '../../env';

@Migratable({
  migrations: {
    1: [
      `CREATE TABLE IF NOT EXISTS shards (
      shard_id TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    ],
    // pitbull (axe Robustesse) — "le verrou d'idempotence du webhook Gmail est mort" :
    // le verrou KV précédent (gmail_processing_threads, pipelines.ts) acquérait
    // toujours (`response !== null` valait `undefined !== null` = true sur CHAQUE
    // appel) et effaçait la marque à la fin d'un run réussi, donc une redélivrance
    // post-succès rejouait tout l'historique. Ces deux tables portent désormais le
    // verrou ET le curseur historyId traité dans ce DO : une instance par connexion
    // (`connection:{connectionId}:registry`), jamais shardée/recréée comme ZeroDriver,
    // storage SQL transactionnel — le bon grain pour "un flux de notifications Gmail,
    // un verrou". Voir lib/history-lock.ts pour la décision pure claim/skip.
    2: [
      `CREATE TABLE IF NOT EXISTS history_notification_locks (
      notification_history_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      claimed_at INTEGER,
      completed_at INTEGER
    )`,
      `CREATE TABLE IF NOT EXISTS gmail_sync_cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_processed_history_id TEXT
    )`,
    ],
  },
})
@Queryable()
export class ShardRegistry extends DurableObject<ZeroEnv> {
  sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: ZeroEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  /**
   * Claim a Gmail history notification for processing, or report why it must be
   * skipped. `notificationHistoryId` is the historyId Gmail attaches to *this specific*
   * Pub/Sub notification (the `nextHistoryId` in pipelines.ts) — the one value every
   * redelivery attempt of the same notification carries identically, unlike the
   * previous KV key which was keyed off the mutable "start of range" cursor.
   *
   * Reads then writes this DO instance's own SQL storage with no intervening await on
   * anything else, so no other invocation of this same DO can interleave between the
   * check and the write — the atomicity KV's eventually-consistent, no-compare-and-set
   * `get`/`put` pair could never provide.
   */
  async claimHistoryNotification(
    notificationHistoryId: string,
    now: number,
  ): Promise<HistoryLockRpcResult> {
    // Lazily prune expired 'done' marks so this table doesn't grow unbounded over the
    // life of a connection; cheap relative to the row it's about to read/write.
    this.sql.exec(
      `DELETE FROM history_notification_locks WHERE status = 'done' AND completed_at < ?`,
      now - DONE_MARK_TTL_MS,
    );

    const row = this.sql
      .exec<{
        status: string;
        claimed_at: number | null;
        completed_at: number | null;
      }>(`SELECT status, claimed_at, completed_at FROM history_notification_locks WHERE notification_history_id = ?`, notificationHistoryId)
      .toArray()[0];

    const existing: HistoryLockRecord | undefined = !row
      ? undefined
      : row.status === 'processing'
        ? { status: 'processing', claimedAt: row.claimed_at ?? 0 }
        : { status: 'done', completedAt: row.completed_at ?? 0 };

    const decision = decideHistoryLockAction(existing, now);

    if (decision.action === 'claim') {
      this.sql.exec(
        `INSERT INTO history_notification_locks (notification_history_id, status, claimed_at, completed_at)
         VALUES (?, 'processing', ?, NULL)
         ON CONFLICT(notification_history_id) DO UPDATE SET status = 'processing', claimed_at = excluded.claimed_at, completed_at = NULL`,
        notificationHistoryId,
        now,
      );
    }

    return { action: decision.action, reason: decision.reason };
  }

  /**
   * Mark a notification as successfully processed (the mark is kept, not deleted — it
   * must survive a post-success redelivery for `DONE_MARK_TTL_MS`) and advance the
   * "last processed historyId" cursor in the same DO storage, atomically with the
   * lock. Previously this cursor lived in a separate KV key
   * (`gmail_history_id`) written mid-workflow, before processing had actually
   * finished — a crash between that write and completion would silently skip the
   * unprocessed history on the next run. Advancing it here, only on confirmed success,
   * closes that gap too.
   */
  async completeHistoryNotification(
    notificationHistoryId: string,
    lastProcessedHistoryId: string,
    now: number,
  ): Promise<void> {
    this.sql.exec(
      `INSERT INTO history_notification_locks (notification_history_id, status, claimed_at, completed_at)
       VALUES (?, 'done', NULL, ?)
       ON CONFLICT(notification_history_id) DO UPDATE SET status = 'done', completed_at = excluded.completed_at, claimed_at = NULL`,
      notificationHistoryId,
      now,
    );
    this.sql.exec(
      `INSERT INTO gmail_sync_cursor (id, last_processed_history_id) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET last_processed_history_id = excluded.last_processed_history_id`,
      lastProcessedHistoryId,
    );
  }

  /**
   * Release a claimed notification after a failed run so a genuine retry (queue
   * `msg.retry()`, or a fresh Pub/Sub redelivery) is not forced to wait out
   * `PROCESSING_STALE_AFTER_MS` before it can be reclaimed. Only the caller that
   * actually claimed the lock should call this — releasing on the "skip" path would
   * wrongly free a lock owned by a concurrent in-flight attempt, or wipe a still-valid
   * post-success mark.
   */
  async releaseHistoryNotification(notificationHistoryId: string): Promise<void> {
    this.sql.exec(
      `DELETE FROM history_notification_locks WHERE notification_history_id = ? AND status = 'processing'`,
      notificationHistoryId,
    );
  }

  /** Last historyId a run completed through, replacing the `gmail_history_id` KV read. */
  async getLastProcessedHistoryId(): Promise<string | null> {
    const row = this.sql
      .exec<{
        last_processed_history_id: string | null;
      }>(`SELECT last_processed_history_id FROM gmail_sync_cursor WHERE id = 1`)
      .toArray()[0];
    return row?.last_processed_history_id ?? null;
  }
}
