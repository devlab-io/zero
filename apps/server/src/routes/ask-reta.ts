import { askRetaInputSchema, type AskRetaStreamEvent } from '../lib/ask-reta/schema';
import { AskRetaAbortedError, runAskReta } from '../lib/ask-reta/pipeline';
import { getActiveConnection } from '../lib/server-utils';
import { createAskRetaDeps } from '../lib/ask-reta/deps';
import { evaluateRateLimit } from '../lib/rate-limit';
import { hasRemoteRedis } from '../lib/auth-cache';
import { Ratelimit } from '@upstash/ratelimit';
import type { HonoContext } from '../ctx';
import { env } from 'cloudflare:workers';
import { redis } from '../lib/services';
import { logger } from '../lib/logger';
import type { ZeroEnv } from '../env';
import { Hono } from 'hono';

/**
 * Ask Reta streaming transport (slice 2, spec docs/spec/mail-copilot.md).
 *
 * Authenticated NDJSON POST — mounted INSIDE the `api` Hono app, so the
 * session middleware runs first and the active connection is resolved
 * server-side from the session (ownership-safe; never the legacy websocket).
 * Steps stream as they complete; the final answer stays the extractive/
 * deterministic contract of the pipeline — no free model prose. Cancel is
 * preemptive: a client fetch-abort fires `c.req.raw.signal`, which the
 * pipeline races on every model/dependency call.
 */

/** Testable NDJSON envelope: one JSON event per line, closes when run ends. */
export function createAskRetaNdjsonResponse(
  run: (emit: (event: AskRetaStreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: AskRetaStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true; // consumer cancelled mid-stream
        }
      };
      try {
        await run(emit);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by cancellation */
        }
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const askRetaStreamRouter = new Hono<HonoContext>().post('/', async (c) => {
  const sessionUser = c.var.sessionUser;
  if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

  // Same limits and posture as tRPC copilot.ask: strict userId key,
  // fail-closed in production without remote Redis.
  const zenv = env as unknown as ZeroEnv;
  const decision = await evaluateRateLimit({
    hasRemoteRedis: hasRemoteRedis(zenv),
    isProduction: zenv.NODE_ENV === 'production',
    failClosed: true,
    identifier: sessionUser.id,
    limit: (id) =>
      new Ratelimit({
        redis: redis(),
        limiter: Ratelimit.slidingWindow(20, '5 m'),
        analytics: true,
        prefix: 'ratelimit:copilot-ask',
      }).limit(id),
  });
  if (decision.outcome === 'missing-identity') return c.json({ error: 'Unauthorized' }, 401);
  if (decision.outcome === 'unavailable')
    return c.json({ error: 'Rate limiting unavailable' }, 503);
  if (decision.outcome === 'limited') return c.json({ error: 'Too many requests' }, 429);

  const parsed = askRetaInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);
  const input = parsed.data;

  const activeConnection = await getActiveConnection();
  const { deps, modelKey } = await createAskRetaDeps({
    userId: sessionUser.id,
    connectionId: activeConnection.id,
    executionCtx: c.executionCtx,
    signal: c.req.raw.signal,
  });

  return createAskRetaNdjsonResponse(async (emit) => {
    try {
      const result = await runAskReta(
        { ...deps, onStep: (step) => emit({ type: 'step', step }) },
        input,
      );
      emit({ type: 'result', result: { ...result, model: modelKey } });
    } catch (error) {
      if (error instanceof AskRetaAbortedError) {
        emit({ type: 'error', message: 'aborted' });
        return;
      }
      // No question/mail content in logs or in the error surface.
      logger.error('[ask-reta-stream] ask failed');
      emit({ type: 'error', message: 'ask_failed' });
    }
  });
});
