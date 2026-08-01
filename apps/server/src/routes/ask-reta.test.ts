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
}));

vi.mock('cloudflare:workers', () => ({ env: harness.env }));
vi.mock('../lib/server-utils', () => ({ getActiveConnection: harness.getActiveConnection }));
vi.mock('../lib/services', () => ({ redis: () => ({}) }));
vi.mock('../lib/ask-reta/deps', () => ({ createAskRetaDeps: harness.createDeps }));
vi.mock('../lib/ask-reta/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ask-reta/pipeline')>();
  return { AskRetaAbortedError: actual.AskRetaAbortedError, runAskReta: harness.runAskReta };
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

  it('fails CLOSED in production without remote Redis (503)', async () => {
    harness.env.NODE_ENV = 'production';
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
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

  it('drops an event whose serialization exceeds its byte budget', () => {
    expect(
      serializeBoundedEvent({
        type: 'result',
        result: {
          answer: 'a'.repeat(300_000),
          citations: [],
          steps: [],
          model: 'llama-4-scout',
        },
      }),
    ).toBeNull();
  });

  it('drops OFF-SCHEMA events at runtime — terminal events included', () => {
    // Unknown step kind.
    expect(
      serializeBoundedEvent({
        type: 'step',
        step: { kind: 'exfiltrate' as never, detail: 'x', sourceRefs: [] },
      }),
    ).toBeNull();
    // A result whose citation violates the contract (metadata kind).
    expect(
      serializeBoundedEvent({
        type: 'result',
        result: {
          answer: 'ok',
          citations: [
            {
              ref: 's1',
              kind: 'metadata' as never,
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
    // A terminal error outside the enum vocabulary.
    expect(
      serializeBoundedEvent({ type: 'error', message: 'stack trace détaillée' as never }),
    ).toBeNull();
  });
});
