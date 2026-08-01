import {
  deleteRetaCredentialTx,
  selectRetaModelTx,
  type VaultCredentialRow,
  type VaultTxStore,
} from './vault-transactions';
import { defaultUserSettings } from '../schemas';
import { describe, expect, it } from 'vitest';

// P1 TOCTOU (release-fix 3A): select-model and delete-credential run against
// an in-memory store with REAL row locks and REAL concurrency — both
// interleaving orders must end in a coherent state (valid selection +
// credential, or Workers + deleted), NEVER an orphan BYOK selection.

const CONSENT = '2026-08-01';
const FALLBACK = 'workers-ai:llama-4-scout';
const ANTHROPIC_IDS = ['anthropic:claude-fable-5', 'anthropic:claude-sonnet-5'];

class RowLock {
  private queue: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    const acquired = this.queue.then(() => release);
    this.queue = this.queue.then(() => next);
    return acquired.then((releaseFn) => releaseFn as unknown as () => void);
  }
}

/**
 * Minimal transactional fake: `runTx` hands the body a store whose lock*
 * methods take the SAME row locks a Postgres `SELECT … FOR UPDATE` would,
 * held until the transaction body finishes — interleavings between two
 * concurrent transactions are therefore REAL, not simulated.
 */
function makeFakeVaultDb() {
  const state = {
    credential: {
      id: 'row-1',
      provider: 'anthropic',
      kekVersion: 'v1',
      consentVersion: CONSENT,
    } as VaultCredentialRow | null,
    settings: { askRetaModel: FALLBACK } as Record<string, unknown>,
  };
  const credentialLock = new RowLock();
  const settingsLock = new RowLock();

  const runTx = async <T>(body: (store: VaultTxStore) => Promise<T>): Promise<T> => {
    const releases: (() => void)[] = [];
    const store: VaultTxStore = {
      lockCredential: async (provider) => {
        releases.push(await credentialLock.acquire());
        return state.credential && state.credential.provider === provider ? state.credential : null;
      },
      deleteCredential: async (provider) => {
        if (state.credential?.provider === provider) state.credential = null;
      },
      lockSettings: async () => {
        releases.push(await settingsLock.acquire());
        return { settings: state.settings };
      },
      writeSettings: async (settings) => {
        state.settings = settings as unknown as Record<string, unknown>;
      },
    };
    try {
      return await body(store);
    } finally {
      // Commit: locks released at transaction end, like Postgres.
      for (const release of releases.reverse()) release();
    }
  };

  return { state, runTx };
}

const selectAnthropiceParams = {
  modelId: 'anthropic:claude-fable-5',
  provider: 'anthropic',
  requiredConsentVersion: CONSENT,
  supportedKekVersions: ['v1', 'v2'],
};

const deleteParams = {
  provider: 'anthropic',
  resetModelIds: ANTHROPIC_IDS,
  fallbackModelId: FALLBACK,
};

const selectedModel = (state: { settings: Record<string, unknown> }) =>
  (state.settings as { askRetaModel?: string }).askRetaModel;

describe('vault transactions — eligibility inside the transaction', () => {
  it('selects a BYOK model when the credential exists with CURRENT consent and openable KEK', async () => {
    const { state, runTx } = makeFakeVaultDb();
    const result = await runTx((store) => selectRetaModelTx(store, selectAnthropiceParams));
    expect(result).toEqual({ ok: true });
    expect(selectedModel(state)).toBe('anthropic:claude-fable-5');
  });

  it('REFUSES a credential under an older consent version (re-consent required)', async () => {
    const { state, runTx } = makeFakeVaultDb();
    state.credential = { ...state.credential!, consentVersion: '2020-01-01' };
    const result = await runTx((store) => selectRetaModelTx(store, selectAnthropiceParams));
    expect(result).toEqual({ ok: false, reason: 'provider-not-configured' });
    expect(selectedModel(state)).toBe(FALLBACK);
  });

  it('REFUSES a credential whose KEK version the ring cannot open', async () => {
    const { state, runTx } = makeFakeVaultDb();
    state.credential = { ...state.credential!, kekVersion: 'v9' };
    const result = await runTx((store) => selectRetaModelTx(store, selectAnthropiceParams));
    expect(result).toEqual({ ok: false, reason: 'provider-not-configured' });
  });

  it('Workers selection (provider null) never touches the credential row', async () => {
    const { state, runTx } = makeFakeVaultDb();
    state.credential = null;
    const result = await runTx((store) =>
      selectRetaModelTx(store, {
        modelId: 'workers-ai:llama-3.3-70b',
        provider: null,
        requiredConsentVersion: CONSENT,
        supportedKekVersions: [],
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(selectedModel(state)).toBe('workers-ai:llama-3.3-70b');
  });

  it('delete resets ONLY a selection pointing at the deleted provider', async () => {
    const { state, runTx } = makeFakeVaultDb();
    state.settings = { ...defaultUserSettings, askRetaModel: 'anthropic:claude-sonnet-5' };
    await runTx((store) => deleteRetaCredentialTx(store, deleteParams));
    expect(state.credential).toBeNull();
    expect(selectedModel(state)).toBe(FALLBACK);

    // A selection on ANOTHER provider survives its neighbour's deletion.
    const other = makeFakeVaultDb();
    other.state.settings = { ...defaultUserSettings, askRetaModel: 'workers-ai:llama-3.3-70b' };
    await other.runTx((store) => deleteRetaCredentialTx(store, deleteParams));
    expect(selectedModel(other.state)).toBe('workers-ai:llama-3.3-70b');
  });
});

describe('vault transactions — REAL select/delete interleavings (both orders)', () => {
  /** Deterministic gate: resolves once the first tx HOLDS the credential lock. */
  const withLockSignal = (store: VaultTxStore, onLocked: () => void): VaultTxStore => ({
    ...store,
    lockCredential: async (provider) => {
      const row = await store.lockCredential(provider);
      onLocked();
      return row;
    },
  });

  it('SELECT acquires the credential lock first → DELETE waits, then resets: end state Workers + deleted', async () => {
    const { state, runTx } = makeFakeVaultDb();
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const select = runTx((store) =>
      selectRetaModelTx(withLockSignal(store, signalLocked), selectAnthropiceParams),
    );
    await locked; // the select HOLDS the credential row before the delete starts
    const del = runTx((store) => deleteRetaCredentialTx(store, deleteParams));
    const [selectResult] = await Promise.all([select, del]);
    // The selection was valid WHEN it committed; the serialized delete then
    // reset it — never a surviving orphan selection.
    expect(selectResult).toEqual({ ok: true });
    expect(state.credential).toBeNull();
    expect(selectedModel(state)).toBe(FALLBACK);
  });

  it('DELETE acquires the credential lock first → SELECT observes the gone credential and refuses', async () => {
    const { state, runTx } = makeFakeVaultDb();
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const del = runTx((store) =>
      deleteRetaCredentialTx(withLockSignal(store, signalLocked), deleteParams),
    );
    await locked; // the delete HOLDS the credential row before the select starts
    const select = runTx((store) => selectRetaModelTx(store, selectAnthropiceParams));
    const [, selectResult] = await Promise.all([del, select]);
    expect(selectResult).toEqual({ ok: false, reason: 'provider-not-configured' });
    expect(state.credential).toBeNull();
    // The settings never adopted the orphan selection.
    expect(selectedModel(state)).toBe(FALLBACK);
  });

  it('stress: many interleaved select/delete pairs never end with an orphan selection', async () => {
    for (let round = 0; round < 20; round += 1) {
      const { state, runTx } = makeFakeVaultDb();
      const first = round % 2 === 0 ? 'select' : 'delete';
      const ops: Promise<unknown>[] = [
        runTx(
          async (store): Promise<unknown> =>
            first === 'select'
              ? selectRetaModelTx(store, selectAnthropiceParams)
              : deleteRetaCredentialTx(store, deleteParams),
        ),
        runTx(
          async (store): Promise<unknown> =>
            first === 'select'
              ? deleteRetaCredentialTx(store, deleteParams)
              : selectRetaModelTx(store, selectAnthropiceParams),
        ),
      ];
      await Promise.all(ops);
      const model = selectedModel(state);
      const orphan = ANTHROPIC_IDS.includes(model ?? '') && state.credential === null;
      expect(orphan, `round ${round}: orphan selection ${model}`).toBe(false);
    }
  });
});
