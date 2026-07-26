import {
  forceReSync,
  getThreadsFromDB,
  getZeroAgent,
  getZeroDB,
  getThread,
  modifyThreadLabelsInDB,
  deleteAllSpam,
  reSyncThread,
} from '../../lib/server-utils';
import {
  cancelTtlSeconds,
  MAX_QUEUE_DELAY_SECONDS,
  MAX_SCHEDULE_AHEAD_SECONDS,
  scheduleTtlSeconds,
} from '../../lib/scheduled-send';
import { IGetThreadResponseSchema, type IGetThreadsResponse } from '../../lib/driver/types';
import { makeBulkLabelProcedure, makeToggleLabelProcedure } from './mail-label-procedures';
import type { DeleteAllSpamResponse, IEmailSendBatch } from '../../types';
import { activeDriverProcedure, router, privateProcedure } from '../trpc';
import { getConnectionRegistry } from '../../lib/connection-registry';
import { outgoingHeadersSchema } from '../../lib/mime-headers';
import { processEmailHtml } from '../../lib/email-processor';
import { defaultPageSize, FOLDERS } from '../../lib/utils';
import { toAttachmentFiles } from '../../lib/attachments';
import { serializedFileSchema } from '../../lib/schemas';
import { openThreadProcedure } from './open-thread';
// V4.1 list-projection (issue #30) : la liste sert la projection riche (superset de
// IGetThreadsResponse). Élargit le .output() pour ne PAS stripper subject/sender/date/labels/unread.
import { ThreadsResponseSchema } from '@zero/types';
import { getContext } from 'hono/context-storage';
import { type HonoContext } from '../../ctx';
import { logger } from '../../lib/logger';
import { TRPCError } from '@trpc/server';
import { env } from '../../env';
import { z } from 'zod';

const senderSchema = z.object({
  name: z.string().optional(),
  email: z.string(),
});

// const getFolderLabelId = (folder: string) => {
//   // Handle special cases first
//   if (folder === 'bin') return 'TRASH';
//   if (folder === 'archive') return ''; // Archive doesn't have a specific label

//   // For other folders, convert to uppercase (same as database method)
//   return folder.toUpperCase();
// };

export const mailRouter = router({
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
      }),
    )
    .output(ThreadsResponseSchema)
    .query(async ({ ctx, input }) => {
      const { folder, maxResults, cursor, q, labelIds } = input;
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);

      logger.debug('[listThreads] input:', { folder, maxResults, cursor, q, labelIds });

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

      // Apply folder-to-label mapping when no search query is provided
      const effectiveLabelIds = labelIds;

      if (q) {
        threadsResponse = await agent.rawListThreads({
          query: q,
          maxResults,
          labelIds: effectiveLabelIds,
          pageToken: cursor,
          folder,
        });
      } else {
        threadsResponse = await getThreadsFromDB(activeConnection.id, {
          folder,
          // query: q,
          maxResults,
          labelIds: effectiveLabelIds,
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

  toggleStar: makeToggleLabelProcedure('STARRED'),
  toggleImportant: makeToggleLabelProcedure('IMPORTANT'),
  bulkStar: makeBulkLabelProcedure('STARRED', 'add'),
  bulkMarkImportant: makeBulkLabelProcedure('IMPORTANT', 'add'),
  bulkUnstar: makeBulkLabelProcedure('STARRED', 'remove'),
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
  bulkUnmarkImportant: makeBulkLabelProcedure('IMPORTANT', 'remove'),

  send: activeDriverProcedure
    .input(
      z.object({
        to: z.array(senderSchema),
        subject: z.string(),
        message: z.string(),
        attachments: z.array(serializedFileSchema).optional().default([]),
        headers: outgoingHeadersSchema.optional().default({}),
        cc: z.array(senderSchema).optional(),
        bcc: z.array(senderSchema).optional(),
        threadId: z.string().optional(),
        fromEmail: z.string().optional(),
        draftId: z.string().optional(),
        isForward: z.boolean().optional(),
        originalMessage: z.string().optional(),
        scheduleAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection, sessionUser } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const agent = await getZeroAgent(activeConnection.id, executionCtx);

      const { draftId, scheduleAt, attachments, ...mail } = input as typeof input & {
        scheduleAt?: string;
      };

      const db = await getZeroDB(sessionUser.id);
      const userSettings = await db.findUserSettings();
      const undoSendEnabled = userSettings?.settings?.undoSendEnabled ?? false;
      const shouldSchedule = !!scheduleAt || undoSendEnabled;

      const afterTask = async () => {
        try {
          logger.warn('Saving writing style matrix...');
          // Post-send bookkeeping pulls in the AI SDK stack — load it off the hot path.
          const { updateWritingStyleMatrix } = await import('../../services/writing-style-service');
          await updateWritingStyleMatrix(activeConnection.id, input.message);
          logger.warn('Saved writing style matrix.');
        } catch (error) {
          logger.error('Failed to save writing style matrix', error);
        }
      };

      if (shouldSchedule) {
        const messageId = crypto.randomUUID();

        // Validate scheduleAt if provided
        let targetTime: number;
        if (scheduleAt) {
          const parsedTime = Date.parse(scheduleAt);
          if (isNaN(parsedTime)) {
            return { success: false, error: 'Invalid schedule date format' } as const;
          }

          const now = Date.now();

          if (parsedTime <= now) {
            return { success: false, error: 'Schedule time must be in the future' } as const;
          }

          // Borne HAUTE. Elle manquait : au-delà d'un an, `scheduleTtlSeconds` plafonne à
          // `MAX_KV_TTL_SECONDS` et le CORPS du message expire AVANT son échéance. Le cron
          // ne remet en file que `{messageId, connectionId, sendAt}` — jamais le corps — et
          // le mail disparaît sans que le client, qui a reçu `{success:true}`, l'apprenne.
          // C'est la perte silencieuse que l'alignement des TTL croyait avoir fermée : elle
          // subsistait dans ce cas limite, faute de refuser l'échéance en amont.
          if ((parsedTime - now) / 1000 > MAX_SCHEDULE_AHEAD_SECONDS) {
            // Littérale, comme les autres motifs de refus : le client conserve un type
            // d'erreur exploitable. La valeur « 365 » est verrouillée par un test
            // (scheduled-send.test.ts) qui casse si `MAX_SCHEDULE_AHEAD_SECONDS` bouge.
            return {
              success: false,
              error:
                'Schedule time must be at most 365 days ahead: beyond that the message body cannot be stored until its due date',
            } as const;
          }

          targetTime = parsedTime;
        } else {
          targetTime = Date.now() + 15_000;
        }

        const rawDelaySeconds = Math.floor((targetTime - Date.now()) / 1000);
        const isLongTerm = rawDelaySeconds > MAX_QUEUE_DELAY_SECONDS;

        // UNE seule duree de vie pour les trois clefs. Le corps etait ecrit avec 24 h fixes
        // alors que la planification pouvait courir jusqu'a un an : tout mail programme
        // au-dela de ~24 h perdait son contenu AVANT son echeance, et le cron ne remet en
        // file que `{messageId, connectionId, sendAt}` — jamais le corps.
        const ttlSeconds = scheduleTtlSeconds(rawDelaySeconds);

        const {
          pending_emails_status: statusKV,
          pending_emails_payload: payloadKV,
          scheduled_emails: scheduledKV,
          send_email_queue,
        } = env;

        try {
          await statusKV.put(messageId, 'pending', {
            expirationTtl: ttlSeconds,
          });
        } catch (error) {
          logger.error(`Failed to write pending status to KV for message ${messageId}`, error);
          return { success: false, error: 'Failed to schedule email status' } as const;
        }

        const mailPayload = {
          ...mail,
          draftId,
          attachments,
          connectionId: activeConnection.id,
        };

        try {
          await payloadKV.put(messageId, JSON.stringify(mailPayload), {
            expirationTtl: ttlSeconds,
          });
        } catch (error) {
          logger.error(`Failed to write email payload to KV for message ${messageId}`, error);
          return { success: false, error: 'Failed to schedule email payload' } as const;
        }

        if (isLongTerm) {
          try {
            await scheduledKV.put(
              messageId,
              JSON.stringify({
                messageId,
                connectionId: activeConnection.id,
                sendAt: targetTime,
              }),
              { expirationTtl: ttlSeconds },
            );
          } catch (error) {
            logger.error(
              `Failed to write long-term schedule to KV for message ${messageId}`,
              error,
            );
            return { success: false, error: 'Failed to schedule email (long-term)' } as const;
          }
        } else {
          const delaySeconds = rawDelaySeconds;
          const queueBody: IEmailSendBatch = {
            messageId,
            connectionId: activeConnection.id,
            sendAt: targetTime,
          };
          try {
            await send_email_queue.send(queueBody, { delaySeconds });
          } catch (error) {
            logger.error(`Failed to enqueue email send for message ${messageId}`, error);
            return { success: false, error: 'Failed to enqueue email send' } as const;
          }
        }

        ctx.c.executionCtx.waitUntil(afterTask());

        if (isLongTerm) {
          return { success: true, scheduled: true, messageId, sendAt: targetTime };
        } else {
          return { success: true, queued: true, messageId, sendAt: targetTime };
        }
      }

      const mailWithAttachments = {
        ...mail,
        attachments: attachments?.map((att: any) =>
          typeof att?.arrayBuffer === 'function' ? att : toAttachmentFiles([att])[0],
        ),
      } as typeof mail & { attachments: any[] };

      if (draftId) {
        await agent.stub.sendDraft(draftId, mailWithAttachments);
      } else {
        await agent.stub.create(mailWithAttachments);
      }

      if (input.threadId)
        ctx.c.executionCtx.waitUntil(reSyncThread(activeConnection.id, input.threadId));
      ctx.c.executionCtx.waitUntil(afterTask());
      return { success: true };
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

      let scheduledSendAt: number | undefined;
      const scheduledData = await scheduledKV.get(messageId);
      if (scheduledData) {
        try {
          const { connectionId, sendAt } = JSON.parse(scheduledData);
          if (connectionId !== activeConnection.id) {
            return {
              success: false,
              error: "Unauthorized: Cannot cancel another user's scheduled email",
            } as const;
          }
          scheduledSendAt = typeof sendAt === 'number' ? sendAt : undefined;
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

      // La marque d'annulation vivait 1 h. Au-dela, elle expirait AVANT l'echeance et le
      // consommateur, ne voyant plus `cancelled`, envoyait un mail que l'utilisateur avait
      // annule. Elle couvre desormais l'echeance connue (ou le delai de file maximal).
      await statusKV.put(messageId, 'cancelled', {
        expirationTtl: cancelTtlSeconds(scheduledSendAt, Date.now()),
      });

      await payloadKV.delete(messageId);
      await scheduledKV.delete(messageId); // Clean up long-term schedule if it exists

      return { success: true };
    }),
  /**
   * Issue d'un envoi différé. `pending_emails_status` était ÉCRIT et jamais lu : ni une
   * procédure tRPC ni l'interface n'y touchaient. Le client recevait
   * `{success:true, scheduled:true}` et n'apprenait jamais qu'un mail avait échoué, ni
   * qu'il était resté bloqué sur une issue ambiguë. Cette procédure est le lecteur qui
   * manquait.
   *
   * `reservation` est la source de vérité (SQL transactionnel du DO de la connexion) ;
   * `status` n'est que la surface KV, qui peut avoir expiré ou n'avoir pas pu être écrite.
   * L'autorisation est structurelle : on n'interroge que le registre de SA propre
   * connexion, il n'existe pas de chemin vers celui d'une autre.
   */
  scheduledSendStatus: activeDriverProcedure
    .input(z.object({ messageId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const status = await env.pending_emails_status.get(input.messageId);
      const registry = getConnectionRegistry(env, activeConnection.id);
      const reservation = await registry.getScheduledSendReservation(input.messageId);

      return {
        messageId: input.messageId,
        status: status ?? null,
        reservation: reservation
          ? {
              status: reservation.status,
              outcome: reservation.outcome,
              reservedAt: reservation.reservedAt,
              settledAt: reservation.settledAt,
              detail: reservation.detail,
            }
          : null,
        // `sending` sans règlement = tentative dont l'issue n'est jamais revenue. C'est le
        // coût assumé du « jamais de doublon » : ce mail ne repartira pas seul, et il doit
        // être visible plutôt que silencieux.
        stuck: reservation?.status === 'sending',
      };
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
      return agent.getMessageAttachments(input.messageId) as Promise<
        {
          filename: string;
          mimeType: string;
          size: number;
          attachmentId: string;
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
        // Borne d'entrée : `processEmailHtml` parse deux fois le HTML (sanitize-html puis
        // cheerio). Non bornée, la procédure acceptait des mégaoctets — 3,2 Mo mesurés à
        // 3,1 s de CPU — sur un worker dont le rate limiting n'est pas actif. 2 Mo est la
        // même borne que celle du sanitiseur destiné au LLM (lib/mail-sanitize).
        html: z.string().max(2_000_000),
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
