import { describe, expect, it } from 'vitest';

import { computeArchiveAfterSend } from './send-and-archive';

describe('computeArchiveAfterSend (mod+shift+Enter — send and archive/done)', () => {
  it('archives the open thread in the current folder', () => {
    expect(computeArchiveAfterSend({ threadId: 'thread-1', folder: 'inbox' })).toEqual({
      threadIds: ['thread-1'],
      currentFolder: 'inbox',
      destination: 'archive',
    });
  });

  it('defaults the folder to inbox when the route has none', () => {
    expect(computeArchiveAfterSend({ threadId: 'thread-1', folder: '' })).toEqual({
      threadIds: ['thread-1'],
      currentFolder: 'inbox',
      destination: 'archive',
    });
    expect(computeArchiveAfterSend({ threadId: 'thread-1', folder: null })?.currentFolder).toBe(
      'inbox',
    );
  });

  it('keeps a non-default folder (e.g. a reply opened from sent)', () => {
    expect(computeArchiveAfterSend({ threadId: 't', folder: 'sent' })?.currentFolder).toBe('sent');
  });

  it('returns null for a brand-new compose with no open thread', () => {
    expect(computeArchiveAfterSend({ threadId: null, folder: 'inbox' })).toBeNull();
    expect(computeArchiveAfterSend({ threadId: undefined, folder: 'inbox' })).toBeNull();
    expect(computeArchiveAfterSend({ threadId: '   ', folder: 'inbox' })).toBeNull();
  });
});
