import {
  QUERY_PERSIST_MAX_AGE_MS,
  selectQueriesForPersistence,
  shouldPersistQuery,
  type PersistableQuery,
} from './query-persistence';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import { MAIL_LIST_STALE_MS } from './mail-list-query';
import { describe, expect, it } from 'vitest';

function query(
  queryKey: readonly unknown[],
  data: unknown,
  dataUpdatedAt = 1,
  status = 'success',
): PersistableQuery {
  return { queryKey, state: { data, dataUpdatedAt, status } };
}

describe('query persistence policy', () => {
  it('persists successful lists and bounded thread details', () => {
    expect(shouldPersistQuery(query([['mail', 'listThreads']], { pages: [] }))).toBe(true);
    expect(shouldPersistQuery(query([['mail', 'get']], { id: 'thread-1' }))).toBe(true);
    expect(shouldPersistQuery(query(['email-content', 'message-1'], '<p>Hello</p>'))).toBe(true);
  });

  it('does not persist attachments, failed queries, or oversized details', () => {
    expect(
      shouldPersistQuery(query([['mail', 'getMessageAttachments']], [{ name: 'invoice.pdf' }])),
    ).toBe(false);
    expect(shouldPersistQuery(query([['mail', 'get']], null, 1, 'error'))).toBe(false);
    expect(shouldPersistQuery(query([['mail', 'get']], 'x'.repeat(3 * 1024 * 1024 + 1)))).toBe(
      false,
    );
  });

  it('keeps the newest detail queries inside the aggregate budget', () => {
    const details = Array.from({ length: 5 }, (_, index) =>
      query(
        [['mail', 'get'], { input: { id: `thread-${index}` } }],
        'x'.repeat(2 * 1024 * 1024),
        index,
      ),
    );

    const selected = selectQueriesForPersistence(details);

    expect(selected).toHaveLength(3);
    expect(selected.map((item) => item.state.dataUpdatedAt)).toEqual([4, 3, 2]);
  });

  it('r16 : le corps de 1,5 Mo est DANS la politique — jamais exclu, tronqué ni écrasé par un plus vieux', () => {
    const heavy = query(
      [['mail', 'get'], { input: { id: 'chatgpt-pro' } }],
      'x'.repeat(1_500_000),
      100,
    );
    expect(shouldPersistQuery(heavy)).toBe(true);

    // Budget 8 Mo servi par fraîcheur : le corps lourd fraîchement lu survit,
    // les anciens sortent — LRU par récence, croissance bornée.
    const older = Array.from({ length: 4 }, (_, index) =>
      query(
        [['mail', 'get'], { input: { id: `old-${index}` } }],
        'x'.repeat(2 * 1024 * 1024),
        index,
      ),
    );
    const selected = selectQueriesForPersistence([...older, heavy]);
    expect(selected[0]).toBe(heavy);
    const totalBytes = selected.reduce((sum, item) => sum + (item.state.data as string).length, 0);
    expect(totalBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('le snapshot persisté survit à plusieurs jours sans session (borne ≥ 7 jours)', () => {
    // Élimine la classe de cold boot multi-jour (cause POSSIBLE — non prouvée —
    // du spinner Drafts observé au premier clic post-reload, CUA r7). La
    // fraîcheur est gérée par la réconciliation stale-only, pas par l'expiration.
    expect(QUERY_PERSIST_MAX_AGE_MS).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });
});

describe('restore persistant réel — maxAge (r7b, sémantique de la lib vérifiée)', () => {
  const DRAFTS_KEY = [
    ['mail', 'listThreads'],
    { input: { q: '', folder: 'draft', labelIds: [] }, type: 'infinite' },
  ];
  const draftsData = {
    pages: [{ threads: [{ id: 'draft-row' }], nextPageToken: null }],
    pageParams: [''],
  };

  const makePersisted = (ageMs: number) => {
    const source = new QueryClient();
    source.setQueryData(DRAFTS_KEY, draftsData, { updatedAt: Date.now() - ageMs });
    return {
      timestamp: Date.now() - ageMs,
      buster: 'test-buster',
      clientState: dehydrate(source),
    };
  };

  const makePersister = (persisted: ReturnType<typeof makePersisted>) => ({
    persistClient: async () => {},
    restoreClient: async () => persisted,
    removeClient: async () => {},
  });

  it('un snapshot Drafts âgé de 25 h est REJETÉ à maxAge 24 h (cold boot du lendemain garanti)', async () => {
    const queryClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient,
      persister: makePersister(makePersisted(25 * 60 * 60 * 1000)),
      maxAge: 24 * 60 * 60 * 1000,
      buster: 'test-buster',
    });
    expect(queryClient.getQueryData(DRAFTS_KEY)).toBeUndefined();
  });

  it('le même snapshot de 25 h est RESTAURÉ à 7 jours, et reste stale pour la réconciliation 5 min', async () => {
    const queryClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient,
      persister: makePersister(makePersisted(25 * 60 * 60 * 1000)),
      maxAge: QUERY_PERSIST_MAX_AGE_MS,
      buster: 'test-buster',
    });
    // Le snapshot Drafts est disponible au premier clic…
    expect(queryClient.getQueryData(DRAFTS_KEY)).toEqual(draftsData);
    // …et son âge est préservé : bien au-delà du staleTime de 5 min, donc le
    // contrat stale-only (mail-list-query.test.ts) déclenchera UNE
    // réconciliation d'arrière-plan à l'entrée du dossier — la borne 7 jours
    // ne rend aucun snapshot « frais », elle ne fait que le garder peignable.
    const dataUpdatedAt = queryClient.getQueryState(DRAFTS_KEY)?.dataUpdatedAt ?? 0;
    expect(Date.now() - dataUpdatedAt).toBeGreaterThan(MAIL_LIST_STALE_MS);
  });
});
