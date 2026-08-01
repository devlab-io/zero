import { askRetaConversationKey } from '@/lib/ask-reta-conversation-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { registerComposerInsertHandler } from '@/lib/composer-insert';
import { draftStorageKey, saveLocalDraft } from '@/lib/draft-storage';
import { askRetaConversationAtom } from './ask-reta-state';
import { createRoot, type Root } from 'react-dom/client';
import { AskRetaSurface } from './ask-reta-surface';
import { getDefaultStore } from 'jotai';
import { flushSync } from 'react-dom';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  streamAskReta: vi.fn(),
  fetchQuery: vi.fn(),
  draftsMutateAsync: vi.fn(),
  settingsMutateAsync: vi.fn(),
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
    },
    drafts: {
      create: { mutationOptions: () => ({ kind: 'drafts' }) },
      list: { queryKey: () => ['drafts'] },
    },
    settings: {
      save: { mutationOptions: () => ({ kind: 'settings' }) },
      get: { queryKey: () => ['settings'] },
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: { kind: string }) =>
    options.kind === 'drafts'
      ? { isPending: false, mutateAsync: harness.draftsMutateAsync }
      : { isPending: false, mutateAsync: harness.settingsMutateAsync },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(async () => {}),
    fetchQuery: harness.fetchQuery,
  }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({ data: { settings: { askRetaModel: 'llama-4-scout' } } }),
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
  harness.settingsMutateAsync.mockReset();
  harness.settingsMutateAsync.mockResolvedValue({ success: true });
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

describe('AskRetaSurface — context capture (unchanged in slice 2)', () => {
  it('sends the open thread AND the draft persisted under the EXACT composer scope', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.queryStore.activeReplyId = 'msg-3';
    saveLocalDraft(draftStorageKey({ threadId: 'thread-9', replyId: 'msg-3' }), {
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
    const unregister = registerComposerInsertHandler(draftStorageKey({}), handler);

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
      draftStorageKey({ threadId: 'thread-9', replyId: 'msg-3' }),
      replyHandler,
    );

    render();
    await askQuestion('Prépare un mail');
    clickInsert();

    expect(replyHandler).not.toHaveBeenCalled();
    const snapshot = JSON.parse(localStorage.getItem(draftStorageKey({}))!) as { to: string[] };
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
    harness.settingsMutateAsync.mockRejectedValueOnce(new Error('offline'));
    const select = container.querySelector('select')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(select, 'llama-3.3-70b');
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
