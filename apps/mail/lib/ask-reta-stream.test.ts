import { AskRetaStreamError, streamAskReta } from './ask-reta-stream';
import { describe, expect, it, vi } from 'vitest';

const ndjsonResponse = (lines: string[]) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
};

const input = { question: 'q', history: [], context: {} };

describe('streamAskReta — NDJSON consumer', () => {
  it('delivers steps progressively then resolves with the final result', async () => {
    const steps: unknown[] = [];
    const fetchImpl = vi.fn(async () =>
      ndjsonResponse([
        JSON.stringify({ type: 'step', step: { kind: 'search', detail: 'd1', sourceRefs: [] } }),
        JSON.stringify({
          type: 'result',
          result: { answer: 'A', citations: [], steps: [], model: 'llama-4-scout' },
        }),
      ]),
    );
    const result = await streamAskReta({
      input,
      signal: new AbortController().signal,
      onStep: (step) => steps.push(step),
      backendUrl: 'http://backend.test',
      fetchImpl,
    });
    expect(steps).toHaveLength(1);
    expect(result.model).toBe('llama-4-scout');
    // CSRF header + credentials: the route's origin gate depends on both.
    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Ask-Reta-Csrf']).toBe('1');
    expect(init.credentials).toBe('include');
  });

  it('maps a fetch AbortError to AskRetaStreamError(aborted)', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      streamAskReta({
        input,
        signal: controller.signal,
        onStep: () => {},
        backendUrl: 'http://backend.test',
        fetchImpl: vi.fn(async () => {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }),
      }),
    ).rejects.toMatchObject({ reason: 'aborted' });
  });

  it('a server error event maps to failed/aborted without leaking detail', async () => {
    const run = (message: string) =>
      streamAskReta({
        input,
        signal: new AbortController().signal,
        onStep: () => {},
        backendUrl: 'http://backend.test',
        fetchImpl: vi.fn(async () => ndjsonResponse([JSON.stringify({ type: 'error', message })])),
      });
    await expect(run('aborted')).rejects.toMatchObject({ reason: 'aborted' });
    await expect(run('ask_failed')).rejects.toMatchObject({ reason: 'failed' });
  });

  it('bounds a runaway stream: an oversize newline-free event trips the buffer cap', async () => {
    // 300k chars WITHOUT a newline: the line buffer cap must fire — the
    // consumer never accumulates an unbounded event.
    const encoder = new TextEncoder();
    const runaway = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`{"type":"step","pad":"${'x'.repeat(300_000)}`));
          controller.close();
        },
      }),
      { status: 200 },
    );
    await expect(
      streamAskReta({
        input,
        signal: new AbortController().signal,
        onStep: () => {},
        backendUrl: 'http://backend.test',
        fetchImpl: vi.fn(async () => runaway),
      }),
    ).rejects.toMatchObject({ reason: 'protocol' });
  });

  it('a stream ending without a result is a protocol error', async () => {
    await expect(
      streamAskReta({
        input,
        signal: new AbortController().signal,
        onStep: () => {},
        backendUrl: 'http://backend.test',
        fetchImpl: vi.fn(async () =>
          ndjsonResponse([
            JSON.stringify({ type: 'step', step: { kind: 'search', detail: 'd', sourceRefs: [] } }),
          ]),
        ),
      }),
    ).rejects.toBeInstanceOf(AskRetaStreamError);
  });
});
