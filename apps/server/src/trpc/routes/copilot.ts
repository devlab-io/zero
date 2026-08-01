import {
  askRetaInputSchema,
  askRetaModelKeys,
  DEFAULT_ASK_RETA_MODEL,
  type AskRetaModelKey,
  type AskRetaResult,
} from '../../lib/ask-reta/schema';
import { buildMailboxOverview, getMailboxActivity } from '../../lib/mailbox-overview';
import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { workersAiModel, type WorkersAiBinding } from '../../lib/ask-reta/model';
import { runAskReta, type AskRetaDeps } from '../../lib/ask-reta/pipeline';
import { getZeroAgent, getZeroDB } from '../../lib/server-utils';
import { getContext } from 'hono/context-storage';
import { Ratelimit } from '@upstash/ratelimit';
import { type HonoContext } from '../../ctx';
import { env } from 'cloudflare:workers';
import { createDb } from '../../db';

/**
 * Ask Reta (spec docs/spec/mail-copilot.md, slice 1). The ONLY sanctioned
 * client entry: components/copilot/** — enforced by the r9 guard test in
 * apps/mail. Connection ownership comes exclusively from the request context;
 * no connection id is ever accepted from the client. The dependency surface
 * handed to the pipeline is read-only: nothing here can mutate a mailbox.
 */

const resolveModelKey = (value: unknown): AskRetaModelKey =>
  askRetaModelKeys.includes(value as AskRetaModelKey)
    ? (value as AskRetaModelKey)
    : DEFAULT_ASK_RETA_MODEL;

export const copilotRouter = router({
  ask: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(20, '5m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:copilot-ask-${sessionUser?.id}`,
      }),
    )
    .input(askRetaInputSchema)
    .mutation(async ({ ctx, input }): Promise<AskRetaResult> => {
      const { activeConnection, sessionUser } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;
      const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);

      const db = await getZeroDB(sessionUser.id);
      const stored = await db.findUserSettings();
      const modelKey = resolveModelKey(
        (stored?.settings as { askRetaModel?: unknown } | undefined)?.askRetaModel,
      );

      const deps: AskRetaDeps = {
        // Structural narrowing: the generated Ai<AiModels> run() overloads reject a
        // string-typed model id; the catalogue only holds valid @cf/meta ids.
        model: workersAiModel(env.AI as unknown as WorkersAiBinding, modelKey),
        overview: async () => {
          const now = Date.now();
          // Fixed UTC windows (supplementary signal only; folder counts are exact).
          const todayStart = new Date(new Date(now).setUTCHours(0, 0, 0, 0));
          const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
          const { db: sendDb, conn } = createDb(env.HYPERDRIVE.connectionString);
          try {
            const [folders, activity] = await Promise.all([
              agent.getMailboxCounts(),
              getMailboxActivity(sendDb, {
                connectionId: activeConnection.id,
                todayStart,
                weekStart,
              }),
            ]);
            return buildMailboxOverview(folders, activity);
          } finally {
            executionCtx.waitUntil(conn.end());
          }
        },
        // No folder default: the contract is the WHOLE active mailbox. `folder`
        // narrows the search only when the planner explicitly asked for it.
        searchThreads: async ({ query, folder, maxResults }) =>
          await agent.getThreadsFromDB({ q: query, folder, maxResults }),
        readThread: async (threadId) => await agent.getThreadFromDB(threadId),
        signal: ctx.c.req.raw.signal,
      };

      const result = await runAskReta(deps, input);
      return { ...result, model: modelKey };
    }),
});
