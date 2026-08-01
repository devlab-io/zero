import { AskRetaAbortedError } from './errors';

/**
 * Injectable model seam. Workers AI needs no credential; BYOK providers
 * (slice 3A, lib/ask-reta/providers.ts) implement the same interface behind
 * the envelope-encryption vault + fixed-endpoint catalogue.
 *
 * Cancellation capability (review 02-cancel-contract) is EXPLICIT:
 * - 'cooperative': the provider API is NOT abortable (env.AI.run ignores the
 *   signal). The implementation checks the signal before dispatch and after
 *   the await — a dispatched inference may still run to completion on the
 *   provider side; its result is discarded, never displayed.
 * - 'native': the provider call itself honors the signal (fetch-based BYOK
 *   passes it to fetch, aborting the HTTP request for real).
 */
export interface RetaModel {
  /** Catalogue id (`provider:model`) — the only model identifier clients see. */
  readonly key: string;
  readonly abortMode: 'native' | 'cooperative';
  complete(params: {
    system: string;
    user: string;
    maxTokens: number;
    temperature: number;
    signal?: AbortSignal;
    /**
     * OPTIONAL structured-output hint (tour 06): a JSON Schema the response
     * should satisfy. Workers AI forwards it as
     * `response_format: { type: 'json_schema', json_schema }` — the mechanism
     * the LOCAL generated types expose for BOTH catalogue Workers models
     * (`guided_json` exists only on the Scout input type, so response_format
     * is the portable choice). Adapters whose upstream API has no equivalent
     * (BYOK) IGNORE it safely — the parsing path is unchanged either way.
     */
    jsonSchema?: Record<string, unknown>;
  }): Promise<string>;
}

export type WorkersAiBinding = {
  run: (
    model: string,
    options: {
      messages: { role: 'system' | 'user'; content: string }[];
      max_tokens: number;
      temperature: number;
      response_format?: { type: 'json_schema'; json_schema: Record<string, unknown> };
    },
  ) => Promise<unknown>;
};

export const workersAiModel = (
  ai: WorkersAiBinding,
  entry: { key: string; upstreamModel: string },
): RetaModel => ({
  key: entry.key,
  // env.AI.run ignores AbortSignal: cancellation here is COOPERATIVE only —
  // refuse to dispatch after abort, discard a late result after abort. The
  // dispatched inference itself may run to completion on Cloudflare's side.
  abortMode: 'cooperative',
  async complete({ system, user, maxTokens, temperature, signal, jsonSchema }) {
    if (signal?.aborted) throw new AskRetaAbortedError('aborted');
    const response = await ai.run(entry.upstreamModel, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
      ...(jsonSchema
        ? { response_format: { type: 'json_schema' as const, json_schema: jsonSchema } }
        : {}),
    });
    if (signal?.aborted) throw new AskRetaAbortedError('aborted');
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'response' in response) {
      const inner = (response as { response: unknown }).response;
      if (typeof inner === 'string') return inner;
      // json_schema mode may return the structured object directly: normalize
      // to a JSON string so the shared extract/parse path stays unchanged.
      if (inner && typeof inner === 'object') return JSON.stringify(inner);
    }
    return '';
  },
});

/** Extract the first JSON object from a model reply (fences/prose tolerated). */
export const extractJsonObject = (raw: string): unknown | null => {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
};
