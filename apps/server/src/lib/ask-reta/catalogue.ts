/**
 * Ask Reta model catalogue (slice 3A) — DEPLOYMENT-OWNED.
 *
 * The client only ever selects an `id` from this list; upstream model names
 * and endpoints are server-only. No arbitrary URL or model id can come from
 * the client: an id absent from the catalogue fails deterministically
 * (selectModel rejects; a stale stored selection resolves to the default) —
 * nothing off-catalogue is ever passed to a provider.
 */

export type RetaProviderId = 'workers-ai' | 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'zai';

export type RetaCatalogueEntry = {
  /** Internal id (`provider:model`) — the ONLY value the client handles. */
  id: string;
  provider: RetaProviderId;
  /** Upstream model identifier — server-only, never client-supplied. */
  upstreamModel: string;
  label: string;
  requiresCredential: boolean;
  /**
   * Server-owned capability: whether the upstream accepts a non-default
   * `temperature`. Models that 400 on it (GPT-5 Responses, Claude 5,
   * Gemini 3.6 Flash) OMIT the parameter — encoded HERE, never guessed in
   * the adapter.
   */
  supportsTemperature: boolean;
};

export const RETA_MODEL_CATALOGUE: readonly RetaCatalogueEntry[] = [
  {
    id: 'workers-ai:llama-4-scout',
    provider: 'workers-ai',
    upstreamModel: '@cf/meta/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout (Workers AI)',
    requiresCredential: false,
    supportsTemperature: true,
  },
  {
    id: 'workers-ai:llama-3.3-70b',
    provider: 'workers-ai',
    upstreamModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B (Workers AI)',
    requiresCredential: false,
    supportsTemperature: true,
  },
  {
    id: 'openai:gpt-5.2',
    provider: 'openai',
    upstreamModel: 'gpt-5.2',
    label: 'GPT-5.2 (OpenAI)',
    requiresCredential: true,
    supportsTemperature: false,
  },
  {
    id: 'openai:gpt-5-mini',
    provider: 'openai',
    upstreamModel: 'gpt-5-mini',
    label: 'GPT-5 mini (OpenAI)',
    requiresCredential: true,
    supportsTemperature: false,
  },
  {
    id: 'anthropic:claude-fable-5',
    provider: 'anthropic',
    upstreamModel: 'claude-fable-5',
    label: 'Claude Fable 5 (Anthropic)',
    requiresCredential: true,
    supportsTemperature: false,
  },
  {
    id: 'anthropic:claude-sonnet-5',
    provider: 'anthropic',
    upstreamModel: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 (Anthropic)',
    requiresCredential: true,
    supportsTemperature: false,
  },
  {
    id: 'gemini:gemini-3.6-flash',
    provider: 'gemini',
    upstreamModel: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash (Google)',
    requiresCredential: true,
    supportsTemperature: false,
  },
  {
    id: 'gemini:gemini-3.1-pro-preview',
    provider: 'gemini',
    upstreamModel: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview (Google)',
    requiresCredential: true,
    supportsTemperature: true,
  },
  {
    id: 'moonshot:kimi-k2.5',
    provider: 'moonshot',
    upstreamModel: 'kimi-k2.5',
    label: 'Kimi K2.5 (Moonshot)',
    requiresCredential: true,
    supportsTemperature: true,
  },
  {
    id: 'zai:glm-5.1',
    provider: 'zai',
    upstreamModel: 'glm-5.1',
    label: 'GLM-5.1 (Z.AI)',
    requiresCredential: true,
    supportsTemperature: true,
  },
  {
    id: 'zai:glm-5',
    provider: 'zai',
    upstreamModel: 'glm-5',
    label: 'GLM-5 (Z.AI)',
    requiresCredential: true,
    supportsTemperature: true,
  },
  {
    id: 'zai:glm-5-turbo',
    provider: 'zai',
    upstreamModel: 'glm-5-turbo',
    label: 'GLM-5 Turbo (Z.AI)',
    requiresCredential: true,
    supportsTemperature: true,
  },
];

export const RETA_BYOK_PROVIDERS: readonly RetaProviderId[] = [
  'openai',
  'anthropic',
  'gemini',
  'moonshot',
  'zai',
];

export const DEFAULT_CATALOGUE_ID = 'workers-ai:llama-4-scout';

/**
 * Consent contract version for BYOK egress (slice 3A): setCredential requires
 * this EXACT literal — bumping it forces every user to re-consent before any
 * mailbox excerpt can leave for their provider again.
 */
export const RETA_BYOK_CONSENT_VERSION = '2026-08-01';

/** Server-owned reset set for deleteCredential's atomic model fallback. */
export const catalogueIdsForProvider = (provider: RetaProviderId): string[] =>
  RETA_MODEL_CATALOGUE.filter((entry) => entry.provider === provider).map((entry) => entry.id);

/** Legacy stored selections (slice 1/2 short ids) — Workers AI only. */
const LEGACY_ALIASES: Record<string, string> = {
  'llama-4-scout': 'workers-ai:llama-4-scout',
  'llama-3.3-70b': 'workers-ai:llama-3.3-70b',
};

export const findCatalogueEntry = (id: unknown): RetaCatalogueEntry | null => {
  if (typeof id !== 'string') return null;
  return RETA_MODEL_CATALOGUE.find((entry) => entry.id === id) ?? null;
};

/**
 * Resolve a STORED selection: legacy aliases map to their canonical ids;
 * anything unknown/stale resolves DETERMINISTICALLY to the default — never
 * forwarded to a provider.
 */
export const resolveSelectedEntry = (stored: unknown): RetaCatalogueEntry => {
  const canonical =
    typeof stored === 'string' && LEGACY_ALIASES[stored] ? LEGACY_ALIASES[stored] : stored;
  return findCatalogueEntry(canonical) ?? findCatalogueEntry(DEFAULT_CATALOGUE_ID)!;
};
