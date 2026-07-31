import { canReuseMailListPlaceholder } from './mail-list-placeholder';
import { describe, expect, it } from 'vitest';

describe('canReuseMailListPlaceholder', () => {
  it('keeps prior rows only inside the same folder', () => {
    const inboxKey = [
      ['mail', 'listThreads'],
      { input: { folder: 'inbox', q: '' }, type: 'infinite' },
    ] as const;

    expect(canReuseMailListPlaceholder(inboxKey, 'inbox')).toBe(true);
    expect(canReuseMailListPlaceholder(inboxKey, 'archive')).toBe(false);
  });

  it('refuses malformed or absent previous keys', () => {
    expect(canReuseMailListPlaceholder(undefined, 'inbox')).toBe(false);
    expect(canReuseMailListPlaceholder([['mail', 'listThreads']], 'inbox')).toBe(false);
  });
});
