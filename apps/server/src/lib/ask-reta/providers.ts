import { findCatalogueEntry, type RetaCatalogueEntry, type RetaProviderId } from './catalogue';
import { AskRetaAbortedError } from './errors';
import type { RetaModel } from './model';

/**
 * BYOK provider adapters (slice 3A) — fetch-based, abortMode 'native'.
 *
 * Discipline (contract, all providers):
 * - The adapter resolves the CATALOGUE itself from an internal model id — no
 *   caller can inject an entry with a foreign URL or upstream model name.
 * - POST only, CONSTANT endpoints (the only URL variance is the
 *   catalogue-owned Gemini model path), redirect:'error', cache:'no-store',
 *   signal REQUIRED and passed to fetch (native abort) AND honored during the
 *   body read, auth in HEADERS only (never query), no retries — ever.
 * - Request parameters follow SERVER-OWNED capabilities (catalogue): models
 *   that reject `temperature` never receive it; Moonshot uses
 *   `max_completion_tokens`.
 * - Success bodies are size-capped (1 MiB, exact cap accepted, +1 refused)
 *   BEFORE parsing; stream failures surface as FIXED errors.
 * - Provider failures are a FIXED RetaProviderError: no response body, no
 *   URL, no status, no key material — nothing provider-derived.
 * - No web tools / browsing of any kind.
 */

const MAX_RESPONSE_BYTES = 1_048_576;

/**
 * FIXED failure when a BYOK model is selected but unusable (no KEK, no
 * credential, undecryptable envelope): Ask Reta fails DETERMINISTICALLY —
 * never a silent substitution of another model, and no detail about which
 * precondition failed.
 */
export class RetaVaultUnavailableError extends Error {
  constructor() {
    super('Ask Reta: selected model unavailable — provider credential missing or vault locked');
    this.name = 'RetaVaultUnavailableError';
  }
}

export class RetaProviderError extends Error {
  constructor(
    public readonly provider: RetaProviderId,
    public readonly kind: 'http' | 'network' | 'oversize' | 'malformed',
  ) {
    // FIXED message — deliberately free of status/body/url/key material.
    super(`Ask Reta provider call failed (${provider}: ${kind})`);
    this.name = 'RetaProviderError';
  }
}

type ChatParams = {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
};

const isAbort = (error: unknown, signal?: AbortSignal) =>
  signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AskRetaAbortedError('aborted');
};

/**
 * Read at most MAX_RESPONSE_BYTES (the exact cap is accepted, one byte more
 * is refused). The signal is honored around EVERY chunk; a mid-stream failure
 * is a FIXED provider error — the native message never surfaces.
 */
async function readBoundedJson(
  response: Response,
  provider: RetaProviderId,
  signal?: AbortSignal,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new RetaProviderError(provider, 'malformed');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      throwIfAborted(signal);
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (error) {
        if (isAbort(error, signal)) throw new AskRetaAbortedError('aborted');
        throw new RetaProviderError(provider, 'network');
      }
      throwIfAborted(signal);
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) throw new RetaProviderError(provider, 'oversize');
        chunks.push(value);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      /* already released by cancel */
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(merged));
  } catch {
    throw new RetaProviderError(provider, 'malformed');
  }
}

async function providerFetch(params: {
  provider: RetaProviderId;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
  fetchImpl: typeof fetch;
}): Promise<unknown> {
  throwIfAborted(params.signal);
  let response: Response;
  try {
    response = await params.fetchImpl(params.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...params.headers },
      body: JSON.stringify(params.body),
      redirect: 'error',
      cache: 'no-store',
      signal: params.signal,
    });
  } catch (error) {
    // Native abort is a first-class outcome; NEVER retried.
    if (isAbort(error, params.signal)) throw new AskRetaAbortedError('aborted');
    throw new RetaProviderError(params.provider, 'network');
  }
  throwIfAborted(params.signal);
  if (!response.ok) {
    // Release the error body WITHOUT reading it — nothing provider-derived
    // is buffered or surfaced; cancellation is best-effort.
    await response.body?.cancel().catch(() => {});
    throw new RetaProviderError(params.provider, 'http');
  }
  return readBoundedJson(response, params.provider, params.signal);
}

const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** OpenAI Responses API: output[] → message → content[] → output_text. */
const parseOpenAi = (json: unknown): string | null => {
  const output = (json as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = asText((part as { text?: unknown }).text);
      if (text !== null) return text;
    }
  }
  return null;
};

const parseAnthropic = (json: unknown): string | null => {
  const content = (json as { content?: unknown[] }).content;
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    const text = asText((part as { text?: unknown }).text);
    if (text !== null) return text;
  }
  return null;
};

const parseGemini = (json: unknown): string | null => {
  const candidates = (json as { candidates?: unknown[] }).candidates;
  const parts = (candidates?.[0] as { content?: { parts?: unknown[] } } | undefined)?.content
    ?.parts;
  if (!Array.isArray(parts)) return null;
  const texts = parts
    .map((part) => asText((part as { text?: unknown }).text))
    .filter((text): text is string => text !== null);
  return texts.length ? texts.join('') : null;
};

const parseOpenAiCompatChat = (json: unknown): string | null => {
  const choices = (json as { choices?: unknown[] }).choices;
  const message = (choices?.[0] as { message?: { content?: unknown } } | undefined)?.message;
  return asText(message?.content);
};

type AdapterSpec = {
  url: (upstreamModel: string) => string;
  headers: (apiKey: string) => Record<string, string>;
  /** Body from the CATALOGUE entry (upstream name + capabilities) — never client data. */
  body: (entry: RetaCatalogueEntry, params: ChatParams) => unknown;
  parse: (json: unknown) => string | null;
};

const temperatureIfSupported = (entry: RetaCatalogueEntry, params: ChatParams) =>
  entry.supportsTemperature ? { temperature: params.temperature } : {};

const ADAPTERS: Record<Exclude<RetaProviderId, 'workers-ai'>, AdapterSpec> = {
  openai: {
    url: () => 'https://api.openai.com/v1/responses',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    body: (entry, p) => ({
      model: entry.upstreamModel,
      input: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      max_output_tokens: p.maxTokens,
      ...temperatureIfSupported(entry, p),
    }),
    parse: parseOpenAi,
  },
  anthropic: {
    url: () => 'https://api.anthropic.com/v1/messages',
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    body: (entry, p) => ({
      model: entry.upstreamModel,
      system: p.system,
      messages: [{ role: 'user', content: p.user }],
      max_tokens: p.maxTokens,
      ...temperatureIfSupported(entry, p),
    }),
    parse: parseAnthropic,
  },
  gemini: {
    // Model path comes EXCLUSIVELY from the catalogue's upstreamModel.
    url: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    // API key in a HEADER — never a query parameter.
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
    body: (entry, p) => ({
      system_instruction: { parts: [{ text: p.system }] },
      contents: [{ role: 'user', parts: [{ text: p.user }] }],
      generationConfig: {
        maxOutputTokens: p.maxTokens,
        ...(entry.supportsTemperature ? { temperature: p.temperature } : {}),
      },
    }),
    parse: parseGemini,
  },
  moonshot: {
    url: () => 'https://api.moonshot.ai/v1/chat/completions',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    body: (entry, p) => ({
      model: entry.upstreamModel,
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      // Kimi K2.5 uses the newer parameter name; `max_tokens` is rejected.
      max_completion_tokens: p.maxTokens,
      ...temperatureIfSupported(entry, p),
    }),
    parse: parseOpenAiCompatChat,
  },
  zai: {
    url: () => 'https://api.z.ai/api/paas/v4/chat/completions',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    body: (entry, p) => ({
      model: entry.upstreamModel,
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      max_tokens: p.maxTokens,
      ...temperatureIfSupported(entry, p),
    }),
    parse: parseOpenAiCompatChat,
  },
};

export function createProviderModel(params: {
  /** INTERNAL catalogue id — the adapter resolves the entry itself. */
  modelId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): RetaModel {
  const entry = findCatalogueEntry(params.modelId);
  if (!entry) throw new Error('unknown Ask Reta model id');
  if (entry.provider === 'workers-ai') {
    throw new Error('workers-ai is not a fetch adapter');
  }
  const spec = ADAPTERS[entry.provider];
  const fetchImpl = params.fetchImpl ?? fetch;
  const { apiKey } = params;

  return {
    key: entry.id,
    // The signal is passed to fetch: the HTTP request itself is aborted.
    abortMode: 'native',
    async complete(chat) {
      const json = await providerFetch({
        provider: entry.provider,
        url: spec.url(entry.upstreamModel),
        headers: spec.headers(apiKey),
        body: spec.body(entry, chat),
        signal: chat.signal,
        fetchImpl,
      });
      const text = spec.parse(json);
      if (text === null) throw new RetaProviderError(entry.provider, 'malformed');
      return text;
    },
  };
}
