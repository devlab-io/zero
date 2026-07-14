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
import { getContext } from 'hono/context-storage';
import { getZeroAgent } from '../../lib/server-utils';
import { TRPCError } from '@trpc/server';
import { privateProcedure, router } from '../trpc';
import { type HonoContext } from '../../ctx';
import { createDb, type DB } from '../../db';
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
        const item = await withOutboxDb(async (db) => {
          const current = await getOwnedDraftOutboxItem(db, {
            id: input.id,
            userId: ctx.sessionUser.id,
          });

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

          return cancelDraftOutboxJob(db, current);
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
});
