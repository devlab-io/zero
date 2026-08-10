import { pruneSentDraftFromCache } from './draft-send-reconciliation';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

describe('draft send reconciliation', () => {
  it('purges the sent draft from every cached Drafts variant only', () => {
    const queryClient = new QueryClient();
    const draftsPrefix = [['mail', 'listThreads'], { input: { folder: 'draft' } }];
    const draftKey = [
      ['mail', 'listThreads'],
      { input: { q: '', folder: 'draft', labelIds: [] }, type: 'infinite' },
    ];
    const searchedDraftKey = [
      ['mail', 'listThreads'],
      { input: { q: 'BRAPAC', folder: 'draft', labelIds: [] }, type: 'infinite' },
    ];
    const inboxKey = [
      ['mail', 'listThreads'],
      { input: { q: '', folder: 'inbox', labelIds: [] }, type: 'infinite' },
    ];
    const data = {
      pages: [{ threads: [{ id: 'draft-brapac' }, { id: 'draft-other' }] }],
      pageParams: [''],
    };
    queryClient.setQueryData(draftKey, data);
    queryClient.setQueryData(searchedDraftKey, data);
    queryClient.setQueryData(inboxKey, data);

    pruneSentDraftFromCache(queryClient, draftsPrefix, 'draft-brapac');

    expect(queryClient.getQueryData(draftKey)).toEqual({
      pages: [{ threads: [{ id: 'draft-other' }] }],
      pageParams: [''],
    });
    expect(queryClient.getQueryData(searchedDraftKey)).toEqual({
      pages: [{ threads: [{ id: 'draft-other' }] }],
      pageParams: [''],
    });
    expect(queryClient.getQueryData(inboxKey)).toEqual(data);
  });
});
