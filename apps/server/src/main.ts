import { SyncThreadsCoordinatorWorkflow } from './workflows/sync-threads-coordinator-workflow';
import { processSendEmailBatch, type SendEmailQueueMessage } from './lib/send-outbox/consumer';
import { SyncThreadsWorkflow } from './workflows/sync-threads-workflow';
import { ShardRegistry, ZeroAgent, ZeroDriver } from './routes/agent';
import { getZeroAgent, reSyncThread } from './lib/server-utils';
import { ThreadSyncWorker } from './routes/agent/sync-worker';
import { EProviders, type IEmailSendBatch } from './types';
import { runSendJobSweep } from './lib/send-outbox/sweep';
import { ThinkingMCP } from './lib/sequential-thinking';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { captureServerException } from './lib/sentry';
import { bootEnv, env, type ZeroEnv } from './env';
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
    switch (true) {
      case batch.queue.startsWith('subscribe-queue'): {
        logger.info('batch', batch);
        await Promise.all(
          (
            batch.messages as unknown as Array<{
              body: { connectionId: string; providerId: EProviders };
            }>
          ).map(async (msg) => {
            const connectionId = msg.body.connectionId;
            const providerId = msg.body.providerId;
            try {
              await enableBrainFunction({ id: connectionId, providerId });
            } catch (error) {
              logger.error(
                `Failed to enable brain function for connection ${connectionId}:`,
                error,
              );
            }
          }),
        );
        logger.info('[SUBSCRIBE_QUEUE] batch done');
        return;
      }
      case batch.queue.startsWith('send-email-queue'): {
        const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);
        try {
          await processSendEmailBatch(batch.messages as SendEmailQueueMessage[], {
            db,
            statusKV: this.env.pending_emails_status,
            payloadKV: this.env.pending_emails_payload,
            getAgent: (connectionId) => getZeroAgent(connectionId, this.ctx),
            resyncThread: (connectionId, threadId) => reSyncThread(connectionId, threadId),
            waitUntil: (promise) => this.ctx.waitUntil(promise),
          });
        } finally {
          this.ctx.waitUntil(conn.end());
        }
        return;
      }
      case batch.queue.startsWith('thread-queue'): {
        const tracer = initTracing();

        await Promise.all(
          (
            batch.messages as unknown as Array<{
              body: { providerId: string; historyId: string; subscriptionName: string };
            }>
          ).map(async (msg) => {
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
              logger.info('[THREAD_QUEUE] result', result);
              span.setAttributes({
                'workflow.result': typeof result === 'string' ? result : JSON.stringify(result),
                'workflow.success': true,
              });
            } catch (error) {
              logger.error('Error running workflow', error);
              span.recordException(error as Error);
              span.setStatus({ code: 2, message: (error as Error).message });
            } finally {
              span.end();
            }
          }),
        );
        break;
      }
    }
  }
  async scheduled() {
    bootEnv(this.env as unknown as Record<string, unknown>);
    logger.info('Running scheduled tasks...');

    // Tâches ISOLÉES (adversarial-11) : l'échec de l'une ne prive jamais les
    // suivantes — le sweep outbound P18 tourne même si les emails planifiés
    // ou les souscriptions échouent.
    const { runScheduledTasksIsolated } = await import('./lib/run-scheduled-tasks');
    await runScheduledTasksIsolated(
      [
        ['scheduled-emails', () => this.processScheduledEmails()],
        ['expired-subscriptions', () => this.processExpiredSubscriptions()],
        [
          'team-outbound-sweep',
          async () => {
            // P18 : outbox des webhooks sortants — claim CAS + bail, garde
            // SSRF/DoH à chaque tentative, signature HMAC.
            const { runOutboundDeliverySweep } = await import('./lib/teams/team-outbound-runner');
            await runOutboundDeliverySweep(this.env as unknown as import('./env').ZeroEnv);
          },
        ],
      ],
      (name, error) => logger.error(`scheduled task ${name} failed`, error),
    );
  }

  private async processScheduledEmails() {
    logger.info('Checking for scheduled emails ready to be queued...');
    const { scheduled_emails: scheduledKV, send_email_queue } = this.env as {
      scheduled_emails: KVNamespace;
      send_email_queue: Queue<IEmailSendBatch>;
    };

    await this.sweepSendJobs(send_email_queue);

    try {
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
            logger.error('Failed to process scheduled email key', key.name, error);
          }
        }
      } while (cursor);
    } catch (error) {
      logger.error('Error processing scheduled emails:', error);
    }
  }

  /**
   * Filet de réconciliation send_job : ré-enqueue les jobs jamais remis à la
   * Queue (crash entre commit DB et enqueue, ou planifiés au-delà de l'horizon
   * de délai Queue de 12 h), les jobs dont le message semble perdu, et les
   * `sending` orphelins. Les relivraisons en trop sont neutralisées par le
   * claim CAS du consumer.
   */
  private async sweepSendJobs(send_email_queue: Queue<IEmailSendBatch>) {
    const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);
    try {
      await runSendJobSweep(db, send_email_queue, { horizonMs: 12 * 60 * 60 * 1000 });
    } catch (error) {
      logger.error('[SCHEDULED] Send job sweep failed:', error);
    } finally {
      this.ctx.waitUntil(conn.end());
    }
  }

  private async processExpiredSubscriptions() {
    logger.info('[SCHEDULED] Checking for expired subscriptions...');
    const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);
    const allAccounts = await db.query.connection.findMany({
      where: (fields, { isNotNull, and }) =>
        and(isNotNull(fields.accessToken), isNotNull(fields.refreshToken)),
    });
    await conn.end();
    logger.info('[SCHEDULED] allAccounts', allAccounts.length);
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

    logger.info(
      `[SCHEDULED] Processed ${allAccounts.keys.length} accounts, found ${expiredSubscriptions.length} expired subscriptions`,
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
export { TeamThreadRealtime } from './routes/team-realtime';
export { DbRpcDO, ZeroDB } from './db/durable-objects';
