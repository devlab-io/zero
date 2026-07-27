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

import { DateNormalizationError, type ThreadSyncResult } from './errors';
import { invalidateThreadBodyCache } from './projection';
import type { ZeroDriverInternal } from './internal';
import migrations from './db/drizzle/migrations';
import { invariant } from '../../lib/invariant';
import { OutgoingMessageType } from './types';
import { logger } from '../../lib/logger';
import type { Sender } from '../../types';
import { Effect } from 'effect';
import { create } from './db';

const maxCount = 20;

export async function syncFolders(self: ZeroDriverInternal) {
  if (self.name === 'general') return;
  // Skip sync for aggregate instances - they should only mirror primary operations
  // The multi-stub pattern ensures aggregate gets operations in background
  if (self.name.includes('aggregate')) {
    logger.info('[syncFolders] Skipping sync for aggregate instance');
    return;
  }

  const threadCount = await self.getThreadCount();
  if (threadCount < maxCount) {
    logger.info(
      `[syncFolders] Starting folder sync for ${self.name} (threadCount: ${threadCount})`,
    );
    const triggered = await triggerSyncWorkflow(self, 'inbox');
    if (!triggered.ok) {
      // L'echec remonte a l'appelant au lieu d'etre avale : sans cela, la synchronisation
      // initiale ne demarrait pas et personne ne pouvait l'apprendre.
      throw triggered.error instanceof Error
        ? triggered.error
        : new Error(`Failed to trigger sync coordinator workflow for ${self.name}/inbox`);
    }
  } else {
    logger.info(
      `[syncFolders] Skipping sync for ${self.name} - threadCount (${threadCount}) >= maxCount (${maxCount})`,
    );
  }
}

function dropTables(self: ZeroDriverInternal) {
  self.sql.exec(`DROP TABLE IF EXISTS threads`);
  self.sql.exec(`DROP TABLE IF EXISTS thread_labels`);
  self.sql.exec(`DROP TABLE IF EXISTS labels`);
}

function createTables(self: ZeroDriverInternal) {
  const m = Object.values(migrations.migrations);
  for (const migration of m) {
    self.sql.exec(migration);
  }
}

export async function forceReSync(self: ZeroDriverInternal) {
  // this.foldersInSync.clear();
  self.syncThreadsInProgress.clear();
  dropTables(self);
  createTables(self);
  await syncFolders(self);
}

export async function syncThread(
  self: ZeroDriverInternal,
  { threadId }: { threadId: string },
): Promise<ThreadSyncResult> {
  if (self.name === 'general' || self.name.includes('aggregate')) {
    logger.info(`[syncThread] Skipping sync for ${self.name} instance - thread ${threadId}`);
    return { success: true, threadId, broadcastSent: false };
  }

  if (self.syncThreadsInProgress.has(threadId)) {
    logger.info(`[syncThread] Sync already in progress for thread ${threadId}, skipping...`);
    return { success: true, threadId, broadcastSent: false };
  }

  return Effect.runPromise(
    Effect.gen(self, function* () {
      logger.info(`[syncThread] Starting sync for thread: ${threadId}`);
      if (!this.connection) {
        throw new Error('No connection available');
      }
      const result: ThreadSyncResult = {
        success: false,
        threadId,
        broadcastSent: false,
      };

      this.syncThreadsInProgress.set(threadId, true);

      // Un echec d'ecriture DB ne doit plus etre avale : l'appelant (workflow, queue)
      // comptait une synchro fantome comme reussie (pipelines.ts:401).
      let databaseWriteFailed = false;

      const connection = this.connection;
      invariant(connection, 'driver connection is not set');
      const latest = yield* Effect.tryPromise(() =>
        this.env.THREAD_SYNC_WORKER.get(this.env.THREAD_SYNC_WORKER.newUniqueId()).syncThread(
          connection,
          threadId,
        ),
      );

      // The worker just rewrote the thread body in R2: drop the cached copy.
      yield* Effect.sync(() => invalidateThreadBodyCache(this.name, threadId));

      if (!latest) {
        this.syncThreadsInProgress.delete(threadId);
        logger.info(`[syncThread] Skipping thread ${threadId} - no latest message`);
        result.success = false;
        result.reason = 'No latest message';
        return result;
      }

      // Normalize received date
      const normalizedReceivedOn = yield* Effect.try({
        try: () => new Date(latest.receivedOn).toISOString(),
        catch: (error) =>
          new DateNormalizationError(`Failed to normalize date for ${threadId}`, error),
      }).pipe(
        Effect.catchAll((error) => {
          logger.warn(
            `[syncThread] Date normalization failed for ${threadId}, using current date:`,
            error,
          );
          return Effect.succeed(new Date().toISOString());
        }),
      );

      result.normalizedReceivedOn = normalizedReceivedOn;

      // Update database
      yield* Effect.tryPromise(() =>
        create(
          this.db,
          {
            id: threadId,
            threadId,
            providerId: 'google',
            latestSender: latest.sender,
            latestReceivedOn: normalizedReceivedOn,
            latestSubject: latest.subject,
          },
          latest.tags.map((tag) => tag.id),
        ),
      ).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            logger.info(`[syncThread] Updated database for ${threadId}`);
            this.invalidateRecipientCache();
          }),
        ),
        Effect.tap(() => Effect.sync(() => this.reloadFolder('inbox'))),
        Effect.catchAll((error) => {
          logger.error(`[syncThread] Failed to update database for ${threadId}:`, error);
          return Effect.sync(() => {
            databaseWriteFailed = true;
            result.reason = `Database write failed: ${
              error instanceof Error ? error.message : String(error)
            }`;
          });
        }),
      );

      // Broadcast update if agent exists
      if (this.agent) {
        const agent = this.agent;
        yield* Effect.tryPromise(() =>
          agent.broadcastChatMessage({
            type: OutgoingMessageType.Mail_Get,
            threadId,
          }),
        ).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              result.broadcastSent = true;
              logger.info(`[syncThread] Broadcasted update for ${threadId}`);
            }),
          ),
          Effect.catchAll((error) => {
            logger.warn(`[syncThread] Failed to broadcast update for ${threadId}:`, error);
            return Effect.succeed(undefined);
          }),
        );
      } else {
        logger.info(`[syncThread] No agent available for broadcasting ${threadId}`);
      }

      this.syncThreadsInProgress.delete(threadId);

      result.success = !databaseWriteFailed;

      logger.info(`[syncThread] Completed sync for thread: ${threadId}`, {
        success: result.success,
        broadcastSent: result.broadcastSent,
        hasLatestMessage: !!latest,
      });

      return result;
    }).pipe(
      Effect.catchAll((error) => {
        self.syncThreadsInProgress.delete(threadId);
        logger.error(`[syncThread] Critical error syncing thread ${threadId}:`, error);
        return Effect.succeed({
          success: false,
          threadId,
          reason: error.message,
          broadcastSent: false,
        });
      }),
    ),
  );
}

export async function storeThreadInDB(
  self: ZeroDriverInternal,
  threadData: {
    id: string;
    threadId: string;
    providerId: string;
    latestSender: Sender;
    latestReceivedOn: string;
    latestSubject: string;
  },
  labelIds: string[],
): Promise<void> {
  try {
    await create(
      self.db,
      {
        id: threadData.id,
        threadId: threadData.threadId,
        providerId: threadData.providerId,
        latestSender: threadData.latestSender,
        latestReceivedOn: threadData.latestReceivedOn,
        latestSubject: threadData.latestSubject,
      },
      labelIds,
    );
    //   await sendDoState(this.name);
    logger.info(`[ZeroDriver] Successfully stored thread ${threadData.id} in database`);
  } catch (error) {
    logger.error(`[ZeroDriver] Failed to store thread ${threadData.id} in database:`, error);
    throw error;
  }
}

/**
 * Issue du déclenchement du workflow coordinateur de synchronisation. La fonction
 * retournait `void` : l'échec de `create()` était journalisé PUIS AVALÉ, le repli était en
 * commentaire, et aucun appelant ne pouvait savoir que la synchronisation initiale n'avait
 * pas démarré. Une boîte pouvait donc rester vide indéfiniment sans qu'aucun code ne
 * puisse réagir. Le résultat est désormais exploitable — `syncFolders` s'en sert.
 */
export type TriggerSyncOutcome = { ok: true; instanceId: string } | { ok: false; error: unknown };

export async function triggerSyncWorkflow(
  self: ZeroDriverInternal,
  folder: string,
): Promise<TriggerSyncOutcome> {
  try {
    logger.info(`[ZeroDriver] Triggering sync coordinator workflow for ${self.name}/${folder}`);

    const instance = await self.env.SYNC_THREADS_COORDINATOR_WORKFLOW.create({
      params: {
        connectionId: self.name,
        folder: folder,
      },
    });

    logger.info(
      `[ZeroDriver] Sync coordinator workflow triggered for ${self.name}/${folder}, instance: ${instance.id}`,
    );
    return { ok: true, instanceId: instance.id };
  } catch (error) {
    logger.error(
      `[ZeroDriver] Failed to trigger sync coordinator workflow for ${self.name}/${folder}:`,
      error,
    );
    return { ok: false, error };
  }
}
