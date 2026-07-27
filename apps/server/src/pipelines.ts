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
import {
  createDefaultWorkflows,
  type WorkflowContext,
} from './thread-workflow-utils/workflow-engine';
import { getServiceAccount } from './lib/factories/google-subscription.factory';
import { getConnectionRegistry } from './lib/connection-registry';
import { getThread, getZeroAgent } from './lib/server-utils';
import { captureServerException } from './lib/sentry';
import { DurableObject } from 'cloudflare:workers';
import { bulkDeleteKeys } from './lib/bulk-delete';
import { type gmail_v1 } from '@googleapis/gmail';
import { initTracing } from './lib/tracing';
import { connection } from './db/schema';
import { Effect, Logger } from 'effect';
import { logger } from './lib/logger';
import { EProviders } from './types';
import type { ZeroEnv } from './env';
import { eq } from 'drizzle-orm';
import { withDb } from './db';

// --- Journalisation des workflows Effect (A5) ----------------------------------------
//
// Ce fichier émettait 44 `Console.log` d'Effect. `Console` écrit DIRECTEMENT sur la console
// de la plateforme : il contourne entièrement le seuil `LOG_LEVEL` de lib/logger. Sur
// Workers, cette sortie part vers `wrangler tail` et logpush — un stockage tiers, durable
// et facturé —, et l'une de ces lignes était
// `[MAIN_WORKFLOW] Starting workflow with payload:` suivie de la charge utile COMPLÈTE de
// la notification. Aucune de ces lignes n'était filtrable.
//
// `wfLog` remplace `Console.log` : tout passe par lib/logger, et une ligne QUI PORTE UNE
// CHARGE UTILE — c'est-à-dire qui a des arguments au-delà du message — est rétrogradée en
// `debug`, donc muette dès que le seuil vaut `info`.
const wfLog = (message: string, ...rest: unknown[]) =>
  Effect.sync(() => {
    if (rest.length > 0) logger.debug(message, ...rest);
    else logger.info(message);
  });

/**
 * Le Logger d'Effect (`Effect.log*`) écrivait sur stderr via `prettyLogger`, hors du même
 * seuil. Il est remplacé par un logger qui délègue à lib/logger, niveau pour niveau.
 */
export const loggerLayer = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ logLevel, message }) => {
    const parts = Array.isArray(message) ? message : [message];
    const [head, ...rest] = parts;
    const text = typeof head === 'string' ? head : JSON.stringify(head);
    switch (logLevel.label) {
      case 'FATAL':
      case 'ERROR':
        logger.error(text, ...rest);
        break;
      case 'WARN':
        logger.warn(text, ...rest);
        break;
      case 'INFO':
        logger.info(text, ...rest);
        break;
      default:
        logger.debug(text, ...rest);
        break;
    }
  }),
);

const isValidUUID = (str: string): boolean => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(str);
};

const validateArguments = (
  params: MainWorkflowParams,
  serviceAccount: { project_id: string },
): Effect.Effect<string, MainWorkflowError> =>
  Effect.gen(function* () {
    yield* wfLog('[MAIN_WORKFLOW] Validating arguments');
    const regex = new RegExp(
      `projects/${serviceAccount.project_id}/subscriptions/notifications__([a-z0-9-]+)`,
    );
    const match = params.subscriptionName.toString().match(regex);
    if (!match) {
      yield* wfLog('[MAIN_WORKFLOW] Invalid subscription name:', params.subscriptionName);
      return yield* Effect.fail({
        _tag: 'InvalidSubscriptionName' as const,
        subscriptionName: params.subscriptionName,
      });
    }
    const [, connectionId] = match;
    yield* wfLog('[MAIN_WORKFLOW] Extracted connectionId:', connectionId);
    return connectionId;
  });

export type ZeroWorkflowParams = {
  connectionId: string;
  historyId: string;
  nextHistoryId: string;
};

export type ThreadWorkflowParams = {
  connectionId: string;
  threadId: string;
  providerId: string;
};

export type MainWorkflowParams = {
  providerId: string;
  historyId: string;
  subscriptionName: string;
};

export enum EWorkflowType {
  MAIN = 'main',
  THREAD = 'thread',
  ZERO = 'zero',
}

export type WorkflowParams =
  | { workflowType: 'main'; params: MainWorkflowParams }
  | { workflowType: 'thread'; params: ThreadWorkflowParams }
  | { workflowType: 'zero'; params: ZeroWorkflowParams };

export type MainWorkflowError =
  | { _tag: 'MissingEnvironmentVariable'; variable: string }
  | { _tag: 'InvalidSubscriptionName'; subscriptionName: string }
  | { _tag: 'InvalidConnectionId'; connectionId: string }
  | { _tag: 'UnsupportedProvider'; providerId: string }
  | { _tag: 'WorkflowCreationFailed'; error: unknown };

export type ZeroWorkflowError =
  | { _tag: 'ConnectionNotFound'; connectionId: string }
  | { _tag: 'ConnectionNotAuthorized'; connectionId: string }
  | { _tag: 'HistoryNotFound'; historyId: string; connectionId: string }
  | { _tag: 'UnsupportedProvider'; providerId: string }
  | { _tag: 'DatabaseError'; error: unknown }
  | { _tag: 'GmailApiError'; error: unknown }
  | { _tag: 'WorkflowCreationFailed'; error: unknown }
  | { _tag: 'LabelModificationFailed'; error: unknown; threadId: string };

export type ThreadWorkflowError =
  | { _tag: 'ConnectionNotFound'; connectionId: string }
  | { _tag: 'ConnectionNotAuthorized'; connectionId: string }
  | { _tag: 'ThreadNotFound'; threadId: string }
  | { _tag: 'UnsupportedProvider'; providerId: string }
  | { _tag: 'DatabaseError'; error: unknown }
  | { _tag: 'GmailApiError'; error: unknown }
  | { _tag: 'VectorizationError'; error: unknown }
  | { _tag: 'WorkflowCreationFailed'; error: unknown };

export type UnsupportedWorkflowError = { _tag: 'UnsupportedWorkflow'; workflowType: never };

export type WorkflowError =
  | MainWorkflowError
  | ZeroWorkflowError
  | ThreadWorkflowError
  | UnsupportedWorkflowError;

export class WorkflowRunner extends DurableObject<ZeroEnv> {
  constructor(state: DurableObjectState, env: ZeroEnv) {
    super(state, env);
  }

  /**
   * Capture d'exception sur les POINTS D'ENTRÉE RPC de ce Durable Object.
   *
   * `captureServerException` n'existait qu'en main.ts (fetch, queue, scheduled). Un
   * workflow qui casse à l'intérieur du DO remontait bien jusqu'au consommateur
   * `thread-queue`, mais ce dernier attrapait, journalisait, rejouait — et n'émettait
   * AUCUN événement. Le traitement des notifications Gmail pouvait donc échouer en boucle
   * sans qu'aucune alerte ne parte.
   */
  private captureEntrypointFailure(transaction: string) {
    return async (error: unknown): Promise<never> => {
      await captureServerException(error, this.env, { transaction });
      throw error;
    };
  }

  /**
   * This function runs the main workflow. The main workflow is responsible for processing incoming messages from a Pub/Sub subscription and passing them to the appropriate pipeline.
   * It validates the subscription name and extracts the connection ID.
   * @param params
   * @returns
   */
  public runMainWorkflow(params: MainWorkflowParams) {
    const tracer = initTracing();
    const span = tracer.startSpan('workflow_main', {
      attributes: {
        'provider.id': params.providerId,
        'history.id': params.historyId,
        'subscription.name': params.subscriptionName,
      },
    });

    return Effect.gen(this, function* () {
      yield* wfLog('[MAIN_WORKFLOW] Starting workflow with payload:', params);

      const { providerId, historyId } = params;

      const serviceAccount = getServiceAccount();

      const connectionId = yield* validateArguments(params, serviceAccount);
      span.setAttributes({ 'connection.id': connectionId });

      if (!isValidUUID(connectionId)) {
        yield* wfLog('[MAIN_WORKFLOW] Invalid connection id format:', connectionId);
        span.setAttributes({ 'error.type': 'invalid_connection_id' });
        return yield* Effect.fail({
          _tag: 'InvalidConnectionId' as const,
          connectionId,
        });
      }

      // Une lecture de curseur en ÉCHEC ne doit JAMAIS être ramenée au même `null` qu'un
      // curseur ABSENT. L'`Effect.orElse(() => Effect.succeed(null))` qui vivait ici
      // perdait du mail, en silence et définitivement : `null` fait démarrer `history.list`
      // au `nextHistoryId` de CETTE notification (voir `historyId: previousHistoryId ||
      // historyId` juste en dessous), donc la plage d'historique de la notification est
      // sautée ; puis le run se terminant en succès, `completeHistoryNotification` avance
      // le curseur au-delà de cette plage — les messages qu'elle portait ne sont plus
      // jamais lus par personne.
      //
      // On fait donc échouer le run. C'est le seul choix qui ferme le chemin : le curseur
      // n'est avancé que par `completeHistoryNotification`, à l'intérieur de
      // `runZeroWorkflow`, et échouer ici empêche `runZeroWorkflow` d'être seulement
      // appelé. L'échec est journalisé par l'`Effect.tapError` en bas de ce pipe, envoyé à
      // Sentry par `captureEntrypointFailure`, puis rejoué par le consommateur
      // `thread-queue` (main.ts : `captureServerException` + `msg.retry()`).
      const previousHistoryId = yield* Effect.tryPromise({
        try: () => getConnectionRegistry(this.env, connectionId).getLastProcessedHistoryId(),
        catch: (error) => ({
          _tag: 'WorkflowCreationFailed' as const,
          error: `Failed to get history ID for connection ${connectionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
      });

      span.setAttributes({ 'history.previous_id': previousHistoryId || 'none' });

      if (providerId === EProviders.google) {
        yield* wfLog('[MAIN_WORKFLOW] Processing Google provider workflow');
        yield* wfLog('[MAIN_WORKFLOW] Previous history ID:', previousHistoryId);

        const zeroWorkflowParams = {
          connectionId,
          historyId: previousHistoryId || historyId,
          nextHistoryId: historyId,
        };

        const result = yield* Effect.tryPromise({
          try: () => this.runZeroWorkflow(zeroWorkflowParams),
          catch: (error) => ({ _tag: 'WorkflowCreationFailed' as const, error }),
        });

        yield* wfLog('[MAIN_WORKFLOW] Zero workflow result:', result);
        span.setAttributes({
          'workflow.result': typeof result === 'string' ? result : JSON.stringify(result),
        });
      } else {
        yield* wfLog('[MAIN_WORKFLOW] Unsupported provider:', providerId);
        span.setAttributes({ 'error.type': 'unsupported_provider' });
        return yield* Effect.fail({
          _tag: 'UnsupportedProvider' as const,
          providerId,
        });
      }

      yield* wfLog('[MAIN_WORKFLOW] Workflow completed successfully');
      span.setAttributes({ 'workflow.success': true });
      return 'Workflow completed successfully';
    })
      .pipe(
        Effect.tap(() => Effect.sync(() => span.end())),
        Effect.tapError((error) =>
          Effect.sync(() => {
            span.recordException(error as unknown as Error);
            span.setStatus({ code: 2, message: String(error) });
            span.end();
          }),
        ),
        Effect.tapError((error) => wfLog('[MAIN_WORKFLOW] Error in workflow:', error)),
        Effect.provide(loggerLayer),
        Effect.runPromise,
      )
      .catch(this.captureEntrypointFailure('WorkflowRunner.runMainWorkflow'));
  }

  public runZeroWorkflow(params: ZeroWorkflowParams) {
    return Effect.gen(this, function* () {
      yield* wfLog('[ZERO_WORKFLOW] Starting workflow with payload:', params);
      const { connectionId, historyId, nextHistoryId } = params;

      const registry = getConnectionRegistry(this.env, connectionId);
      const notificationHistoryId = nextHistoryId.toString();

      // Verrou d'idempotence. La clé est le historyId de CETTE notification : la seule
      // valeur que chaque redélivrance du même push porte à l'identique. Voir
      // lib/history-lock.ts (décision) et routes/agent/shard-registry.ts (stockage).
      const claim = yield* Effect.tryPromise({
        try: () => registry.claimHistoryNotification(notificationHistoryId, Date.now()),
        catch: (error) => ({ _tag: 'WorkflowCreationFailed' as const, error }),
      });

      if (claim.action === 'skip') {
        yield* wfLog('[ZERO_WORKFLOW] Skipping duplicate/redelivered notification:', {
          connectionId,
          notificationHistoryId,
          reason: claim.reason,
        });
        // A skip is a deliberate no-op, not a failure: it must resolve successfully so
        // the caller ACKs the message (no retry), and it must not run the failure-path
        // cleanup below — that would wrongly release a lock a concurrent in-flight
        // attempt still owns, or wipe a still-valid post-success mark.
        return 'Skipped: duplicate notification';
      }

      yield* wfLog('[ZERO_WORKFLOW] Acquired processing lock for history notification:', {
        connectionId,
        notificationHistoryId,
        reason: claim.reason,
      });

      // `withDb` relâche la connexion dans un `finally`. Elle ne l'était auparavant que sur
      // le chemin nominal : « connexion introuvable », « connexion non autorisée » et toute
      // panne de la requête elle-même laissaient la connexion ouverte — et l'`Effect.catchAll`
      // en bas de ce pipe n'y avait pas accès pour rattraper le coup.
      const foundConnection = yield* Effect.tryPromise({
        try: () =>
          withDb(this.env.HYPERDRIVE.connectionString, async (db) => {
            logger.info('[ZERO_WORKFLOW] Finding connection:', connectionId);
            const [found] = await db
              .select()
              .from(connection)
              .where(eq(connection.id, connectionId.toString()));
            if (!found) {
              throw new Error(`Connection not found ${connectionId}`);
            }
            if (!found.accessToken || !found.refreshToken) {
              throw new Error(`Connection is not authorized ${connectionId}`);
            }
            logger.info('[ZERO_WORKFLOW] Found connection:', found.id);
            return found;
          }),
        catch: (error) => ({ _tag: 'DatabaseError' as const, error }),
      });

      const agent = yield* Effect.tryPromise({
        try: async () => {
          const { stub: agent } = await getZeroAgent(foundConnection.id);
          return agent;
        },
        catch: (error) => ({ _tag: 'DatabaseError' as const, error }),
      });

      if (foundConnection.providerId === EProviders.google) {
        yield* wfLog('[ZERO_WORKFLOW] Processing Google provider workflow');

        const history = yield* Effect.tryPromise({
          try: async () => {
            logger.info('[ZERO_WORKFLOW] Getting Gmail history with ID:', historyId);
            const { history } = (await agent.listHistory(historyId.toString())) as {
              history: gmail_v1.Schema$History[];
            };
            logger.info('[ZERO_WORKFLOW] Found history entries:', history);
            return history;
          },
          catch: (error) => ({ _tag: 'GmailApiError' as const, error }),
        });

        // Note: the processed-historyId cursor is advanced only in
        // completeHistoryNotification below, once this notification has actually
        // finished (successfully or as a confirmed no-op) — not here, before threads
        // are synced and labels are applied. Advancing it this early (the previous
        // behavior, via a KV write mid-workflow) meant a crash between this point and
        // completion left the cursor already past `nextHistoryId`: the next run's
        // history.list would start from a point *after* the unprocessed batch and
        // silently skip it forever.

        if (!history.length) {
          yield* wfLog('[ZERO_WORKFLOW] No history found, skipping');
          yield* Effect.tryPromise({
            try: () =>
              registry.completeHistoryNotification(
                notificationHistoryId,
                nextHistoryId.toString(),
                Date.now(),
              ),
            catch: (error) => ({ _tag: 'WorkflowCreationFailed' as const, error }),
          });
          return 'No history found';
        }

        // Extract thread IDs from history and track label changes
        const threadsAdded = new Set<string>();
        const threadLabelChanges = new Map<
          string,
          { addLabels: Set<string>; removeLabels: Set<string> }
        >();

        // Optimal single-pass functional processing
        const processLabelChange = (
          labelChange: { message?: gmail_v1.Schema$Message; labelIds?: string[] | null },
          isAddition: boolean,
        ) => {
          const threadId = labelChange.message?.threadId;
          if (!threadId || !labelChange.labelIds?.length) return;

          let changes = threadLabelChanges.get(threadId);
          if (!changes) {
            changes = { addLabels: new Set<string>(), removeLabels: new Set<string>() };
            threadLabelChanges.set(threadId, changes);
          }

          const targetSet = isAddition ? changes.addLabels : changes.removeLabels;
          labelChange.labelIds.forEach((labelId) => targetSet.add(labelId));
        };

        history.forEach((historyItem) => {
          // Extract thread IDs from messages
          historyItem.messagesAdded?.forEach((msg) => {
            if (msg.message?.labelIds?.includes('DRAFT')) return;
            // if (msg.message?.labelIds?.includes('SPAM')) return;
            if (msg.message?.threadId) {
              threadsAdded.add(msg.message.threadId);
            }
          });

          // Process label changes using shared helper
          historyItem.labelsAdded?.forEach((labelAdded) => processLabelChange(labelAdded, true));
          historyItem.labelsRemoved?.forEach((labelRemoved) =>
            processLabelChange(labelRemoved, false),
          );
        });

        yield* wfLog(
          '[ZERO_WORKFLOW] Found unique thread IDs:',
          Array.from(threadLabelChanges.keys()),
          Array.from(threadsAdded),
        );

        if (threadsAdded.size > 0) {
          const threadWorkflowParams = Array.from(threadsAdded);

          // Sync threads with proper error handling - use allSuccesses to collect successful syncs
          const syncResults = yield* Effect.allSuccesses(
            threadWorkflowParams.map((threadId) =>
              Effect.tryPromise({
                try: async () => {
                  const result = await agent.syncThread({ threadId });
                  logger.info(`[ZERO_WORKFLOW] Successfully synced thread ${threadId}`);
                  return { threadId, result };
                },
                catch: (error) => {
                  logger.error(`[ZERO_WORKFLOW] Failed to sync thread ${threadId}:`, error);
                  // Let this effect fail so allSuccesses will exclude it
                  throw new Error(
                    `Failed to sync thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
                  );
                },
              }),
            ),
            { concurrency: 6 }, // Limit concurrency to avoid rate limits
          );

          const syncedCount = syncResults.filter((result) => result.result.success).length;
          const failedCount = threadWorkflowParams.length - syncedCount;

          if (failedCount > 0) {
            yield* wfLog(
              `[ZERO_WORKFLOW] Warning: ${failedCount}/${threadWorkflowParams.length} thread syncs failed. Successfully synced: ${syncedCount}`,
            );
            // Continue with processing - sync failures shouldn't stop the entire workflow
            // The thread processing will continue with whatever data is available
          } else {
            yield* wfLog(`[ZERO_WORKFLOW] Successfully synced all ${syncedCount} threads`);
          }

          yield* wfLog('[ZERO_WORKFLOW] Synced threads:', syncResults);

          // Run thread workflow for each successfully synced thread
          if (syncedCount > 0) {
            yield* Effect.tryPromise({
              try: () => agent.reloadFolder('inbox'),
              catch: (error) => ({ _tag: 'GmailApiError' as const, error }),
            }).pipe(
              Effect.tap(() => wfLog('[ZERO_WORKFLOW] Successfully reloaded inbox folder')),
              Effect.orElse(() =>
                Effect.gen(function* () {
                  yield* wfLog('[ZERO_WORKFLOW] Failed to reload inbox folder');
                  return undefined;
                }),
              ),
            );

            yield* wfLog(
              `[ZERO_WORKFLOW] Running thread workflows for ${syncedCount} synced threads`,
            );

            const threadWorkflowResults = yield* Effect.allSuccesses(
              syncResults.map(({ threadId }) =>
                this.runThreadWorkflow({
                  connectionId,
                  threadId,
                  providerId: foundConnection.providerId,
                }).pipe(
                  Effect.tap(() =>
                    wfLog(`[ZERO_WORKFLOW] Successfully ran thread workflow for ${threadId}`),
                  ),
                  Effect.tapError((error) =>
                    wfLog(`[ZERO_WORKFLOW] Failed to run thread workflow for ${threadId}:`, error),
                  ),
                ),
              ),
              { concurrency: 6 }, // Limit concurrency to avoid overwhelming the system
            );

            const threadWorkflowSuccessCount = threadWorkflowResults.length;
            const threadWorkflowFailedCount = syncedCount - threadWorkflowSuccessCount;

            if (threadWorkflowFailedCount > 0) {
              yield* wfLog(
                `[ZERO_WORKFLOW] Warning: ${threadWorkflowFailedCount}/${syncedCount} thread workflows failed. Successfully processed: ${threadWorkflowSuccessCount}`,
              );
            } else {
              yield* wfLog(
                `[ZERO_WORKFLOW] Successfully ran all ${threadWorkflowSuccessCount} thread workflows`,
              );
            }
          }
        } else {
          yield* wfLog('[ZERO_WORKFLOW] No new threads to process');
        }

        // Process label changes for threads
        if (threadLabelChanges.size > 0) {
          yield* wfLog(
            `[ZERO_WORKFLOW] Processing label changes for ${threadLabelChanges.size} threads`,
          );

          // Process each thread's label changes
          for (const [threadId, changes] of threadLabelChanges) {
            const addLabels = Array.from(changes.addLabels);
            const removeLabels = Array.from(changes.removeLabels);

            // Only call if there are actual changes to make
            if (addLabels.length > 0 || removeLabels.length > 0) {
              yield* wfLog(
                `[ZERO_WORKFLOW] Modifying labels for thread ${threadId}: +${addLabels.length} -${removeLabels.length}`,
              );
              yield* Effect.tryPromise({
                try: () => agent.modifyThreadLabelsInDB(threadId, addLabels, removeLabels),
                catch: (error) => ({ _tag: 'LabelModificationFailed' as const, error, threadId }),
              }).pipe(
                Effect.orElse(() =>
                  Effect.gen(function* () {
                    yield* wfLog(`[ZERO_WORKFLOW] Failed to modify labels for thread ${threadId}`);
                    return undefined;
                  }),
                ),
              );
            }
          }

          yield* wfLog('[ZERO_WORKFLOW] Completed label modifications');
        } else {
          yield* wfLog('[ZERO_WORKFLOW] No threads with label changes to process');
        }

        // Mark the notification done — the mark is kept (TTL ~24h), not deleted, so a
        // redelivery arriving after this point is skipped rather than replayed — and
        // advance the processed-historyId cursor in the same DO write, now that
        // threads/labels have actually been applied.
        yield* Effect.tryPromise({
          try: () =>
            registry.completeHistoryNotification(
              notificationHistoryId,
              nextHistoryId.toString(),
              Date.now(),
            ),
          catch: (error) => ({ _tag: 'WorkflowCreationFailed' as const, error }),
        });

        yield* wfLog('[ZERO_WORKFLOW] Processing complete');
        return 'Zero workflow completed successfully';
      } else {
        yield* wfLog('[ZERO_WORKFLOW] Unsupported provider:', foundConnection.providerId);
        return yield* Effect.fail({
          _tag: 'UnsupportedProvider' as const,
          providerId: foundConnection.providerId,
        });
      }
    })
      .pipe(
        Effect.tapError((error) => wfLog('[ZERO_WORKFLOW] Error in workflow:', error)),
        Effect.catchAll((error) => {
          // Release the lock on failure (rather than leave it 'processing') so a genuine
          // retry — queue msg.retry(), or a fresh Pub/Sub redelivery — isn't forced to
          // wait out the stale-processing window before it can be reclaimed.
          return Effect.tryPromise({
            try: async () => {
              const notificationHistoryId = params.nextHistoryId.toString();
              logger.info(
                '[ZERO_WORKFLOW] Releasing processing lock for notification after error:',
                notificationHistoryId,
              );
              await getConnectionRegistry(this.env, params.connectionId).releaseHistoryNotification(
                notificationHistoryId,
              );
            },
            catch: () => ({
              _tag: 'WorkflowCreationFailed' as const,
              error: 'Failed to release processing lock',
            }),
          }).pipe(
            Effect.orElse(() => Effect.succeed(undefined)),
            Effect.flatMap(() => Effect.fail(error)),
          );
        }),
        Effect.provide(loggerLayer),
        Effect.runPromise,
      )
      .catch(this.captureEntrypointFailure('WorkflowRunner.runZeroWorkflow'));
  }

  public runThreadWorkflow(params: ThreadWorkflowParams) {
    return Effect.gen(this, function* () {
      yield* wfLog('[THREAD_WORKFLOW] Starting workflow with payload:', params);
      const { connectionId, threadId, providerId } = params;
      const keysToDelete: string[] = [];

      if (providerId === EProviders.google) {
        yield* wfLog('[THREAD_WORKFLOW] Processing Google provider workflow');
        // Idem `runZeroWorkflow` : la libération passe par le `finally` de `withDb`, seul
        // chemin qui couvre aussi les deux `throw` de validation ci-dessous.
        const foundConnection = yield* Effect.tryPromise({
          try: () =>
            withDb(this.env.HYPERDRIVE.connectionString, async (db) => {
              logger.info('[THREAD_WORKFLOW] Finding connection:', connectionId);
              const [found] = await db
                .select()
                .from(connection)
                .where(eq(connection.id, connectionId.toString()));
              if (!found) {
                throw new Error(`Connection not found ${connectionId}`);
              }
              if (!found.accessToken || !found.refreshToken) {
                throw new Error(`Connection is not authorized ${connectionId}`);
              }
              logger.info('[THREAD_WORKFLOW] Found connection:', found.id);
              return found;
            }),
          catch: (error) => ({ _tag: 'DatabaseError' as const, error }),
        });

        const thread = yield* Effect.tryPromise({
          try: async () => {
            logger.info('[THREAD_WORKFLOW] Getting thread:', threadId);
            const { result: thread } = await getThread(foundConnection.id, threadId.toString());
            logger.info('[THREAD_WORKFLOW] Found thread with messages:', thread.messages.length);
            return thread;
          },
          catch: (error) => ({ _tag: 'GmailApiError' as const, error }),
        });

        if (!thread.messages || thread.messages.length === 0) {
          yield* wfLog('[THREAD_WORKFLOW] Thread has no messages, skipping processing');
          // Add thread processing key to cleanup list
          keysToDelete.push(threadId.toString());
          return 'Thread has no messages';
        }

        // Initialize workflow engine with default workflows
        const workflowEngine = createDefaultWorkflows();

        // Create workflow context
        const workflowContext: WorkflowContext = {
          connectionId: connectionId.toString(),
          threadId: threadId.toString(),
          thread,
          foundConnection,
          results: new Map<string, unknown>(),
          env: this.env,
        };

        // Execute configured workflows using the workflow engine
        const workflowResults = yield* Effect.tryPromise({
          try: async () => {
            // Execute all workflows registered in the engine
            const workflowNames = workflowEngine.getWorkflowNames();

            const { results, errors } = await workflowEngine.executeWorkflowChain(
              workflowNames,
              workflowContext,
            );

            return { results, errors };
          },
          catch: (error) => ({ _tag: 'WorkflowCreationFailed' as const, error }),
        });

        // Clear workflow context after execution
        workflowEngine.clearContext(workflowContext);

        // Log workflow results
        const successfulSteps = Array.from(workflowResults.results.keys());
        const failedSteps = Array.from(workflowResults.errors.keys());

        if (successfulSteps.length > 0) {
          yield* wfLog('[THREAD_WORKFLOW] Successfully executed steps:', successfulSteps);
        }

        if (failedSteps.length > 0) {
          yield* wfLog('[THREAD_WORKFLOW] Failed steps:', failedSteps);
          // Log errors efficiently using forEach to avoid nested iteration
          workflowResults.errors.forEach((error, stepId) => {
            logger.info(`[THREAD_WORKFLOW] Error in step ${stepId}:`, error.message);
          });
        }

        // Add thread processing key to cleanup list
        keysToDelete.push(threadId.toString());

        // Bulk delete all collected keys
        if (keysToDelete.length > 0) {
          yield* Effect.tryPromise({
            try: async () => {
              logger.info('[THREAD_WORKFLOW] Bulk deleting keys:', keysToDelete);
              const result = await bulkDeleteKeys(keysToDelete);
              logger.info('[THREAD_WORKFLOW] Bulk delete result:', result);
              return result;
            },
            catch: (error) => ({ _tag: 'DatabaseError' as const, error }),
          }).pipe(
            Effect.orElse(() => Effect.succeed({ successful: 0, failed: keysToDelete.length })),
          );
        }

        yield* wfLog('[THREAD_WORKFLOW] Thread processing complete');
        return 'Thread workflow completed successfully';
      } else {
        yield* wfLog('[THREAD_WORKFLOW] Unsupported provider:', providerId);
        return yield* Effect.fail({
          _tag: 'UnsupportedProvider' as const,
          providerId,
        });
      }
    }).pipe(
      Effect.tapError((error) => wfLog('[THREAD_WORKFLOW] Error in workflow:', error)),
      Effect.catchAll((error) => {
        // Clean up thread processing flag on error using bulk delete
        return Effect.tryPromise({
          try: async () => {
            logger.info(
              '[THREAD_WORKFLOW] Clearing processing flag for thread after error:',
              params.threadId,
            );
            const result = await bulkDeleteKeys([params.threadId.toString()]);
            logger.info('[THREAD_WORKFLOW] Error cleanup result:', result);
            return result;
          },
          catch: () => ({
            _tag: 'DatabaseError' as const,
            error: 'Failed to cleanup thread processing flag',
          }),
        }).pipe(
          Effect.orElse(() => Effect.succeed({ successful: 0, failed: 1 })),
          Effect.flatMap(() => Effect.fail(error)),
        );
      }),
      Effect.provide(loggerLayer),
    );
  }
}
