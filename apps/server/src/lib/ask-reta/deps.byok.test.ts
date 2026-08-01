import { findCatalogueEntry, RETA_BYOK_CONSENT_VERSION } from './catalogue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeKek, encryptApiKey } from './byok-crypto';
import { RetaVaultUnavailableError } from './providers';

// P0 model resolution (slice 3A + release-fix): Workers works WITHOUT any
// KEK; a BYOK selection with an unusable vault (no ring, no credential,
// STALE CONSENT, unopenable KEK version) fails with the FIXED error — never
// a silent fallback; the KEK ring rotates rows lazily via CAS.

const harness = vi.hoisted(() => ({
  kekV1: undefined as string | undefined,
  kekV2: undefined as string | undefined,
  kekActive: undefined as string | undefined,
  settings: null as { settings: Record<string, unknown> } | null,
  credentialRow: undefined as Record<string, unknown> | undefined,
  findRetaByokCredential: vi.fn(async () => harness.credentialRow),
  rewrapRetaByokCredential: vi.fn(async (...args: unknown[]) => {
    void args;
    return true;
  }),
  aiRun: vi.fn(async () => ({ response: 'workers ok' })),
}));

vi.mock('../../env', () => ({
  env: {
    get AI() {
      return { run: harness.aiRun };
    },
    get RETA_BYOK_KEK_V1() {
      return harness.kekV1;
    },
    get RETA_BYOK_KEK_V2() {
      return harness.kekV2;
    },
    get RETA_BYOK_KEK_ACTIVE() {
      return harness.kekActive;
    },
    HYPERDRIVE: { connectionString: 'postgres://fake' },
  },
}));

vi.mock('../server-utils', () => ({
  getZeroAgent: vi.fn(async () => ({ stub: { getMailboxCounts: vi.fn() } })),
  getThreadsFromDB: vi.fn(),
  getThread: vi.fn(),
  getZeroDB: vi.fn(async () => ({
    findUserSettings: vi.fn(async () => harness.settings),
    findRetaByokCredential: harness.findRetaByokCredential,
    rewrapRetaByokCredential: harness.rewrapRetaByokCredential,
  })),
}));

vi.mock('../../db', () => ({
  createDb: () => ({ db: {}, conn: { end: vi.fn(async () => {}) } }),
}));

import { buildByokModel, createAskRetaDeps } from './deps';

const KEK_SECRET_V1 = Buffer.from(new Uint8Array(32).fill(5)).toString('base64url');
const KEK_SECRET_V2 = Buffer.from(new Uint8Array(32).fill(6)).toString('base64url');
const API_KEY = 'sk-byok-vault-cle-reelle';
const USER_ID = 'user-1';

const makeDeps = () =>
  createAskRetaDeps({
    userId: USER_ID,
    connectionId: 'conn-1',
    executionCtx: { waitUntil: () => {} } as unknown as ExecutionContext,
  });

const sealRow = async (params?: {
  userId?: string;
  kekSecret?: string;
  kekVersion?: string;
  consentVersion?: string;
}) => {
  const credentialId = 'cred-row-1';
  const envelope = await encryptApiKey({
    apiKey: API_KEY,
    kek: decodeKek(params?.kekSecret ?? KEK_SECRET_V1),
    kekVersion: params?.kekVersion ?? 'v1',
    aad: { userId: params?.userId ?? USER_ID, provider: 'anthropic', credentialId },
  });
  return {
    id: credentialId,
    ...envelope,
    consentVersion: params?.consentVersion ?? RETA_BYOK_CONSENT_VERSION,
  };
};

type VaultRow = Awaited<ReturnType<typeof sealRow>>;

beforeEach(() => {
  harness.kekV1 = undefined;
  harness.kekV2 = undefined;
  harness.kekActive = undefined;
  harness.settings = null;
  harness.credentialRow = undefined;
  harness.findRetaByokCredential.mockClear();
  harness.rewrapRetaByokCredential.mockClear();
  harness.rewrapRetaByokCredential.mockResolvedValue(true);
});

describe('createAskRetaDeps — catalogue-driven model resolution', () => {
  it('defaults to the Workers scout WITHOUT any KEK configured', async () => {
    const { modelKey, deps } = await makeDeps();
    expect(modelKey).toBe('workers-ai:llama-4-scout');
    expect(deps.model.abortMode).toBe('cooperative');
    expect(harness.findRetaByokCredential).not.toHaveBeenCalled();
  });

  it('maps a LEGACY stored key to its Workers catalogue id', async () => {
    harness.settings = { settings: { askRetaModel: 'llama-3.3-70b' } };
    const { modelKey } = await makeDeps();
    expect(modelKey).toBe('workers-ai:llama-3.3-70b');
  });

  it('a FORGED/stale stored id resolves to the default — never reaches a provider', async () => {
    harness.settings = { settings: { askRetaModel: 'evil:model-x' } };
    const { modelKey } = await makeDeps();
    expect(modelKey).toBe('workers-ai:llama-4-scout');
    expect(harness.findRetaByokCredential).not.toHaveBeenCalled();
  });

  it('BYOK selected but NO KEK ring → FIXED vault error, NO silent fallback to Workers', async () => {
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    await expect(makeDeps()).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('BYOK selected, ring present but NO credential row → fixed vault error', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    await expect(makeDeps()).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('CONSENT GATE: a credential under an OLDER consent version fails closed before any decrypt', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    harness.credentialRow = await sealRow({ consentVersion: '2020-01-01' });
    await expect(makeDeps()).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('BYOK happy path: modelKey is the catalogue id and abortMode is native', async () => {
    harness.kekV1 = KEK_SECRET_V1;
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    harness.credentialRow = await sealRow();
    const { modelKey, deps } = await makeDeps();
    expect(modelKey).toBe('anthropic:claude-fable-5');
    expect(deps.model.abortMode).toBe('native');
    expect(harness.findRetaByokCredential).toHaveBeenCalledWith('anthropic');
    // Row already under the active version: no rewrap traffic.
    expect(harness.rewrapRetaByokCredential).not.toHaveBeenCalled();
  });
});

describe('buildByokModel — vault preconditions fail CLOSED with the fixed error', () => {
  const entry = findCatalogueEntry('anthropic:claude-fable-5')!;
  const ringV1 = { RETA_BYOK_KEK_V1: KEK_SECRET_V1 };
  const vaultWith = (row: VaultRow | undefined) => ({
    findRetaByokCredential: vi.fn(async () => row),
    rewrapRetaByokCredential: vi.fn(async () => true),
  });

  it('rejects when the row version is absent from the ring (no KEK guessing loop)', async () => {
    const row = await sealRow({ kekVersion: 'v0' });
    await expect(
      buildByokModel({ vault: vaultWith(row), userId: USER_ID, entry, kekSecrets: ringV1 }),
    ).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('rejects on malformed KEK secret and on a ring whose ACTIVE version has no secret', async () => {
    const row = await sealRow();
    await expect(
      buildByokModel({
        vault: vaultWith(row),
        userId: USER_ID,
        entry,
        kekSecrets: { RETA_BYOK_KEK_V1: 'not-a-kek' },
      }),
    ).rejects.toBeInstanceOf(RetaVaultUnavailableError);
    await expect(
      buildByokModel({
        vault: vaultWith(row),
        userId: USER_ID,
        entry,
        kekSecrets: { RETA_BYOK_KEK_V1: KEK_SECRET_V1, RETA_BYOK_KEK_ACTIVE: 'v2' },
      }),
    ).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it("user B CANNOT decrypt user A's envelope (AAD binding) — fixed error, no crypto detail", async () => {
    const rowOfA = await sealRow({ userId: 'user-A' });
    const failure = await buildByokModel({
      vault: vaultWith(rowOfA),
      userId: 'user-B',
      entry,
      kekSecrets: ringV1,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RetaVaultUnavailableError);
    expect((failure as Error).message).not.toMatch(/OperationError|decrypt|AAD|tag/i);
  });

  it('the DECRYPTED key reaches the adapter headers — and only there', async () => {
    const row = await sealRow();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const model = await buildByokModel({
      vault: vaultWith(row),
      userId: USER_ID,
      entry,
      kekSecrets: ringV1,
      fetchImpl,
    });
    await expect(
      model.complete({ system: 's', user: 'u', maxTokens: 10, temperature: 0 }),
    ).resolves.toBe('ok');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(API_KEY);
    expect(calls[0]!.url).not.toContain(API_KEY);
  });
});

describe('KEK ring rotation — lazy TRUE rewrap with CAS persistence', () => {
  const entry = findCatalogueEntry('anthropic:claude-fable-5')!;
  const fullRing = {
    RETA_BYOK_KEK_V1: KEK_SECRET_V1,
    RETA_BYOK_KEK_V2: KEK_SECRET_V2,
    RETA_BYOK_KEK_ACTIVE: 'v2',
  };

  const complete = (model: Awaited<ReturnType<typeof buildByokModel>>) =>
    model.complete({ system: 's', user: 'u', maxTokens: 10, temperature: 0 });

  const capturingFetch = () => {
    const headers: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      headers.push((init?.headers ?? {}) as Record<string, string>);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    return { headers, fetchImpl };
  };

  it('row v1 + ring active v2 → CAS persists wrappedDek/wrapIv/kekVersion, ciphertext+iv untouched, call works', async () => {
    const row = await sealRow(); // wrapped under v1
    const rewrap = vi.fn(async (_provider: string, params: Record<string, string>) => {
      void _provider;
      void params;
      return true;
    });
    const vault = {
      findRetaByokCredential: vi.fn(async () => row),
      rewrapRetaByokCredential: rewrap,
    };
    const { headers, fetchImpl } = capturingFetch();
    const model = await buildByokModel({
      vault,
      userId: USER_ID,
      entry,
      kekSecrets: fullRing,
      fetchImpl,
    });
    await expect(complete(model)).resolves.toBe('ok');
    // The key still decrypts (same DEK) and reaches the provider.
    expect(headers[0]!['x-api-key']).toBe(API_KEY);
    // CAS carried the OLD version as guard and ONLY the wrap fields moved.
    expect(rewrap).toHaveBeenCalledTimes(1);
    const [provider, casParams] = rewrap.mock.calls[0]! as [string, Record<string, string>];
    expect(provider).toBe('anthropic');
    expect(casParams.id).toBe(row.id);
    expect(casParams.expectedKekVersion).toBe('v1');
    expect(casParams.kekVersion).toBe('v2');
    expect(casParams.wrappedDek).not.toBe(row.wrappedDek);
    expect(casParams.wrapIv).not.toBe(row.wrapIv);
    expect(casParams).not.toHaveProperty('ciphertext');
    expect(casParams).not.toHaveProperty('iv');
  });

  it('row already at the active version → NO rewrap traffic (idempotent)', async () => {
    const row = await sealRow({ kekSecret: KEK_SECRET_V2, kekVersion: 'v2' });
    const vault = {
      findRetaByokCredential: vi.fn(async () => row),
      rewrapRetaByokCredential: vi.fn(async () => true),
    };
    const { fetchImpl } = capturingFetch();
    const model = await buildByokModel({
      vault,
      userId: USER_ID,
      entry,
      kekSecrets: fullRing,
      fetchImpl,
    });
    await expect(complete(model)).resolves.toBe('ok');
    expect(vault.rewrapRetaByokCredential).not.toHaveBeenCalled();
  });

  it('CAS lost → reload the concurrently-rotated row and continue', async () => {
    const rowV1 = await sealRow();
    const rowV2 = await sealRow({ kekSecret: KEK_SECRET_V2, kekVersion: 'v2' });
    const find = vi
      .fn(async () => rowV1 as VaultRow | undefined)
      .mockResolvedValueOnce(rowV1)
      .mockResolvedValueOnce(rowV2); // reload after lost CAS
    const vault = {
      findRetaByokCredential: find,
      rewrapRetaByokCredential: vi.fn(async () => false), // another isolate won
    };
    const { headers, fetchImpl } = capturingFetch();
    const model = await buildByokModel({
      vault,
      userId: USER_ID,
      entry,
      kekSecrets: fullRing,
      fetchImpl,
    });
    await expect(complete(model)).resolves.toBe('ok');
    expect(headers[0]!['x-api-key']).toBe(API_KEY);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('ROLLBACK: ring active back to v1 rewraps a v2 row down to v1 (same mechanism)', async () => {
    const rowV2 = await sealRow({ kekSecret: KEK_SECRET_V2, kekVersion: 'v2' });
    const rewrap = vi.fn(async (_provider: string, params: Record<string, string>) => {
      void _provider;
      void params;
      return true;
    });
    const vault = {
      findRetaByokCredential: vi.fn(async () => rowV2),
      rewrapRetaByokCredential: rewrap,
    };
    const { fetchImpl } = capturingFetch();
    const model = await buildByokModel({
      vault,
      userId: USER_ID,
      entry,
      kekSecrets: { ...fullRing, RETA_BYOK_KEK_ACTIVE: 'v1' },
      fetchImpl,
    });
    await expect(complete(model)).resolves.toBe('ok');
    const [, casParams] = rewrap.mock.calls[0]! as [string, Record<string, string>];
    expect(casParams.expectedKekVersion).toBe('v2');
    expect(casParams.kekVersion).toBe('v1');
  });

  it('OLD secret retired after full migration: v2-only ring opens v2 rows', async () => {
    const rowV2 = await sealRow({ kekSecret: KEK_SECRET_V2, kekVersion: 'v2' });
    const vault = {
      findRetaByokCredential: vi.fn(async () => rowV2),
      rewrapRetaByokCredential: vi.fn(async () => true),
    };
    const { fetchImpl } = capturingFetch();
    const model = await buildByokModel({
      vault,
      userId: USER_ID,
      entry,
      kekSecrets: { RETA_BYOK_KEK_V2: KEK_SECRET_V2, RETA_BYOK_KEK_ACTIVE: 'v2' },
      fetchImpl,
    });
    await expect(complete(model)).resolves.toBe('ok');
    expect(vault.rewrapRetaByokCredential).not.toHaveBeenCalled();
  });

  it('row wrapped under a RETIRED version (secret removed too early) → fixed vault error', async () => {
    const rowV1 = await sealRow();
    const vault = {
      findRetaByokCredential: vi.fn(async () => rowV1),
      rewrapRetaByokCredential: vi.fn(async () => true),
    };
    await expect(
      buildByokModel({
        vault,
        userId: USER_ID,
        entry,
        kekSecrets: { RETA_BYOK_KEK_V2: KEK_SECRET_V2, RETA_BYOK_KEK_ACTIVE: 'v2' },
      }),
    ).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });
});
