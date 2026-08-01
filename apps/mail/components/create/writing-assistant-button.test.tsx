import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WritingAssistantButton } from './writing-assistant-button';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/react';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: harness.isPending, mutateAsync: harness.mutateAsync }),
}));

vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({ ai: { rewriteEmail: { mutationOptions: () => ({}) } } }),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
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
vi.mock('sonner', () => ({
  toast: { success: harness.toastSuccess, error: harness.toastError },
}));

let container: HTMLDivElement;
let root: Root;
let html: string;
let setContent: ReturnType<typeof vi.fn>;
let setTextSelection: ReturnType<typeof vi.fn>;
let focus: ReturnType<typeof vi.fn>;

function makeEditor() {
  setContent = vi.fn((content: string | object) => {
    html = typeof content === 'string' ? content : '<p>Previous content</p>';
  });
  setTextSelection = vi.fn();
  focus = vi.fn();
  return {
    isDestroyed: false,
    getHTML: () => html,
    getText: () => 'Bonjor Thomas',
    getJSON: () => ({ type: 'doc', content: [] }),
    state: { selection: { from: 4, to: 4 }, doc: { content: { size: 40 } } },
    commands: { setContent, setTextSelection, focus },
  } as unknown as Editor;
}

function mount(editor: Editor) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<WritingAssistantButton editor={editor} />));
}

beforeEach(() => {
  html = '<p>Bonjor Thomas</p>';
  harness.isPending = false;
  harness.mutateAsync.mockReset();
  harness.toastSuccess.mockReset();
  harness.toastError.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('WritingAssistantButton', () => {
  it('corrects the current draft and replaces it only after the response', async () => {
    harness.mutateAsync.mockResolvedValue({ html: '<p>Bonjour Thomas</p>' });
    mount(makeEditor());

    expect(container.querySelector('[aria-label="Writing assistant"]')).not.toBeNull();
    const correct = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'CorrectSpelling, grammar and punctuation',
    )!;

    await act(async () => correct.click());

    expect(harness.mutateAsync).toHaveBeenCalledWith({
      content: '<p>Bonjor Thomas</p>',
      mode: 'correct',
    });
    expect(setContent).toHaveBeenCalledWith('<p>Bonjour Thomas</p>');
    expect(setTextSelection).toHaveBeenCalledWith({ from: 4, to: 4 });
    expect(focus).toHaveBeenCalled();
    expect(harness.toastSuccess).toHaveBeenCalledWith(
      'Email corrected',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
  });

  it('passes the freely requested mood to reformulation', async () => {
    harness.mutateAsync.mockResolvedValue({ html: '<p>Bonjour !</p>' });
    mount(makeEditor());

    const input = container.querySelector<HTMLInputElement>('#rewrite-mood')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'très chaleureux mais court',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const reformulate = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Reformulate',
    )!;
    await act(async () => reformulate.click());

    expect(harness.mutateAsync).toHaveBeenCalledWith({
      content: '<p>Bonjor Thomas</p>',
      mode: 'rewrite',
      mood: 'très chaleureux mais court',
    });
  });
});
