import { resolveMailListNavigation } from './mail-list-navigation';
import { describe, expect, it } from 'vitest';
import { FOLDERS } from '@/lib/utils';

describe('mail list navigation target', () => {
  it('opens a selected draft through draftId and the compose surface', () => {
    expect(resolveMailListNavigation(FOLDERS.DRAFT, 'draft-1')).toEqual({
      threadId: null,
      draftId: 'draft-1',
      composeOpen: 'true',
    });
  });

  it('clears the draft selection without opening a regular thread reader', () => {
    expect(resolveMailListNavigation(FOLDERS.DRAFT, null)).toEqual({
      threadId: null,
      draftId: null,
      composeOpen: null,
    });
  });

  it('keeps regular folders on the thread reader path', () => {
    expect(resolveMailListNavigation(FOLDERS.INBOX, 'thread-1')).toEqual({
      threadId: 'thread-1',
      draftId: null,
      composeOpen: undefined,
    });
  });
});
