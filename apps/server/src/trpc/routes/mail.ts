import {
  cancelSendJob,
  createSendJob,
  getSendJobForConnection,
  getSendJobForUser,
  listSendJobsForUser,
  markSendJobEnqueued,
  retrySendJob,
  sendJobStatuses,
} from '../../lib/send-outbox';
import {
  forceReSync,
  getThreadsFromDB,
  getZeroAgent,
  getZeroDB,
  getThread,
  modifyThreadLabelsInDB,
  deleteAllSpam,
} from '../../lib/server-utils';
import { buildMailboxOverview, getMailboxActivityOrZero } from '../../lib/mailbox-overview';
import { IGetThreadResponseSchema, type IGetThreadsResponse } from '../../lib/driver/types';
import { activeDriverProcedure, router, privateProcedure } from '../trpc';
import { processEmailHtml } from '../../lib/email-processor';
import { previewSearchText } from '../../lib/search-preview';
import { defaultPageSize, FOLDERS } from '../../lib/utils';
import { serializedFileSchema } from '../../lib/schemas';
import type { DeleteAllSpamResponse } from '../../types';
import { openThreadProcedure } from './open-thread';
import { ThreadsResponseSchema } from '@zero/types';
import { getContext } from 'hono/context-storage';
import { type HonoContext } from '../../ctx';
import { createDb, type DB } from '../../db';
import { logger } from '../../lib/logger';
import { TRPCError } from '@trpc/server';
import { env } from '../../env';
import { z } from 'zod';

const senderSchema = z.object({
  name: z.string().optional(),
  email: z.string(),
});

// Connexion Postgres par requête (pattern outbox.ts) : la fermeture part en
// waitUntil pour ne pas allonger la réponse.
const withSendDb = async <T>(callback: (db: DB) => Promise<T>) => {
  const executionCtx = getContext<HonoContext>().executionCtx;
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  try {
    return await callback(db);
  } finally {
    executionCtx.waitUntil(conn.end());
  }
};

export const mailRouter = router({
  mailboxOverview: activeDriverProcedure
    .input(
      z.object({
        connectionId: z.string().min(1),
        todayStartMs: z.number().int().nonnegative(),
        weekStartMs: z.number().int().nonnegative(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.connectionId !== ctx.activeConnection.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active connection changed' });
      }

      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(ctx.activeConnection.id, executionCtx);
      const [folders, activity] = await Promise.all([
        agent.getMailboxCounts(),
        withSendDb((db) =>
          // Secondary signal: degrades to zeros on failure, never a 500 while
          // the folder counts are available (prod fix 2026-08-01).
          getMailboxActivityOrZero(db, {
            connectionId: ctx.activeConnection.id,
            todayStart: new Date(input.todayStartMs),
            weekStart: new Date(input.weekStartMs),
          }),
        ),
      ]);

      return buildMailboxOverview(folders, activity);
    }),
  suggestRecipients: activeDriverProcedure
    .input(
      z.object({
        query: z.string().optional().default(''),
        limit: z.number().optional().default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);

      return await agent.suggestRecipients(input.query, input.limit);
    }),
  forceSync: activeDriverProcedure.mutation(async ({ ctx }) => {
    const { activeConnection } = ctx;
    return await forceReSync(activeConnection.id);
  }),
  get: activeDriverProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(IGetThreadResponseSchema)
    .query(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      const result = await getThread(activeConnection.id, input.id);
      return result.result;
    }),
  openThread: openThreadProcedure,
  listThreads: activeDriverProcedure
    .input(
      z.object({
        folder: z.string().optional().default('inbox'),
        q: z.string().optional().default(''),
        maxResults: z.number().optional().default(defaultPageSize),
        cursor: z.string().optional().default(''),
        labelIds: z.array(z.string()).optional().default([]),
        // CUA 2026-07-30 (obs 3, reliquat serveur) : préview projection-first.
        // true → la recherche est servie par la projection DO (sujet/expéditeur,
        // instantané) au lieu de Gmail `q` ; le client l'affiche PENDANT le vol
        // Gmail, la réponse Gmail reste authoritative et la remplace.
        localPreview: z.boolean().optional().default(false),
      }),
    )
    .output(ThreadsResponseSchema)
    .query(async ({ ctx, input }) => {
      const { folder, maxResults, cursor, q, labelIds, localPreview } = input;
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);

      logger.debug('[listThreads] input:', {
        folder,
        maxResults,
        cursor,
        qLength: q?.length,
        labelIds,
      });

      if (folder === FOLDERS.DRAFT) {
        logger.debug('[listThreads] Listing drafts');
        const drafts = await agent.listDrafts({
          q,
          maxResults,
          pageToken: cursor,
        });
        logger.debug('[listThreads] Drafts result:', drafts);
        return drafts;
      }

      type ThreadItem = { id: string; historyId: string | null; $raw?: unknown };

      let threadsResponse: IGetThreadsResponse;

      if (q && localPreview) {
        // Préview projection-first : LIKE sujet/expéditeur dans le DO, borné au
        // label du dossier (sous-ensemble strict de la sémantique Gmail — même
        // scope que labelIds INBOX + q côté Gmail). Une requête à opérateurs
        // dépasse cette sémantique → page vide, le client garde son fallback.
        const previewText = previewSearchText(q);
        threadsResponse = previewText
          ? await getThreadsFromDB(activeConnection.id, {
              folder,
              q: previewText,
              maxResults,
              labelIds,
              pageToken: cursor,
            })
          : { threads: [], nextPageToken: '' };
      } else if (q) {
        threadsResponse = await agent.rawListThreads({
          query: q,
          maxResults,
          labelIds,
          pageToken: cursor,
          folder,
        });
      } else {
        threadsResponse = await getThreadsFromDB(activeConnection.id, {
          folder,
          maxResults,
          labelIds,
          pageToken: cursor,
        });
      }

      if (folder === FOLDERS.SNOOZED) {
        const nowTs = Date.now();
        const filtered: ThreadItem[] = [];

        logger.debug('[listThreads] Filtering snoozed threads at', new Date(nowTs).toISOString());

        await Promise.all(
          threadsResponse.threads.map(async (t: ThreadItem) => {
            const keyName = `${t.id}__${activeConnection.id}`;
            try {
              const wakeAtIso = await env.snoozed_emails.get(keyName);
              if (!wakeAtIso) {
                filtered.push(t);
                return;
              }

              const wakeAt = new Date(wakeAtIso).getTime();
              if (wakeAt > nowTs) {
                filtered.push(t);
                return;
              }

              logger.debug('[UNSNOOZE_ON_ACCESS] Expired thread', t.id, {
                wakeAtIso,
                now: new Date(nowTs).toISOString(),
              });

              await modifyThreadLabelsInDB(activeConnection.id, t.id, ['INBOX'], ['SNOOZED']);
              await env.snoozed_emails.delete(keyName);
            } catch (error) {
              logger.error('[UNSNOOZE_ON_ACCESS] Failed for', t.id, error);
              filtered.push(t);
            }
          }),
        );

        threadsResponse.threads = filtered;
        logger.debug('[listThreads] Snoozed threads after filtering:', filtered);
      }

      if (threadsResponse.threads.length === 0 && folder === FOLDERS.INBOX && !q) {
        const now = Date.now();
        const cooldownKey = `resync_cooldown_${activeConnection.id}`;
        const lastResyncStr = await env.gmail_processing_threads.get(cooldownKey);
        const lastResync = lastResyncStr ? parseInt(lastResyncStr, 10) : 0;
        const RESYNC_COOLDOWN_MS = 30000;

        if (now - lastResync > RESYNC_COOLDOWN_MS) {
          await env.gmail_processing_threads.put(cooldownKey, now.toString(), {
            expirationTtl: 60,
          });

          getZeroAgent(activeConnection.id, executionCtx)
            .then((_agent) => {
              _agent.stub.forceReSync().catch((error) => {
                logger.error('[listThreads] Async resync failed:', error);
              });
            })
            .catch((error) => {
              logger.error('[listThreads] Failed to get agent for async resync:', error);
            });
        }
      }

      logger.debug('[listThreads] Returning threadsResponse:', threadsResponse);
      return threadsResponse;
    }),
  markAsRead: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, [], ['UNREAD']),
        ),
      );
    }),
  markAsUnread: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    // TODO: Add batching
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['UNREAD'], []),
        ),
      );
    }),
  markAsImportant: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['IMPORTANT'], []),
        ),
      );
    }),
  modifyLabels: activeDriverProcedure
    .input(
      z.object({
        threadId: z.string().array(),
        addLabels: z.string().array().optional().default([]),
        removeLabels: z.string().array().optional().default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
      const { threadId, addLabels, removeLabels } = input;

      const result = await agent.normalizeIds(threadId);
      const { threadIds } = result;

      if (threadIds.length) {
        await Promise.all(
          threadIds.map((threadId) =>
            modifyThreadLabelsInDB(activeConnection.id, threadId, addLabels, removeLabels),
          ),
        );
        return { success: true };
      }

      return { success: false, error: 'No label changes specified' };
    }),

  toggleStar: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
      const { threadIds } = await agent.normalizeIds(input.ids);

      if (!threadIds.length) {
        return { success: false, error: 'No thread IDs provided' };
      }

      const threadResults = await Promise.allSettled(
        threadIds.map(async (id: string) => {
          const thread = await getThread(activeConnection.id, id);
          return thread.result;
        }),
      );

      let anyStarred = false;
      let processedThreads = 0;

      for (const result of threadResults) {
        if (result.status === 'fulfilled' && result.value && result.value.messages.length > 0) {
          processedThreads++;
          const isThreadStarred = result.value.messages.some((message) =>
            message.tags?.some((tag) => tag.name.toLowerCase().startsWith('starred')),
          );
          if (isThreadStarred) {
            anyStarred = true;
            break;
          }
        }
      }

      const shouldStar = processedThreads > 0 && !anyStarred;

      await Promise.all(
        threadIds.map((threadId) =>
          modifyThreadLabelsInDB(
            activeConnection.id,
            threadId,
            shouldStar ? ['STARRED'] : [],
            shouldStar ? [] : ['STARRED'],
          ),
        ),
      );

      return { success: true };
    }),
  toggleImportant: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
      const { threadIds } = await agent.normalizeIds(input.ids);

      if (!threadIds.length) {
        return { success: false, error: 'No thread IDs provided' };
      }

      const threadResults = await Promise.allSettled(
        threadIds.map(async (id: string) => {
          const thread = await getThread(activeConnection.id, id);
          return thread.result;
        }),
      );

      let anyImportant = false;
      let processedThreads = 0;

      for (const result of threadResults) {
        if (result.status === 'fulfilled' && result.value && result.value.messages.length > 0) {
          processedThreads++;
          const isThreadImportant = result.value.messages.some((message) =>
            message.tags?.some((tag) => tag.name.toLowerCase().startsWith('important')),
          );
          if (isThreadImportant) {
            anyImportant = true;
            break;
          }
        }
      }

      const shouldMarkImportant = processedThreads > 0 && !anyImportant;

      await Promise.all(
        threadIds.map((threadId) =>
          modifyThreadLabelsInDB(
            activeConnection.id,
            threadId,
            shouldMarkImportant ? ['IMPORTANT'] : [],
            shouldMarkImportant ? [] : ['IMPORTANT'],
          ),
        ),
      );

      return { success: true };
    }),
  bulkStar: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['STARRED'], []),
        ),
      );
    }),
  bulkMarkImportant: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['IMPORTANT'], []),
        ),
      );
    }),
  bulkUnstar: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, [], ['STARRED']),
        ),
      );
    }),
  deleteAllSpam: activeDriverProcedure.mutation(async ({ ctx }): Promise<DeleteAllSpamResponse> => {
    const { activeConnection } = ctx;
    try {
      const result = await deleteAllSpam(activeConnection.id);
      return {
        success: true,
        message: `Spam emails deleted ${result.deletedCount} threads`,
        count: result.deletedCount,
      };
    } catch (error) {
      logger.error('Error deleting spam emails:', error);
      return {
        success: false,
        message: 'Failed to delete spam emails',
        error: String(error),
        count: 0,
      };
    }
  }),
  bulkUnmarkImportant: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, [], ['IMPORTANT']),
        ),
      );
    }),

  // Envoi durable : TOUT Send (immédiat, undo, planifié) devient une ligne
  // send_job Postgres + un message Queue, et répond dès que les deux sont
  // acceptés — jamais après Gmail. Le consumer (lib/send-outbox/consumer)
  // porte l'appel fournisseur en at-least-once avec claim CAS.
  send: activeDriverProcedure
    .input(
      z.object({
        to: z.array(senderSchema),
        subject: z.string(),
        message: z.string(),
        attachments: z.array(serializedFileSchema).optional().default([]),
        headers: z.record(z.string()).optional().default({}),
        cc: z.array(senderSchema).optional(),
        bcc: z.array(senderSchema).optional(),
        threadId: z.string().optional(),
        fromEmail: z.string().optional(),
        draftId: z.string().optional(),
        isForward: z.boolean().optional(),
        originalMessage: z.string().optional(),
        scheduleAt: z.string().optional(),
        // Clé d'idempotence générée par le composer, stable à travers les
        // doubles clics et retries réseau ; scopée par connexion via la
        // contrainte unique (connection_id, client_submission_key).
        clientSendId: z
          .string()
          .regex(/^[A-Za-z0-9-]{8,64}$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection, sessionUser } = ctx;
      const { draftId, scheduleAt, attachments, clientSendId, ...mail } = input as typeof input & {
        scheduleAt?: string;
      };

      let scheduledTime: number | null = null;
      if (scheduleAt) {
        const parsedTime = Date.parse(scheduleAt);
        if (isNaN(parsedTime)) {
          return { success: false, error: 'Invalid schedule date format' } as const;
        }
        if (parsedTime <= Date.now()) {
          return { success: false, error: 'Schedule time must be in the future' } as const;
        }
        scheduledTime = parsedTime;
      }

      const zeroDb = await getZeroDB(sessionUser.id);
      const userSettings = await zeroDb.findUserSettings();
      const undoSendEnabled = userSettings?.settings?.undoSendEnabled ?? false;

      // undo actif → fenêtre de 15 s via le délai Queue ; sinon envoi immédiat.
      const targetTime = scheduledTime ?? (undoSendEnabled ? Date.now() + 15_000 : Date.now());
      const rawDelaySeconds = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
      const maxQueueDelay = 43200; // 12 h, délai maximal accepté par Cloudflare Queues
      const isLongTerm = rawDelaySeconds > maxQueueDelay;

      const mailPayload = {
        ...mail,
        draftId,
        attachments,
        connectionId: activeConnection.id,
      };

      const { send_email_queue } = env;

      return withSendDb(async (db) => {
        let job;
        let deduped;
        try {
          ({ job, deduped } = await createSendJob(db, {
            connectionId: activeConnection.id,
            clientSubmissionKey: clientSendId ?? crypto.randomUUID(),
            payload: mailPayload,
            threadId: input.threadId ?? null,
            scheduledSendAt: targetTime > Date.now() ? new Date(targetTime) : null,
          }));
        } catch (error) {
          logger.error('Failed to persist send job', error);
          return { success: false, error: 'Failed to queue email send' } as const;
        }

        if (deduped) {
          // Double clic / retry réseau : le job existe déjà. La réponse dépend
          // de son état réel — jamais un succès aveugle.
          if (job.status === 'cancelled') {
            return { success: false, error: 'Send was cancelled' } as const;
          }
          if (job.status === 'failed') {
            // Le job reste failed + payload conservé : rejouable via retrySend
            // ou la page Queue, mais la soumission dupliquée n'est PAS un succès.
            return { success: false, error: job.error ?? 'Send failed' } as const;
          }
          if (job.status === 'sent' || job.status === 'sending' || job.enqueuedAt) {
            // Déjà parti ou déjà dans la Queue : dédup normale.
            return {
              success: true,
              queued: true,
              messageId: job.id,
              sendAt: job.scheduledSendAt?.getTime(),
              duplicate: true,
            } as const;
          }
          // queued sans marqueur d'enqueue : la remise à la Queue avait échoué
          // (ou n'a pas encore eu lieu) — ce retry HTTP republie CE job.
          const dueAt = job.scheduledSendAt?.getTime() ?? Date.now();
          const dedupeDelaySeconds = Math.max(0, Math.floor((dueAt - Date.now()) / 1000));
          if (dedupeDelaySeconds > maxQueueDelay) {
            // Planifié long terme : c'est le territoire du sweep cron.
            return {
              success: true,
              scheduled: true,
              messageId: job.id,
              sendAt: dueAt,
              duplicate: true,
            } as const;
          }
          try {
            await send_email_queue.send(
              { messageId: job.id, jobId: job.id, connectionId: activeConnection.id },
              { delaySeconds: dedupeDelaySeconds },
            );
          } catch (error) {
            logger.error(`Failed to re-enqueue deduped send job ${job.id}`, error);
            // Job intact (queued, enqueuedAt null) : nouvelle tentative même
            // clé possible, et le sweep cron le rattrape de toute façon.
            return { success: false, error: 'Failed to enqueue email send' } as const;
          }
          await markSendJobEnqueued(db, job.id).catch(() => {});
          return {
            success: true,
            queued: true,
            messageId: job.id,
            sendAt: dueAt,
            duplicate: true,
          } as const;
        }

        if (isLongTerm) {
          // Au-delà du délai Queue maximal : le sweep cron enqueue le job quand
          // il entre dans l'horizon de 12 h. La ligne DB est l'autorité.
          return {
            success: true,
            scheduled: true,
            messageId: job.id,
            sendAt: targetTime,
          } as const;
        }

        try {
          await send_email_queue.send(
            { messageId: job.id, jobId: job.id, connectionId: activeConnection.id },
            { delaySeconds: rawDelaySeconds },
          );
        } catch (error) {
          logger.error(`Failed to enqueue send job ${job.id}`, error);
          // Le job est CONSERVÉ (queued, enqueuedAt null) : le composer reste
          // ouvert avec la même clé de soumission, dont le retry HTTP republie
          // ce même job (chemin dedupe ci-dessus) ; le sweep cron couvre
          // l'abandon. Aucune suppression — la ligne DB est l'autorité durable.
          return { success: false, error: 'Failed to enqueue email send' } as const;
        }

        // Marqueur best-effort pour le sweep ; un échec ici est bénin.
        await markSendJobEnqueued(db, job.id).catch(() => {});

        return { success: true, queued: true, messageId: job.id, sendAt: targetTime } as const;
      });
    }),
  // Suivi post-enqueue : le composer interroge l'état du job pour transformer
  // un échec asynchrone en toast actionnable au lieu d'un faux succès muet.
  getSendStatus: activeDriverProcedure
    .input(z.object({ messageId: z.string() }))
    .query(async ({ input, ctx }) =>
      withSendDb(async (db) => {
        const job = await getSendJobForConnection(db, {
          id: input.messageId,
          connectionId: ctx.activeConnection.id,
        });
        if (!job) return { status: 'unknown' as const, error: null, sendAt: null };
        return {
          status: job.status,
          error: job.error,
          sendAt: job.scheduledSendAt?.getTime() ?? null,
        };
      }),
    ),
  listSendJobs: activeDriverProcedure
    .input(
      z
        .object({ statuses: z.array(z.enum(sendJobStatuses)).optional() })
        .optional()
        .default({}),
    )
    .query(async ({ input, ctx }) =>
      withSendDb(async (db) => {
        const jobs = await listSendJobsForUser(db, {
          userId: ctx.sessionUser.id,
          statuses: input.statuses,
          limit: 20,
        });
        return jobs.map((job) => {
          const payload = job.payload as { subject?: string; to?: { email: string }[] } | null;
          return {
            id: job.id,
            status: job.status,
            error: job.error,
            subject: payload?.subject ?? null,
            to: payload?.to?.map((recipient) => recipient.email) ?? [],
            sendAt: job.scheduledSendAt?.getTime() ?? null,
            createdAt: job.createdAt.getTime(),
          };
        });
      }),
    ),
  retrySend: activeDriverProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { send_email_queue } = env;
      return withSendDb(async (db) => {
        // Scope utilisateur (pas connexion active) : la page Queue doit pouvoir
        // rejouer un échec même après un changement de compte ; le consumer
        // enverra via la connexion propriétaire du job.
        const job = await getSendJobForUser(db, {
          id: input.messageId,
          userId: ctx.sessionUser.id,
        });
        if (!job) return { success: false, error: 'Send job not found' } as const;
        if (job.status === 'cancelled') {
          return { success: false, error: 'Send was cancelled' } as const;
        }
        if (job.status !== 'failed') {
          // sent / queued / sending : déjà en route, le retry est un no-op sûr.
          return { success: true, queued: true, messageId: job.id } as const;
        }

        const revived = await retrySendJob(db, { id: job.id, connectionId: job.connectionId });
        if (!revived) {
          return { success: false, error: 'Send job changed state; refresh and retry' } as const;
        }

        try {
          await send_email_queue.send(
            { messageId: job.id, jobId: job.id, connectionId: job.connectionId },
            { delaySeconds: 0 },
          );
          await markSendJobEnqueued(db, job.id).catch(() => {});
        } catch (error) {
          // Le job est requeued en DB : le sweep cron le remettra dans la Queue.
          logger.error(`Failed to re-enqueue send job ${job.id}; sweep will recover`, error);
        }

        return { success: true, queued: true, messageId: job.id } as const;
      });
    }),
  unsend: activeDriverProcedure
    .input(
      z.object({
        messageId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { messageId } = input;
      const { activeConnection } = ctx;
      const {
        pending_emails_status: statusKV,
        pending_emails_payload: payloadKV,
        scheduled_emails: scheduledKV,
      } = env;

      // Chemin autoritatif : annulation CAS de la ligne send_job (queued/failed
      // uniquement — un job en cours d'envoi ou envoyé ne se rappelle pas).
      const jobResult = await withSendDb(async (db) => {
        const job = await getSendJobForConnection(db, {
          id: messageId,
          connectionId: activeConnection.id,
        });
        if (!job) return null;
        const cancelled = await cancelSendJob(db, {
          id: messageId,
          connectionId: activeConnection.id,
        });
        if (cancelled) return { success: true } as const;
        return {
          success: false,
          error: `Too late to cancel (status: ${job.status})`,
        } as const;
      });
      if (jobResult) return jobResult;

      // Repli legacy KV : messages enqueued avant le déploiement du send_job.
      const scheduledData = await scheduledKV.get(messageId);
      if (scheduledData) {
        try {
          const { connectionId } = JSON.parse(scheduledData);
          if (connectionId !== activeConnection.id) {
            return {
              success: false,
              error: "Unauthorized: Cannot cancel another user's scheduled email",
            } as const;
          }
        } catch (error) {
          logger.error('Failed to parse scheduled data for ownership verification:', error);
          return { success: false, error: 'Invalid scheduled email data' } as const;
        }
      }

      const payloadData = await payloadKV.get(messageId);
      if (payloadData) {
        try {
          const payload = JSON.parse(payloadData);
          if (payload.connectionId && payload.connectionId !== activeConnection.id) {
            return {
              success: false,
              error: "Unauthorized: Cannot cancel another user's queued email",
            } as const;
          }
        } catch (error) {
          logger.error('Failed to parse payload data:', error);
          return { success: false, error: 'Invalid payload data' } as const;
        }
      }

      await statusKV.put(messageId, 'cancelled', {
        expirationTtl: 60 * 60,
      });

      await payloadKV.delete(messageId);
      await scheduledKV.delete(messageId); // Clean up long-term schedule if it exists

      return { success: true };
    }),
  delete: activeDriverProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { exec, stub } = await getZeroAgent(activeConnection.id, executionCtx);
      exec(`DELETE FROM threads WHERE thread_id = ?`, input.id);
      await stub.reloadFolder('bin');
      return true;
    }),
  bulkDelete: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['TRASH'], []),
        ),
      );
    }),
  bulkArchive: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, [], ['INBOX']),
        ),
      );
    }),
  bulkMute: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      return Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['MUTE'], []),
        ),
      );
    }),
  getEmailAliases: activeDriverProcedure.query(async ({ ctx }) => {
    const { activeConnection } = ctx;
    const executionCtx = getContext<HonoContext>().executionCtx;
    const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
    return agent.getEmailAliases();
  }),
  snoozeThreads: activeDriverProcedure
    .input(
      z.object({
        ids: z.string().array(),
        wakeAt: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      if (!input.ids.length) {
        return { success: false, error: 'No thread IDs provided' };
      }

      const wakeAtDate = new Date(input.wakeAt);
      if (wakeAtDate <= new Date()) {
        return { success: false, error: 'Snooze time must be in the future' };
      }

      await Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['SNOOZED'], ['INBOX']),
        ),
      );

      const wakeAtIso = wakeAtDate.toISOString();
      await Promise.all(
        input.ids.map((threadId) =>
          env.snoozed_emails.put(`${threadId}__${activeConnection.id}`, wakeAtIso, {
            metadata: { wakeAt: wakeAtIso },
          }),
        ),
      );

      return { success: true };
    }),
  unsnoozeThreads: activeDriverProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      if (!input.ids.length) return { success: false, error: 'No thread IDs' };
      await Promise.all(
        input.ids.map((threadId) =>
          modifyThreadLabelsInDB(activeConnection.id, threadId, ['INBOX'], ['SNOOZED']),
        ),
      );
      await Promise.all(
        input.ids.map((threadId) =>
          env.snoozed_emails.delete(`${threadId}__${activeConnection.id}`),
        ),
      );
      return { success: true };
    }),
  getMessageAttachments: activeDriverProcedure
    .input(
      z.object({
        messageId: z.string(),
        // inlineOnly : ne renvoyer que les images CID inline du corps (les refs
        // `cid:` ne sont plus inlinées au sync — le reader les résout ici sans
        // payer le téléchargement des vraies pièces jointes du message).
        inlineOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
      return agent.getMessageAttachments(input.messageId, {
        inlineOnly: input.inlineOnly,
      }) as Promise<
        {
          filename: string;
          mimeType: string;
          size: number;
          attachmentId: string;
          contentId: string | null;
          headers: {
            name: string;
            value: string;
          }[];
          body: string;
        }[]
      >;
    }),
  processEmailContent: privateProcedure
    .input(
      z.object({
        html: z.string(),
        shouldLoadImages: z.boolean(),
        theme: z.enum(['light', 'dark']),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { processedHtml, hasBlockedImages } = processEmailHtml({
          html: input.html,
          shouldLoadImages: input.shouldLoadImages,
          theme: input.theme,
        });

        return {
          processedHtml,
          hasBlockedImages,
        };
      } catch (error) {
        logger.error('Error processing email content:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process email content',
        });
      }
    }),
  getRawEmail: activeDriverProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { activeConnection } = ctx;
      const { stub: agent } = await getZeroAgent(activeConnection.id);
      return agent.getRawEmail(input.id);
    }),
  verifyEmail: activeDriverProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const { activeConnection } = ctx;
        const { stub: agent } = await getZeroAgent(activeConnection.id);

        const rawEmail = await agent.getRawEmail(input.id);

        const { verify } = await import('../../lib/email-verification');
        const result = await verify(rawEmail);
        return result;
      } catch (error) {
        logger.error('Email verification error:', error);
        return { isVerified: false };
      }
    }),
});
