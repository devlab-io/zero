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
  awaitPageCompletion,
  childWorkflowId,
  createOrAttachPageWorkflow,
  type PageWorkflowBinding,
} from './sync-coordinator-utils';
import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';
import { connectionToDriver } from '../lib/server-utils';
import type { WorkflowEvent } from 'cloudflare:workers';
import { captureServerException } from '../lib/sentry';
import { connection } from '../db/schema';
import { logger } from '../lib/logger';
import type { ZeroEnv } from '../env';
import { eq } from 'drizzle-orm';
import { withDb } from '../db';

export interface SyncThreadsCoordinatorParams {
  connectionId: string;
  folder: string;
}

/** Sortie d'un workflow enfant de page (une passe de `SYNC_THREADS_WORKFLOW`). */
interface SyncPageOutput {
  synced?: number;
  totalThreads?: number;
  successfulSyncs?: number;
  failedSyncs?: number;
  nextPageToken?: string | null;
}

export interface SyncThreadsCoordinatorResult {
  totalSynced: number;
  message: string;
  folder: string;
  totalPagesProcessed: number;
  totalThreads: number;
  totalSuccessfulSyncs: number;
  totalFailedSyncs: number;
  pageWorkflowResults: Array<{
    pageNumber: number;
    workflowId: string;
    status: 'completed' | 'failed';
    synced: number;
    error?: string;
  }>;
}

export class SyncThreadsCoordinatorWorkflow extends WorkflowEntrypoint<
  ZeroEnv,
  SyncThreadsCoordinatorParams
> {
  /**
   * Point d'entrée du Workflow. `captureServerException` n'existait qu'en main.ts (fetch,
   * queue, scheduled) : un Workflow qui casse n'émettait AUCUN événement, alors même que
   * Cloudflare Workflows retente le step puis abandonne l'instance en silence. La
   * synchronisation d'une boîte pouvait donc mourir sans laisser d'alerte.
   */
  async run(
    event: WorkflowEvent<SyncThreadsCoordinatorParams>,
    step: WorkflowStep,
  ): Promise<SyncThreadsCoordinatorResult> {
    try {
      return await this.execute(event, step);
    } catch (error) {
      await captureServerException(error, this.env, {
        transaction: 'SyncThreadsCoordinatorWorkflow.run',
        extra: { connectionId: event.payload.connectionId, folder: event.payload.folder },
      });
      throw error;
    }
  }

  private async execute(
    event: WorkflowEvent<SyncThreadsCoordinatorParams>,
    step: WorkflowStep,
  ): Promise<SyncThreadsCoordinatorResult> {
    const { connectionId, folder } = event.payload;

    logger.info(
      `[SyncThreadsCoordinatorWorkflow] Starting coordination for connection ${connectionId}, folder ${folder}`,
    );

    const result: SyncThreadsCoordinatorResult = {
      totalSynced: 0,
      message: 'Coordination completed',
      folder,
      totalPagesProcessed: 0,
      totalThreads: 0,
      totalSuccessfulSyncs: 0,
      totalFailedSyncs: 0,
      pageWorkflowResults: [],
    };

    const setupResult = await step.do(`setup-connection-${connectionId}-${folder}`, async () => {
      // `withDb` : le `conn.end()` d'origine ne s'exécutait que si la requête aboutissait, et
      // ce bloc est un `step.do` que Cloudflare REJOUE — chaque rejeu ajoutait donc une
      // connexion perdue de plus.
      const foundConnection = await withDb(this.env.HYPERDRIVE.connectionString, (db) =>
        db.query.connection.findFirst({
          where: eq(connection.id, connectionId),
        }),
      );

      if (!foundConnection) {
        throw new Error(`Connection ${connectionId} not found`);
      }

      const maxCount = parseInt(this.env.THREAD_SYNC_MAX_COUNT || '20');
      const shouldLoop = this.env.THREAD_SYNC_LOOP === 'true';

      return { maxCount, shouldLoop, foundConnection };
    });

    const { maxCount, shouldLoop, foundConnection } = setupResult as {
      maxCount: number;
      shouldLoop: boolean;
      foundConnection: Parameters<typeof connectionToDriver>[0];
    };
    const driver = connectionToDriver(foundConnection);

    if (connectionId.includes('aggregate')) {
      logger.info(
        `[SyncThreadsCoordinatorWorkflow] Skipping sync for aggregate instance - folder ${folder}`,
      );
      result.message = 'Skipped aggregate instance';
      return result;
    }

    if (!driver) {
      logger.warn(`[SyncThreadsCoordinatorWorkflow] No driver available for folder ${folder}`);
      result.message = 'No driver available';
      return result;
    }

    // Process pages sequentially
    let currentPageToken: string | null = null;
    let pageNumber = 0;

    do {
      pageNumber++;

      // Process this page
      const pageResult = await step.do(
        `process-page-${pageNumber}-${folder}-${connectionId}`,
        async () => {
          logger.info(
            `[SyncThreadsCoordinatorWorkflow] Processing page ${pageNumber} for ${folder}`,
          );

          // Identifiant DÉTERMINISTE : sans lui, chaque nouvelle tentative de ce step par
          // Cloudflare Workflows créait une instance enfant SUPPLÉMENTAIRE et re-synchronisait
          // la page entière. Le rattachement rend le rejeu inoffensif.
          const childId = childWorkflowId(event.instanceId, folder, pageNumber);
          const instance = await createOrAttachPageWorkflow(
            this.env.SYNC_THREADS_WORKFLOW as unknown as PageWorkflowBinding<
              Record<string, unknown>,
              SyncPageOutput
            >,
            childId,
            {
              connectionId,
              folder,
              pageNumber,
              pageToken: currentPageToken,
              maxCount,
              singlePageMode: true,
            },
          );

          logger.info(
            `[SyncThreadsCoordinatorWorkflow] Page ${pageNumber} handled by workflow ${instance.id}`,
          );

          // Poll avec backoff exponentiel (issue #31) : plus de plancher plat de 5 s/page.
          // Une page qui se termine vite rend la main en <1 s au lieu d'attendre 5 s ;
          // l'intervalle croît 250 ms → 5 s (plafond), budget total ~5 min inchangé.
          // Un état terminal sort désormais IMMÉDIATEMENT, avec son vrai motif.
          const result = await awaitPageCompletion(instance, {
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            now: () => Date.now(),
          });

          return { result: result ?? null, workflowId: instance.id };
        },
      );

      // Update result with this page's data
      if (pageResult?.result) {
        const workflowResult = pageResult.result;
        result.pageWorkflowResults.push({
          pageNumber,
          workflowId: pageResult.workflowId,
          status: 'completed',
          synced: workflowResult.synced || 0,
        });

        result.totalSynced += workflowResult.synced || 0;
        result.totalPagesProcessed += 1;
        result.totalThreads += workflowResult.totalThreads || 0;
        result.totalSuccessfulSyncs += workflowResult.successfulSyncs || 0;
        result.totalFailedSyncs += workflowResult.failedSyncs || 0;

        // Get next page token from workflow result if available
        currentPageToken = workflowResult.nextPageToken || null;
      } else {
        // If no result, we can't continue
        break;
      }

      // If no more pages, stop
      if (!currentPageToken) {
        logger.info(`[SyncThreadsCoordinatorWorkflow] No more pages for ${folder}`);
        break;
      }
    } while (currentPageToken && shouldLoop);

    logger.info(
      `[SyncThreadsCoordinatorWorkflow] Completed ${folder}: ${result.totalSynced} synced across ${result.totalPagesProcessed} pages`,
    );

    return result;
  }
}
