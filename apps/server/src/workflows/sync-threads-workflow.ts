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
import { persistSyncedThread } from '../lib/driver/gmail-sync-persist';
import { getZeroAgent, connectionToDriver } from '../lib/server-utils';
import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';
import { GoogleMailManager } from '../lib/driver/google';
import type { WorkflowEvent } from 'cloudflare:workers';
import { captureServerException } from '../lib/sentry';
import type { ParsedMessage } from '../types';
import { connection } from '../db/schema';
import { logger } from '../lib/logger';
import type { ZeroEnv } from '../env';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';

export interface SyncThreadsParams {
  connectionId: string;
  folder: string;
  pageNumber?: number;
  pageToken?: string | null;
  maxCount?: number;
  singlePageMode?: boolean;
}

export interface SyncThreadsResult {
  synced: number;
  message: string;
  folder: string;
  pagesProcessed: number;
  totalThreads: number;
  successfulSyncs: number;
  failedSyncs: number;
  broadcastSent: boolean;
  nextPageToken: string | null;
}

interface PageProcessingResult {
  threads: { id: string; historyId: string | null }[];
  nextPageToken: string | null;
  processedCount: number;
  successCount: number;
  failureCount: number;
}

export class SyncThreadsWorkflow extends WorkflowEntrypoint<ZeroEnv, SyncThreadsParams> {
  /**
   * Point d'entrée du Workflow. `captureServerException` n'existait qu'en main.ts (fetch,
   * queue, scheduled) : un Workflow qui casse n'émettait AUCUN événement, alors même que
   * Cloudflare Workflows retente le step puis abandonne l'instance en silence. La
   * synchronisation d'une boîte pouvait donc mourir sans laisser d'alerte.
   */
  async run(
    event: WorkflowEvent<SyncThreadsParams>,
    step: WorkflowStep,
  ): Promise<SyncThreadsResult> {
    try {
      return await this.execute(event, step);
    } catch (error) {
      await captureServerException(error, this.env, {
        transaction: 'SyncThreadsWorkflow.run',
        extra: { connectionId: event.payload.connectionId, folder: event.payload.folder },
      });
      throw error;
    }
  }

  private async execute(
    event: WorkflowEvent<SyncThreadsParams>,
    step: WorkflowStep,
  ): Promise<SyncThreadsResult> {
    const { connectionId, folder } = event.payload;

    logger.info(
      `[SyncThreadsWorkflow] Starting sync for connection ${connectionId}, folder ${folder}`,
    );

    const result: SyncThreadsResult = {
      synced: 0,
      message: 'Sync completed',
      folder,
      pagesProcessed: 0,
      totalThreads: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      broadcastSent: false,
      nextPageToken: null,
    };

    const setupResult = await step.do(`setup-connection-${connectionId}-${folder}`, async () => {
      const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);

      const foundConnection = await db.query.connection.findFirst({
        where: eq(connection.id, connectionId),
      });

      await conn.end();

      if (!foundConnection) {
        throw new Error(`Connection ${connectionId} not found`);
      }

      const maxCount = parseInt(this.env.THREAD_SYNC_MAX_COUNT || '20');
      const shouldLoop = this.env.THREAD_SYNC_LOOP === 'true';

      return { maxCount, shouldLoop, foundConnection };
    });

    const { maxCount, foundConnection } = setupResult as {
      maxCount: number;
      shouldLoop: boolean;
      foundConnection: Parameters<typeof connectionToDriver>[0];
    };
    const driver = connectionToDriver(foundConnection);

    if (connectionId.includes('aggregate')) {
      logger.info(`[SyncThreadsWorkflow] Skipping sync for aggregate instance - folder ${folder}`);
      result.message = 'Skipped aggregate instance';
      return result;
    }

    if (!driver) {
      logger.warn(`[SyncThreadsWorkflow] No driver available for folder ${folder}`);
      result.message = 'No driver available';
      return result;
    }

    const { pageNumber = 1, pageToken, maxCount: paramMaxCount } = event.payload;
    const effectiveMaxCount = paramMaxCount || maxCount;

    logger.info(`[SyncThreadsWorkflow] Running in single-page mode for page ${pageNumber}`);

    const pageResult = await step.do(
      `process-single-page-${pageNumber}-${folder}-${connectionId}`,
      async () => {
        logger.info(
          `[SyncThreadsWorkflow] Processing single page ${pageNumber} for folder ${folder}`,
        );

        const listResult = await driver.list({
          folder,
          maxResults: effectiveMaxCount,
          pageToken: pageToken || undefined,
        });

        const pageProcessingResult: PageProcessingResult = {
          threads: listResult.threads,
          nextPageToken: listResult.nextPageToken,
          processedCount: 0,
          successCount: 0,
          failureCount: 0,
        };

        const { stub: agent } = await getZeroAgent(connectionId);

        const storeSummary = async (threadId: string, latest: ParsedMessage) => {
          await agent.storeThreadInDB(
            {
              id: threadId,
              threadId,
              providerId: 'google',
              latestSender: latest.sender,
              latestReceivedOn: new Date(latest.receivedOn).toISOString(),
              latestSubject: latest.subject,
            },
            latest.tags.map((tag) => tag.id),
          );
        };

        if (driver instanceof GoogleMailManager) {
          // Chemin chaud batché (issue #31) : UN batch coalesce les ~maxCount `threads.get`
          // de la page via un driver PARTAGÉ (round-trips ⌈N/50⌉ au lieu de N), compteur
          // Gmail loggé par cycle, en bypassant le wrapper flat-60s du DO per-thread.
          const ids = listResult.threads.map((t) => t.id);
          let fetched: Awaited<ReturnType<GoogleMailManager['getMany']>>;
          try {
            fetched = await driver.getMany(ids);
          } finally {
            driver.logSyncCycleCalls(`sync-page-${pageNumber}-${folder}`);
          }

          await Promise.allSettled(
            listResult.threads.map(async (thread) => {
              try {
                const full = fetched.get(thread.id);
                if (!full) {
                  pageProcessingResult.failureCount++;
                  return;
                }
                // Réplique FIDÈLE de ThreadSyncWorker.syncThread (routes/agent, MUST-NOT-TOUCH) :
                // R2 écrit INCONDITIONNELLEMENT (même clé/metadata) dès que le thread est
                // récupéré, PUIS résumé DB seulement si `latest` existe. Un thread 100 %
                // brouillons persiste donc quand même en R2 (fidélité stricte au pré-slice).
                const outcome = await persistSyncedThread(thread.id, full, {
                  putR2: (id, data) =>
                    this.env.THREADS_BUCKET.put(
                      `${foundConnection.id}/${id}.json`,
                      JSON.stringify(data),
                      { customMetadata: { threadId: id } },
                    ).then(() => undefined),
                  storeSummary,
                });
                if (outcome === 'synced') {
                  pageProcessingResult.processedCount++;
                  pageProcessingResult.successCount++;
                } else {
                  // r2-only : R2 écrit, résumé DB sauté (comme le pré-slice quand latest absent).
                  pageProcessingResult.failureCount++;
                }
              } catch (error) {
                logger.error(`[SyncThreadsWorkflow] Failed to sync thread ${thread.id}:`, error);
                pageProcessingResult.failureCount++;
              }
            }),
          );
        } else {
          // Fallback per-thread DO (providers non-Gmail : pas de batch HTTP Gmail).
          const syncSingleThread = async (thread: { id: string; historyId: string | null }) => {
            try {
              const latest = await this.env.THREAD_SYNC_WORKER.get(
                this.env.THREAD_SYNC_WORKER.newUniqueId(),
              ).syncThread(foundConnection, thread.id);

              if (latest) {
                await storeSummary(thread.id, latest);
                pageProcessingResult.processedCount++;
                pageProcessingResult.successCount++;
              } else {
                pageProcessingResult.failureCount++;
              }
            } catch (error) {
              logger.error(`[SyncThreadsWorkflow] Failed to sync thread ${thread.id}:`, error);
              pageProcessingResult.failureCount++;
            }
          };
          await Promise.allSettled(listResult.threads.map(syncSingleThread));
        }

        await agent.reloadFolder(folder);

        logger.info(`[SyncThreadsWorkflow] Completed single page ${pageNumber}`);
        return pageProcessingResult;
      },
    );

    const typedPageResult = pageResult as PageProcessingResult;
    result.pagesProcessed = 1;
    result.totalThreads = typedPageResult.threads.length;
    result.synced = typedPageResult.processedCount;
    result.successfulSyncs = typedPageResult.successCount;
    result.failedSyncs = typedPageResult.failureCount;
    result.nextPageToken = typedPageResult.nextPageToken;

    logger.info(
      `[SyncThreadsWorkflow] Single-page workflow completed for ${connectionId}/${folder}:`,
      result,
    );
    return result;
  }
}
