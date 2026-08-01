import { ASK_RETA_MODELS, type AskRetaModelKey } from './schema';

/**
 * Injectable model seam. Slice 1 ships Workers AI only (no external
 * credentials); BYOK providers (spec, slice ≥ 3) implement the same interface
 * behind the envelope-encryption + host-allowlist prerequisites.
 */
export interface RetaModel {
  readonly key: AskRetaModelKey;
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
  async complete({ system, user, maxTokens, temperature }) {
    // Workers AI has no native abort; the pipeline checks its signal between steps.
    const response = await ai.run(ASK_RETA_MODELS[key], {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    });
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
