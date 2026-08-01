import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// P0 secret discipline (slice 3B): the API key lives ONLY as ephemeral card
// state — never in localStorage/query cache/toasts/DOM after the flow ends,
// never sent without the explicit consent checkbox.

const API_KEY = 'sk-secret-saisi-au-clavier-9999';

const harness = vi.hoisted(() => ({
  catalogue: undefined as unknown,
  setCredentialMutateAsync: vi.fn(),
  deleteCredentialMutateAsync: vi.fn(),
  invalidateQueries: vi.fn(async () => {}),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({
    copilot: {
      modelCatalog: {
        queryOptions: () => ({ kind: 'modelCatalog' }),
        queryKey: () => ['copilot', 'modelCatalog'],
      },
      setCredential: { mutationOptions: () => ({ kind: 'setCredential' }) },
      deleteCredential: { mutationOptions: () => ({ kind: 'deleteCredential' }) },
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { kind: string }) =>
    options.kind === 'modelCatalog' ? { data: harness.catalogue } : { data: undefined },
  useMutation: (options: { kind: string }) => ({
    isPending: false,
    mutateAsync:
      options.kind === 'setCredential'
        ? harness.setCredentialMutateAsync
        : harness.deleteCredentialMutateAsync,
  }),
  useQueryClient: () => ({ invalidateQueries: harness.invalidateQueries }),
}));

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

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => harness.toastSuccess(...args),
    error: (...args: unknown[]) => harness.toastError(...args),
  },
}));

import { ModelManagerDialog } from './model-manager';

const catalogueFixture = () => ({
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

let container: HTMLDivElement;
let root: Root;

const render = (open = true) => {
  act(() => {
    root.render(<ModelManagerDialog open={open} onOpenChange={() => {}} />);
  });
};

const card = (provider: string) =>
  container.querySelector(`[data-testid="provider-card-${provider}"]`) as HTMLElement;
const keyInput = (provider: string) =>
  card(provider).querySelector(`#ask-reta-key-${provider}`) as HTMLInputElement;
const consentBox = (provider: string) =>
  card(provider).querySelector(`#ask-reta-consent-${provider}`) as HTMLInputElement;
const buttonIn = (scope: HTMLElement, text: string) =>
  [...scope.querySelectorAll('button')].find((button) => button.textContent?.includes(text));

const typeKey = (provider: string, value: string) => {
  const input = keyInput(provider);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const checkConsent = (provider: string) => {
  const box = consentBox(provider);
  act(() => {
    box.click();
  });
};

beforeEach(() => {
  localStorage.clear();
  harness.catalogue = catalogueFixture();
  harness.setCredentialMutateAsync.mockReset();
  harness.setCredentialMutateAsync.mockResolvedValue({ ok: true });
  harness.deleteCredentialMutateAsync.mockReset();
  harness.deleteCredentialMutateAsync.mockResolvedValue({ ok: true });
  harness.invalidateQueries.mockClear();
  harness.toastSuccess.mockClear();
  harness.toastError.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ModelManagerDialog — cards and states', () => {
  it('renders Workers as included plus the five BYOK provider cards with configured state ONLY', () => {
    render();
    expect(container.textContent).toContain('askReta.workersIncluded');
    for (const provider of ['openai', 'anthropic', 'gemini', 'moonshot', 'zai']) {
      expect(card(provider), provider).toBeTruthy();
    }
    expect(card('anthropic').textContent).toContain('askReta.configured');
    expect(card('openai').textContent).toContain('askReta.notConfigured');
    // NEVER a verification status, suffix or length anywhere.
    expect(container.textContent).not.toMatch(/verified|suffix|•{3,}/i);
  });

  it('vault unavailable: fixed admin message, NO key form at all', () => {
    harness.catalogue = { ...catalogueFixture(), vaultAvailable: false };
    render();
    expect(container.textContent).toContain('askReta.vaultUnavailable');
    expect(container.querySelector('[data-testid^="provider-card-"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it('the key field is a hardened password input', () => {
    render();
    const input = keyInput('anthropic');
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });
});

describe('ModelManagerDialog — consent gate and save flow', () => {
  it('save stays DISABLED until both a plausible key AND the explicit consent are given', () => {
    render();
    const save = buttonIn(card('anthropic'), 'askReta.replaceKey')!;
    expect(save.disabled).toBe(true);
    typeKey('anthropic', API_KEY);
    expect(save.disabled).toBe(true); // key alone is not enough
    checkConsent('anthropic');
    expect(save.disabled).toBe(false);
    // The consent wording is the exact fixed label, next to the checkbox.
    expect(card('anthropic').textContent).toContain('askReta.consentLabel');
  });

  it('save sends provider+key+consent literals, then CLEARS the field and refreshes the catalogue', async () => {
    render();
    typeKey('anthropic', API_KEY);
    checkConsent('anthropic');
    await act(async () => {
      buttonIn(card('anthropic'), 'askReta.replaceKey')!.click();
    });
    expect(harness.setCredentialMutateAsync).toHaveBeenCalledWith({
      provider: 'anthropic',
      apiKey: API_KEY,
      acceptsMailboxEgress: true,
      consentVersion: '2026-08-01',
    });
    // Ephemeral state gone on success: field empty, consent unchecked.
    expect(keyInput('anthropic').value).toBe('');
    expect(consentBox('anthropic').checked).toBe(false);
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['copilot', 'modelCatalog'],
    });
    // The secret appears NOWHERE else: not in the DOM, toasts, or storage.
    expect(document.body.innerHTML).not.toContain(API_KEY);
    expect(harness.toastSuccess.mock.calls.flat().join(' ')).not.toContain(API_KEY);
    expect(localStorage.length).toBe(0);
  });

  it('save FAILURE: field cleared, FIXED toast, the key leaks nowhere', async () => {
    harness.setCredentialMutateAsync.mockRejectedValueOnce(
      new Error(`upstream said: ${API_KEY} invalid`),
    );
    render();
    typeKey('anthropic', API_KEY);
    checkConsent('anthropic');
    await act(async () => {
      buttonIn(card('anthropic'), 'askReta.replaceKey')!.click();
    });
    expect(keyInput('anthropic').value).toBe('');
    expect(harness.toastError).toHaveBeenCalledWith('common.askReta.keySaveError');
    expect(harness.toastError.mock.calls.flat().join(' ')).not.toContain(API_KEY);
    expect(document.body.innerHTML).not.toContain(API_KEY);
  });

  it('closing the dialog UNMOUNTS the cards: a typed key never survives reopen', () => {
    render();
    typeKey('anthropic', API_KEY);
    expect(keyInput('anthropic').value).toBe(API_KEY);
    render(false); // close → cards unmount, ephemeral state destroyed
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull();
    expect(document.body.innerHTML).not.toContain(API_KEY);
    render(true); // reopen: fresh card, empty field
    expect(keyInput('anthropic').value).toBe('');
  });
});

describe('ModelManagerDialog — delete with confirmation', () => {
  it('remove asks for confirmation, then delegates the atomic delete+reset and refreshes', async () => {
    render();
    const anthropic = card('anthropic');
    act(() => {
      buttonIn(anthropic, 'askReta.removeKey')!.click();
    });
    expect(card('anthropic').textContent).toContain('askReta.confirmRemoveKey');
    expect(harness.deleteCredentialMutateAsync).not.toHaveBeenCalled();
    await act(async () => {
      buttonIn(card('anthropic'), 'askReta.confirmRemove')!.click();
    });
    expect(harness.deleteCredentialMutateAsync).toHaveBeenCalledWith({ provider: 'anthropic' });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['copilot', 'modelCatalog'],
    });
    expect(harness.toastSuccess).toHaveBeenCalledWith('common.askReta.keyRemoved');
  });

  it('an unconfigured provider offers no remove button; cancel backs out without deleting', () => {
    render();
    expect(buttonIn(card('openai'), 'askReta.removeKey')).toBeUndefined();
    act(() => {
      buttonIn(card('anthropic'), 'askReta.removeKey')!.click();
    });
    act(() => {
      buttonIn(card('anthropic'), 'askReta.cancel')!.click();
    });
    expect(card('anthropic').textContent).not.toContain('askReta.confirmRemoveKey');
    expect(harness.deleteCredentialMutateAsync).not.toHaveBeenCalled();
  });
});
