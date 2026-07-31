import {
  resolveThreadDisplayCaptureAction,
  selectAdjacentThreadTarget,
  shouldMarkAdjacentThreadRead,
} from './thread-navigation';
import { describe, expect, it } from 'vitest';

describe('selectAdjacentThreadTarget', () => {
  const items = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

  it('selects the direct next and previous rows', () => {
    expect(selectAdjacentThreadTarget(items, 't2', 'next')).toEqual({
      targetId: 't3',
      index: 2,
    });
    expect(selectAdjacentThreadTarget(items, 't2', 'previous')).toEqual({
      targetId: 't1',
      index: 0,
    });
  });

  it('does not wrap at a list edge or guess for a deep link', () => {
    expect(selectAdjacentThreadTarget(items, 't3', 'next')).toBeNull();
    expect(selectAdjacentThreadTarget(items, 't1', 'previous')).toBeNull();
    expect(selectAdjacentThreadTarget(items, 'missing', 'next')).toBeNull();
  });

  it('uses the focused row when the opened id is a message projection id', () => {
    expect(selectAdjacentThreadTarget(items, 'message-id', 'next', 1)).toEqual({
      targetId: 't3',
      index: 2,
    });
  });
});

describe('shouldMarkAdjacentThreadRead', () => {
  it('only mutates Gmail when the projection says the target is unread', () => {
    expect(shouldMarkAdjacentThreadRead({ unread: true })).toBe(true);
    expect(shouldMarkAdjacentThreadRead({ unread: false })).toBe(false);
    expect(shouldMarkAdjacentThreadRead({})).toBe(false);
    expect(shouldMarkAdjacentThreadRead()).toBe(false);
  });
});

describe('resolveThreadDisplayCaptureAction', () => {
  it('owns reader arrows and Escape without relying on an active hotkey scope', () => {
    expect(
      resolveThreadDisplayCaptureAction({
        key: 'ArrowDown',
        hasModifier: false,
        isTypingOrModal: false,
      }),
    ).toBe('next');
    expect(
      resolveThreadDisplayCaptureAction({
        key: 'ArrowUp',
        hasModifier: false,
        isTypingOrModal: false,
      }),
    ).toBe('previous');
    expect(
      resolveThreadDisplayCaptureAction({
        key: 'Escape',
        hasModifier: false,
        isTypingOrModal: false,
      }),
    ).toBe('close');
  });

  it('leaves modified and composer keys alone', () => {
    expect(
      resolveThreadDisplayCaptureAction({
        key: 'Escape',
        hasModifier: true,
        isTypingOrModal: false,
      }),
    ).toBeNull();
    expect(
      resolveThreadDisplayCaptureAction({
        key: 'Escape',
        hasModifier: false,
        isTypingOrModal: true,
      }),
    ).toBeNull();
  });
});
