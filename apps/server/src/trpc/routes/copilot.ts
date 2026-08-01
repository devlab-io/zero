import {
  askRetaFolderSchema,
  askRetaInputSchema,
  askRetaLimits,
  type AskRetaResult,
  type AskRetaStepThread,
} from '../../lib/ask-reta/schema';
import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { createAskRetaDeps } from '../../lib/ask-reta/deps';
import { getThreadsFromDB } from '../../lib/server-utils';
import { runAskReta } from '../../lib/ask-reta/pipeline';
import type { ThreadsResponse } from '@zero/types';
import { getContext } from 'hono/context-storage';
import { Ratelimit } from '@upstash/ratelimit';
import { type HonoContext } from '../../ctx';
import { z } from 'zod';

const formatSender = (sender?: { name?: string; email?: string }) =>
  sender ? `${sender.name ?? ''} <${sender.email ?? 'unknown'}>`.trim() : 'unknown';

/**
 * Ask Reta (spec docs/spec/mail-copilot.md). The ONLY sanctioned client
 * surface is components/copilot/** — enforced by the r9 guard test in
 * apps/mail. Connection ownership comes exclusively from the request context;
 * no connection id is ever accepted from the client. The dependency surface
 * handed to the pipeline (lib/ask-reta/deps.ts, shared with the slice-2
 * NDJSON stream) is read-only: nothing here can mutate a mailbox.
 */
export const copilotRouter = router({
  ask: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(20, '5m'),
        generatePrefix: () => 'ratelimit:copilot-ask',
        // Strict per-user key + fail-closed: in production without remote
        // Redis this expensive surface DENIES instead of running unlimited.
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(askRetaInputSchema)
    .mutation(async ({ ctx, input }): Promise<AskRetaResult> => {
      const { activeConnection, sessionUser } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;

      const { deps, modelKey } = await createAskRetaDeps({
        userId: sessionUser.id,
        connectionId: activeConnection.id,
        executionCtx,
        signal: ctx.c.req.raw.signal,
      });

      const result = await runAskReta(deps, input);
      return { ...result, model: modelKey };
    }),

  /**
   * Replayable search preview (slice 2): the SAME semantics as a pipeline
   * search step — whole active mailbox by default (multi-shard helper, no
   * folder default), same hard cap, metadata only. Powers the editable
   * query replay in the panel's step display.
   */
  searchPreview: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(60, '5m'),
        generatePrefix: () => 'ratelimit:copilot-search-preview',
        // Same posture as ask: strict userId key, fail-closed in production.
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(
      z.object({
        query: z.string().trim().min(1).max(300),
        folder: askRetaFolderSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<{ threads: AskRetaStepThread[] }> => {
      const response = await getThreadsFromDB(ctx.activeConnection.id, {
        q: input.query,
        folder: input.folder,
        maxResults: askRetaLimits.searchResults,
      });
      // The projection rows carry the rich metadata at runtime; the driver
      // type is the thin superset (same coercion as the pipeline dep).
      const rows = response.threads as ThreadsResponse['threads'];
      return {
        threads: rows.slice(0, askRetaLimits.searchResults).map((row) => ({
          threadId: row.id,
          subject: row.subject ?? '(no subject)',
          sender: formatSender(row.sender),
          date: row.receivedOn ?? 'unknown',
        })),
      };
    }),
});
