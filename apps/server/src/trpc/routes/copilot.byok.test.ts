import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// P0 routes BYOK (slice 3A) : vrais resolvers + schémas zod, DB/vault/env en
// fakes déterministes. Rien de sensible ne doit traverser la frontière tRPC :
// pas d'écho de clé, pas de champ d'enveloppe, pas de mapping upstream.

const harness = vi.hoisted(() => ({
  kek: undefined as string | undefined,
  settings: null as { settings: Record<string, unknown> } | null,
  status: [] as { provider: string; updatedAt: Date }[],
  findUserSettings: vi.fn(async () => harness.settings),
  listRetaByokCredentialStatus: vi.fn(async () => harness.status),
  replaceRetaByokCredential: vi.fn(async (_data: unknown) => {}),
  deleteRetaByokCredentialAndResetModel: vi.fn(async (..._args: unknown[]) => {}),
  updateUserSettings: vi.fn(async (_settings: unknown) => {}),
  limiterConfigs: [] as Record<string, unknown>[],
}));

const procBuild = vi.hoisted(() => {
  const build = (partial: Record<string, unknown> = {}): any => ({
    use: () => build(partial),
    input: (inputSchema: unknown) => build({ ...partial, inputSchema }),
    query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
    mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
  });
  return build;
});

vi.mock('../trpc', () => ({
  router: (defs: unknown) => defs,
  activeDriverProcedure: procBuild(),
  createRateLimiterMiddleware: vi.fn((config: Record<string, unknown>) => {
    harness.limiterConfigs.push(config);
    return 'rate-limiter-middleware';
  }),
}));

vi.mock('../../env', () => ({
  env: {
    get RETA_BYOK_KEK_V1() {
      return harness.kek;
    },
    AI: { run: vi.fn() },
    HYPERDRIVE: { connectionString: 'postgres://fake' },
  },
}));

vi.mock('../../lib/server-utils', () => ({
  getZeroAgent: vi.fn(),
  getThreadsFromDB: vi.fn(),
  getThread: vi.fn(),
  getZeroDB: vi.fn(async () => ({
    findUserSettings: harness.findUserSettings,
    listRetaByokCredentialStatus: harness.listRetaByokCredentialStatus,
    replaceRetaByokCredential: harness.replaceRetaByokCredential,
    deleteRetaByokCredentialAndResetModel: harness.deleteRetaByokCredentialAndResetModel,
    updateUserSettings: harness.updateUserSettings,
  })),
}));

vi.mock('../../db', () => ({
  createDb: () => ({ db: {}, conn: { end: vi.fn(async () => {}) } }),
}));

import { decodeKek, decryptApiKey, zeroize } from '../../lib/ask-reta/byok-crypto';
import { DEFAULT_CATALOGUE_ID } from '../../lib/ask-reta/catalogue';
import { copilotRouter } from './copilot';

const KEK_SECRET = Buffer.from(new Uint8Array(32).fill(11)).toString('base64url');
const API_KEY = 'sk-nouvelle-cle-jamais-echo';

type Proc = { resolver: Function; inputSchema?: { parse: (value: unknown) => unknown } };
const routes = copilotRouter as unknown as Record<string, Proc>;
const ctx = { activeConnection: { id: 'conn-1' }, sessionUser: { id: 'user-1' } };

const call = (name: string, input?: unknown) => {
  const proc = routes[name]!;
  return proc.resolver({
    ctx,
    input: proc.inputSchema ? proc.inputSchema.parse(input) : undefined,
  });
};

beforeEach(() => {
  harness.kek = undefined;
  harness.settings = null;
  harness.status = [];
  harness.replaceRetaByokCredential.mockClear();
  harness.deleteRetaByokCredentialAndResetModel.mockClear();
  harness.updateUserSettings.mockClear();
});

describe('copilot.modelCatalog', () => {
  it('lists the catalogue with status flags — NOTHING sensitive, no upstream mapping', async () => {
    harness.status = [{ provider: 'anthropic', updatedAt: new Date() }];
    harness.kek = KEK_SECRET;
    const result = await call('modelCatalog');
    expect(result.models).toHaveLength(12);
    expect(result.selectedModelId).toBe(DEFAULT_CATALOGUE_ID);
    expect(result.vaultAvailable).toBe(true);
    const anthropic = result.models.find(
      (m: { id: string }) => m.id === 'anthropic:claude-fable-5',
    );
    expect(anthropic.configured).toBe(true);
    const openai = result.models.find((m: { id: string }) => m.id === 'openai:gpt-5.2');
    expect(openai.configured).toBe(false);
    const workers = result.models.find((m: { id: string }) => m.id === DEFAULT_CATALOGUE_ID);
    expect(workers.configured).toBe(true);
    // Boundary hygiene: no envelope field, no upstream model name, no key hint.
    const keys = result.models.flatMap((m: object) => Object.keys(m));
    for (const forbidden of ['ciphertext', 'iv', 'wrappedDek', 'wrapIv', 'upstreamModel']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(result)).not.toContain('@cf/meta');
  });

  it('reports vaultAvailable=false without KEK and resolves a stale selection to the default', async () => {
    harness.settings = { settings: { askRetaModel: 'zombie:model' } };
    const result = await call('modelCatalog');
    expect(result.vaultAvailable).toBe(false);
    expect(result.selectedModelId).toBe(DEFAULT_CATALOGUE_ID);
  });
});

describe('copilot.setCredential', () => {
  const validInput = {
    provider: 'anthropic',
    apiKey: API_KEY,
    acceptsMailboxEgress: true,
    consentVersion: '2026-08-01',
  };

  it('REQUIRES explicit consent literals — refusals and drifted versions are schema errors', () => {
    const schema = routes.setCredential!.inputSchema!;
    expect(() => schema.parse({ ...validInput, acceptsMailboxEgress: false })).toThrow();
    expect(() => schema.parse({ ...validInput, consentVersion: '2025-01-01' })).toThrow();
    expect(() => schema.parse({ ...validInput, provider: 'workers-ai' })).toThrow();
    expect(() => schema.parse({ ...validInput, apiKey: 'short' })).toThrow();
    // No caller-controlled identity: a smuggled userId is STRIPPED by zod.
    const parsed = schema.parse({ ...validInput, userId: 'user-B' }) as Record<string, unknown>;
    expect(parsed.userId).toBeUndefined();
  });

  it('fails closed without KEK', async () => {
    await expect(call('setCredential', validInput)).rejects.toBeInstanceOf(TRPCError);
    expect(harness.replaceRetaByokCredential).not.toHaveBeenCalled();
  });

  it('stores ONLY the envelope (decryptable, atomically replaced) and NEVER echoes the key', async () => {
    harness.kek = KEK_SECRET;
    const result = await call('setCredential', validInput);
    expect(result).toEqual({ ok: true });
    expect(harness.replaceRetaByokCredential).toHaveBeenCalledTimes(1);
    const stored = harness.replaceRetaByokCredential.mock.calls[0]![0] as Record<string, string>;
    expect(Object.keys(stored).sort()).toEqual([
      'ciphertext',
      'consentVersion',
      'id',
      'iv',
      'kekVersion',
      'provider',
      'wrapIv',
      'wrappedDek',
    ]);
    expect(stored.kekVersion).toBe('v1');
    // No plaintext, no hint (suffix/length/prefix) anywhere in the stored row.
    for (const value of Object.values(stored)) {
      expect(String(value)).not.toContain(API_KEY);
      expect(String(value)).not.toContain(API_KEY.slice(-6));
    }
    // The envelope REALLY decrypts back to the key under the right AAD.
    const kek = decodeKek(KEK_SECRET);
    const bytes = await decryptApiKey({
      envelope: {
        ciphertext: stored.ciphertext!,
        iv: stored.iv!,
        wrappedDek: stored.wrappedDek!,
        wrapIv: stored.wrapIv!,
        kekVersion: stored.kekVersion!,
      },
      kek,
      aad: { userId: 'user-1', provider: 'anthropic', credentialId: stored.id! },
    });
    expect(new TextDecoder().decode(bytes)).toBe(API_KEY);
    zeroize(bytes);
    zeroize(kek);
  });
});

describe('copilot.deleteCredential', () => {
  it('delegates the ATOMIC delete+reset with the server-owned reset set', async () => {
    const result = await call('deleteCredential', { provider: 'openai' });
    expect(result).toEqual({ ok: true });
    expect(harness.deleteRetaByokCredentialAndResetModel).toHaveBeenCalledWith(
      'openai',
      ['openai:gpt-5.2', 'openai:gpt-5-mini'],
      DEFAULT_CATALOGUE_ID,
    );
  });

  it('rejects a non-BYOK provider at the schema', () => {
    expect(() => routes.deleteCredential!.inputSchema!.parse({ provider: 'workers-ai' })).toThrow();
  });
});

describe('copilot.selectModel', () => {
  it('rejects any id absent from the catalogue', async () => {
    await expect(call('selectModel', { modelId: 'evil:model' })).rejects.toBeInstanceOf(TRPCError);
    await expect(call('selectModel', { modelId: 'gpt-5.2' })).rejects.toBeInstanceOf(TRPCError);
    expect(harness.updateUserSettings).not.toHaveBeenCalled();
  });

  it('Workers models are ALWAYS selectable — no KEK, no credential needed', async () => {
    const result = await call('selectModel', { modelId: 'workers-ai:llama-3.3-70b' });
    expect(result).toEqual({ selectedModelId: 'workers-ai:llama-3.3-70b' });
    const saved = harness.updateUserSettings.mock.calls[0]![0] as { askRetaModel: string };
    expect(saved.askRetaModel).toBe('workers-ai:llama-3.3-70b');
  });

  it('a BYOK model needs the vault AND a configured provider', async () => {
    await expect(
      call('selectModel', { modelId: 'anthropic:claude-fable-5' }),
    ).rejects.toBeInstanceOf(TRPCError); // no KEK
    harness.kek = KEK_SECRET;
    await expect(
      call('selectModel', { modelId: 'anthropic:claude-fable-5' }),
    ).rejects.toBeInstanceOf(TRPCError); // KEK but not configured
    harness.status = [{ provider: 'anthropic', updatedAt: new Date() }];
    const result = await call('selectModel', { modelId: 'anthropic:claude-fable-5' });
    expect(result).toEqual({ selectedModelId: 'anthropic:claude-fable-5' });
  });

  it('unparseable stored settings fall back to defaults instead of leaking garbage', async () => {
    harness.settings = { settings: { language: 42 } };
    await call('selectModel', { modelId: 'workers-ai:llama-4-scout' });
    const saved = harness.updateUserSettings.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.language).toBe('en');
    expect(saved.askRetaModel).toBe('workers-ai:llama-4-scout');
  });
});

describe('copilot BYOK — write surfaces are rate-limited FAIL-CLOSED per user', () => {
  it('setCredential/deleteCredential/selectModel each wire a userId fail-closed limiter', () => {
    const prefixes = harness.limiterConfigs.map((config) =>
      (config.generatePrefix as () => string)(),
    );
    for (const expected of [
      'ratelimit:copilot-byok-set',
      'ratelimit:copilot-byok-delete',
      'ratelimit:copilot-byok-select',
    ]) {
      const index = prefixes.indexOf(expected);
      expect(index, expected).toBeGreaterThan(-1);
      expect(harness.limiterConfigs[index]).toMatchObject({ key: 'userId', failClosed: true });
    }
  });

  it('no BYOK route accepts a userId or connectionId input', () => {
    for (const name of ['setCredential', 'deleteCredential', 'selectModel'] as const) {
      const schema = routes[name]!.inputSchema!;
      const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;
      expect(Object.keys(shape)).not.toContain('userId');
      expect(Object.keys(shape)).not.toContain('connectionId');
    }
  });
});
