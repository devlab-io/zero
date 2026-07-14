import {
  buildQueueItemAccessibleName,
  buildQueueNavigationShortcuts,
  clearQueueItemPending,
  moveQueueSelection,
  setQueueItemPending,
} from './queue-review.logic';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { describe, expect, it } from 'vitest';

describe('queue review interactions', () => {
  it('derives j/k, arrows, Enter and Space from the canonical registry', () => {
    const shortcuts = buildQueueNavigationShortcuts(enhancedKeyboardShortcuts);
    const bindings = shortcuts.map((shortcut) => `${shortcut.keys.join('+')}:${shortcut.action}`);

    expect(bindings).toEqual(
      expect.arrayContaining([
        'j:focusNext',
        'ArrowDown:focusNext',
        'k:focusPrevious',
        'ArrowUp:focusPrevious',
        'Enter:openFocused',
        'space:pageDown',
      ]),
    );
    expect(shortcuts.every((shortcut) => shortcut.scope === 'queue' && !shortcut.ignore)).toBe(
      true,
    );
  });

  it('moves a roving selection without overflowing either end', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveQueueSelection(items, null, 'next')).toBe('a');
    expect(moveQueueSelection(items, 'a', 'next')).toBe('b');
    expect(moveQueueSelection(items, 'c', 'next')).toBe('c');
    expect(moveQueueSelection(items, null, 'previous')).toBe('c');
    expect(moveQueueSelection(items, 'a', 'previous')).toBe('a');
  });

  it('tracks pending state per item so another item remains actionable', () => {
    const firstPending = setQueueItemPending({}, 'draft-a', 'approve');
    const parallelPending = setQueueItemPending(firstPending, 'draft-b', 'retry');

    expect(parallelPending).toEqual({ 'draft-a': 'approve', 'draft-b': 'retry' });
    expect(clearQueueItemPending(parallelPending, 'draft-a')).toEqual({ 'draft-b': 'retry' });
  });

  it('gives each review row a subject and status accessible name', () => {
    expect(
      buildQueueItemAccessibleName({
        subject: 'Follow-up client',
        fallbackSubject: 'Untitled',
        status: 'Draft ready',
      }),
    ).toBe('Follow-up client, Draft ready');
    expect(
      buildQueueItemAccessibleName({
        subject: '',
        fallbackSubject: 'Untitled',
        status: 'Failed',
      }),
    ).toBe('Untitled, Failed');
  });
});
