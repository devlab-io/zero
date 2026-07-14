import { HotkeysProvider, useHotkeysContext } from 'react-hotkeys-hook';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { keyboardShortcuts, type Shortcut } from '@/config/shortcuts';
import { dispatchShortcutEvent, dispatchShortcutSequenceEvent, useShortcuts } from './use-hotkey-utils';

const shortcutsFor = (scope: string) => keyboardShortcuts.filter((shortcut) => shortcut.scope === scope);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

    expect(calls).toEqual(['archive', 'archive', 'remind', 'remind', 'unread', 'unread', 'delete', 'delete', 'delete']);
  });

  it('matches canonical punctuation and modifiers from QWERTY and AZERTY events', () => {
    const calls: string[] = [];
    const handlers = {
      markAsImportant: () => calls.push('important'),
      goToSettings: () => calls.push('settings'),
      helpWithShortcuts: () => calls.push('help'),
    };

    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', shiftKey: true }), shortcutsFor('mail-list'), handlers);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', shiftKey: true }), shortcutsFor('thread-display'), handlers);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true }), shortcutsFor('global'), handlers);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true }), shortcutsFor('global'), handlers);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: '?', code: 'Comma', shiftKey: true }), shortcutsFor('global'), handlers);

    expect(calls).toEqual(['important', 'important', 'settings', 'help', 'help']);
  });

  it('does not let a shifted alias fall through to its bare-key row', () => {
    const calls: string[] = [];
    const shortcuts: Shortcut[] = [
      { keys: ['u'], action: 'bare', type: 'single', description: 'Bare U', scope: 'test' },
      { keys: ['shift', 'u'], action: 'shifted', type: 'combination', description: 'Shift U', scope: 'test' },
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
    const handlers = { archiveEmail: () => calls.push('archive'), exitSelectionMode: () => calls.push('escape') };

    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }), shortcutsFor('mail-list'), handlers, input);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }), shortcutsFor('mail-list'), handlers, editor);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }), shortcutsFor('mail-list'), handlers, dialogButton);
    dispatchShortcutEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }), shortcutsFor('mail-list'), handlers, input);

    expect(calls).toEqual(['escape']);
  });

  it('registers only while its runtime scope is active and fires once for a browser event', () => {
    const calls: string[] = [];
    mountRuntime(false, () => calls.push('archive'));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }));
    });
    expect(calls).toEqual([]);

    mountRuntime(true, () => calls.push('archive'));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true }));
    });
    expect(calls).toEqual(['archive']);
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
      new KeyboardEvent('keydown', { key: '#', code: 'Digit3', altKey: true }),
      shortcutsFor('navigation'),
      handlers,
      { key: 'g', startedAt: 3 },
      4,
      800,
    );

    expect(calls).toEqual(['spam', 'bin']);
  });
});
