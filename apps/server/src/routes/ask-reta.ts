import {
  askRetaFolderSchema,
  askRetaInputSchema,
  askRetaLimits,
  type AskRetaStep,
  type AskRetaStreamEvent,
} from '../lib/ask-reta/schema';
import { AskRetaAbortedError, runAskReta } from '../lib/ask-reta/pipeline';
import { createAskRetaCancellation } from '../lib/ask-reta/cancellation';
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

/**
 * Deterministic bounding of the TERMINAL result (review 02-2): the result
 * re-embeds steps, citations and mailbox metadata — a 300-char query yields a
 * >300 detail, an overlong subject/sender flows straight from the mailbox.
 * Without this, the terminal fails validation AFTER the whole ask was paid
 * and the client ends on a protocol error.
 */
const boundResult = (
  result: Extract<AskRetaStreamEvent, { type: 'result' }>['result'],
): Extract<AskRetaStreamEvent, { type: 'result' }>['result'] => ({
  answer: truncate(result.answer, 12_000),
  citations: result.citations.slice(0, askRetaLimits.citations).map((citation) => ({
    ref: truncate(citation.ref, 16),
    kind: citation.kind,
    threadId: truncate(citation.threadId, 200),
    ...(citation.messageId ? { messageId: truncate(citation.messageId, 200) } : {}),
    subject: truncate(citation.subject, 300),
    sender: truncate(citation.sender, 300),
    date: truncate(citation.date, 64),
    excerptHash: citation.excerptHash,
    quote: truncate(citation.quote, 300),
  })),
  steps: result.steps.slice(0, 12).map(boundStep),
  ...(result.proposal
    ? {
        proposal: {
          kind: result.proposal.kind,
          ...(result.proposal.to ? { to: truncate(result.proposal.to, 500) } : {}),
          ...(result.proposal.subject ? { subject: truncate(result.proposal.subject, 300) } : {}),
          bodyHtml: truncate(result.proposal.bodyHtml, 40_000),
          ...(result.proposal.threadId
            ? { threadId: truncate(result.proposal.threadId, 200) }
            : {}),
        },
      }
    : {}),
  // Union type, ≤40 by construction — the runtime schema still verifies it.
  model: result.model,
});

/** Truncate → runtime-validate → size-check; null → drop (never enqueue). */
export const serializeBoundedEvent = (event: AskRetaStreamEvent): string | null => {
  const bounded: AskRetaStreamEvent =
    event.type === 'step'
      ? { type: 'step', step: boundStep(event.step) }
      : event.type === 'result'
        ? { type: 'result', result: boundResult(event.result) }
        : event;
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
    let line = serializeBoundedEvent(event);
    if (line === null) {
      // A dropped STEP is a cosmetic loss; a dropped TERMINAL must never end
      // in a silent close — the client gets an explicit ask_failed instead.
      if (event.type === 'step') return;
      line = serializeBoundedEvent({ type: 'error', message: 'ask_failed' });
      if (line === null) return; // unreachable: the fallback is always valid
    }
    const payload = line;
    chain = chain.then(() => writer.write(encoder.encode(payload))).catch(markConsumerGone);
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

  // 2. OWNED cancellation authority (review 02-2): the CANONICAL 45s deadline
  //    aborts the controller (the pipeline races the same budget), fed also by
  //    the request signal (enable_request_signal) and the stream-cancel path.
  //    Disposal is guaranteed on EVERY exit, including failures before the
  //    Response exists — no leaked timer or listener.
  const cancellation = createAskRetaCancellation({ requestSignal: c.req.raw.signal });

  let deps: Awaited<ReturnType<typeof createAskRetaDeps>>['deps'];
  let modelKey: Awaited<ReturnType<typeof createAskRetaDeps>>['modelKey'];
  try {
    const activeConnection = await getActiveConnection();
    ({ deps, modelKey } = await createAskRetaDeps({
      userId: sessionUser.id,
      connectionId: activeConnection.id,
      executionCtx: c.executionCtx,
      signal: cancellation.signal,
    }));
  } catch (error) {
    cancellation.dispose();
    throw error;
  }

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
          // The pipeline race may reject a tick before the controller timer:
          // abort NOW so the underlying operation observes it and settles.
          cancellation.abort();
          emit({ type: 'error', message: 'aborted' });
          return;
        }
        // No question/mail content in logs or in the error surface.
        logger.error('[ask-reta-stream] ask failed');
        emit({ type: 'error', message: 'ask_failed' });
      } finally {
        cancellation.dispose();
      }
    },
    { onConsumerGone: () => cancellation.abort() },
  );
});
