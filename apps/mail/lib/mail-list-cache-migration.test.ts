import { seedMailListPageSizeMigration } from './mail-list-cache-migration';
import { MAIL_LIST_PAGE_SIZE } from './mail-pagination';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

const OLD_INBOX_KEY = [
  ['mail', 'listThreads'],
  { input: { q: '', folder: 'inbox', labelIds: [] }, type: 'infinite' },
] as const;

const NEW_INBOX_KEY = [
  ['mail', 'listThreads'],
  {
    input: { q: '', folder: 'inbox', labelIds: [], maxResults: MAIL_LIST_PAGE_SIZE },
    type: 'infinite',
  },
] as const;

const listData = (id: string) => ({
  pages: [{ threads: [{ id }], nextPageToken: 'p2' }],
  pageParams: [''],
});

describe('seedMailListPageSizeMigration (ancienne clé 20 → clé pages de 50)', () => {
  it('recopie le snapshot persisté vers la nouvelle clé en préservant son âge', () => {
    const queryClient = new QueryClient();
    const persistedAt = Date.now() - 6 * 60 * 1000;
    queryClient.setQueryData(OLD_INBOX_KEY, listData('old-row'), { updatedAt: persistedAt });

    const seeded = seedMailListPageSizeMigration(queryClient);

    expect(seeded).toBe(1);
    expect(queryClient.getQueryData(NEW_INBOX_KEY)).toEqual(listData('old-row'));
    // L'âge est préservé : la réconciliation stale-only reste honnête (un
    // snapshot de 6 min est stale → un refetch d'arrière-plan aura lieu).
    expect(queryClient.getQueryState(NEW_INBOX_KEY)?.dataUpdatedAt).toBe(persistedAt);
  });

  it('n’écrase JAMAIS une donnée déjà présente sous la nouvelle clé (idempotent)', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(OLD_INBOX_KEY, listData('old-row'));
    queryClient.setQueryData(NEW_INBOX_KEY, listData('fresh-row'));

    const seeded = seedMailListPageSizeMigration(queryClient);

    expect(seeded).toBe(0);
    expect(queryClient.getQueryData(NEW_INBOX_KEY)).toEqual(listData('fresh-row'));
  });

  it('ignore drafts et recherche : leur clé n’a pas changé (défaut serveur)', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      [
        ['mail', 'listThreads'],
        { input: { q: '', folder: 'draft', labelIds: [] }, type: 'infinite' },
      ],
      listData('draft-row'),
    );
    queryClient.setQueryData(
      [
        ['mail', 'listThreads'],
        { input: { q: 'facture', folder: 'inbox', labelIds: [] }, type: 'infinite' },
      ],
      listData('search-row'),
    );

    expect(seedMailListPageSizeMigration(queryClient)).toBe(0);
  });
});
