import { draftStorageKey, ownedDraftStorageKey, saveLocalDraft } from '@/lib/draft-storage';
import { askRetaConversationAtom, askRetaThreadCaptureAtom } from './ask-reta-state';
import { askRetaConversationKey } from '@/lib/ask-reta-conversation-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { registerComposerInsertHandler } from '@/lib/composer-insert';
import { registerLiveDraft } from '@/lib/live-draft-registry';
import { createRoot, type Root } from 'react-dom/client';
import { AskRetaSurface } from './ask-reta-surface';
import { getDefaultStore } from 'jotai';
import { flushSync } from 'react-dom';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const defaultCatalogue = () => ({
  selectedModelId: 'workers-ai:llama-4-scout',
  vaultAvailable: true,
  consentVersion: '2026-08-01',
  models: [
    {
      id: 'workers-ai:llama-4-scout',
      provider: 'workers-ai',
      label: 'Llama 4 Scout (Workers AI)',
      requiresCredential: false,
      configured: true,
    },
    {
      id: 'workers-ai:llama-3.3-70b',
      provider: 'workers-ai',
      label: 'Llama 3.3 70B (Workers AI)',
      requiresCredential: false,
      configured: true,
    },
    {
      id: 'anthropic:claude-fable-5',
      provider: 'anthropic',
      label: 'Claude Fable 5 (Anthropic)',
      requiresCredential: true,
      configured: true,
    },
    {
      id: 'openai:gpt-5.2',
      provider: 'openai',
      label: 'GPT-5.2 (OpenAI)',
      requiresCredential: true,
      configured: false,
    },
  ],
});

const harness = vi.hoisted(() => ({
  streamAskReta: vi.fn(),
  fetchQuery: vi.fn(),
  draftsMutateAsync: vi.fn(),
  selectModelMutateAsync: vi.fn(),
  invalidateQueries: vi.fn(async () => {}),
  catalogue: undefined as unknown,
  getQueryData: vi.fn((_key: unknown) => undefined as unknown),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastPlain: vi.fn(),
  purge: vi.fn(),
  userId: 'user-1' as string | undefined,
  connectionId: 'conn-a' as string | undefined,
  queryStore: {} as Record<string, string | null>,
}));

vi.mock('nuqs', () => ({
  useQueryState: (key: string) => [
    harness.queryStore[key] ?? null,
    (value: string | null) => {
      harness.queryStore[key] = value;
    },
  ],
}));

vi.mock('@/lib/ask-reta-stream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ask-reta-stream')>();
  return { AskRetaStreamError: actual.AskRetaStreamError, streamAskReta: harness.streamAskReta };
});

vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({
    copilot: {
      searchPreview: { queryOptions: (input: unknown) => ({ kind: 'searchPreview', input }) },
      modelCatalog: {
        queryOptions: () => ({ kind: 'modelCatalog' }),
        queryKey: () => ['copilot', 'modelCatalog'],
      },
      selectModel: { mutationOptions: () => ({ kind: 'selectModel' }) },
    },
    drafts: {
      create: { mutationOptions: () => ({ kind: 'drafts' }) },
      list: { queryKey: () => ['drafts'] },
    },
    mail: {
      get: { queryKey: (input: unknown) => ['mail', 'get', input] },
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { kind: string }) =>
    options.kind === 'modelCatalog' ? { data: harness.catalogue } : { data: undefined },
  useMutation: (options: { kind: string }) =>
    options.kind === 'drafts'
      ? { isPending: false, mutateAsync: harness.draftsMutateAsync }
      : { isPending: false, mutateAsync: harness.selectModelMutateAsync },
  useQueryClient: () => ({
    invalidateQueries: harness.invalidateQueries,
    fetchQuery: harness.fetchQuery,
    getQueryData: harness.getQueryData,
  }),
}));

// The manager is a SEPARATE lazy chunk; the surface tests only assert its
// mount/unmount contract — the real dialog has its own dedicated test file.
vi.mock('./model-manager', () => ({
  ModelManagerDialog: (props: { open: boolean }) => (
    <div data-testid="model-manager" data-open={String(props.open)} />
  ),
}));

vi.mock('@/hooks/use-reply-state-purge', () => ({
  useReplyStatePurge: () => harness.purge,
}));

vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: harness.userId } } }),
}));

vi.mock('@/hooks/use-connections', () => ({
  useActiveConnection: () => ({ data: { id: harness.connectionId } }),
}));

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/lib/log', () => ({ log: { error: vi.fn() } }));
vi.mock('sonner', () => {
  const toast = (...args: unknown[]) => harness.toastPlain(...args);
  toast.success = (...args: unknown[]) => harness.toastSuccess(...args);
  toast.error = (...args: unknown[]) => harness.toastError(...args);
  return { toast };
});

let container: HTMLDivElement;
let root: Root;

const render = () => {
  act(() => {
    root.render(<AskRetaSurface />);
  });
};

// Owned keys (scope-fix): every composer seam is partitioned by the account.
const OWNER_A = { userId: 'user-1', connectionId: 'conn-a' } as const;
const ownedKeyA = (scope: Parameters<typeof ownedDraftStorageKey>[1]) =>
  ownedDraftStorageKey(OWNER_A, scope);

const baseResult = (answer: string) => ({
  answer,
  citations: [],
  steps: [],
  model: 'llama-4-scout',
});

const askQuestion = async (text: string) => {
  const input = container.querySelector('input')! as HTMLInputElement;
  const form = container.querySelector('form')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  getDefaultStore().set(askRetaConversationAtom, []);
  getDefaultStore().set(askRetaThreadCaptureAtom, null);
  harness.userId = 'user-1';
  harness.connectionId = 'conn-a';
  harness.queryStore.threadId = null;
  harness.queryStore.draftId = null;
  harness.queryStore.activeReplyId = null;
  harness.queryStore.isComposeOpen = null;
  harness.queryStore.isAskRetaOpen = 'true';
  harness.streamAskReta.mockReset();
  harness.streamAskReta.mockResolvedValue(baseResult('Réponse.'));
  harness.fetchQuery.mockReset();
  harness.draftsMutateAsync.mockReset();
  harness.selectModelMutateAsync.mockReset();
  harness.selectModelMutateAsync.mockResolvedValue({ selectedModelId: 'workers-ai:llama-3.3-70b' });
  harness.invalidateQueries.mockClear();
  harness.catalogue = defaultCatalogue();
  harness.getQueryData.mockReset();
  harness.getQueryData.mockReturnValue(undefined);
  harness.toastSuccess.mockClear();
  harness.toastError.mockClear();
  harness.toastPlain.mockClear();
  harness.purge.mockClear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('AskRetaSurface — LIVE draft context (slice 2bis)', () => {
  const draftOf = (call: number) =>
    (
      harness.streamAskReta.mock.calls[call]![0] as {
        input: { context: { draft?: { subject?: string; to?: string; body?: string } } };
      }
    ).input.context.draft;

  it("submit BEFORE autosave: the server receives 'alpha'; after more typing, 'alphabeta'", async () => {
    harness.queryStore.threadId = 'thread-9';
    // A live composer is mounted on the exact scope; the durable autosave is
    // BEHIND (stale localStorage) — the live registry must win.
    saveLocalDraft(ownedKeyA({ threadId: 'thread-9' }), {
      to: ['old@x.test'],
      cc: [],
      bcc: [],
      subject: 'AUTOSAVE EN RETARD',
      message: '<p>vieux contenu</p>',
      savedAt: Date.now(),
    });
    const live = registerLiveDraft(ownedKeyA({ threadId: 'thread-9' }));
    live.publish({ to: ['client@x.test'], subject: 'Objet', bodyHtml: '<p>alpha</p>' });

    render();
    await askQuestion('Question 1');
    expect(draftOf(0)?.body).toBe('<p>alpha</p>');
    expect(draftOf(0)?.subject).toBe('Objet');
    expect(draftOf(0)?.subject).not.toBe('AUTOSAVE EN RETARD');

    // The user keeps typing — the next ask carries the newest content.
    live.publish({ to: ['client@x.test'], subject: 'Objet', bodyHtml: '<p>alphabeta</p>' });
    await askQuestion('Question 2');
    expect(draftOf(1)?.body).toBe('<p>alphabeta</p>');
    live.unregister();
  });

  it('a mounted-but-EMPTY live composer is the truth: no stale local fallback', async () => {
    harness.queryStore.threadId = 'thread-9';
    saveLocalDraft(ownedKeyA({ threadId: 'thread-9' }), {
      to: ['old@x.test'],
      cc: [],
      bcc: [],
      subject: 'VIEUX',
      message: '<p>vieux</p>',
      savedAt: Date.now(),
    });
    const live = registerLiveDraft(ownedKeyA({ threadId: 'thread-9' }));
    live.publish({ to: [], subject: '', bodyHtml: '' });

    render();
    await askQuestion('Question');
    expect(draftOf(0)).toBeUndefined();
    live.unregister();
  });

  it('live snapshots never leak across scopes (thread-a composer, thread-b ask)', async () => {
    harness.queryStore.threadId = 'thread-b';
    const live = registerLiveDraft(ownedKeyA({ threadId: 'thread-a' }));
    live.publish({ to: [], subject: 'secret de A', bodyHtml: '<p>brouillon de A</p>' });

    render();
    await askQuestion('Question sur B');
    expect(draftOf(0)).toBeUndefined();
    live.unregister();
  });

  it('the live body NEVER lands in Ask Reta localStorage', async () => {
    harness.queryStore.threadId = 'thread-9';
    const live = registerLiveDraft(ownedKeyA({ threadId: 'thread-9' }));
    live.publish({ to: [], subject: '', bodyHtml: '<p>CORPS-LIVE-CONFIDENTIEL</p>' });

    render();
    await askQuestion('Question avec brouillon');
    const askRetaKeys = Object.keys(localStorage).filter((key) => key.startsWith('zero:ask-reta:'));
    for (const key of askRetaKeys) {
      expect(localStorage.getItem(key)).not.toContain('CORPS-LIVE-CONFIDENTIEL');
    }
    live.unregister();
  });
});

describe('AskRetaSurface — OWNER partition of every composer seam (scope-fix)', () => {
  const draftOf = (call: number) =>
    (
      harness.streamAskReta.mock.calls[call]![0] as {
        input: { context: { draft?: { subject?: string; body?: string } } };
      }
    ).input.context.draft;
  const OWNER_B = { userId: 'user-1', connectionId: 'conn-b' } as const;

  it("BARE-scope live draft of account A never reaches account B's ask", async () => {
    // A's bare composer publishes under A's OWNED bare key…
    const live = registerLiveDraft(ownedKeyA({}));
    live.publish({ to: [], subject: 'secret bare de A', bodyHtml: '<p>brouillon bare de A</p>' });
    // …while the panel runs under connection B.
    harness.connectionId = 'conn-b';
    render();
    await askQuestion('Question de B');
    expect(draftOf(0)).toBeUndefined();
    live.unregister();
  });

  it("BARE-scope DURABLE draft of account A never reaches account B's ask", async () => {
    saveLocalDraft(ownedKeyA({}), {
      to: ['a@x.test'],
      cc: [],
      bcc: [],
      subject: 'durable bare de A',
      message: '<p>corps durable de A</p>',
      savedAt: Date.now(),
    });
    harness.connectionId = 'conn-b';
    render();
    await askQuestion('Question de B');
    expect(draftOf(0)).toBeUndefined();
  });

  it('the SAME scope on two connections resolves to two distinct drafts', async () => {
    const liveA = registerLiveDraft(ownedKeyA({ threadId: 'thread-9' }));
    liveA.publish({ to: [], subject: 'brouillon de A', bodyHtml: '<p>contenu A</p>' });
    const liveB = registerLiveDraft(ownedDraftStorageKey(OWNER_B, { threadId: 'thread-9' }));
    liveB.publish({ to: [], subject: 'brouillon de B', bodyHtml: '<p>contenu B</p>' });
    harness.queryStore.threadId = 'thread-9';

    render();
    await askQuestion('Question sous A');
    expect(draftOf(0)?.body).toBe('<p>contenu A</p>');

    act(() => {
      harness.connectionId = 'conn-b';
    });
    render();
    await askQuestion('Question sous B');
    expect(draftOf(1)?.body).toBe('<p>contenu B</p>');
    liveA.unregister();
    liveB.unregister();
  });

  it('LEGACY unscoped keys are never read (ambiguous owner: safe break)', async () => {
    harness.queryStore.threadId = 'thread-9';
    saveLocalDraft(draftStorageKey({ threadId: 'thread-9' }), {
      to: ['legacy@x.test'],
      cc: [],
      bcc: [],
      subject: 'clé legacy v1',
      message: '<p>contenu legacy</p>',
      savedAt: Date.now(),
    });
    render();
    await askQuestion('Question');
    expect(draftOf(0)).toBeUndefined();
    // Untouched: recoverable manually, never migrated nor deleted.
    expect(localStorage.getItem(draftStorageKey({ threadId: 'thread-9' }))).not.toBeNull();
  });

  it("an insert handler of another owner is never reached; the snapshot lands under A's key", async () => {
    harness.streamAskReta.mockResolvedValueOnce({
      answer: 'askReta.proposalOnly',
      citations: [],
      steps: [],
      model: 'llama-4-scout',
      proposal: { kind: 'new', to: 'client@x.test', subject: 'Objet', bodyHtml: '<p>Corps</p>' },
    });
    const foreignHandler = vi.fn(() => 'inserted' as const);
    const unregister = registerComposerInsertHandler(
      ownedDraftStorageKey(OWNER_B, {}),
      foreignHandler,
    );

    render();
    await askQuestion('Prépare un mail');
    const button = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('openInComposer'),
    )!;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(foreignHandler).not.toHaveBeenCalled();
    expect(localStorage.getItem(ownedKeyA({}))).toContain('Corps');
    expect(localStorage.getItem(ownedDraftStorageKey(OWNER_B, {}))).toBeNull();
    unregister();
  });

  it('owner not hydrated: fail-closed — no read, no indicator, no crash', async () => {
    harness.connectionId = undefined;
    const live = registerLiveDraft(ownedKeyA({}));
    live.publish({ to: [], subject: 's', bodyHtml: '<p>quelque chose</p>' });
    render();
    expect(container.textContent).not.toContain('askReta.draftIncluded');
    // Submit is blocked by the hydration gate; nothing was read.
    await askQuestion('rapide');
    expect(harness.streamAskReta).not.toHaveBeenCalled();
    live.unregister();
  });
});

describe('AskRetaSurface — context capture (unchanged in slice 2)', () => {
  it('sends the open thread AND the draft persisted under the EXACT composer scope', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.queryStore.activeReplyId = 'msg-3';
    saveLocalDraft(ownedKeyA({ threadId: 'thread-9', replyId: 'msg-3' }), {
      to: ['client@x.test'],
      cc: [],
      bcc: [],
      subject: 'Re: Facture',
      message: '<p>brouillon en cours</p>',
      savedAt: Date.now(),
    });

    render();
    await askQuestion('Améliore ma réponse');

    const call = harness.streamAskReta.mock.calls[0]![0] as {
      input: { context: { threadId?: string; draft?: { subject?: string } } };
    };
    expect(call.input.context.threadId).toBe('thread-9');
    expect(call.input.context.draft?.subject).toBe('Re: Facture');
  });
});

describe('AskRetaSurface — streaming (slice 2)', () => {
  it('renders live steps as they stream, then the final turn', async () => {
    harness.streamAskReta.mockImplementationOnce(
      async ({ onStep }: { onStep: (s: unknown) => void }) => {
        onStep({ kind: 'search', detail: '"socredo" → 2 threads', sourceRefs: [] });
        return baseResult('Extraits vérifiés…');
      },
    );
    render();
    await askQuestion('Où en est Socredo ?');
    expect(container.textContent).toContain('Extraits vérifiés…');
  });

  it('Stop aborts the in-flight stream preemptively', async () => {
    let capturedSignal: AbortSignal | null = null;
    harness.streamAskReta.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          capturedSignal = signal;
          signal.addEventListener('abort', () =>
            reject(
              Object.assign(new Error('Ask Reta stream error: aborted'), {
                name: 'AskRetaStreamError',
                reason: 'aborted',
              }),
            ),
          );
        }),
    );
    render();
    await askQuestion('Question longue');
    const stopButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('askReta.stop'),
    );
    expect(stopButton).toBeTruthy();
    await act(async () => {
      stopButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true);
  });

  it('a LATE settlement of an old-scope stream never touches the new scope', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    let resolveOldRun!: (value: unknown) => void;
    harness.streamAskReta.mockImplementationOnce(
      () => new Promise((resolve) => (resolveOldRun = resolve)),
    );

    render();
    await askQuestion('question secrète de A');

    // Switch to connection B while A's stream is still in flight.
    act(() => {
      harness.connectionId = 'conn-b';
    });
    render();

    // A's stream settles LATE with its result.
    await act(async () => {
      resolveOldRun(baseResult('réponse secrète de A'));
    });

    // B's conversation/state never received A's turn…
    expect(container.textContent).not.toContain('réponse secrète de A');
    // …and NOTHING of A was ever written under B's storage key.
    const bWrites = setItemSpy.mock.calls.filter(
      ([key]) => key === askRetaConversationKey('user-1', 'conn-b'),
    );
    for (const [, value] of bWrites) {
      expect(value).not.toContain('secrète de A');
    }
    setItemSpy.mockRestore();
  });
});

describe('AskRetaSurface — hydration gate', () => {
  it('Ask stays DISABLED until the scope is hydrated, enabled after', async () => {
    harness.connectionId = undefined; // no scope → hydration cannot complete
    render();
    const input = container.querySelector('input')! as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, 'question trop rapide');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const sendButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('askReta.send'),
    )!;
    expect(sendButton.hasAttribute('disabled')).toBe(true);

    // A fast submit is a no-op: nothing lands in any conversation.
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(harness.streamAskReta).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('question trop rapide');

    // Scope arrives → hydration completes → the input unlocks (the pre-scope
    // text was purged: it belonged to no confirmed scope) and typing enables Ask.
    act(() => {
      harness.connectionId = 'conn-a';
    });
    render();
    const unlockedInput = container.querySelector('input')! as HTMLInputElement;
    expect(unlockedInput.hasAttribute('disabled')).toBe(false);
    expect(unlockedInput.value).toBe('');
    act(() => {
      setValue.call(unlockedInput, 'nouvelle question');
      unlockedInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const enabledButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('askReta.send'),
    )!;
    expect(enabledButton.hasAttribute('disabled')).toBe(false);
  });
});

describe('AskRetaSurface — review hardening', () => {
  it('ZERO paint before hydration: a stale atom is never rendered', () => {
    // Hydration cannot complete (no connection) while the atom still holds
    // another scope's turns — the gate must render an EMPTY conversation.
    harness.connectionId = undefined;
    getDefaultStore().set(askRetaConversationAtom, [
      { id: 'stale', role: 'assistant', content: 'tour périmé du scope A' },
    ]);
    render();
    expect(container.textContent).not.toContain('tour périmé du scope A');
    expect(container.textContent).toContain('askReta.empty');
  });

  it('clear during a SLOW stream aborts first: no late turn, streaming state reset', async () => {
    let resolveRun!: (value: unknown) => void;
    let capturedSignal: AbortSignal | null = null;
    harness.streamAskReta.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          capturedSignal = signal;
          resolveRun = resolve;
        }),
    );
    render();
    await askQuestion('question lente');

    const clearButton = [...container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'common.askReta.clear',
    )!;
    await act(async () => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Abort fired BEFORE the state clear; the Stop button is gone.
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('askReta.stop'),
      ),
    ).toBe(false);

    // The slow stream settles LATE: nothing lands, storage stays empty.
    await act(async () => {
      resolveRun(baseResult('réponse tardive'));
    });
    expect(container.textContent).not.toContain('réponse tardive');
    expect(localStorage.getItem(askRetaConversationKey('user-1', 'conn-a'))).toBeNull();
  });
});

describe('AskRetaSurface — scope switch purges EVERYTHING (review 02-2)', () => {
  it('an UNSENT confidential question typed under A never exists under B', async () => {
    render();
    const input = container.querySelector('input')! as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, 'question confidentielle jamais envoyée');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect((container.querySelector('input') as HTMLInputElement).value).toBe(
      'question confidentielle jamais envoyée',
    );

    act(() => {
      harness.connectionId = 'conn-b';
    });
    render();

    expect((container.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(container.textContent).not.toContain('question confidentielle');
  });

  it('A→B after a stream STEP: progression, announcement and asking state are gone', async () => {
    let capturedOnStep!: (step: unknown) => void;
    let capturedSignal: AbortSignal | null = null;
    harness.streamAskReta.mockImplementationOnce(
      ({ signal, onStep }: { signal: AbortSignal; onStep: (s: unknown) => void }) =>
        new Promise(() => {
          capturedSignal = signal;
          capturedOnStep = onStep;
        }),
    );
    render();
    await askQuestion('question de A');
    await act(async () => {
      capturedOnStep({ kind: 'search', detail: 'détail étape secrète de A', sourceRefs: [] });
    });
    expect(container.textContent).toContain('détail étape secrète de A');

    act(() => {
      harness.connectionId = 'conn-b';
    });
    render();

    // The old stream is aborted, its controller invalidated…
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true);
    // …and nothing of A's progression paints under B.
    expect(container.textContent).not.toContain('détail étape secrète de A');
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('askReta.stop'),
      ),
    ).toBe(false);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent ?? '').toBe('');
  });
});

describe('AskRetaSurface — PRE-EFFECT frame of a scope switch (review 02-3)', () => {
  it("B's very first committed frame never shows A's Stop button nor progression", async () => {
    // A has an ask in flight: Stop is visible, isAsking is true.
    harness.streamAskReta.mockImplementationOnce(() => new Promise(() => {}));
    render();
    await askQuestion('question de A en vol');
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('askReta.stop'),
      ),
    ).toBe(true);

    // Switch to B and commit SYNCHRONOUSLY: flushSync commits the DOM but the
    // PASSIVE effects (the scope-switch purge) have NOT run yet — this is the
    // exact frame the previous act()-based tests could never observe.
    const actEnv = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean };
    actEnv.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      harness.connectionId = 'conn-b';
      flushSync(() => {
        root.render(<AskRetaSurface />);
      });
      // isAsking is STILL true (no effect ran) — yet nothing of A paints:
      // the form must show Send, not A's Stop, and no progression block.
      const buttons = [...container.querySelectorAll('button')];
      expect(buttons.some((b) => b.textContent?.includes('askReta.stop'))).toBe(false);
      expect(buttons.some((b) => b.textContent?.includes('askReta.send'))).toBe(true);
      expect(container.textContent).not.toContain('askReta.thinking');
    } finally {
      actEnv.IS_REACT_ACT_ENVIRONMENT = true;
    }

    // After the effects flush, the purge makes state and display consistent.
    await act(async () => {});
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('askReta.stop'),
      ),
    ).toBe(false);
  });
});

describe('AskRetaSurface — persistence A→B→A (slice 2)', () => {
  it('restores per-scope conversations and never leaks turns across scopes', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render();
    await askQuestion('question pour A');
    expect(container.textContent).toContain('question pour A');

    // A → B: the panel hydrates B (empty), nothing of A under B's key.
    act(() => {
      harness.connectionId = 'conn-b';
    });
    render();
    expect(container.textContent).not.toContain('question pour A');
    const bKey = askRetaConversationKey('user-1', 'conn-b');
    for (const [key, value] of setItemSpy.mock.calls) {
      if (key === bKey) expect(value).not.toContain('question pour A');
    }
    expect(localStorage.getItem(bKey)).toBeNull();

    // B → A: A's turns come back from ITS key.
    act(() => {
      harness.connectionId = 'conn-a';
    });
    render();
    expect(container.textContent).toContain('question pour A');
    setItemSpy.mockRestore();
  });

  it('clear empties the atom AND the device-local store', async () => {
    render();
    await askQuestion('à effacer');
    const aKey = askRetaConversationKey('user-1', 'conn-a');
    expect(localStorage.getItem(aKey)).not.toBeNull();
    const clearButton = [...container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'common.askReta.clear',
    );
    await act(async () => {
      clearButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(localStorage.getItem(aKey)).toBeNull();
    expect(container.textContent).not.toContain('à effacer');
  });
});

describe('AskRetaSurface — replayable search steps (slice 2)', () => {
  const searchResult = () => ({
    answer: 'Extraits vérifiés…',
    citations: [],
    model: 'llama-4-scout',
    steps: [
      {
        kind: 'search',
        detail: '"devis" in sent → 1 threads',
        sourceRefs: ['s1'],
        search: {
          query: 'devis',
          folder: 'sent',
          threads: [
            { threadId: 'thread-7', subject: 'Devis 113', sender: 'Omar', date: '2026-07-28' },
          ],
        },
      },
    ],
  });

  it('renders the exact thread set clickable and replays with the folder PRESERVED', async () => {
    harness.streamAskReta.mockResolvedValueOnce(searchResult());
    harness.fetchQuery.mockResolvedValue({
      threads: [{ threadId: 'thread-8', subject: 'Devis 114', sender: 'Omar', date: '2026-07-29' }],
    });

    render();
    await askQuestion('Quels devis envoyés ?');

    // The exact metadata set is clickable → navigation purges reply state.
    const chip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Devis 113'),
    );
    expect(chip).toBeTruthy();
    act(() => {
      chip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.purge).toHaveBeenCalledWith({ threadId: 'thread-7' });

    // Replay keeps the step's folder scope — a Sent search stays a Sent search.
    const replayButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('askReta.replay'),
    );
    await act(async () => {
      replayButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'searchPreview',
        input: { query: 'devis', folder: 'sent' },
      }),
    );
    expect(container.textContent).toContain('Devis 114');
  });
});

describe('AskRetaSurface — proposals (slice-1 behaviour preserved)', () => {
  const proposalResult = (kind: 'new' | 'reply', threadId?: string) => ({
    answer: 'askReta.proposalOnly',
    citations: [],
    steps: [],
    model: 'llama-4-scout',
    proposal: {
      kind,
      to: 'client@x.test',
      subject: 'Objet proposé',
      bodyHtml: '<p>Corps proposé</p>',
      ...(threadId ? { threadId } : {}),
    },
  });

  const clickInsert = () => {
    const button = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('openInComposer'),
    );
    expect(button).toBeTruthy();
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('live-inserts a NEW proposal into the bare-scope composer with the recipient', async () => {
    harness.streamAskReta.mockResolvedValueOnce(proposalResult('new'));
    const handler = vi.fn(() => 'inserted' as const);
    const unregister = registerComposerInsertHandler(ownedKeyA({}), handler);

    render();
    await askQuestion('Prépare un mail');
    clickInsert();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ message: '<p>Corps proposé</p>', to: 'client@x.test' }),
      { force: false },
    );
    unregister();
  });

  it('a NEW proposal never injects into a live reply: bare key, purge with threadId null', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.queryStore.activeReplyId = 'msg-3';
    harness.streamAskReta.mockResolvedValueOnce(proposalResult('new'));
    const replyHandler = vi.fn(() => 'inserted' as const);
    const unregister = registerComposerInsertHandler(
      ownedKeyA({ threadId: 'thread-9', replyId: 'msg-3' }),
      replyHandler,
    );

    render();
    await askQuestion('Prépare un mail');
    clickInsert();

    expect(replyHandler).not.toHaveBeenCalled();
    const snapshot = JSON.parse(localStorage.getItem(ownedKeyA({}))!) as { to: string[] };
    expect(snapshot.to).toEqual(['client@x.test']);
    expect(harness.purge).toHaveBeenCalledWith({ threadId: null });
    expect(harness.queryStore.isComposeOpen).toBe('true');
    unregister();
  });

  it('saves a reply proposal as a Gmail draft attached to its thread', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.streamAskReta.mockResolvedValueOnce(proposalResult('reply', 'thread-9'));
    harness.draftsMutateAsync.mockResolvedValue({ id: 'draft-1' });

    render();
    await askQuestion('Prépare une réponse');
    const saveButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('createDraft'),
    );
    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.draftsMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-9', message: '<p>Corps proposé</p>' }),
    );
  });

  it('clipboard and model-save failures surface toast errors', async () => {
    harness.streamAskReta.mockResolvedValueOnce(proposalResult('new'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    render();
    await askQuestion('Prépare un mail');
    const copyButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('askReta.copy'),
    );
    await act(async () => {
      copyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.toastError).toHaveBeenCalledWith('common.actions.errorTryAgainLater');

    harness.toastError.mockClear();
    harness.selectModelMutateAsync.mockRejectedValueOnce(new Error('offline'));
    const select = container.querySelector('select')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(select, 'workers-ai:llama-3.3-70b');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(harness.toastError).toHaveBeenCalledWith('common.actions.errorTryAgainLater');
  });
});

describe('AskRetaSurface — reload safety', () => {
  it('a stored conversation NEVER resurrects a draft action after reload', () => {
    localStorage.setItem(
      askRetaConversationKey('user-1', 'conn-a'),
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        turns: [
          {
            id: 't1',
            role: 'assistant',
            content: 'réponse restaurée',
            payload: {
              citations: [],
              steps: [],
              model: 'llama-4-scout',
              // tampered: a proposal injected in storage
              proposal: { kind: 'new', bodyHtml: '<p>evil</p>' },
            },
          },
        ],
      }),
    );
    render();
    expect(container.textContent).toContain('réponse restaurée');
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('askReta.createDraft'),
      ),
    ).toBe(false);
  });
});

describe('AskRetaSurface — model catalogue select (slice 3B)', () => {
  const modelSelect = () =>
    container.querySelector('select#ask-reta-model') as unknown as HTMLSelectElement;
  const option = (id: string) =>
    modelSelect().querySelector(`option[value="${id}"]`) as HTMLOptionElement;
  const changeModel = async (id: string) => {
    const select = modelSelect();
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(select, id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  it('renders the SERVER catalogue grouped by provider — selection is the server truth', () => {
    render();
    const select = modelSelect();
    expect(select.value).toBe('workers-ai:llama-4-scout');
    const groups = [...select.querySelectorAll('optgroup')].map((group) => group.label);
    expect(groups).toEqual(['Workers AI', 'OpenAI', 'Anthropic']);
    // Configured BYOK models selectable; unconfigured VISIBLE but disabled
    // (the manage button is the configure path).
    expect(option('anthropic:claude-fable-5').disabled).toBe(false);
    expect(option('openai:gpt-5.2').disabled).toBe(true);
    expect(option('openai:gpt-5.2').textContent).toContain('askReta.notConfigured');
  });

  it('changing the model fires selectModel THEN atomically refreshes the catalogue', async () => {
    render();
    await changeModel('workers-ai:llama-3.3-70b');
    expect(harness.selectModelMutateAsync).toHaveBeenCalledWith({
      modelId: 'workers-ai:llama-3.3-70b',
    });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['copilot', 'modelCatalog'],
    });
  });

  it('vault unavailable: BYOK options disabled even when configured — Workers stay selectable', () => {
    harness.catalogue = { ...defaultCatalogue(), vaultAvailable: false };
    render();
    expect(option('anthropic:claude-fable-5').disabled).toBe(true);
    expect(option('workers-ai:llama-3.3-70b').disabled).toBe(false);
  });

  it('“Manage models” opens the lazy manager; an account/connection switch CLOSES it', async () => {
    render();
    const manage = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('askReta.manageModels'),
    )!;
    await act(async () => {
      manage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {}); // lazy chunk resolution
    expect(
      container.querySelector('[data-testid="model-manager"]')?.getAttribute('data-open'),
    ).toBe('true');

    // Account switch: the manager (and any ephemeral card state) dies with A.
    harness.connectionId = 'conn-b';
    render();
    expect(container.querySelector('[data-testid="model-manager"]')).toBeNull();
  });
});

describe('AskRetaSurface — chip « fil actuel inclus » (prod CUA fix)', () => {
  const chip = () => container.querySelector('[data-testid="ask-reta-thread-chip"]');

  it('Y sur un fil ouvert : le chip localisé apparaît, SANS aucun fetch supplémentaire', async () => {
    harness.queryStore.threadId = 'thread-9';
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
    expect(chip()!.textContent).toContain('askReta.currentThreadIncluded');
    // Sujet absent du cache → chip générique, et JAMAIS de fetch pour l'obtenir.
    expect(harness.fetchQuery).not.toHaveBeenCalled();
    // La lecture est bien le cache existant du compte (getQueryData seul).
    expect(harness.getQueryData).toHaveBeenCalledWith(['mail', 'get', { id: 'thread-9' }]);
  });

  it('le sujet apparaît UNIQUEMENT s’il est déjà dans le cache (jamais de corps)', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.getQueryData.mockReturnValue({
      latest: { subject: 'Relance facture Socredo', decodedBody: '<p>CORPS SECRET</p>' },
    });
    render();
    await act(async () => {});
    expect(chip()!.textContent).toContain('Relance facture Socredo');
    expect(chip()!.textContent).not.toContain('CORPS SECRET');
  });

  it('fermeture du fil : le chip disparaît', async () => {
    harness.queryStore.threadId = 'thread-9';
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
    harness.queryStore.threadId = null;
    render();
    await act(async () => {});
    expect(chip()).toBeNull();
  });

  it('A→B avec le même threadId : le chip de A ne réapparaît JAMAIS sous B', async () => {
    harness.queryStore.threadId = 'thread-9';
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();

    // Bascule de connexion, le paramètre threadId de l'URL persiste.
    harness.connectionId = 'conn-b';
    render();
    await act(async () => {}); // purge + réhydratation sous B
    await act(async () => {});
    expect(chip()).toBeNull();

    // Un NOUVEAU fil ouvert sous B recapture le chip pour B.
    harness.queryStore.threadId = 'thread-b1';
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
  });

  it("capture Cmd+J (« aucun fil ») : badge ABSENT et contexte serveur SANS threadId malgré un fil ouvert dans l'URL", async () => {
    harness.queryStore.threadId = 'thread-9';
    getDefaultStore().set(askRetaThreadCaptureAtom, { threadId: null });
    render();
    await act(async () => {});
    expect(chip()).toBeNull();
    await askQuestion('Question générique');
    const sent = harness.streamAskReta.mock.calls[0]![0] as {
      input: { context: { threadId?: string } };
    };
    expect(sent.input.context.threadId).toBeUndefined();
  });

  it('capture Y : le fil figé à la frappe pilote badge ET contexte serveur', async () => {
    harness.queryStore.threadId = 'thread-9';
    getDefaultStore().set(askRetaThreadCaptureAtom, { threadId: 'thread-9' });
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
    await askQuestion('Question sur le fil');
    const sent = harness.streamAskReta.mock.calls[0]![0] as {
      input: { context: { threadId?: string } };
    };
    expect(sent.input.context.threadId).toBe('thread-9');
  });

  it('A→B : la capture du raccourci est PURGÉE — le fil de A ne part jamais sous B', async () => {
    harness.queryStore.threadId = 'thread-9';
    getDefaultStore().set(askRetaThreadCaptureAtom, { threadId: 'thread-9' });
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
    harness.connectionId = 'conn-b';
    render();
    await act(async () => {});
    expect(getDefaultStore().get(askRetaThreadCaptureAtom)).toBeNull();
    expect(chip()).toBeNull();
  });

  it('fermeture du panneau (unmount) : la capture meurt avec lui', async () => {
    harness.queryStore.threadId = 'thread-9';
    getDefaultStore().set(askRetaThreadCaptureAtom, { threadId: 'thread-9' });
    render();
    await act(async () => {});
    act(() => root.unmount());
    root = createRoot(container);
    expect(getDefaultStore().get(askRetaThreadCaptureAtom)).toBeNull();
  });

  it('changement de fil sous le MÊME compte : le badge suit le nouveau fil', async () => {
    harness.queryStore.threadId = 'thread-1';
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
    harness.queryStore.threadId = 'thread-2';
    harness.getQueryData.mockReturnValue({ latest: { subject: 'Sujet du fil 2' } });
    render();
    await act(async () => {});
    expect(chip()).not.toBeNull();
    expect(chip()!.textContent).toContain('Sujet du fil 2');
  });
});

describe('AskRetaSurface — citations METADATA (tour 10)', () => {
  const metadataResult = () => ({
    answer:
      'Expéditeurs les plus récents (inbox) / Most recent senders:\n1. Compta <compta@socredo.test> — 2026-07-30 — « Relance facture »',
    citations: [
      {
        ref: 's1',
        kind: 'metadata',
        threadId: 'thread-meta-1',
        subject: 'Relance facture',
        sender: 'Compta <compta@socredo.test>',
        date: '2026-07-30T10:00:00.000Z',
        excerptHash: 'a'.repeat(64),
      },
    ],
    steps: [],
    model: 'workers-ai:llama-4-scout',
  });

  it('rend la citation metadata comme MÉTADONNÉES (label + sender), jamais comme extrait, et le clic ouvre le fil', async () => {
    harness.streamAskReta.mockResolvedValueOnce(metadataResult());
    render();
    await askQuestion('Mes derniers expéditeurs ?');

    const chipButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Relance facture'),
    )!;
    expect(chipButton.textContent).toContain('askReta.metadataCitation');
    expect(chipButton.textContent).toContain('Compta <compta@socredo.test>');
    expect(chipButton.getAttribute('title')).toContain('askReta.metadataCitation');
    expect(chipButton.getAttribute('title')).not.toContain('«');

    await act(async () => {
      chipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Le clic ouvre le fil cité (purge reply + fermeture du panneau).
    expect(harness.purge).toHaveBeenCalledWith({ threadId: 'thread-meta-1' });
    expect(harness.queryStore.isAskRetaOpen).toBeNull();
  });

  it('titre du bloc : METADATA exactement quand toutes les citations le sont', async () => {
    harness.streamAskReta.mockResolvedValueOnce(metadataResult());
    render();
    await askQuestion('Mes derniers expéditeurs ?');
    const headings = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(headings).toContain('common.askReta.metadataCitation');
    expect(headings).not.toContain('common.askReta.sources');
  });

  it('non-régression : des citations MESSAGE gardent le titre Sources', async () => {
    harness.streamAskReta.mockResolvedValueOnce({
      answer: 'Réponse extractive',
      citations: [
        {
          ref: 's1',
          kind: 'message',
          threadId: 'thread-msg-1',
          subject: 'Facture Socredo',
          sender: 'Compta <compta@socredo.test>',
          date: '2026-07-30T10:00:00.000Z',
          excerptHash: 'b'.repeat(64),
          quote: 'Montant dû : détail vérifié du corps du message',
        },
      ],
      steps: [],
      model: 'workers-ai:llama-4-scout',
    });
    render();
    await askQuestion('Que dit la facture ?');
    const headings = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(headings).toContain('common.askReta.sources');
    expect(headings).not.toContain('common.askReta.metadataCitation');
  });

  it('la citation metadata SURVIT à la persistance/rechargement (projection v2)', async () => {
    harness.streamAskReta.mockResolvedValueOnce(metadataResult());
    render();
    await askQuestion('Mes derniers expéditeurs ?');
    // Remount : recharge depuis le storage device-local.
    act(() => root.unmount());
    root = createRoot(container);
    render();
    await act(async () => {});
    const chip = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Relance facture'),
    );
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain('askReta.metadataCitation');
  });
});
