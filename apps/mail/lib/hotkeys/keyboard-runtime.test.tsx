import { HotkeysProvider, useHotkeysContext } from 'react-hotkeys-hook';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { act, useEffect } from 'react';

import {
  dispatchShortcutEvent,
  dispatchShortcutSequenceEvent,
  useShortcuts,
} from './use-hotkey-utils';
import { keyboardShortcuts, type Shortcut } from '@/config/shortcuts';
import { resolveQueueSelectionId } from './queue-navigation';
import { QUEUE_HANDLED_ACTIONS } from './handler-manifest';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

vi.mock('@/components/context/command-palette-context', () => ({
  useCommandPalette: () => ({ clearAllFilters: vi.fn() }),
}));
vi.mock('@/components/context/sidebar-context', () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));
vi.mock('@/hooks/use-optimistic-actions', () => ({
  useOptimisticActions: () => ({ undoLastAction: vi.fn() }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('nuqs', async () => {
  const React = await import('react');
  return { useQueryState: () => React.useState<string | null>(null) };
});

const shortcutsFor = (scope: string) =>
  keyboardShortcuts.filter((shortcut) => shortcut.scope === scope);
const contextualSheetScopes = [...new Set(keyboardShortcuts.map((shortcut) => shortcut.scope))];
const contextualSheetActions = [
  ...new Set(
    keyboardShortcuts.filter((shortcut) => !shortcut.ignore).map((shortcut) => shortcut.action),
  ),
];
const contextualActionCatalogs = [
  enMessages.pages.settings.shortcuts.actions,
  frMessages.pages.settings.shortcuts.actions,
] as Array<Record<string, string>>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function RuntimeProbe({ enabled, onArchive }: { enabled: boolean; onArchive: () => void }) {
  const { enableScope, disableScope } = useHotkeysContext();
  useShortcuts(shortcutsFor('mail-list'), { archiveEmail: onArchive }, { scope: 'mail-list' });

  useEffect(() => {
    if (enabled) enableScope('mail-list');
    else disableScope('mail-list');
    return () => disableScope('mail-list');
  }, [disableScope, enableScope, enabled]);

  return null;
}

function mountRuntime(enabled: boolean, onArchive: () => void) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      <HotkeysProvider initiallyActiveScopes={['global']}>
        <RuntimeProbe enabled={enabled} onArchive={onArchive} />
      </HotkeysProvider>,
    );
  });
}

type QueueShortcutHandlers = Record<(typeof QUEUE_HANDLED_ACTIONS)[number], () => void>;

function QueueRuntimeProbe({ handlers }: { handlers: QueueShortcutHandlers }) {
  useShortcuts(shortcutsFor('queue'), handlers, { scope: 'queue', preventDefault: true });
  return null;
}

function mountQueueRuntime(handlers: QueueShortcutHandlers) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HotkeysProvider initiallyActiveScopes={['queue']}>
        <QueueRuntimeProbe handlers={handlers} />
      </HotkeysProvider>,
    );
  });
}

describe('keyboard runtime', () => {
  it('keeps every alias for a mail-list action when real keyboard events arrive', () => {
    const calls: string[] = [];
    const handlers = {
      archiveEmail: () => calls.push('archive'),
      remindThread: () => calls.push('remind'),
      markAsUnread: () => calls.push('unread'),
      bulkDelete: () => calls.push('delete'),
    };

    for (const event of [
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }),
      new KeyboardEvent('keydown', { key: 'e', code: 'KeyE' }),
      new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }),
      new KeyboardEvent('keydown', { key: 'h', code: 'KeyH' }),
      new KeyboardEvent('keydown', { key: 'u', code: 'KeyU' }),
      new KeyboardEvent('keydown', { key: 'U', code: 'KeyU', shiftKey: true }),
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', shiftKey: true }),
      new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete' }),
      new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', ctrlKey: true }),
    ]) {
      dispatchShortcutEvent(event, shortcutsFor('mail-list'), handlers);
    }

    expect(calls).toEqual([
      'archive',
      'archive',
      'remind',
      'remind',
      'unread',
      'unread',
      'delete',
      'delete',
      'delete',
    ]);
  });

  it('matches canonical punctuation and modifiers from QWERTY and AZERTY events', () => {
    const calls: string[] = [];
    const handlers = {
      markAsImportant: () => calls.push('important'),
      goToSettings: () => calls.push('settings'),
      helpWithShortcuts: () => calls.push('help'),
    };

    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '+', code: 'Equal', shiftKey: true }),
      shortcutsFor('mail-list'),
      handlers,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '+', code: 'Equal', shiftKey: true }),
      shortcutsFor('thread-display'),
      handlers,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }),
      shortcutsFor('global'),
      handlers,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true }),
      shortcutsFor('global'),
      handlers,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '?', code: 'Comma', shiftKey: true }),
      shortcutsFor('global'),
      handlers,
    );

    expect(calls).toEqual(['important', 'important', 'settings', 'help', 'help']);
  });

  it('does not let a shifted alias fall through to its bare-key row', () => {
    const calls: string[] = [];
    const shortcuts: Shortcut[] = [
      { keys: ['u'], action: 'bare', type: 'single', description: 'Bare U', scope: 'test' },
      {
        keys: ['shift', 'u'],
        action: 'shifted',
        type: 'combination',
        description: 'Shift U',
        scope: 'test',
      },
    ];

    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: 'U', code: 'KeyU', shiftKey: true }),
      shortcuts,
      { bare: () => calls.push('bare'), shifted: () => calls.push('shifted') },
    );

    expect(calls).toEqual(['shifted']);
  });

  it('does not leak simple keys into typing and dialog targets, except Escape', () => {
    const input = document.createElement('input');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const dialogButton = document.createElement('button');
    dialog.appendChild(dialogButton);
    const calls: string[] = [];
    const handlers = {
      archiveEmail: () => calls.push('archive'),
      exitSelectionMode: () => calls.push('escape'),
    };

    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }),
      shortcutsFor('mail-list'),
      handlers,
      input,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }),
      shortcutsFor('mail-list'),
      handlers,
      editor,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }),
      shortcutsFor('mail-list'),
      handlers,
      dialogButton,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }),
      shortcutsFor('mail-list'),
      handlers,
      input,
    );

    expect(calls).toEqual(['escape']);
  });

  it('registers only while its runtime scope is active and fires once for a browser event', () => {
    const calls: string[] = [];
    mountRuntime(false, () => calls.push('archive'));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }),
      );
    });
    expect(calls).toEqual([]);

    mountRuntime(true, () => calls.push('archive'));
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }),
      );
    });
    expect(calls).toEqual(['archive']);
  });

  it('dispatches every queue navigation variant exactly once without typing/modal leaks or a parallel listener', () => {
    const calls: string[] = [];
    const handlers = {
      focusNext: () => calls.push('next'),
      focusPrevious: () => calls.push('previous'),
      openSelected: () => calls.push('open'),
      approveSelected: () => calls.push('approve'),
      rejectSelected: () => calls.push('reject'),
    };
    const addEventListener = vi.spyOn(document, 'addEventListener');

    try {
      mountQueueRuntime(handlers);
      expect(
        addEventListener.mock.calls.filter(([eventName]) => eventName === 'keydown'),
      ).toHaveLength(1);

      for (const event of [
        new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true }),
        new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }),
        new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', bubbles: true }),
        new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }),
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
        new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
      ]) {
        act(() => document.dispatchEvent(event));
      }
      expect(calls).toEqual(['next', 'next', 'previous', 'previous', 'open', 'open']);

      const input = document.createElement('input');
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const dialogButton = document.createElement('button');
      dialog.appendChild(dialogButton);
      document.body.append(input, editor, dialog);

      for (const target of [input, editor, dialogButton]) {
        for (const init of [
          { key: 'j', code: 'KeyJ' },
          { key: 'ArrowDown', code: 'ArrowDown' },
          { key: 'k', code: 'KeyK' },
          { key: 'ArrowUp', code: 'ArrowUp' },
          { key: 'Enter', code: 'Enter' },
          { key: ' ', code: 'Space' },
        ]) {
          act(() => target.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true })));
        }
      }
      expect(calls).toEqual(['next', 'next', 'previous', 'previous', 'open', 'open']);
      input.remove();
      editor.remove();
      dialog.remove();
    } finally {
      addEventListener.mockRestore();
    }
  });

  it('uses the production queue selection algorithm with deterministic wrap and filtered-list recovery', () => {
    const visibleItems = [{ id: 'first' }, { id: 'middle' }, { id: 'last' }];

    expect(resolveQueueSelectionId(visibleItems, 'first', 'next')).toBe('middle');
    expect(resolveQueueSelectionId(visibleItems, 'last', 'next')).toBe('first');
    expect(resolveQueueSelectionId(visibleItems, 'last', 'previous')).toBe('middle');
    expect(resolveQueueSelectionId(visibleItems, 'first', 'previous')).toBe('last');
    expect(resolveQueueSelectionId(visibleItems, 'filtered-out', 'next')).toBe('first');
    expect(resolveQueueSelectionId(visibleItems, 'filtered-out', 'previous')).toBe('last');
    expect(resolveQueueSelectionId([], 'filtered-out', 'next')).toBeNull();
  });

  it('routes g ! and g # sequences from real QWERTY and AZERTY punctuation events', () => {
    const calls: string[] = [];
    const handlers = { goToSpam: () => calls.push('spam'), goToBin: () => calls.push('bin') };
    let pending = dispatchShortcutSequenceEvent(
      new KeyboardEvent('keydown', { key: 'g', code: 'KeyG' }),
      shortcutsFor('navigation'),
      handlers,
      null,
      1,
      800,
    );
    pending = dispatchShortcutSequenceEvent(
      new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true }),
      shortcutsFor('navigation'),
      handlers,
      pending,
      2,
      800,
    );
    dispatchShortcutSequenceEvent(
      new KeyboardEvent('keydown', { key: 'g', code: 'KeyG' }),
      shortcutsFor('navigation'),
      handlers,
      pending,
      3,
      800,
    );
    dispatchShortcutSequenceEvent(
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', ctrlKey: true, altKey: true }),
      shortcutsFor('navigation'),
      handlers,
      { key: 'g', startedAt: 3 },
      4,
      800,
    );

    expect(calls).toEqual(['spam', 'bin']);
  });

  it('accepts Ctrl+Alt layout punctuation only for punctuation shortcuts', () => {
    const calls: string[] = [];
    const handlers = {
      bulkDelete: () => calls.push('delete'),
      archiveEmail: () => calls.push('archive'),
    };
    const input = document.createElement('input');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', ctrlKey: true, altKey: true }),
      shortcutsFor('mail-list'),
      handlers,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', ctrlKey: true, altKey: true }),
      shortcutsFor('mail-list'),
      handlers,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', ctrlKey: true, altKey: true }),
      shortcutsFor('mail-list'),
      handlers,
      input,
    );
    dispatchShortcutEvent(
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', ctrlKey: true, altKey: true }),
      shortcutsFor('mail-list'),
      handlers,
      dialog,
    );

    expect(calls).toEqual(['delete']);
  });

  it('opens localized contextual shortcut help in place from Shift+?', async () => {
    const Location = () => <output data-testid="location">{useLocation().pathname}</output>;
    const { GlobalHotkeys } = await import('./global-hotkeys');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/mail/inbox']}>
          <HotkeysProvider initiallyActiveScopes={contextualSheetScopes}>
            <GlobalHotkeys />
            <Location />
          </HotkeysProvider>
        </MemoryRouter>,
      );
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true, bubbles: true }),
      );
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Keyboard Shortcuts');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('New Email');
    for (const action of contextualSheetActions) {
      expect(document.querySelector(`[data-shortcut-action="${action}"]`)?.textContent).not.toBe(
        action,
      );
    }
    for (const catalog of contextualActionCatalogs) {
      for (const action of contextualSheetActions) {
        expect(catalog[action]).toEqual(expect.any(String));
        expect(catalog[action]).not.toBe(action);
      }
    }
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/mail/inbox');
  });
});
