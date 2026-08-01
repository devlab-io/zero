import {
  askRetaFolderSchema,
  askRetaInputSchema,
  askRetaLimits,
  type AskRetaStep,
  type AskRetaStreamEvent,
} from '../lib/ask-reta/schema';
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
import { z } from 'zod';

/**
 * Ask Reta streaming transport (slice 2, spec docs/spec/mail-copilot.md).
 *
 * Authenticated NDJSON POST — mounted INSIDE the `api` Hono app (session
 * middleware first, active connection resolved server-side; never the legacy
 * websocket). Hardening (slice-2 review):
 * - EXACT-origin allowlist + explicit CSRF header, checked BEFORE the body is
 *   read or any connection resolved — the root CORS accepts any COOKIE_DOMAIN
 *   subdomain, so a cookie-sharing sibling worker must die here with a 403.
 * - REAL preemptive cancel: `enable_request_signal` (wrangler) makes the
 *   request signal fire on client disconnect; a LOCAL AbortController is tied
 *   to it, to the ReadableStream cancel path (consumer gone) and to a
 *   hard-deadline timer; the pipeline receives that local signal.
 * - Server-side event discipline: every NDJSON event is runtime-validated /
 *   truncated to schema bounds and size-capped BEFORE write, and writes go
 *   through a TransformStream writer so consumer backpressure is honored.
 */

const CSRF_HEADER = 'X-Ask-Reta-Csrf';
// Belt over the pipeline's own 45s budget: whatever happens, the local
// controller aborts and the resources close.
const HARD_DEADLINE_MS = 60_000;
const MAX_STEP_EVENT_BYTES = 32_768;
const MAX_TERMINAL_EVENT_BYTES = 262_144;

/** Exact-origin allowlist: the configured frontend origin(s), nothing broader. */
export const isAllowedAskRetaOrigin = (origin: string | undefined, appUrl: string): boolean => {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
};

const truncate = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/** Truncate step metadata to schema bounds — never trust pipeline growth. */
const boundStep = (step: AskRetaStep): AskRetaStep => ({
  kind: step.kind,
  detail: truncate(step.detail, 300),
  sourceRefs: step.sourceRefs.slice(0, 48).map((ref) => truncate(ref, 16)),
  ...(step.search
    ? {
        search: {
          query: truncate(step.search.query, 300),
          ...(step.search.folder ? { folder: truncate(step.search.folder, 40) } : {}),
          threads: step.search.threads.slice(0, askRetaLimits.searchResults).map((thread) => ({
            threadId: truncate(thread.threadId, 200),
            subject: truncate(thread.subject, 300),
            sender: truncate(thread.sender, 300),
            date: truncate(thread.date, 64),
          })),
        },
      }
    : {}),
});

// Runtime contract of every wire event — bounded, terminal events included.
// Nothing off-schema is EVER enqueued, whatever the pipeline produced.
const streamStepSchema = z.object({
  kind: z.enum(['overview', 'search', 'read_thread']),
  detail: z.string().max(300),
  sourceRefs: z.array(z.string().max(16)).max(48),
  search: z
    .object({
      query: z.string().max(300),
      folder: askRetaFolderSchema.optional(),
      threads: z
        .array(
          z.object({
            threadId: z.string().max(200),
            subject: z.string().max(300),
            sender: z.string().max(300),
            date: z.string().max(64),
          }),
        )
        .max(askRetaLimits.searchResults),
    })
    .optional(),
});

const streamResultSchema = z.object({
  answer: z.string().max(12_000),
  citations: z
    .array(
      z.object({
        ref: z.string().max(16),
        kind: z.literal('message'),
        threadId: z.string().max(200),
        messageId: z.string().max(200).optional(),
        subject: z.string().max(300),
        sender: z.string().max(300),
        date: z.string().max(64),
        excerptHash: z.string().regex(/^[0-9a-f]{64}$/),
        quote: z.string().max(300),
      }),
    )
    .max(askRetaLimits.citations),
  steps: z.array(streamStepSchema).max(12),
  proposal: z
    .object({
      kind: z.enum(['reply', 'new']),
      to: z.string().max(500).optional(),
      subject: z.string().max(300).optional(),
      bodyHtml: z.string().max(40_000),
      threadId: z.string().max(200).optional(),
    })
    .optional(),
  model: z.string().max(40),
});

const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('step'), step: streamStepSchema }),
  z.object({ type: z.literal('result'), result: streamResultSchema }),
  z.object({ type: z.literal('error'), message: z.enum(['aborted', 'ask_failed']) }),
]);

/** Truncate → runtime-validate → size-check; null → drop (never enqueue). */
export const serializeBoundedEvent = (event: AskRetaStreamEvent): string | null => {
  const bounded: AskRetaStreamEvent =
    event.type === 'step' ? { type: 'step', step: boundStep(event.step) } : event;
  const validated = streamEventSchema.safeParse(bounded);
  if (!validated.success) {
    logger.warn('[ask-reta-stream] off-schema event dropped', { type: bounded.type });
    return null;
  }
  const line = `${JSON.stringify(validated.data)}\n`;
  const budget = validated.data.type === 'step' ? MAX_STEP_EVENT_BYTES : MAX_TERMINAL_EVENT_BYTES;
  if (new TextEncoder().encode(line).byteLength > budget) {
    logger.warn('[ask-reta-stream] oversize event dropped', { type: validated.data.type });
    return null;
  }
  return line;
};

/**
 * NDJSON envelope over a TransformStream: writes await the writer (consumer
 * backpressure is respected); a consumer cancellation rejects the pending
 * write, which reports the consumer as gone so the caller can abort the run.
 */
export function createAskRetaNdjsonResponse(
  run: (emit: (event: AskRetaStreamEvent) => void) => Promise<void>,
  options: { onConsumerGone?: () => void } = {},
): Response {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let consumerGone = false;
  let chain: Promise<void> = Promise.resolve();

  const markConsumerGone = () => {
    if (consumerGone) return;
    consumerGone = true;
    options.onConsumerGone?.();
  };
  // IMMEDIATE disconnect detection: a reader cancel rejects writer.closed even
  // when no write is pending — a long model call is aborted right away, not
  // at the next enqueue. (Normal completion resolves closed: no false fire.)
  writer.closed.catch(markConsumerGone);

  const emit = (event: AskRetaStreamEvent) => {
    if (consumerGone) return;
    const line = serializeBoundedEvent(event);
    if (line === null) return;
    chain = chain.then(() => writer.write(encoder.encode(line))).catch(markConsumerGone);
  };

  void (async () => {
    try {
      await run(emit);
    } finally {
      await chain.catch(() => {});
      try {
        await writer.close();
      } catch {
        /* consumer already gone */
      }
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const askRetaStreamRouter = new Hono<HonoContext>().post('/', async (c) => {
  // 1. CSRF/origin gate FIRST — before the body is read, before any session or
  //    connection work. Exact origin only: the cookie-sharing sibling worker
  //    (*.COOKIE_DOMAIN) passes the root CORS but must die here.
  const zenv = env as unknown as ZeroEnv;
  if (!isAllowedAskRetaOrigin(c.req.header('Origin'), zenv.VITE_PUBLIC_APP_URL)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  if (c.req.header(CSRF_HEADER) !== '1') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const sessionUser = c.var.sessionUser;
  if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

  // Same limits and posture as tRPC copilot.ask: strict userId key,
  // fail-closed in production without remote Redis.
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

  // 2. LOCAL cancellation authority, fed by every disconnect path:
  //    request signal (enable_request_signal), stream cancel, hard deadline.
  const controller = new AbortController();
  const requestSignal = c.req.raw.signal;
  const onRequestAbort = () => controller.abort();
  if (requestSignal.aborted) controller.abort();
  else requestSignal.addEventListener('abort', onRequestAbort, { once: true });
  const deadlineTimer = setTimeout(() => controller.abort(), HARD_DEADLINE_MS);

  const activeConnection = await getActiveConnection();
  const { deps, modelKey } = await createAskRetaDeps({
    userId: sessionUser.id,
    connectionId: activeConnection.id,
    executionCtx: c.executionCtx,
    signal: controller.signal,
  });

  return createAskRetaNdjsonResponse(
    async (emit) => {
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
      } finally {
        clearTimeout(deadlineTimer);
        requestSignal.removeEventListener('abort', onRequestAbort);
      }
    },
    { onConsumerGone: () => controller.abort() },
  );
});
