import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { registerComposerInsertHandler } from '@/lib/composer-insert';
import { draftStorageKey, saveLocalDraft } from '@/lib/draft-storage';
import { askRetaConversationAtom } from './ask-reta-state';
import { createRoot, type Root } from 'react-dom/client';
import { AskRetaSurface } from './ask-reta-surface';
import { getDefaultStore } from 'jotai';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  askMutateAsync: vi.fn(),
  askPending: false,
  draftsMutateAsync: vi.fn(),
  settingsMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastPlain: vi.fn(),
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

vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({
    copilot: { ask: { mutationOptions: () => ({ kind: 'ask' }) } },
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
  useMutation: (options: { kind: string }) => {
    if (options.kind === 'ask')
      return { isPending: harness.askPending, mutateAsync: harness.askMutateAsync };
    if (options.kind === 'drafts')
      return { isPending: false, mutateAsync: harness.draftsMutateAsync };
    return { isPending: false, mutateAsync: harness.settingsMutateAsync };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}) }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({ data: { settings: { askRetaModel: 'llama-4-scout' } } }),
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

const askQuestion = async (text: string) => {
  const input = container.querySelector('input')! as HTMLInputElement;
  const form = container.querySelector('form')!;
  // React 19 value-tracker: only the native prototype setter makes the change visible.
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
  // The conversation atom lives in jotai's default store — reset between tests.
  getDefaultStore().set(askRetaConversationAtom, []);
  harness.queryStore.threadId = null;
  harness.queryStore.draftId = null;
  harness.queryStore.activeReplyId = null;
  harness.askMutateAsync.mockReset();
  harness.askMutateAsync.mockResolvedValue({
    answer: 'Réponse.',
    citations: [],
    steps: [],
    model: 'llama-4-scout',
  });
  harness.draftsMutateAsync.mockReset();
  harness.toastSuccess.mockClear();
  harness.toastError.mockClear();
  harness.toastPlain.mockClear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('AskRetaSurface — context capture', () => {
  it('sends the open thread AND the draft persisted under the EXACT composer scope', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.queryStore.activeReplyId = 'msg-3';
    // Snapshot under the reply composer's real key…
    saveLocalDraft(draftStorageKey({ threadId: 'thread-9', replyId: 'msg-3' }), {
      to: ['client@x.test'],
      cc: [],
      bcc: [],
      subject: 'Re: Facture',
      message: '<p>brouillon en cours</p>',
      savedAt: Date.now(),
    });
    // …and a decoy under the bare compose key that must NOT be read.
    saveLocalDraft(draftStorageKey({}), {
      to: [],
      cc: [],
      bcc: [],
      subject: 'DECOY',
      message: '<p>decoy</p>',
      savedAt: Date.now(),
    });

    render();
    await askQuestion('Améliore ma réponse');

    expect(harness.askMutateAsync).toHaveBeenCalledTimes(1);
    const payload = harness.askMutateAsync.mock.calls[0]![0] as {
      context: { threadId?: string; draft?: { subject?: string; body?: string } };
    };
    expect(payload.context.threadId).toBe('thread-9');
    expect(payload.context.draft?.subject).toBe('Re: Facture');
    expect(payload.context.draft?.body).toContain('brouillon en cours');
    expect(payload.context.draft?.subject).not.toBe('DECOY');
  });

  it('omits the draft context when no scoped snapshot exists', async () => {
    render();
    await askQuestion('Question globale');
    const payload = harness.askMutateAsync.mock.calls[0]![0] as { context: object };
    expect(payload.context).toEqual({});
  });
});

describe('AskRetaSurface — citations', () => {
  it('renders server citations and opens the cited thread on click', async () => {
    harness.askMutateAsync.mockResolvedValue({
      answer: 'Voir la relance.',
      citations: [
        {
          ref: 's1',
          threadId: 'thread-42',
          subject: 'Relance facture',
          sender: 'Compta <c@x.test>',
          date: '2026-07-30',
          excerptHash: 'a'.repeat(64),
        },
      ],
      steps: [{ kind: 'search', detail: '"facture" → 1 threads', sourceRefs: ['s1'] }],
      model: 'llama-4-scout',
    });

    render();
    await askQuestion('Où est la relance ?');

    const chip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Relance facture'),
    );
    expect(chip).toBeTruthy();
    act(() => {
      chip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.queryStore.threadId).toBe('thread-42');
    expect(harness.queryStore.isAskRetaOpen).toBeNull();
  });
});

describe('AskRetaSurface — proposal insertion, never silently overwriting', () => {
  const proposalResponse = (kind: 'new' | 'reply', threadId?: string) => ({
    answer: 'Brouillon prêt.',
    citations: [],
    steps: [],
    model: 'llama-4-scout',
    proposal: {
      kind,
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

  it('live-inserts into the mounted composer for the current scope', async () => {
    harness.askMutateAsync.mockResolvedValue(proposalResponse('new'));
    const handler = vi.fn(() => 'inserted' as const);
    const unregister = registerComposerInsertHandler(draftStorageKey({}), handler);

    render();
    await askQuestion('Prépare un mail');
    clickInsert();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ message: '<p>Corps proposé</p>' }),
      { force: false },
    );
    expect(harness.toastSuccess).toHaveBeenCalled();
    unregister();
  });

  it('asks before replacing when the composer is occupied, then forces on confirm', async () => {
    harness.askMutateAsync.mockResolvedValue(proposalResponse('new'));
    const handler = vi.fn((_payload: unknown, { force }: { force: boolean }) =>
      force ? ('inserted' as const) : ('occupied' as const),
    );
    const unregister = registerComposerInsertHandler(draftStorageKey({}), handler);

    render();
    await askQuestion('Prépare un mail');
    clickInsert();

    expect(handler).toHaveBeenCalledTimes(1);
    const toastArgs = harness.toastPlain.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    expect(toastArgs[0]).toBe('common.askReta.replacePrompt');
    act(() => {
      toastArgs[1].action.onClick();
    });
    expect(handler).toHaveBeenLastCalledWith(expect.anything(), { force: true });
    unregister();
  });

  it('reply proposals only offer insertion when their reply composer is open', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.askMutateAsync.mockResolvedValue(proposalResponse('reply', 'thread-9'));

    render();
    await askQuestion('Prépare une réponse');
    // No activeReplyId → no insert button, Gmail-draft action still present.
    expect(
      [...container.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('openInComposer'),
      ),
    ).toBe(false);
    expect(
      [...container.querySelectorAll('button')].some((b) => b.textContent?.includes('createDraft')),
    ).toBe(true);
  });

  it('saves a reply proposal as a Gmail draft attached to its thread', async () => {
    harness.queryStore.threadId = 'thread-9';
    harness.askMutateAsync.mockResolvedValue(proposalResponse('reply', 'thread-9'));
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
});
