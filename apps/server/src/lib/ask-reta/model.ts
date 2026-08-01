import { ASK_RETA_MODELS, type AskRetaModelKey } from './schema';
import { AskRetaAbortedError } from './errors';

/**
 * Injectable model seam. Slice 1 ships Workers AI only (no external
 * credentials); BYOK providers (spec, slice ≥ 3) implement the same interface
 * behind the envelope-encryption + host-allowlist prerequisites.
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
  readonly key: AskRetaModelKey;
  readonly abortMode: 'native' | 'cooperative';
  complete(params: {
    system: string;
    user: string;
    maxTokens: number;
    temperature: number;
    signal?: AbortSignal;
  }): Promise<string>;
}

export type WorkersAiBinding = {
  run: (
    model: string,
    options: {
      messages: { role: 'system' | 'user'; content: string }[];
      max_tokens: number;
      temperature: number;
    },
  ) => Promise<unknown>;
};

export const workersAiModel = (ai: WorkersAiBinding, key: AskRetaModelKey): RetaModel => ({
  key,
  // env.AI.run ignores AbortSignal: cancellation here is COOPERATIVE only —
  // refuse to dispatch after abort, discard a late result after abort. The
  // dispatched inference itself may run to completion on Cloudflare's side.
  abortMode: 'cooperative',
  async complete({ system, user, maxTokens, temperature, signal }) {
    if (signal?.aborted) throw new AskRetaAbortedError('aborted');
    const response = await ai.run(ASK_RETA_MODELS[key], {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    });
    if (signal?.aborted) throw new AskRetaAbortedError('aborted');
    if (typeof response === 'string') return response;
    if (
      response &&
      typeof response === 'object' &&
      'response' in response &&
      typeof (response as { response: unknown }).response === 'string'
    ) {
      return (response as { response: string }).response;
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
