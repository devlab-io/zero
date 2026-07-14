import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { act, useRef } from 'react';

const h = vi.hoisted(() => ({
  hotkeys: new Map<string, (event: KeyboardEvent) => void>(),
  markAsRead: vi.fn(),
  setMail: vi.fn(),
}));

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: (key: string, handler: (event: KeyboardEvent) => void) => {
    h.hotkeys.set(key, handler);
  },
}));
vi.mock('@/hooks/use-optimistic-actions', () => ({
  useOptimisticActions: () => ({ optimisticMarkAsRead: h.markAsRead }),
}));
vi.mock('@/components/mail/use-mail', () => ({
  useMail: () => [{ bulkSelected: [] }, h.setMail],
}));
vi.mock('nuqs', () => ({ useQueryState: () => [null, vi.fn()] }));

import { resolveMailFocusNavigation, useMailNavigation } from './use-mail-navigation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  h.hotkeys.clear();
  h.markAsRead.mockReset();
  h.setMail.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function NavigationProbe({
  onNavigate,
  openOnFocus,
  autoMarkAsRead,
}: {
  onNavigate: (threadId: string | null) => void;
  openOnFocus: boolean;
  autoMarkAsRead: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { focusedIndex } = useMailNavigation({
    items: [
      { id: 'draft-1', unread: true },
      { id: 'draft-2', unread: false },
    ],
    containerRef: listRef,
    onNavigate,
    openOnFocus,
    autoMarkAsRead,
  });

  return (
    <div ref={listRef}>
      <div data-thread-id="draft-1" />
      <div data-thread-id="draft-2" />
      <output data-testid="focused-index">{focusedIndex ?? 'none'}</output>
    </div>
  );
}

function mountProbe(props: React.ComponentProps<typeof NavigationProbe>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <Provider store={createStore()}>
        <NavigationProbe {...props} />
      </Provider>,
    );
  });
}

function press(key: string) {
  const handler = h.hotkeys.get(key);
  expect(handler, `hotkey ${key} should be registered`).toBeTypeOf('function');
  act(() => handler?.(new KeyboardEvent('keydown', { key })));
}

describe('mail focus navigation policy', () => {
  it('keeps draft focus local until Enter and never marks a draft as read', () => {
    const onNavigate = vi.fn();
    mountProbe({ onNavigate, openOnFocus: false, autoMarkAsRead: false });

    press('j');

    expect(container?.querySelector('[data-testid="focused-index"]')?.textContent).toBe('0');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(h.markAsRead).not.toHaveBeenCalled();

    press('Enter');

    expect(onNavigate).toHaveBeenCalledWith('draft-1');
    expect(h.markAsRead).not.toHaveBeenCalled();
  });

  it('preserves open-and-auto-read on an unread regular thread', () => {
    const onNavigate = vi.fn();
    mountProbe({ onNavigate, openOnFocus: true, autoMarkAsRead: true });

    press('j');

    expect(onNavigate).toHaveBeenCalledWith('draft-1');
    expect(h.markAsRead).toHaveBeenCalledWith(['draft-1'], true);
  });

  it('does not auto-read a message that is already read or when auto-read is disabled', () => {
    expect(
      resolveMailFocusNavigation(
        { id: 'thread-read', unread: false },
        { openOnFocus: true, autoMarkAsRead: true },
      ),
    ).toEqual({ navigateToId: 'thread-read', markAsReadId: null });
    expect(
      resolveMailFocusNavigation(
        { id: 'thread-unread', unread: true },
        { openOnFocus: true, autoMarkAsRead: false },
      ),
    ).toEqual({ navigateToId: 'thread-unread', markAsReadId: null });
  });
});
