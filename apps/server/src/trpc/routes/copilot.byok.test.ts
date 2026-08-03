import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

// P0 routes BYOK (slice 3A + release-fix) : vrais resolvers + schémas zod,
// DB/vault/env en fakes déterministes. Rien de sensible ne traverse la
// frontière tRPC : pas d'écho de clé, pas de champ d'enveloppe, pas de
// mapping upstream. Consentement COURANT exigé ; sélection transactionnelle.

const harness = vi.hoisted(() => ({
  kekV1: undefined as string | undefined,
  kekV2: undefined as string | undefined,
  kekActive: undefined as string | undefined,
  settings: null as { settings: Record<string, unknown> } | null,
  status: [] as { provider: string; consentVersion: string; kekVersion: string; updatedAt: Date }[],
  selectResult: { ok: true } as { ok: true } | { ok: false; reason: string },
  findUserSettings: vi.fn(async () => harness.settings),
  listRetaByokCredentialStatus: vi.fn(async () => harness.status),
  replaceRetaByokCredential: vi.fn(async (...args: unknown[]) => {
    void args;
  }),
  deleteRetaByokCredentialAndResetModel: vi.fn(async (...args: unknown[]) => {
    void args;
  }),
  selectRetaModel: vi.fn(async (...args: unknown[]) => {
    void args;
    return harness.selectResult;
  }),
  consumeCopilotControlRateLimit: vi.fn(async (kind: string) => ({
    allowed: true,
    limit: kind === 'byok-select' ? 30 : 10,
    remaining: kind === 'byok-select' ? 29 : 9,
    reset: 1,
  })),
  limiterConfigs: [] as Record<string, unknown>[],
}));

type FakeProcedure = {
  use: (middleware: unknown) => FakeProcedure;
  input: (inputSchema: unknown) => FakeProcedure;
  query: (resolver: unknown) => Record<string, unknown>;
  mutation: (resolver: unknown) => Record<string, unknown>;
};

const procBuild = vi.hoisted(() => {
  const build = (partial: Record<string, unknown> = {}): FakeProcedure => ({
    use: () => build(partial),
    input: (inputSchema: unknown) => build({ ...partial, inputSchema }),
    query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
    mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
  });
  type Builder = (partial?: Record<string, unknown>) => FakeProcedure;
  return build as Builder;
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
      return harness.kekV1;
    },
    get RETA_BYOK_KEK_V2() {
      return harness.kekV2;
    },
    get RETA_BYOK_KEK_ACTIVE() {
      return harness.kekActive;
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
    selectRetaModel: harness.selectRetaModel,
    consumeCopilotControlRateLimit: harness.consumeCopilotControlRateLimit,
  })),
}));

vi.mock('../../db', () => ({
  createDb: () => ({ db: {}, conn: { end: vi.fn(async () => {}) } }),
}));

import { DEFAULT_CATALOGUE_ID, RETA_BYOK_CONSENT_VERSION } from '../../lib/ask-reta/catalogue';
import { decodeKek, decryptApiKey, zeroize } from '../../lib/ask-reta/byok-crypto';
import { copilotRouter } from './copilot';

const KEK_SECRET_V1 = Buffer.from(new Uint8Array(32).fill(11)).toString('base64url');
const KEK_SECRET_V2 = Buffer.from(new Uint8Array(32).fill(12)).toString('base64url');
const API_KEY = 'sk-nouvelle-cle-jamais-echo';

type Resolver = (opts: { ctx: unknown; input?: unknown }) => Promise<unknown>;
type Proc = { resolver: Resolver; inputSchema?: { parse: (value: unknown) => unknown } };
const routes = copilotRouter as unknown as Record<string, Proc>;
const ctx = { activeConnection: { id: 'conn-1' }, sessionUser: { id: 'user-1' } };

const call = (name: string, input?: unknown): Promise<unknown> => {
  const proc = routes[name]!;
  return proc.resolver({
    ctx,
    input: proc.inputSchema ? proc.inputSchema.parse(input) : undefined,
  });
};

type CatalogResult = {
  selectedModelId: string;
  vaultAvailable: boolean;
  consentVersion: string;
  models: {
    id: string;
    provider: string;
    label: string;
    requiresCredential: boolean;
    configured: boolean;
  }[];
};

beforeEach(() => {
  harness.kekV1 = undefined;
  harness.kekV2 = undefined;
  harness.kekActive = undefined;
  harness.settings = null;
  harness.status = [];
  harness.selectResult = { ok: true };
  harness.replaceRetaByokCredential.mockClear();
  harness.deleteRetaByokCredentialAndResetModel.mockClear();
  harness.selectRetaModel.mockClear();
  harness.consumeCopilotControlRateLimit.mockClear();
});

const currentStatus = (provider: string, kekVersion = 'v1') => ({
  provider,
  consentVersion: RETA_BYOK_CONSENT_VERSION,
  kekVersion,
  updatedAt: new Date(),
});

describe('copilot.modelCatalog', () => {
  it('lists the catalogue with status flags — NOTHING sensitive, no upstream mapping', async () => {
    harness.status = [currentStatus('anthropic')];
    harness.kekV1 = KEK_SECRET_V1;
    const result = (await call('modelCatalog')) as CatalogResult;
    expect(result.models).toHaveLength(13);
    expect(result.selectedModelId).toBe(DEFAULT_CATALOGUE_ID);
    expect(result.vaultAvailable).toBe(true);
    const anthropic = result.models.find((m) => m.id === 'anthropic:claude-fable-5');
    expect(anthropic?.configured).toBe(true);
    const openai = result.models.find((m) => m.id === 'openai:gpt-5.2');
    expect(openai?.configured).toBe(false);
    const workers = result.models.find((m) => m.id === DEFAULT_CATALOGUE_ID);
    expect(workers?.configured).toBe(true);
    // Boundary hygiene: no envelope field, no upstream model name, no key hint.
    const keys = result.models.flatMap((m) => Object.keys(m));
    for (const forbidden of ['ciphertext', 'iv', 'wrappedDek', 'wrapIv', 'upstreamModel']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(result)).not.toContain('@cf/meta');
    // kekVersion is server-side status only — it never crosses the boundary.
    expect(JSON.stringify(result)).not.toContain('kekVersion');
  });

  it('a credential under an OLDER consent version is NOT configured (re-consent required)', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.status = [
      {
        provider: 'anthropic',
        consentVersion: '2020-01-01',
        kekVersion: 'v1',
        updatedAt: new Date(),
      },
    ];
    const result = (await call('modelCatalog')) as CatalogResult;
    const anthropic = result.models.find((m) => m.id === 'anthropic:claude-fable-5');
    expect(anthropic?.configured).toBe(false);
  });

  it('a credential under a KEK version ABSENT from the ring is NOT configured (stale KEK)', async () => {
    harness.kekV1 = KEK_SECRET_V1; // ring = {v1}
    harness.status = [currentStatus('anthropic', 'v0')];
    const result = (await call('modelCatalog')) as CatalogResult;
    expect(result.vaultAvailable).toBe(true);
    expect(result.models.find((m) => m.id === 'anthropic:claude-fable-5')?.configured).toBe(false);
  });

  it('a v1 credential stops being configured once the ring retires v1 — usable again during the rotation window', async () => {
    harness.status = [currentStatus('anthropic', 'v1')];
    // v2-only ring: v1 rows are unusable → NOT configured.
    harness.kekV2 = KEK_SECRET_V2;
    harness.kekActive = 'v2';
    let result = (await call('modelCatalog')) as CatalogResult;
    expect(result.models.find((m) => m.id === 'anthropic:claude-fable-5')?.configured).toBe(false);
    // Rotation window (both secrets): the v1 row is openable → configured.
    harness.kekV1 = KEK_SECRET_V1;
    result = (await call('modelCatalog')) as CatalogResult;
    expect(result.models.find((m) => m.id === 'anthropic:claude-fable-5')?.configured).toBe(true);
  });

  it('without any ring, BYOK rows are NOT configured — Workers models stay usable', async () => {
    harness.status = [currentStatus('anthropic', 'v1')];
    const result = (await call('modelCatalog')) as CatalogResult;
    expect(result.vaultAvailable).toBe(false);
    expect(result.models.find((m) => m.id === 'anthropic:claude-fable-5')?.configured).toBe(false);
    expect(result.models.find((m) => m.id === DEFAULT_CATALOGUE_ID)?.configured).toBe(true);
  });

  it('reports vaultAvailable=false without KEK ring and resolves a stale selection to the default', async () => {
    harness.settings = { settings: { askRetaModel: 'zombie:model' } };
    const result = (await call('modelCatalog')) as CatalogResult;
    expect(result.vaultAvailable).toBe(false);
    expect(result.selectedModelId).toBe(DEFAULT_CATALOGUE_ID);
  });

  it('vaultAvailable=false when the ACTIVE version has no secret (misconfigured ring)', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.kekActive = 'v2';
    const result = (await call('modelCatalog')) as CatalogResult;
    expect(result.vaultAvailable).toBe(false);
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
    const openRouterParsed = schema.parse({
      ...validInput,
      provider: 'openrouter',
    }) as Record<string, unknown>;
    expect(openRouterParsed.provider).toBe('openrouter');
  });

  it('fails closed without a KEK ring', async () => {
    await expect(call('setCredential', validInput)).rejects.toBeInstanceOf(TRPCError);
    expect(harness.replaceRetaByokCredential).not.toHaveBeenCalled();
  });

  it('stores ONLY the envelope (decryptable, atomically replaced) and NEVER echoes the key', async () => {
    harness.kekV1 = KEK_SECRET_V1;
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
    const kek = decodeKek(KEK_SECRET_V1);
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

  it('wraps NEW envelopes under the ring ACTIVE version (v2 during a rotation)', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.kekV2 = KEK_SECRET_V2;
    harness.kekActive = 'v2';
    await call('setCredential', validInput);
    const stored = harness.replaceRetaByokCredential.mock.calls[0]![0] as Record<string, string>;
    expect(stored.kekVersion).toBe('v2');
    const kek = decodeKek(KEK_SECRET_V2);
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

describe('copilot.selectModel — TRANSACTIONAL eligibility (TOCTOU fix)', () => {
  it('rejects any id absent from the catalogue BEFORE touching the DB', async () => {
    await expect(call('selectModel', { modelId: 'evil:model' })).rejects.toBeInstanceOf(TRPCError);
    await expect(call('selectModel', { modelId: 'gpt-5.2' })).rejects.toBeInstanceOf(TRPCError);
    expect(harness.selectRetaModel).not.toHaveBeenCalled();
  });

  it('Workers models are ALWAYS selectable — no KEK, provider null in the transaction', async () => {
    const result = await call('selectModel', { modelId: 'workers-ai:llama-3.3-70b' });
    expect(result).toEqual({ selectedModelId: 'workers-ai:llama-3.3-70b' });
    expect(harness.selectRetaModel).toHaveBeenCalledWith({
      modelId: 'workers-ai:llama-3.3-70b',
      provider: null,
      requiredConsentVersion: RETA_BYOK_CONSENT_VERSION,
      supportedKekVersions: [],
    });
  });

  it('a BYOK model needs the vault ring, then delegates eligibility to the transaction', async () => {
    await expect(
      call('selectModel', { modelId: 'anthropic:claude-fable-5' }),
    ).rejects.toBeInstanceOf(TRPCError); // no ring
    expect(harness.selectRetaModel).not.toHaveBeenCalled();

    harness.kekV1 = KEK_SECRET_V1;
    harness.kekV2 = KEK_SECRET_V2;
    const result = await call('selectModel', { modelId: 'anthropic:claude-fable-5' });
    expect(result).toEqual({ selectedModelId: 'anthropic:claude-fable-5' });
    // Server-owned params: CURRENT consent + the ring's openable versions.
    expect(harness.selectRetaModel).toHaveBeenCalledWith({
      modelId: 'anthropic:claude-fable-5',
      provider: 'anthropic',
      requiredConsentVersion: RETA_BYOK_CONSENT_VERSION,
      supportedKekVersions: ['v1', 'v2'],
    });
  });

  it('maps the transactional refusal (missing/stale credential) to PRECONDITION_FAILED', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.selectResult = { ok: false, reason: 'provider-not-configured' };
    await expect(
      call('selectModel', { modelId: 'anthropic:claude-fable-5' }),
    ).rejects.toBeInstanceOf(TRPCError);
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

  it('each fail-closed limiter has the exact per-user durable fallback used in production', async () => {
    const expectedKinds = new Map([
      ['ratelimit:copilot-byok-set', 'byok-set'],
      ['ratelimit:copilot-byok-delete', 'byok-delete'],
      ['ratelimit:copilot-byok-select', 'byok-select'],
    ]);
    for (const config of harness.limiterConfigs) {
      const prefix = (config.generatePrefix as () => string)();
      const expectedKind = expectedKinds.get(prefix);
      if (!expectedKind) continue;
      const fallback = config.durableFallback as (context: typeof ctx) => Promise<unknown>;
      expect(fallback, prefix).toBeTypeOf('function');
      await expect(fallback(ctx)).resolves.toMatchObject({ allowed: true });
      expect(harness.consumeCopilotControlRateLimit).toHaveBeenLastCalledWith(expectedKind);
    }
    expect(harness.consumeCopilotControlRateLimit).toHaveBeenCalledTimes(3);
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
