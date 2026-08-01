import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// Vraie route Hono + vraie enveloppe NDJSON ; frontières lourdes en fakes.

const harness = vi.hoisted(() => ({
  env: { NODE_ENV: 'local' } as Record<string, unknown>,
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

import { AskRetaAbortedError } from '../lib/ask-reta/pipeline';
import { askRetaStreamRouter } from './ask-reta';
import type { HonoContext } from '../ctx';

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

const post = (app: Hono<HonoContext>, body: unknown) =>
  app.request('/ask-reta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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
  harness.createDeps.mockResolvedValue({
    deps: { signal: undefined },
    modelKey: 'llama-4-scout',
  });
  harness.getActiveConnection.mockReset();
  harness.getActiveConnection.mockResolvedValue({ id: 'conn-active' });
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
    // Ownership: connection came from the server-side resolution, not the client.
    expect(harness.createDeps).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', connectionId: 'conn-active' }),
    );
  });

  it('rejects without a session (401) and never resolves a connection', async () => {
    const response = await post(makeApp(undefined), { question: 'x' });
    expect(response.status).toBe(401);
    expect(harness.getActiveConnection).not.toHaveBeenCalled();
  });

  it('fails CLOSED in production without remote Redis (503)', async () => {
    harness.env.NODE_ENV = 'production';
    const response = await post(makeApp({ id: 'user-1' }), { question: 'x' });
    expect(response.status).toBe(503);
    expect(harness.runAskReta).not.toHaveBeenCalled();
  });

  it('rejects invalid input (400) before touching the pipeline', async () => {
    const response = await post(makeApp({ id: 'user-1' }), { question: '' });
    expect(response.status).toBe(400);
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
