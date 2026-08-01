import { createProviderModel, RetaProviderError } from './providers';
import { describe, expect, it, vi } from 'vitest';
import { AskRetaAbortedError } from './errors';

// P0 adapter discipline (slice 3A): internal catalogue resolution (nothing
// injectable), constant endpoints, POST only, auth in HEADERS, redirect
// error, no-store, REAL AbortSignal honored during fetch AND body read,
// bounded response (exact cap accepted, +1 refused), no retry ever, and
// FIXED errors free of body/url/status/key material. Server-owned
// capabilities: models that reject `temperature` never receive it; Moonshot
// uses max_completion_tokens.

const API_KEY = 'sk-byok-EXTREMEMENT-SECRETE';
const chat = { system: 'sys prompt', user: 'user prompt', maxTokens: 200, temperature: 0.1 };

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

type Captured = { url: string; init: RequestInit };
const capture = (response: Response) => {
  const calls: Captured[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

const CASES: {
  id: string;
  url: string;
  authHeader: [string, string];
  fixture: unknown;
  expected: string;
  assertBody: (body: Record<string, unknown>) => void;
}[] = [
  {
    id: 'openai:gpt-5.2',
    url: 'https://api.openai.com/v1/responses',
    authHeader: ['Authorization', `Bearer ${API_KEY}`],
    fixture: { output: [{ content: [{ type: 'output_text', text: 'réponse openai' }] }] },
    expected: 'réponse openai',
    assertBody: (body) => {
      expect(body).toEqual({
        model: 'gpt-5.2',
        input: [
          { role: 'system', content: 'sys prompt' },
          { role: 'user', content: 'user prompt' },
        ],
        max_output_tokens: 200,
        // GPT-5 Responses rejects non-default temperature → OMITTED.
      });
    },
  },
  {
    id: 'anthropic:claude-fable-5',
    url: 'https://api.anthropic.com/v1/messages',
    authHeader: ['x-api-key', API_KEY],
    fixture: { content: [{ type: 'text', text: 'réponse anthropic' }] },
    expected: 'réponse anthropic',
    assertBody: (body) => {
      expect(body).toEqual({
        model: 'claude-fable-5',
        system: 'sys prompt',
        messages: [{ role: 'user', content: 'user prompt' }],
        max_tokens: 200,
        // Claude 5 rejects non-default temperature → OMITTED.
      });
    },
  },
  {
    id: 'gemini:gemini-3.6-flash',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    authHeader: ['x-goog-api-key', API_KEY],
    fixture: { candidates: [{ content: { parts: [{ text: 'réponse ' }, { text: 'gemini' }] } }] },
    expected: 'réponse gemini',
    assertBody: (body) => {
      expect(body).toEqual({
        system_instruction: { parts: [{ text: 'sys prompt' }] },
        contents: [{ role: 'user', parts: [{ text: 'user prompt' }] }],
        // 3.6 Flash rejects temperature → maxOutputTokens ONLY.
        generationConfig: { maxOutputTokens: 200 },
      });
    },
  },
  {
    id: 'moonshot:kimi-k2.5',
    url: 'https://api.moonshot.ai/v1/chat/completions',
    authHeader: ['Authorization', `Bearer ${API_KEY}`],
    fixture: { choices: [{ message: { content: 'réponse kimi' } }] },
    expected: 'réponse kimi',
    assertBody: (body) => {
      expect(body).toEqual({
        model: 'kimi-k2.5',
        messages: [
          { role: 'system', content: 'sys prompt' },
          { role: 'user', content: 'user prompt' },
        ],
        // K2.5 uses the NEW parameter name — max_tokens is rejected upstream.
        max_completion_tokens: 200,
        temperature: 0.1,
      });
      expect(body).not.toHaveProperty('max_tokens');
    },
  },
  {
    id: 'zai:glm-5.1',
    url: 'https://api.z.ai/api/paas/v4/chat/completions',
    authHeader: ['Authorization', `Bearer ${API_KEY}`],
    fixture: { choices: [{ message: { content: 'réponse glm' } }] },
    expected: 'réponse glm',
    assertBody: (body) => {
      expect(body).toEqual({
        model: 'glm-5.1',
        messages: [
          { role: 'system', content: 'sys prompt' },
          { role: 'user', content: 'user prompt' },
        ],
        max_tokens: 200,
        temperature: 0.1,
      });
    },
  },
];

describe.each(CASES)('adapter $id', ({ id, url, authHeader, fixture, expected, assertBody }) => {
  it('POSTs the CONSTANT endpoint with auth in headers, native signal, no redirect, no cache', async () => {
    const { calls, fetchImpl } = capture(jsonResponse(fixture));
    const controller = new AbortController();
    const model = createProviderModel({ modelId: id, apiKey: API_KEY, fetchImpl });

    expect(model.key).toBe(id);
    expect(model.abortMode).toBe('native');
    await expect(model.complete({ ...chat, signal: controller.signal })).resolves.toBe(expected);

    expect(calls).toHaveLength(1);
    const { url: calledUrl, init } = calls[0]!;
    expect(calledUrl).toBe(url);
    // Auth NEVER in the URL/query — headers only.
    expect(calledUrl).not.toContain(API_KEY);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBe(controller.signal);
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers[authHeader[0]]).toBe(authHeader[1]);
    assertBody(JSON.parse(String(init.body)) as Record<string, unknown>);
  });
});

describe('server-owned capabilities', () => {
  it('gemini-3.1-pro-preview DOES send temperature (capability true)', async () => {
    const { calls, fetchImpl } = capture(
      jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    );
    const model = createProviderModel({
      modelId: 'gemini:gemini-3.1-pro-preview',
      apiKey: API_KEY,
      fetchImpl,
    });
    await model.complete(chat);
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig).toEqual({ maxOutputTokens: 200, temperature: 0.1 });
    expect(calls[0]!.url).toContain('/models/gemini-3.1-pro-preview:generateContent');
  });
});

describe('adapter failure discipline — fixed errors, never a retry', () => {
  const MODEL_ID = 'moonshot:kimi-k2.5';
  const make = (fetchImpl: typeof fetch) =>
    createProviderModel({ modelId: MODEL_ID, apiKey: API_KEY, fetchImpl });

  it('rejects unknown model ids and workers-ai entries — nothing injectable', () => {
    expect(() => createProviderModel({ modelId: 'evil:model', apiKey: API_KEY })).toThrow(
      'unknown Ask Reta model id',
    );
    expect(() =>
      createProviderModel({ modelId: 'workers-ai:llama-4-scout', apiKey: API_KEY }),
    ).toThrow('workers-ai is not a fetch adapter');
  });

  it('HTTP failure → FIXED RetaProviderError without status/body/url/key, called ONCE, body CANCELLED unread', async () => {
    let bodyCancelled = false;
    const errorBody = new ReadableStream<Uint8Array>({
      // Never enqueues: if the adapter tried to READ the error body it would
      // hang forever — completing at all proves the body was not consumed.
      pull() {},
      cancel() {
        bodyCancelled = true;
      },
    });
    const calls: number[] = [];
    const fetchImpl = vi.fn(async () => {
      calls.push(1);
      return new Response(errorBody, { status: 429 });
    }) as unknown as typeof fetch;
    const failure = await make(fetchImpl)
      .complete(chat)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RetaProviderError);
    const message = (failure as Error).message;
    expect(message).toBe('Ask Reta provider call failed (moonshot: http)');
    expect(message).not.toContain('429');
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain('moonshot.ai');
    expect(calls).toHaveLength(1);
    // The error body is RELEASED (cancelled) without ever being buffered —
    // a read would have hung on the never-enqueueing stream above.
    expect(bodyCancelled).toBe(true);
  });

  it('network failure → fixed error, called ONCE (no retry)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: ECONNRESET at api.moonshot.ai');
    }) as unknown as typeof fetch;
    const failure = await make(fetchImpl)
      .complete(chat)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RetaProviderError);
    expect((failure as Error).message).toBe('Ask Reta provider call failed (moonshot: network)');
    expect((failure as Error).message).not.toContain('ECONNRESET');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pre-aborted signal → AskRetaAbortedError and fetch is NEVER dispatched', async () => {
    const { calls, fetchImpl } = capture(jsonResponse({}));
    const controller = new AbortController();
    controller.abort();
    await expect(
      make(fetchImpl).complete({ ...chat, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AskRetaAbortedError);
    expect(calls).toHaveLength(0);
  });

  it('abort DURING the request (headers) → AskRetaAbortedError, exactly one dispatch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw new DOMException('The operation was aborted', 'AbortError');
    }) as unknown as typeof fetch;
    await expect(
      make(fetchImpl).complete({ ...chat, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AskRetaAbortedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('abort DURING the body stream → AskRetaAbortedError, no partial parse', async () => {
    const controller = new AbortController();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(streamController) {
        pulls += 1;
        if (pulls === 1) {
          streamController.enqueue(new TextEncoder().encode('{"choices"'));
          controller.abort(); // the user cancels mid-body
        } else {
          streamController.close();
        }
      },
    });
    const { fetchImpl } = capture(new Response(stream, { status: 200 }));
    await expect(
      make(fetchImpl).complete({ ...chat, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AskRetaAbortedError);
  });

  it('mid-stream failure → FIXED error, the native stream message never surfaces', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(streamController) {
        streamController.error(new Error('boom-detail-natif-avec-ip-10.0.0.1'));
      },
    });
    const { fetchImpl } = capture(new Response(stream, { status: 200 }));
    const failure = await make(fetchImpl)
      .complete(chat)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RetaProviderError);
    expect((failure as Error).message).toBe('Ask Reta provider call failed (moonshot: network)');
    expect((failure as Error).message).not.toContain('boom');
  });

  it('EXACTLY 1 MiB is accepted; one byte more is refused before parsing', async () => {
    const prefix = '{"choices":[{"message":{"content":"';
    const suffix = '"}}]}';
    const pad = 1_048_576 - prefix.length - suffix.length;
    const exact = prefix + 'a'.repeat(pad) + suffix;
    expect(exact.length).toBe(1_048_576);
    await expect(
      make(capture(new Response(exact, { status: 200 })).fetchImpl).complete(chat),
    ).resolves.toBe('a'.repeat(pad));

    const over = new Uint8Array(1_048_577).fill(97);
    const failure = await make(capture(new Response(over, { status: 200 })).fetchImpl)
      .complete(chat)
      .catch((error: unknown) => error);
    expect((failure as Error).message).toBe('Ask Reta provider call failed (moonshot: oversize)');
  });

  it('non-JSON or shape-less success → fixed malformed error', async () => {
    await expect(
      make(capture(new Response('<html>gateway</html>', { status: 200 })).fetchImpl).complete(chat),
    ).rejects.toThrow('Ask Reta provider call failed (moonshot: malformed)');
    await expect(
      make(capture(jsonResponse({ unexpected: true })).fetchImpl).complete(chat),
    ).rejects.toThrow('Ask Reta provider call failed (moonshot: malformed)');
  });
});
