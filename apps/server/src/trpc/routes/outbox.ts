import {
  completeMailTriageRun,
  cancelDraftRevisionJobs,
  createDraftRevisionJob,
  createMailAgentEnrollment,
  createMailTriageRun,
  failMailTriageRun,
  listMailAgentDevices,
  listMailTriageRuns,
  revisionJobIdempotencyKey,
  retryLatestDraftRevisionJob,
  revokeMailAgentDevice,
  updateDraftOutboxSnapshot,
} from '../../lib/mail-agent';
import {
  DraftOutboxTransitionError,
  approveDraftOutboxJob,
  assertDraftOutboxConnectionOwner,
  cancelDraftOutboxJob,
  draftOutboxStatuses,
  enqueueDraftJob,
  getDraftOutboxItem,
  listDraftOutboxItems,
  retryDraftOutboxJob,
} from '../../lib/draft-outbox';
import {
  DEFAULT_TRIAGE_LOOKBACK_DAYS,
  DEFAULT_TRIAGE_MAX_RESULTS,
  RETA_TRIAGE_MAILBOX,
  classifyTriageThread,
  triageSearchQuery,
  type TriageCandidate,
} from '../../lib/mail-agent/triage';
import { activeDriverProcedure, privateProcedure, router } from '../trpc';
import { assertSendableEmail } from '../../lib/send-content-guard';
import { createDraftContentDigest } from '../../lib/draft-outbox';
import { getZeroAgent } from '../../lib/server-utils';
import { getContext } from 'hono/context-storage';
import { draftOutbox } from '../../db/schema';
import { type HonoContext } from '../../ctx';
import { createDb, type DB } from '../../db';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { env } from '../../env';
import { z } from 'zod';

const statusSchema = z.enum(draftOutboxStatuses);

const enqueueInputSchema = z.object({
  connectionId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  mission: z.string().min(1).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

const emailListSchema = z.array(z.string().trim().email()).max(50);

type ProviderDraft = {
  id: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  content?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    body: string;
  }>;
};

const serializedDraftAttachments = (draft: ProviderDraft) =>
  (draft.attachments ?? []).map((attachment) => ({
    name: attachment.filename,
    type: attachment.mimeType || 'application/octet-stream',
    size: attachment.size,
    lastModified: Date.now(),
    base64: attachment.body,
  }));

const withOutboxDb = async <T>(callback: (db: DB) => Promise<T>) => {
  const executionCtx = getContext<HonoContext>().executionCtx;
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);

  try {
    return await callback(db);
  } finally {
    executionCtx.waitUntil(conn.end());
  }
};

const armDraftOutboxAlarm = async (connectionId: string, scheduledSendAt?: Date | null) => {
  const executionCtx = getContext<HonoContext>().executionCtx;
  const { stub: agent } = await getZeroAgent(connectionId, executionCtx);
  await agent.armDraftOutboxAlarm(scheduledSendAt?.getTime() ?? null);
};

const getOwnedDraftOutboxItem = async (db: DB, input: { id: string; userId: string }) => {
  const item = await getDraftOutboxItem(db, input);
  if (!item) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft outbox item not found' });
  }

  return item;
};

const toMutationError = (error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  if (error instanceof DraftOutboxTransitionError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
  }

  throw error;
};

export const outboxRouter = router({
  list: privateProcedure
    .input(z.object({ status: statusSchema.optional() }).optional().default({}))
    .query(async ({ ctx, input }) =>
      withOutboxDb((db) =>
        listDraftOutboxItems(db, {
          userId: ctx.sessionUser.id,
          status: input.status,
        }),
      ),
    ),

  get: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      withOutboxDb((db) =>
        getOwnedDraftOutboxItem(db, { id: input.id, userId: ctx.sessionUser.id }),
      ),
    ),

  enqueue: privateProcedure.input(enqueueInputSchema).mutation(async ({ ctx, input }) => {
    const result = await withOutboxDb(async (db) => {
      const ownsConnection = await assertDraftOutboxConnectionOwner(db, {
        userId: ctx.sessionUser.id,
        connectionId: input.connectionId,
      });

      if (!ownsConnection) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' });
      }

      return enqueueDraftJob(db, input);
    });

    await armDraftOutboxAlarm(input.connectionId);
    return result;
  }),

  approve: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const snapshot = await withOutboxDb((db) =>
          getOwnedDraftOutboxItem(db, {
            id: input.id,
            userId: ctx.sessionUser.id,
          }),
        );
        if (!snapshot.gmailDraftId) {
          throw new DraftOutboxTransitionError('approveDraftOutboxItem requires gmailDraftId');
        }

        const executionCtx = getContext<HonoContext>().executionCtx;
        const { stub: agent } = await getZeroAgent(snapshot.connectionId, executionCtx);
        const providerDraft = (await agent.getDraft(snapshot.gmailDraftId)) as ProviderDraft;
        try {
          assertSendableEmail({
            body: providerDraft.content,
            recipients: [
              ...(providerDraft.to ?? []),
              ...(providerDraft.cc ?? []),
              ...(providerDraft.bcc ?? []),
            ],
          });
        } catch {
          throw new DraftOutboxTransitionError(
            'Le brouillon est vide ou ne contient que la signature Reta. Envoi bloqué.',
          );
        }

        const providerDigest = await createDraftContentDigest({
          to: providerDraft.to ?? [],
          cc: providerDraft.cc ?? [],
          bcc: providerDraft.bcc ?? [],
          subject: providerDraft.subject ?? '',
          body: providerDraft.content ?? '',
        });
        if (providerDigest !== snapshot.contentDigest) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Le brouillon Gmail a changé. Recharge la file avant de l’envoyer.',
          });
        }

        const item = await withOutboxDb(async (db) => {
          const current = await getOwnedDraftOutboxItem(db, {
            id: input.id,
            userId: ctx.sessionUser.id,
          });
          if (current.contentDigest !== snapshot.contentDigest) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Le brouillon a changé. Recharge la file avant de l’envoyer.',
            });
          }
          return approveDraftOutboxJob(db, current);
        });

        await armDraftOutboxAlarm(item.connectionId, item.scheduledSendAt);
        return item;
      } catch (error) {
        toMutationError(error);
      }
    }),

  cancel: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const item = await withOutboxDb(async (db) => {
          const current = await getOwnedDraftOutboxItem(db, {
            id: input.id,
            userId: ctx.sessionUser.id,
          });

          const cancelled = await cancelDraftOutboxJob(db, current);
          await cancelDraftRevisionJobs(db, current.id);
          return cancelled;
        });

        await armDraftOutboxAlarm(item.connectionId);
        return item;
      } catch (error) {
        toMutationError(error);
      }
    }),

  retry: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const item = await withOutboxDb(async (db) => {
          const current = await getOwnedDraftOutboxItem(db, {
            id: input.id,
            userId: ctx.sessionUser.id,
          });

          return retryDraftOutboxJob(db, current);
        });

        await armDraftOutboxAlarm(item.connectionId);
        return item;
      } catch (error) {
        toMutationError(error);
      }
    }),

  prepareQueue: activeDriverProcedure
    .input(
      z
        .object({
          lookbackDays: z.number().int().min(1).max(365).default(DEFAULT_TRIAGE_LOOKBACK_DAYS),
          maxResults: z.number().int().min(1).max(50).default(DEFAULT_TRIAGE_MAX_RESULTS),
          pageToken: z.string().optional(),
        })
        .optional()
        .default({
          lookbackDays: DEFAULT_TRIAGE_LOOKBACK_DAYS,
          maxResults: DEFAULT_TRIAGE_MAX_RESULTS,
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const mailboxEmail = ctx.activeConnection.email.trim().toLowerCase();
      if (mailboxEmail !== RETA_TRIAGE_MAILBOX) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cette file est limitée à ${RETA_TRIAGE_MAILBOX}`,
        });
      }

      const run = await withOutboxDb((db) =>
        createMailTriageRun(db, {
          userId: ctx.sessionUser.id,
          connectionId: ctx.activeConnection.id,
          lookbackDays: input.lookbackDays,
          maxResults: input.maxResults,
        }),
      );

      try {
        const executionCtx = getContext<HonoContext>().executionCtx;
        const { stub: agent } = await getZeroAgent(ctx.activeConnection.id, executionCtx);
        const response = await agent.rawListThreads({
          folder: 'inbox',
          query: triageSearchQuery(input.lookbackDays),
          maxResults: input.maxResults,
          labelIds: [],
          pageToken: input.pageToken ?? '',
        });

        const candidates: TriageCandidate[] = [];
        for (let offset = 0; offset < response.threads.length; offset += 5) {
          const batch = response.threads.slice(offset, offset + 5);
          const resolved = await Promise.all(
            batch.map(async (thread) => ({
              threadId: thread.id,
              thread: await agent.getThread(thread.id),
            })),
          );
          for (const entry of resolved) {
            const candidate = classifyTriageThread({
              ...entry,
              mailboxEmail,
            });
            if (candidate) candidates.push(candidate);
          }
        }

        let replyNeededCount = 0;
        let noReplyNeededCount = 0;
        await withOutboxDb(async (db) => {
          for (const candidate of candidates) {
            const needsReply = candidate.classification === 'reply_needed';
            if (needsReply) replyNeededCount += 1;
            else noReplyNeededCount += 1;

            const { id } = await enqueueDraftJob(db, {
              connectionId: ctx.activeConnection.id,
              triageRunId: run.id,
              threadId: candidate.threadId,
              mission: needsReply
                ? 'Répondre au dernier message entrant à partir du fil complet'
                : candidate.classificationReason,
              to: candidate.to,
              cc: candidate.cc,
              bcc: candidate.bcc,
              subject: candidate.subject,
              body: '',
              sourceAttachments: candidate.sourceAttachments,
              classification: candidate.classification,
              classificationReason: candidate.classificationReason,
              generationMode: 'codex',
              reviewState: needsReply ? 'pending' : 'ready',
              status: needsReply ? 'queued' : 'no_reply_needed',
              idempotencySeed: `triage:${ctx.activeConnection.id}:${candidate.threadId}:${candidate.latestMessageId}`,
            });

            if (!needsReply) continue;
            const item = await getDraftOutboxItem(db, { id, userId: ctx.sessionUser.id });
            if (!item) throw new Error('Triage outbox item disappeared');
            await createDraftRevisionJob(db, {
              draftOutboxId: item.id,
              kind: 'compose',
              instruction:
                'Rédige une réponse naturelle et concise au dernier message. Appuie-toi uniquement sur le fil, sans inventer de fait, de date, de montant, de lien ni de promesse.',
              baseRevision: item.contentRevision,
              baseDigest: item.contentDigest,
              idempotencyKey: await revisionJobIdempotencyKey({
                kind: 'compose',
                itemId: item.id,
                baseDigest: item.contentDigest,
                instruction: candidate.latestMessageId,
              }),
            });
          }

          await completeMailTriageRun(db, {
            id: run.id,
            nextPageToken: response.nextPageToken,
            scannedCount: response.threads.length,
            replyNeededCount,
            noReplyNeededCount,
          });
        });

        return {
          id: run.id,
          scannedCount: response.threads.length,
          replyNeededCount,
          noReplyNeededCount,
          excludedCount: Math.max(
            0,
            response.threads.length - replyNeededCount - noReplyNeededCount,
          ),
          nextPageToken: response.nextPageToken,
        };
      } catch (error) {
        await withOutboxDb((db) =>
          failMailTriageRun(db, {
            id: run.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        throw error;
      }
    }),

  listTriageRuns: privateProcedure.query(async ({ ctx }) =>
    withOutboxDb((db) => listMailTriageRuns(db, ctx.sessionUser.id)),
  ),

  requestRevision: privateProcedure
    .input(z.object({ id: z.string().min(1), instruction: z.string().trim().min(1).max(4_000) }))
    .mutation(async ({ ctx, input }) => {
      const item = await withOutboxDb((db) =>
        getOwnedDraftOutboxItem(db, { id: input.id, userId: ctx.sessionUser.id }),
      );
      if (item.status !== 'draft_ready' || !item.gmailDraftId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le brouillon doit être prêt' });
      }

      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(item.connectionId, executionCtx);
      const draft = (await agent.getDraft(item.gmailDraftId)) as ProviderDraft;
      const snapshot = {
        to: draft.to ?? [],
        cc: draft.cc ?? [],
        bcc: draft.bcc ?? [],
        subject: draft.subject ?? '',
        body: draft.content ?? '',
      };
      const digest = await createDraftContentDigest(snapshot);
      const itemComparableDigest = await createDraftContentDigest({
        to: item.to,
        cc: item.cc,
        bcc: item.bcc,
        subject: item.subject,
        body: item.body,
      });

      return withOutboxDb(async (db) => {
        let baseRevision = item.contentRevision;
        let baseDigest = item.contentDigest;
        if (digest !== itemComparableDigest) {
          const synced = await updateDraftOutboxSnapshot(db, {
            id: item.id,
            expectedRevision: item.contentRevision,
            ...snapshot,
            digest,
          });
          if (!synced) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Le brouillon a changé' });
          }
          baseRevision = synced.contentRevision;
          baseDigest = synced.contentDigest;
        }
        const idempotencyKey = await revisionJobIdempotencyKey({
          kind: 'revise',
          itemId: item.id,
          baseDigest,
          instruction: input.instruction,
        });
        const job = await createDraftRevisionJob(db, {
          draftOutboxId: item.id,
          kind: 'revise',
          instruction: input.instruction,
          baseRevision,
          baseDigest,
          idempotencyKey,
        });
        await db
          .update(draftOutbox)
          .set({ reviewState: 'revision_requested', error: null, updatedAt: new Date() })
          .where(and(eq(draftOutbox.id, item.id), eq(draftOutbox.contentRevision, baseRevision)));
        return job;
      });
    }),

  retryRevision: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      withOutboxDb(async (db) => {
        const retried = await retryLatestDraftRevisionJob(db, {
          itemId: input.id,
          userId: ctx.sessionUser.id,
        });
        if (!retried) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Aucune correction en échec à relancer',
          });
        }
        return retried;
      }),
    ),

  updateDraft: privateProcedure
    .input(
      z.object({
        id: z.string().min(1),
        expectedContentDigest: z.string(),
        to: emailListSchema,
        cc: emailListSchema.default([]),
        bcc: emailListSchema.default([]),
        subject: z.string().max(998),
        body: z.string().max(200_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const item = await withOutboxDb((db) =>
        getOwnedDraftOutboxItem(db, { id: input.id, userId: ctx.sessionUser.id }),
      );
      if (item.status !== 'draft_ready' || !item.gmailDraftId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le brouillon doit être prêt' });
      }
      if (item.reviewState === 'revising') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Codex corrige déjà ce brouillon' });
      }
      if (input.expectedContentDigest && input.expectedContentDigest !== item.contentDigest) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Le brouillon a changé. Recharge la file avant de l’enregistrer.',
        });
      }

      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(item.connectionId, executionCtx);
      const currentDraft = (await agent.getDraft(item.gmailDraftId)) as ProviderDraft;
      const currentDigest = await createDraftContentDigest({
        to: currentDraft.to ?? [],
        cc: currentDraft.cc ?? [],
        bcc: currentDraft.bcc ?? [],
        subject: currentDraft.subject ?? '',
        body: currentDraft.content ?? '',
      });
      const snapshotDigest = await createDraftContentDigest({
        to: item.to,
        cc: item.cc,
        bcc: item.bcc,
        subject: item.subject,
        body: item.body,
      });
      if (currentDigest !== snapshotDigest) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Le brouillon a changé. Recharge la file avant de l’enregistrer.',
        });
      }

      await agent.createDraft({
        to: input.to.join(', '),
        cc: input.cc.join(', '),
        bcc: input.bcc.join(', '),
        subject: input.subject,
        message: input.body,
        attachments: serializedDraftAttachments(currentDraft),
        id: item.gmailDraftId,
        threadId: item.threadId ?? null,
        fromEmail: null,
      });
      const digest = await createDraftContentDigest(input);
      const updated = await withOutboxDb((db) =>
        updateDraftOutboxSnapshot(db, {
          id: item.id,
          expectedRevision: item.contentRevision,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          body: input.body,
          digest,
        }),
      );
      if (!updated) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Le brouillon a changé' });
      }
      return updated;
    }),

  listWorkerDevices: privateProcedure.query(async ({ ctx }) =>
    withOutboxDb((db) => listMailAgentDevices(db, ctx.sessionUser.id)),
  ),

  createWorkerEnrollment: privateProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80).default('Mac de Thomas') }))
    .mutation(async ({ ctx, input }) =>
      withOutboxDb((db) =>
        createMailAgentEnrollment(db, { userId: ctx.sessionUser.id, name: input.name }),
      ),
    ),

  revokeWorkerDevice: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      withOutboxDb(async (db) => {
        const revoked = await revokeMailAgentDevice(db, {
          userId: ctx.sessionUser.id,
          id: input.id,
        });
        if (!revoked) throw new TRPCError({ code: 'NOT_FOUND', message: 'Appareil introuvable' });
        return revoked;
      }),
    ),
});
