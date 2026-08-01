import { dehydrate, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUERY_DEHYDRATE_OPTIONS } from '@/providers/query-provider';
import { createSplitIDBPersister } from '@/lib/split-persister';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// P0 secret-cache (release-blocker sur 89f00082) : preuve avec le VRAI
// TanStack Query (pas de mock @tanstack/react-query ici) que la clé BYOK
// n'entre JAMAIS dans le MutationCache, ni dans une déshydratation, ni dans
// l'artifact IndexedDB — même pour une mutation offline/paused.

const SECRET = 'sk-SECRET-jamais-en-cache-4242';

const harness = vi.hoisted(() => ({
  setCredentialMutate: vi.fn(),
  deleteCredentialMutate: vi.fn(),
}));

vi.mock('@/providers/query-provider', async (importOriginal) => {
  // The REAL dehydrate barrier under test — only the hooks are faked.
  const actual = await importOriginal<typeof import('@/providers/query-provider')>();
  return {
    QUERY_DEHYDRATE_OPTIONS: actual.QUERY_DEHYDRATE_OPTIONS,
    useTRPC: () => ({
      copilot: {
        modelCatalog: {
          queryOptions: () => ({
            queryKey: ['copilot', 'modelCatalog'],
            queryFn: async () => catalogueFixture(),
          }),
          queryKey: () => ['copilot', 'modelCatalog'],
        },
      },
    }),
    useTRPCClient: () => ({
      copilot: {
        setCredential: { mutate: harness.setCredentialMutate },
        deleteCredential: { mutate: harness.deleteCredentialMutate },
      },
    }),
  };
});

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ModelManagerDialog } from './model-manager';

const catalogueFixture = () => ({
  selectedModelId: 'workers-ai:llama-4-scout',
  vaultAvailable: true,
  consentVersion: '2026-08-01',
  models: [
    {
      id: 'anthropic:claude-fable-5',
      provider: 'anthropic',
      label: 'Claude Fable 5 (Anthropic)',
      requiresCredential: true,
      configured: true,
    },
  ],
});

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const renderManager = () => {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ModelManagerDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
  });
};

const typeAndSave = async () => {
  // The catalogue query is REAL react-query here: wait for the card.
  for (let i = 0; i < 50 && !container.querySelector('#ask-reta-key-anthropic'); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  const input = container.querySelector('#ask-reta-key-anthropic') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input, SECRET);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    (container.querySelector('#ask-reta-consent-anthropic') as HTMLInputElement).click();
  });
  const save = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('askReta.replaceKey'),
  )!;
  await act(async () => {
    save.click();
  });
};

beforeEach(() => {
  harness.setCredentialMutate.mockReset();
  harness.setCredentialMutate.mockResolvedValue({ ok: true });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

describe('P0 secret-cache — the key NEVER enters TanStack (real QueryClient)', () => {
  it('a full save flow leaves ZERO mutation in the MutationCache and no SECRET anywhere dehydratable', async () => {
    renderManager();
    await act(async () => {}); // catalogue queryFn settles
    await typeAndSave();

    // The imperative call fired with the key…
    expect(harness.setCredentialMutate).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: SECRET }),
    );
    // …but NOTHING entered the MutationCache: no variables retention, no
    // ~5-minute GC window, nothing pausable offline.
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(JSON.stringify(dehydrate(queryClient))).not.toContain(SECRET);
    expect(JSON.stringify(dehydrate(queryClient, QUERY_DEHYDRATE_OPTIONS))).not.toContain(SECRET);
  });

  it('save FAILURE leaves the caches equally empty of the secret', async () => {
    harness.setCredentialMutate.mockRejectedValueOnce(new Error(`refused: ${SECRET}`));
    renderManager();
    await act(async () => {});
    await typeAndSave();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(JSON.stringify(dehydrate(queryClient))).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
  });
});

describe('P0 secret-cache — persistence fail-safes (defense in depth)', () => {
  const rogueMutationState = {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: true, // offline: exactly the state the default dehydrate keeps
    status: 'pending' as const,
    variables: { provider: 'anthropic', apiKey: SECRET },
    submittedAt: Date.now(),
  };

  it('an offline/PAUSED mutation carrying the secret is dropped by the dehydrate barrier', () => {
    queryClient
      .getMutationCache()
      .build(
        queryClient,
        { mutationKey: ['rogue'], mutationFn: async (v: unknown) => v },
        rogueMutationState,
      );
    // Reproduction: the DEFAULT dehydrate keeps paused mutations — the
    // secret WOULD leak (this is the exact release-blocker path).
    expect(JSON.stringify(dehydrate(queryClient))).toContain(SECRET);
    // The provider's barrier (shouldDehydrateMutation: false) kills it.
    const guarded = dehydrate(queryClient, QUERY_DEHYDRATE_OPTIONS);
    expect(guarded.mutations).toHaveLength(0);
    expect(JSON.stringify(guarded)).not.toContain(SECRET);
  });

  it('split-persister NEVER writes mutations to storage and SANITIZES them on restore', async () => {
    const map = new Map<string, unknown>();
    const storage = {
      get: async (key: string) => map.get(key),
      set: async (key: string, value: unknown) => void map.set(key, value),
      del: async (key: string) => void map.delete(key),
    };
    const { persister } = createSplitIDBPersister(storage, 'zero-query-cache-user-1', {
      buster: 'b1',
      maxAgeMs: 60_000,
    });

    // Even if a (buggy/future) provider handed mutations to the persister,
    // the IndexedDB artifact must not contain them.
    const poisoned: PersistedClient = {
      timestamp: Date.now(),
      buster: 'b1',
      clientState: {
        mutations: [
          {
            mutationKey: ['rogue'],
            state: rogueMutationState,
          } as unknown as PersistedClient['clientState']['mutations'][number],
        ],
        queries: [],
      },
    };
    await persister.persistClient(poisoned);
    expect(map.size).toBeGreaterThan(0);
    for (const [key, value] of map) {
      expect(JSON.stringify(value), key).not.toContain(SECRET);
    }

    // Legacy/forged blob ALREADY containing mutations: restore sanitizes.
    map.set('zero-query-cache-user-1', poisoned);
    const restored = (await persister.restoreClient()) as PersistedClient;
    expect(restored.clientState.mutations).toHaveLength(0);
    expect(JSON.stringify(restored)).not.toContain(SECRET);
  });
});
