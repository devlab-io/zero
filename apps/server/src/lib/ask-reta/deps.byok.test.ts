import { decodeKek, encryptApiKey, RETA_BYOK_KEK_VERSION } from './byok-crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetaVaultUnavailableError } from './providers';
import { findCatalogueEntry } from './catalogue';

// P0 model resolution (slice 3A): Workers works WITHOUT any KEK; a BYOK
// selection with an unusable vault fails with the FIXED error — never a
// silent fallback; a stale stored id resolves to the Workers default.

const harness = vi.hoisted(() => ({
  kek: undefined as string | undefined,
  settings: null as { settings: Record<string, unknown> } | null,
  credentialRow: undefined as Record<string, unknown> | undefined,
  findRetaByokCredential: vi.fn(async () => harness.credentialRow),
  aiRun: vi.fn(async () => ({ response: 'workers ok' })),
}));

vi.mock('../../env', () => ({
  env: {
    get AI() {
      return { run: harness.aiRun };
    },
    get RETA_BYOK_KEK_V1() {
      return harness.kek;
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
  })),
}));

vi.mock('../../db', () => ({
  createDb: () => ({ db: {}, conn: { end: vi.fn(async () => {}) } }),
}));

import { buildByokModel, createAskRetaDeps } from './deps';

const KEK_SECRET = Buffer.from(new Uint8Array(32).fill(5)).toString('base64url');
const API_KEY = 'sk-byok-vault-cle-reelle';
const USER_ID = 'user-1';

const makeDeps = () =>
  createAskRetaDeps({
    userId: USER_ID,
    connectionId: 'conn-1',
    executionCtx: { waitUntil: () => {} } as unknown as ExecutionContext,
  });

const sealRow = async (params?: { userId?: string; kekVersion?: string }) => {
  const credentialId = 'cred-row-1';
  const envelope = await encryptApiKey({
    apiKey: API_KEY,
    kek: decodeKek(KEK_SECRET),
    kekVersion: params?.kekVersion ?? RETA_BYOK_KEK_VERSION,
    aad: { userId: params?.userId ?? USER_ID, provider: 'anthropic', credentialId },
  });
  return { id: credentialId, ...envelope };
};

beforeEach(() => {
  harness.kek = undefined;
  harness.settings = null;
  harness.credentialRow = undefined;
  harness.findRetaByokCredential.mockClear();
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

  it('BYOK selected but NO KEK → FIXED vault error, NO silent fallback to Workers', async () => {
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    await expect(makeDeps()).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('BYOK selected, KEK present but NO credential row → fixed vault error', async () => {
    harness.kek = KEK_SECRET;
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    await expect(makeDeps()).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('BYOK happy path: modelKey is the catalogue id and abortMode is native', async () => {
    harness.kek = KEK_SECRET;
    harness.settings = { settings: { askRetaModel: 'anthropic:claude-fable-5' } };
    harness.credentialRow = await sealRow();
    const { modelKey, deps } = await makeDeps();
    expect(modelKey).toBe('anthropic:claude-fable-5');
    expect(deps.model.abortMode).toBe('native');
    expect(harness.findRetaByokCredential).toHaveBeenCalledWith('anthropic');
  });
});

describe('buildByokModel — vault preconditions fail CLOSED with the fixed error', () => {
  const entry = findCatalogueEntry('anthropic:claude-fable-5')!;
  const vaultWith = (row: Record<string, unknown> | undefined) => ({
    findRetaByokCredential: async () =>
      row as
        | {
            id: string;
            ciphertext: string;
            iv: string;
            wrappedDek: string;
            wrapIv: string;
            kekVersion: string;
          }
        | undefined,
  });

  it('rejects on retired kekVersion (no KEK guessing loop)', async () => {
    const row = await sealRow({ kekVersion: 'v0' });
    await expect(
      buildByokModel({ vault: vaultWith(row), userId: USER_ID, entry, kekSecret: KEK_SECRET }),
    ).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it('rejects on malformed KEK secret', async () => {
    const row = await sealRow();
    await expect(
      buildByokModel({ vault: vaultWith(row), userId: USER_ID, entry, kekSecret: 'not-a-kek' }),
    ).rejects.toBeInstanceOf(RetaVaultUnavailableError);
  });

  it("user B CANNOT decrypt user A's envelope (AAD binding) — fixed error, no crypto detail", async () => {
    const rowOfA = await sealRow({ userId: 'user-A' });
    const failure = await buildByokModel({
      vault: vaultWith(rowOfA),
      userId: 'user-B',
      entry,
      kekSecret: KEK_SECRET,
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
      kekSecret: KEK_SECRET,
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
