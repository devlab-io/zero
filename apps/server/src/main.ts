import {
  deliverScheduledEmail,
  type ScheduledSendStore,
  type StoredOutgoingMessage,
} from './lib/scheduled-send';
import { SyncThreadsCoordinatorWorkflow } from './workflows/sync-threads-coordinator-workflow';
import { fromScheduledSendAttempt, SendNotDispatchedError } from './lib/send-reservation';
import { SyncThreadsWorkflow } from './workflows/sync-threads-workflow';
import { createSendReservationGate } from './lib/connection-registry';
import { ShardRegistry, ZeroAgent, ZeroDriver } from './routes/agent';
import { renewWatchSubscription } from './lib/subscribe-queue';
import { ThreadSyncWorker } from './routes/agent/sync-worker';
import { EProviders, type IEmailSendBatch } from './types';
import { ThinkingMCP } from './lib/sequential-thinking';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { captureServerException } from './lib/sentry';
import { bootEnv, env, type ZeroEnv } from './env';
import { getZeroAgent } from './lib/server-utils';
import { enableBrainFunction } from './lib/brain';
import { ZeroMCP } from './routes/agent/mcp';
import { WorkflowRunner } from './pipelines';
import { initTracing } from './lib/tracing';
import { logger } from './lib/logger';
import { createDb } from './db';
import { app } from './routes';

const handler = {
  async fetch(request: Request, env: ZeroEnv, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};

export default class Entry extends WorkerEntrypoint<ZeroEnv> {
  async fetch(request: Request): Promise<Response> {
    bootEnv(this.env as unknown as Record<string, unknown>);
    try {
      return await handler.fetch(request, this.env, this.ctx);
    } catch (err) {
      this.ctx.waitUntil(
        captureServerException(err, this.env, {
          transaction: `${request.method} ${new URL(request.url).pathname}`,
        }),
      );
      throw err;
    }
  }
  async queue(
    batch: MessageBatch<unknown> | { queue: string; messages: Array<{ body: IEmailSendBatch }> },
  ) {
    bootEnv(this.env as unknown as Record<string, unknown>);
    try {
      await this.dispatchQueueBatch(batch);
    } catch (err) {
      // `queue()` n'etait couvert par aucune capture : une exception ici ne produisait
      // qu'une ligne de log, jamais un evenement Sentry ni une alerte.
      this.ctx.waitUntil(
        captureServerException(err, this.env, { transaction: `queue ${batch.queue}` }),
      );
      throw err;
    }
  }

  /**
   * Livre chaque message d'un lot INDÉPENDAMMENT.
   *
   * `Promise.all` rejetait le lot entier au premier message en échec. Combiné au
   * `JSON.parse` non gardé de `scheduled-send.ts`, un seul payload KV corrompu faisait
   * rejouer TOUS les messages du lot, à chaque tentative, jusqu'à épuisement des cinq
   * essais — et sans dead-letter queue, les mails sains du lot étaient renvoyés cinq fois
   * chacun. `allSettled` isole les messages ; un rejet résiduel est journalisé, CAPTURÉ, et
   * suivi d'un `retry()` sur CE message seul — sinon l'isolation transformerait une panne
   * inattendue (lecture KV en échec, DO injoignable) en acquittement muet, c'est-à-dire en
   * mail perdu. Tous les points de rejet possibles sont antérieurs à la réservation
   * d'envoi, donc redemander une livraison ne peut pas produire de doublon.
   */
  private async settleQueueBatch(
    queue: string,
    entries: Array<{ task: Promise<unknown>; retry?: () => void }>,
  ): Promise<void> {
    const results = await Promise.allSettled(entries.map((entry) => entry.task));
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      logger.error(`[QUEUE] message handler rejected on ${queue}`, result.reason);
      this.ctx.waitUntil(
        captureServerException(result.reason, this.env, { transaction: `queue ${queue}` }),
      );
      entries[index].retry?.();
    });
  }

  private async dispatchQueueBatch(
    batch: MessageBatch<unknown> | { queue: string; messages: Array<{ body: IEmailSendBatch }> },
  ) {
    switch (true) {
      case batch.queue.startsWith('subscribe-queue'): {
        // Le lot entier etait journalise en `info` : il porte les identifiants de
        // connexion de chaque destinataire. Retrograde en `debug`, borne au denombrement.
        logger.debug('[SUBSCRIBE_QUEUE] batch received', { size: batch.messages.length });
        await this.settleQueueBatch(
          batch.queue,
          (
            batch.messages as unknown as Array<{
              body: { connectionId: string; providerId: EProviders };
              retry?: () => void;
            }>
          ).map((msg) => ({
            retry: () => msg.retry?.(),
            task: renewWatchSubscription(
              { connectionId: msg.body.connectionId, providerId: msg.body.providerId },
              {
                enable: ({ id, providerId }) =>
                  enableBrainFunction({ id, providerId: providerId as EProviders }),
                retry: () => msg.retry?.(),
                logger,
              },
            ),
          })),
        );
        logger.info('[SUBSCRIBE_QUEUE] batch done');
        return;
      }
      case batch.queue.startsWith('send-email-queue'): {
        const { pending_emails_status: statusKV, pending_emails_payload: payloadKV } = this.env as {
          pending_emails_status: ScheduledSendStore;
          pending_emails_payload: ScheduledSendStore;
        };
        await this.settleQueueBatch(
          batch.queue,
          (batch.messages as Array<{ body: IEmailSendBatch; retry?: () => void }>).map((msg) => {
            const { messageId, connectionId, mail } = msg.body;
            const task = deliverScheduledEmail(
              { messageId, connectionId, mail: mail as StoredOutgoingMessage | undefined },
              {
                statusKV,
                payloadKV,
                // Le verrou d'envoi : SQL transactionnel dans le DO de la connexion, seul
                // moyen d'empêcher deux livraisons concurrentes d'envoyer deux fois.
                reservation: createSendReservationGate(this.env, connectionId),
                send: async (targetConnectionId, payload) => {
                  let agent: Awaited<ReturnType<typeof getZeroAgent>>;
                  try {
                    agent = await getZeroAgent(targetConnectionId, this.ctx);
                  } catch (error) {
                    // La resolution du stub precede TOUT appel au fournisseur : si elle
                    // echoue, rien n'a ete emis. Sans ce marqueur, l'erreur etait classee
                    // ambigue et bloquait definitivement un mail jamais tente.
                    throw new SendNotDispatchedError('failed to resolve mail agent', {
                      cause: error,
                    });
                  }
                  // `sendScheduled` NE JETTE PAS : elle classe l'echec dans le Durable
                  // Object, ou l'enveloppe du driver est encore entiere, et rend deux
                  // chaines. Une erreur jetee a travers cette frontiere RPC arrive en
                  // `Error` nu (mesure sur workerd : proprietes propres stack/message/
                  // remote), donc `classifySendFailure` cote appelant ne voyait jamais le
                  // moindre statut : tout echec devenait `ambiguous`.
                  const attempt = await agent.stub.sendScheduled(
                    payload as Parameters<typeof agent.stub.sendScheduled>[0],
                  );
                  if (!attempt.ok) throw fromScheduledSendAttempt(attempt);
                },
                retry: () => msg.retry?.(),
                capture: (error, context) =>
                  this.ctx.waitUntil(captureServerException(error, this.env, context)),
                logger,
              },
            );
            return { task, retry: () => msg.retry?.() };
          }),
        );
        return;
      }
      case batch.queue.startsWith('thread-queue'): {
        const tracer = initTracing();

        await this.settleQueueBatch(
          batch.queue,
          (
            batch.messages as unknown as Array<{
              body: { providerId: string; historyId: string; subscriptionName: string };
              retry?: () => void;
            }>
          ).map((msg) => ({
            retry: () => msg.retry?.(),
            task: (async () => {
              const span = tracer.startSpan('thread_queue_processing', {
                attributes: {
                  'provider.id': msg.body.providerId,
                  'history.id': msg.body.historyId,
                  'subscription.name': msg.body.subscriptionName,
                  'queue.name': batch.queue,
                },
              });

              try {
                const providerId = msg.body.providerId;
                const historyId = msg.body.historyId;
                const subscriptionName = msg.body.subscriptionName;

                const workflowRunner = env.WORKFLOW_RUNNER.get(env.WORKFLOW_RUNNER.newUniqueId());
                const result = await workflowRunner.runMainWorkflow({
                  providerId,
                  historyId,
                  subscriptionName,
                });
                // Sortie complete du workflow (compteurs + identifiants de fil) : `debug`.
                logger.debug('[THREAD_QUEUE] result', result);
                span.setAttributes({
                  'workflow.result': typeof result === 'string' ? result : JSON.stringify(result),
                  'workflow.success': true,
                });
              } catch (error) {
                // Sans retry explicite, l'exception etait avalee et le message ACKe :
                // la notification Gmail etait perdue definitivement.
                logger.error('Error running workflow', error);
                span.recordException(error as Error);
                span.setStatus({ code: 2, message: (error as Error).message });
                // ...et le rejeu, lui, ne produisait AUCUN evenement : une notification qui
                // echoue en boucle jusqu'a epuisement de ses tentatives restait invisible.
                this.ctx.waitUntil(
                  captureServerException(error, this.env, {
                    transaction: `queue ${batch.queue}`,
                    extra: { historyId: msg.body.historyId, providerId: msg.body.providerId },
                  }),
                );
                msg.retry?.();
              } finally {
                span.end();
              }
            })(),
          })),
        );
        break;
      }
    }
  }
  async scheduled() {
    bootEnv(this.env as unknown as Record<string, unknown>);
    logger.info('Running scheduled tasks...');

    // Les deux taches sont INDEPENDANTES et doivent le rester. Enchainees derriere un
    // `await`, une panne de la premiere (KV `list` indisponible) empechait la seconde de
    // s'executer — c'est-a-dire empechait le renouvellement des watch Gmail, la panne
    // meme que ce cron existe pour eviter. Chacune est capturee pour son propre compte ;
    // le tick echoue quand meme si l'une a echoue, pour que la plateforme le sache.
    const outcomes = await Promise.allSettled([
      this.runScheduledTask('scheduled processScheduledEmails', () =>
        this.processScheduledEmails(),
      ),
      this.runScheduledTask('scheduled processExpiredSubscriptions', () =>
        this.processExpiredSubscriptions(),
      ),
    ]);
    const failure = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failure && failure.status === 'rejected') throw failure.reason;
  }

  /**
   * Execute une tache de cron en la CAPTURANT. Les deux crons s'executaient hors de toute
   * capture ; `scheduled()` en a recu une, mais `processScheduledEmails` la neutralisait en
   * avalant tout dans un try/catch englobant.
   */
  private async runScheduledTask(transaction: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (err) {
      this.ctx.waitUntil(captureServerException(err, this.env, { transaction }));
      throw err;
    }
  }

  private async processScheduledEmails() {
    logger.info('Checking for scheduled emails ready to be queued...');
    const { scheduled_emails: scheduledKV, send_email_queue } = this.env as {
      scheduled_emails: KVNamespace;
      send_email_queue: Queue<IEmailSendBatch>;
    };

    const now = Date.now();
    const twelveHoursFromNow = now + 12 * 60 * 60 * 1000;

    let cursor: string | undefined = undefined;
    const batchSize = 1000;

    do {
      const listResp: {
        keys: { name: string }[];
        cursor?: string;
      } = await scheduledKV.list({ cursor, limit: batchSize });
      cursor = listResp.cursor;

      for (const key of listResp.keys) {
        try {
          const scheduledData = await scheduledKV.get(key.name);
          if (!scheduledData) continue;

          const { messageId, connectionId, sendAt } = JSON.parse(scheduledData);

          if (sendAt <= twelveHoursFromNow) {
            const delaySeconds = Math.max(0, Math.floor((sendAt - now) / 1000));

            logger.info(`Queueing scheduled email ${messageId} with ${delaySeconds}s delay`);

            const queueBody: IEmailSendBatch = {
              messageId,
              connectionId,
              sendAt,
            };

            await send_email_queue.send(queueBody, { delaySeconds });
            await scheduledKV.delete(key.name);

            logger.info(`Successfully queued scheduled email ${messageId}`);
          }
        } catch (error) {
          // Une clef isolee illisible ne doit pas arreter la mise en file des autres —
          // mais elle doit REMONTER : ce catch ne journalisait plus rien d'exploitable.
          // Le catch ENGLOBANT, lui, a disparu : il avalait toute panne de `list()` ou de
          // la queue, ce qui neutralisait la capture Sentry de `scheduled()` installee
          // juste au-dessus, et le cron d'envoi differe echouait sans aucun evenement.
          logger.error('Failed to process scheduled email key', key.name, error);
          this.ctx.waitUntil(
            captureServerException(error, this.env, {
              transaction: 'scheduled processScheduledEmails',
              extra: { key: key.name },
            }),
          );
        }
      }
    } while (cursor);
  }

  private async processExpiredSubscriptions() {
    logger.info('[SCHEDULED] Checking for expired subscriptions...');
    const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);
    const allAccounts = await db.query.connection.findMany({
      where: (fields, { isNotNull, and }) =>
        and(isNotNull(fields.accessToken), isNotNull(fields.refreshToken)),
    });
    await conn.end();
    logger.debug('[SCHEDULED] allAccounts', allAccounts.length);
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const expiredSubscriptions: Array<{ connectionId: string; providerId: EProviders }> = [];

    const nowTs = Date.now();

    const unsnoozeMap: Record<string, { threadIds: string[]; keyNames: string[] }> = {};

    let cursor: string | undefined = undefined;
    do {
      const listResp: {
        keys: { name: string; metadata?: { wakeAt?: string } }[];
        cursor?: string;
      } = await this.env.snoozed_emails.list({ cursor, limit: 1000 });
      cursor = listResp.cursor;

      for (const key of listResp.keys) {
        try {
          const wakeAtIso = key.metadata?.wakeAt as string | undefined;
          if (!wakeAtIso) continue;
          const wakeAt = new Date(wakeAtIso).getTime();
          if (wakeAt > nowTs) continue;

          const [threadId, connectionId] = key.name.split('__');
          if (!threadId || !connectionId) continue;

          if (!unsnoozeMap[connectionId]) {
            unsnoozeMap[connectionId] = { threadIds: [], keyNames: [] };
          }
          unsnoozeMap[connectionId].threadIds.push(threadId);
          unsnoozeMap[connectionId].keyNames.push(key.name);
        } catch (error) {
          logger.error('Failed to prepare unsnooze for key', key.name, error);
        }
      }
    } while (cursor);

    // await Promise.all(
    //   Object.entries(unsnoozeMap).map(async ([connectionId, { threadIds, keyNames }]) => {
    //     try {
    //       const { stub: agent } = await getZeroAgent(connectionId, this.ctx);
    //       await agent.queue('unsnoozeThreadsHandler', { connectionId, threadIds, keyNames });
    //     } catch (error) {
    //       logger.error('Failed to enqueue unsnooze tasks', { connectionId, threadIds, error });
    //     }
    //   }),
    // );

    await Promise.all(
      allAccounts.map(async ({ id, providerId }) => {
        const lastSubscribed = await this.env.gmail_sub_age.get(`${id}__${providerId}`);

        if (lastSubscribed) {
          const subscriptionDate = new Date(lastSubscribed);
          if (subscriptionDate < fiveDaysAgo) {
            logger.info(`[SCHEDULED] Found expired Google subscription for connection: ${id}`);
            expiredSubscriptions.push({ connectionId: id, providerId: providerId as EProviders });
          }
        } else {
          expiredSubscriptions.push({ connectionId: id, providerId: providerId as EProviders });
        }
      }),
    );

    // Send expired subscriptions to queue for renewal
    if (expiredSubscriptions.length > 0) {
      logger.info(
        `[SCHEDULED] Sending ${expiredSubscriptions.length} expired subscriptions to renewal queue`,
      );
      await Promise.all(
        expiredSubscriptions.map(async ({ connectionId, providerId }) => {
          await this.env.subscribe_queue.send({ connectionId, providerId });
        }),
      );
    }

    // `allAccounts.keys` est la METHODE Array.prototype.keys : `.length` y vaut son arite,
    // soit 0. Le cron journalisait donc invariablement « Processed 0 accounts ».
    logger.info(
      `[SCHEDULED] Processed ${allAccounts.length} accounts, found ${expiredSubscriptions.length} expired subscriptions`,
    );
  }
}

export {
  ZeroAgent,
  ZeroMCP,
  ZeroDriver,
  ThinkingMCP,
  WorkflowRunner,
  ThreadSyncWorker,
  SyncThreadsWorkflow,
  SyncThreadsCoordinatorWorkflow,
  ShardRegistry,
};
export { DbRpcDO, ZeroDB } from './db/durable-objects';
