import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// Vraie route Hono + vraie enveloppe NDJSON ; frontières lourdes en fakes.

const harness = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'local',
    VITE_PUBLIC_APP_URL: 'https://app.devlab-tahiti.workers.dev',
  } as Record<string, unknown>,
  runAskReta: vi.fn(),
  createDeps: vi.fn(),
  getActiveConnection: vi.fn(),
  consumeRate: vi.fn(async () => ({ allowed: true, limit: 20, remaining: 19, reset: 1 })),
  upstashLimit: vi.fn(async () => ({ success: true, limit: 20, remaining: 12, reset: 777 })),
  cancellations: [] as { signal: AbortSignal; abort: () => void; dispose: () => void }[],
}));

vi.mock('cloudflare:workers', () => ({ env: harness.env }));
vi.mock('../lib/server-utils', () => ({
  getActiveConnection: harness.getActiveConnection,
  getZeroDB: vi.fn(async () => ({ consumeAskRetaRateLimit: harness.consumeRate })),
}));
vi.mock('../lib/services', () => ({ redis: () => ({}) }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    class {
      limit = harness.upstashLimit;
    },
    { slidingWindow: () => 'sliding-window-config' },
  ),
}));
vi.mock('../lib/ask-reta/deps', () => ({ createAskRetaDeps: harness.createDeps }));
vi.mock('../lib/ask-reta/cancellation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ask-reta/cancellation')>();
  return {
    createAskRetaCancellation: (params: Parameters<typeof actual.createAskRetaCancellation>[0]) => {
      const real = actual.createAskRetaCancellation(params);
      const wrapped = { ...real, dispose: vi.fn(real.dispose) };
      harness.cancellations.push(wrapped);
      return wrapped;
    },
  };
});
vi.mock('../lib/ask-reta/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ask-reta/pipeline')>();
  return {
    AskRetaAbortedError: actual.AskRetaAbortedError,
    AskRetaPhaseError: actual.AskRetaPhaseError,
    ASK_RETA_DEADLINE_MS: actual.ASK_RETA_DEADLINE_MS,
    runAskReta: harness.runAskReta,
  };
});

import { askRetaStreamRouter, serializeBoundedEvent } from './ask-reta';
import { AskRetaAbortedError } from '../lib/ask-reta/pipeline';
import type { HonoContext } from '../ctx';

const GOOD_ORIGIN = 'https://app.devlab-tahiti.workers.dev';

const makeApp = (sessionUser?: { id: string }) => {
  const app = new Hono<HonoContext>();
  app.use('*', async (c, next) => {
    // Mirrors the api-app session middleware the real mount sits behind.
    c.set('sessionUser', sessionUser as never);
    Object.defineProperty(c, 'executionCtx', {
      value: { waitUntil: () => {} },
      configurable: true,
    });
    return next();
  });
  app.route('/ask-reta', askRetaStreamRouter);
  return app;
};

const post = (
  app: Hono<HonoContext>,
  body: unknown,
  headers: Record<string, string | undefined> = {},
) => {
  const merged: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: GOOD_ORIGIN,
    'X-Ask-Reta-Csrf': '1',
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return app.request('/ask-reta', { method: 'POST', headers: merged, body: JSON.stringify(body) });
};

const readLines = async (response: Response) => {
  const text = await response.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
};

beforeEach(() => {
  harness.env.NODE_ENV = 'local';
  harness.runAskReta.mockReset();
  harness.createDeps.mockReset();
  harness.createDeps.mockImplementation(async ({ signal }: { signal?: AbortSignal }) => ({
    deps: { signal },
    modelKey: 'llama-4-scout',
  }));
  harness.getActiveConnection.mockReset();
  harness.getActiveConnection.mockResolvedValue({ id: 'conn-active' });
  harness.consumeRate.mockReset();
  harness.consumeRate.mockResolvedValue({ allowed: true, limit: 20, remaining: 19, reset: 1 });
  harness.upstashLimit.mockReset();
  harness.upstashLimit.mockResolvedValue({ success: true, limit: 20, remaining: 12, reset: 777 });
  delete harness.env.REDIS_URL;
  delete harness.env.REDIS_TOKEN;
  harness.cancellations.length = 0;
});

describe('/api/ask-reta — CSRF/origin gate (before anything else)', () => {
  it('rejects the cookie-sharing EVIL SIBLING origin with 403, before body/connection', async () => {
    const response = await post(
      makeApp({ id: 'user-1' }),
      { question: 'x' },
      { Origin: 'https://evil.devlab-tahiti.workers.dev' },
    );
    expect(response.status).toBe(403);
    expect(harness.getActiveConnection).not.toHaveBeenCalled();
    expect(harness.createDeps).not.toHaveBeenCalled();
  });

  it('rejects a missing Origin and a missing CSRF header (403)', async () => {
    expect(
      (await post(makeApp({ id: 'user-1' }), { question: 'x' }, { Origin: undefined })).status,
    ).toBe(403);
    expect(
      (await post(makeApp({ id: 'user-1' }), { question: 'x' }, { 'X-Ask-Reta-Csrf': undefined }))
        .status,
    ).toBe(403);
    expect(harness.getActiveConnection).not.toHaveBeenCalled();
  });

  it('accepts EXACTLY the configured frontend origin', async () => {
    harness.runAskReta.mockResolvedValue({ answer: 'a', citations: [], steps: [] });
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(response.status).toBe(200);
  });
});

describe('/api/ask-reta — authenticated ownership-safe NDJSON stream', () => {
  it('streams steps AS THEY COMPLETE, then the final deterministic result', async () => {
    harness.runAskReta.mockImplementation(async (deps: { onStep: (s: unknown) => void }) => {
      deps.onStep({ kind: 'search', detail: '"socredo" → 1 threads', sourceRefs: ['s1'] });
      deps.onStep({ kind: 'read_thread', detail: 'read top 1 results', sourceRefs: ['s2'] });
      return { answer: 'Extraits vérifiés…', citations: [], steps: [], proposal: undefined };
    });

    const response = await post(makeApp({ id: 'user-1' }), { question: 'Où en est Socredo ?' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');

    const lines = await readLines(response);
    expect(lines.map((l) => l.type)).toEqual(['step', 'step', 'result']);
    expect((lines[2] as unknown as { result: { model: string } }).result.model).toBe(
      'llama-4-scout',
    );
    expect(harness.createDeps).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', connectionId: 'conn-active' }),
    );
  });

  it('REAL cancellation: a consumer cancel aborts the pipeline signal mid-run', async () => {
    let depsSignal: AbortSignal | undefined;
    harness.createDeps.mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
      depsSignal = signal;
      return { deps: { signal }, modelKey: 'llama-4-scout' };
    });
    let emitSecondStep!: () => void;
    let finishRun!: () => void;
    let abortedDuringRun: boolean | undefined;
    harness.runAskReta.mockImplementation(
      async (deps: { onStep: (s: unknown) => void; signal?: AbortSignal }) => {
        deps.onStep({ kind: 'search', detail: 'step 1', sourceRefs: [] });
        await new Promise<void>((resolve) => (emitSecondStep = resolve));
        // The consumer is gone by now: this write is rejected → local abort.
        deps.onStep({ kind: 'search', detail: 'step 2', sourceRefs: [] });
        await new Promise<void>((resolve) => (finishRun = resolve));
        abortedDuringRun = deps.signal?.aborted;
        return { answer: 'late', citations: [], steps: [] };
      },
    );

    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    const reader = response.body!.getReader();
    await reader.read(); // step 1 delivered
    await reader.cancel(); // consumer gone
    emitSecondStep();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The run is STILL in flight and its signal is already aborted.
    expect(depsSignal?.aborted).toBe(true);
    finishRun();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(abortedDuringRun).toBe(true);
  });

  it('a cancel WITHOUT any later write still aborts immediately (writer.closed path)', async () => {
    let depsSignal: AbortSignal | undefined;
    harness.createDeps.mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
      depsSignal = signal;
      return { deps: { signal }, modelKey: 'llama-4-scout' };
    });
    let finishRun!: () => void;
    harness.runAskReta.mockImplementation(async (deps: { onStep: (s: unknown) => void }) => {
      deps.onStep({ kind: 'search', detail: 'step 1', sourceRefs: [] });
      // Long model call: NO further emit until released.
      await new Promise<void>((resolve) => (finishRun = resolve));
      return { answer: 'late', citations: [], steps: [] };
    });

    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // No write happened since the cancel — the abort must already be live.
    expect(depsSignal?.aborted).toBe(true);
    finishRun();
  });

  it('a pipeline DEADLINE rejection aborts the controller: the underlying op settles', async () => {
    let depsSignal: AbortSignal | undefined;
    harness.createDeps.mockImplementation(async ({ signal }: { signal?: AbortSignal }) => {
      depsSignal = signal;
      return { deps: { signal }, modelKey: 'llama-4-scout' };
    });
    // The pipeline race rejected on deadline while the underlying dependency
    // (same signal) is still running: only signal.aborted lets it settle.
    let underlyingSettled = false;
    harness.runAskReta.mockImplementation(async (deps: { signal?: AbortSignal }) => {
      deps.signal?.addEventListener('abort', () => {
        underlyingSettled = true;
      });
      throw new AskRetaAbortedError('deadline');
    });

    const lines = await readLines(await post(makeApp({ id: 'user-1' }), { question: 'x' }));
    expect(lines).toEqual([{ type: 'error', message: 'aborted' }]);
    expect(depsSignal?.aborted).toBe(true);
    expect(underlyingSettled).toBe(true);
  });

  it('a failure BEFORE the Response exists still disposes timer and listener', async () => {
    harness.getActiveConnection.mockRejectedValueOnce(new Error('db down'));
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(response.status).toBe(500);
    expect(harness.cancellations).toHaveLength(1);
    expect(harness.cancellations[0]!.dispose).toHaveBeenCalled();
  });

  it('run completion disposes the cancellation on the normal path too', async () => {
    harness.runAskReta.mockResolvedValueOnce({ answer: 'a', citations: [], steps: [] });
    await readLines(await post(makeApp({ id: 'user-1' }), { question: 'x' }));
    expect(harness.cancellations).toHaveLength(1);
    expect(harness.cancellations[0]!.dispose).toHaveBeenCalled();
  });

  it('prod sans Redis distant : le fallback DO durable AUTORISE et le pipeline tourne (fini le 503 systématique)', async () => {
    harness.env.NODE_ENV = 'production';
    harness.runAskReta.mockResolvedValueOnce({ answer: 'ok', citations: [], steps: [] });
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(response.status).toBe(200);
    expect(harness.consumeRate).toHaveBeenCalledTimes(1);
    expect(harness.runAskReta).toHaveBeenCalledTimes(1);
    // En-têtes de quota EXACTS depuis la décision DO — rien d'autre.
    expect(response.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('19');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('1');
  });

  it('prod sans Redis : le 21e appel (fallback DO refuse) → 429', async () => {
    harness.env.NODE_ENV = 'production';
    harness.consumeRate.mockResolvedValueOnce({
      allowed: false,
      limit: 20,
      remaining: 0,
      reset: 9,
    });
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(response.status).toBe(429);
    expect(harness.runAskReta).not.toHaveBeenCalled();
    expect(response.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('9');
  });

  it('Redis distant PRIMAIRE : autorisé → 200 + en-têtes Upstash ; limité → 429 + en-têtes ; DO jamais consulté', async () => {
    harness.env.NODE_ENV = 'production';
    harness.env.REDIS_URL = 'https://real.upstash.io';
    harness.env.REDIS_TOKEN = 'token';
    harness.runAskReta.mockResolvedValueOnce({ answer: 'ok', citations: [], steps: [] });
    const allowed = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(allowed.headers.get('X-RateLimit-Remaining')).toBe('12');
    expect(allowed.headers.get('X-RateLimit-Reset')).toBe('777');
    expect(harness.consumeRate).not.toHaveBeenCalled();

    harness.upstashLimit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 888,
    });
    const limited = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(limited.headers.get('X-RateLimit-Reset')).toBe('888');
    expect(harness.consumeRate).not.toHaveBeenCalled();
  });

  it('dev local (skip) : aucun en-tête X-RateLimit-* fantôme', async () => {
    harness.runAskReta.mockResolvedValueOnce({ answer: 'ok', citations: [], steps: [] });
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Limit')).toBeNull();
  });

  it('panne TOTALE (pas de Redis, DO en échec) → 503 fail-closed, jamais fail-open, aucun contenu loggé', async () => {
    harness.env.NODE_ENV = 'production';
    harness.consumeRate.mockRejectedValueOnce(new Error('DO unreachable'));
    const response = await post(makeApp({ id: 'user-1' }), {
      question: 'question confidentielle brouillon',
    });
    expect(response.status).toBe(503);
    expect(harness.runAskReta).not.toHaveBeenCalled();
  });

  it('rejects without session (401) and invalid input (400)', async () => {
    expect((await post(makeApp(undefined), { question: 'x' })).status).toBe(401);
    expect((await post(makeApp({ id: 'user-1' }), { question: '' })).status).toBe(400);
    expect(harness.runAskReta).not.toHaveBeenCalled();
  });

  it('an abort surfaces as an explicit terminal event, a failure leaks no content', async () => {
    harness.runAskReta.mockRejectedValueOnce(new AskRetaAbortedError('aborted'));
    let lines = await readLines(await post(makeApp({ id: 'user-1' }), { question: 'x' }));
    expect(lines).toEqual([{ type: 'error', message: 'aborted' }]);

    harness.runAskReta.mockRejectedValueOnce(new Error('secret internal detail'));
    lines = await readLines(await post(makeApp({ id: 'user-1' }), { question: 'x' }));
    expect(lines).toEqual([{ type: 'error', message: 'ask_failed' }]);
  });
});

describe('serializeBoundedEvent — server-side event discipline', () => {
  it('truncates step metadata to schema bounds before writing', () => {
    const line = serializeBoundedEvent({
      type: 'step',
      step: {
        kind: 'search',
        detail: 'd'.repeat(1_000),
        sourceRefs: Array.from({ length: 100 }, (_, i) => `s${i}${'x'.repeat(50)}`),
        search: {
          query: 'q'.repeat(1_000),
          folder: 'sent',
          threads: Array.from({ length: 25 }, (_, i) => ({
            threadId: `t${i}`,
            subject: 's'.repeat(2_000),
            sender: 'Sender <x@y.z>',
            date: '2026-08-01',
          })),
        },
      },
    })!;
    const parsed = JSON.parse(line) as {
      step: {
        detail: string;
        sourceRefs: string[];
        search: { query: string; threads: { subject: string }[] };
      };
    };
    expect(parsed.step.detail).toHaveLength(300);
    expect(parsed.step.sourceRefs).toHaveLength(48);
    expect(parsed.step.search.query).toHaveLength(300);
    expect(parsed.step.search.threads).toHaveLength(10);
    expect(parsed.step.search.threads[0]?.subject).toHaveLength(300);
  });

  it('an oversize answer is TRUNCATED by boundResult — bounded, never dropped', () => {
    const line = serializeBoundedEvent({
      type: 'result',
      result: {
        answer: 'a'.repeat(300_000),
        citations: [],
        steps: [],
        model: 'llama-4-scout',
      },
    });
    expect(line).not.toBeNull();
    const parsed = JSON.parse(line!) as { result: { answer: string } };
    expect(parsed.result.answer).toHaveLength(12_000);
  });

  it('BOUNDS the terminal result: 300-char query and overlong mailbox metadata survive', () => {
    const longQuery = 'q'.repeat(300);
    const line = serializeBoundedEvent({
      type: 'result',
      result: {
        answer: 'Extraits vérifiés…',
        citations: [
          {
            ref: 's11',
            kind: 'message',
            threadId: 't1',
            subject: 'S'.repeat(2_000), // overlong mailbox subject
            sender: `${'N'.repeat(1_000)} <x@y.z>`, // overlong sender
            date: '2026-08-01',
            excerptHash: 'a'.repeat(64),
            quote: 'quote suffisamment longue pour le plancher de preuve',
          },
        ],
        // The pipeline detail embeds the query + decor → >300 chars raw.
        steps: [
          {
            kind: 'search',
            detail: `"${longQuery}" → 3 threads`,
            sourceRefs: [],
            search: { query: longQuery, threads: [] },
          },
        ],
        model: 'llama-4-scout',
      },
    });
    // NOT dropped: bounded then valid.
    expect(line).not.toBeNull();
    const parsed = JSON.parse(line!) as {
      result: { citations: { subject: string; sender: string }[]; steps: { detail: string }[] };
    };
    expect(parsed.result.citations[0]!.subject).toHaveLength(300);
    expect(parsed.result.citations[0]!.sender).toHaveLength(300);
    expect(parsed.result.steps[0]!.detail).toHaveLength(300);
  });

  it('a terminal STILL invalid after bounding becomes an explicit ask_failed, never silence', async () => {
    // excerptHash cannot be truncated into validity → the result is dropped
    // and the envelope substitutes an explicit terminal error.
    harness.runAskReta.mockResolvedValueOnce({
      answer: 'a',
      citations: [
        {
          ref: 's1',
          kind: 'message',
          threadId: 't',
          subject: 's',
          sender: 'x',
          date: 'd',
          excerptHash: 'NOT-A-HASH',
          quote: 'quote suffisamment longue pour le plancher',
        },
      ],
      steps: [],
    });
    const lines = await readLines(await post(makeApp({ id: 'user-1' }), { question: 'x' }));
    expect(lines).toEqual([{ type: 'error', message: 'ask_failed' }]);
  });

  it('drops OFF-SCHEMA events at runtime — terminal events included', () => {
    // Unknown step kind.
    expect(
      serializeBoundedEvent({
        type: 'step',
        step: { kind: 'exfiltrate' as never, detail: 'x', sourceRefs: [] },
      }),
    ).toBeNull();
    // A result whose citation violates the contract (unknown kind).
    expect(
      serializeBoundedEvent({
        type: 'result',
        result: {
          answer: 'ok',
          citations: [
            {
              ref: 's1',
              kind: 'exfil' as never,
              threadId: 't',
              subject: 's',
              sender: 'x',
              date: 'd',
              excerptHash: 'a'.repeat(64),
              quote: 'q'.repeat(30),
            },
          ],
          steps: [],
          model: 'llama-4-scout',
        },
      }),
    ).toBeNull();
    // Tour 10 : une citation METADATA valide passe — et une quote qui s'y
    // glisserait est STRIPPÉE (jamais présentée comme extrait de corps).
    const metadataLine = serializeBoundedEvent({
      type: 'result',
      result: {
        answer: 'ok',
        citations: [
          {
            ref: 's1',
            kind: 'metadata',
            threadId: 't',
            subject: 's',
            sender: 'x',
            date: 'd',
            excerptHash: 'a'.repeat(64),
            quote: 'corps forgé',
          } as never,
        ],
        steps: [],
        model: 'workers-ai:llama-4-scout',
      },
    });
    expect(metadataLine).not.toBeNull();
    expect(metadataLine).toContain('"kind":"metadata"');
    expect(metadataLine).not.toContain('corps forgé');
    // A terminal error outside the enum vocabulary.
    expect(
      serializeBoundedEvent({ type: 'error', message: 'stack trace détaillée' as never }),
    ).toBeNull();
  });
});
