import {
  catalogueIdsForProvider,
  DEFAULT_CATALOGUE_ID,
  findCatalogueEntry,
  resolveSelectedEntry,
  RETA_BYOK_PROVIDERS,
  RETA_MODEL_CATALOGUE,
} from './catalogue';
import { describe, expect, it } from 'vitest';

describe('Ask Reta model catalogue — deployment-owned, closed set', () => {
  it('is EXACTLY the contracted set (ids provider:model, no invented models)', () => {
    expect(RETA_MODEL_CATALOGUE.map((entry) => entry.id)).toEqual([
      'workers-ai:llama-4-scout',
      'workers-ai:llama-3.3-70b',
      'openai:gpt-5.2',
      'openai:gpt-5-mini',
      'anthropic:claude-fable-5',
      'anthropic:claude-sonnet-5',
      'gemini:gemini-3.6-flash',
      'gemini:gemini-3.1-pro-preview',
      'openrouter:google/gemini-3-flash-preview',
      'moonshot:kimi-k2.5',
      'zai:glm-5.1',
      'zai:glm-5',
      'zai:glm-5-turbo',
    ]);
    // No fabricated Kimi K3 — the catalogue only lists real, shipped models.
    expect(RETA_MODEL_CATALOGUE.some((entry) => entry.upstreamModel.includes('k3'))).toBe(false);
  });

  it('every id is prefixed by its provider; Workers entries need no credential, BYOK ones do', () => {
    for (const entry of RETA_MODEL_CATALOGUE) {
      expect(entry.id.startsWith(`${entry.provider}:`)).toBe(true);
      expect(entry.requiresCredential).toBe(entry.provider !== 'workers-ai');
    }
    expect(RETA_BYOK_PROVIDERS).toEqual([
      'openai',
      'anthropic',
      'gemini',
      'openrouter',
      'moonshot',
      'zai',
    ]);
  });

  it('findCatalogueEntry: exact ids only — unknown, legacy or non-string → null', () => {
    expect(findCatalogueEntry('anthropic:claude-fable-5')?.provider).toBe('anthropic');
    expect(findCatalogueEntry('claude-fable-5')).toBeNull();
    expect(findCatalogueEntry('llama-4-scout')).toBeNull();
    expect(findCatalogueEntry('evil:model')).toBeNull();
    expect(findCatalogueEntry(42)).toBeNull();
    expect(findCatalogueEntry(undefined)).toBeNull();
  });

  it('resolveSelectedEntry: legacy short keys alias to their Workers entries', () => {
    expect(resolveSelectedEntry('llama-4-scout').id).toBe('workers-ai:llama-4-scout');
    expect(resolveSelectedEntry('llama-3.3-70b').id).toBe('workers-ai:llama-3.3-70b');
    expect(resolveSelectedEntry('workers-ai:llama-3.3-70b').id).toBe('workers-ai:llama-3.3-70b');
  });

  it('resolveSelectedEntry: anything stale/forged resolves DETERMINISTICALLY to the default', () => {
    expect(resolveSelectedEntry('evil:model').id).toBe(DEFAULT_CATALOGUE_ID);
    expect(resolveSelectedEntry('openai:gpt-9-turbo-preview').id).toBe(DEFAULT_CATALOGUE_ID);
    expect(resolveSelectedEntry('')).toMatchObject({ id: DEFAULT_CATALOGUE_ID });
    expect(resolveSelectedEntry(null).id).toBe(DEFAULT_CATALOGUE_ID);
    expect(resolveSelectedEntry(undefined).id).toBe(DEFAULT_CATALOGUE_ID);
    expect(resolveSelectedEntry({ id: 'anthropic:claude-fable-5' }).id).toBe(DEFAULT_CATALOGUE_ID);
  });

  it('server-owned capabilities: exactly the temperature-rejecting models OMIT it', () => {
    const noTemperature = RETA_MODEL_CATALOGUE.filter((entry) => !entry.supportsTemperature).map(
      (entry) => entry.id,
    );
    expect(noTemperature).toEqual([
      'openai:gpt-5.2',
      'openai:gpt-5-mini',
      'anthropic:claude-fable-5',
      'anthropic:claude-sonnet-5',
      'gemini:gemini-3.6-flash',
    ]);
  });

  it('the default is the credential-free Workers scout', () => {
    const entry = findCatalogueEntry(DEFAULT_CATALOGUE_ID);
    expect(entry?.provider).toBe('workers-ai');
    expect(entry?.requiresCredential).toBe(false);
  });

  it('catalogueIdsForProvider returns the exact server-owned reset set', () => {
    expect(catalogueIdsForProvider('zai')).toEqual(['zai:glm-5.1', 'zai:glm-5', 'zai:glm-5-turbo']);
    expect(catalogueIdsForProvider('moonshot')).toEqual(['moonshot:kimi-k2.5']);
    expect(catalogueIdsForProvider('openrouter')).toEqual([
      'openrouter:google/gemini-3-flash-preview',
    ]);
    expect(catalogueIdsForProvider('workers-ai')).toEqual([
      'workers-ai:llama-4-scout',
      'workers-ai:llama-3.3-70b',
    ]);
  });
});
