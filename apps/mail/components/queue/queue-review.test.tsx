import {
  buildQueueItemAccessibleName,
  clearQueueItemPending,
  setQueueItemPending,
} from './queue-review.logic';
import { resolveQueueSelectionId } from '@/lib/hotkeys/queue-navigation';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { describe, expect, it } from 'vitest';

describe('queue review interactions', () => {
  it('derives j/k, arrows, Enter and Space from the canonical registry', () => {
    const shortcuts = enhancedKeyboardShortcuts.filter((shortcut) => shortcut.scope === 'queue');
    const bindings = shortcuts.map((shortcut) => `${shortcut.keys.join('+')}:${shortcut.action}`);

    expect(bindings).toEqual(
      expect.arrayContaining([
        'j:focusNext',
        'ArrowDown:focusNext',
        'k:focusPrevious',
        'ArrowUp:focusPrevious',
        'Enter:openSelected',
        'Space:openSelected',
      ]),
    );
    expect(shortcuts.every((shortcut) => shortcut.scope === 'queue' && !shortcut.ignore)).toBe(
      true,
    );
  });

  it('moves and wraps the roving selection through the production resolver', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(resolveQueueSelectionId(items, null, 'next')).toBe('a');
    expect(resolveQueueSelectionId(items, 'a', 'next')).toBe('b');
    expect(resolveQueueSelectionId(items, 'c', 'next')).toBe('a');
    expect(resolveQueueSelectionId(items, null, 'previous')).toBe('c');
    expect(resolveQueueSelectionId(items, 'a', 'previous')).toBe('c');
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
