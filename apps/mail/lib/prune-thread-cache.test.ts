import { pruneThreadFromListPages } from './prune-thread-cache';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

describe('pruneThreadFromListPages — retrait chirurgical d’une ligne du cache (CUA round 6)', () => {
  const data = {
    pages: [
      { threads: [{ id: 'd1' }, { id: 'd2' }], nextPageToken: 'p2' },
      { threads: [{ id: 'd3' }], nextPageToken: null },
    ],
  };

  it('retire exactement la ligne visée, les autres pages/lignes intactes par référence', () => {
    const pruned = pruneThreadFromListPages(data, 'd2');
    expect(pruned?.pages[0].threads).toEqual([{ id: 'd1' }]);
    expect(pruned?.pages[0].nextPageToken).toBe('p2');
    // page sans la cible : même référence (pas de re-render inutile)
    expect(pruned?.pages[1]).toBe(data.pages[1]);
  });

  it('id absent → données par identité (aucune écriture de cache)', () => {
    expect(pruneThreadFromListPages(data, 'inconnu')).toBe(data);
  });

  it('cache vide ou non initialisé → intact', () => {
    expect(pruneThreadFromListPages(undefined, 'd1')).toBeUndefined();
    const empty = { pages: [] };
    expect(pruneThreadFromListPages(empty, 'd1')).toBe(empty);
  });
});

describe('portée de la purge — draft uniquement (revue Codex round 6)', () => {
  it('deux caches partagent le même id : seule la query du dossier draft est prunée', () => {
    // QueryClient RÉEL : on teste la sémantique de matching partiel de
    // react-query sur les clés tRPC telles que produites au runtime
    // ([['mail','listThreads'], { input, type: 'infinite' }]).
    const qc = new QueryClient();
    const key = (folder: string) => [
      ['mail', 'listThreads'],
      { input: { q: '', folder, labelIds: [] }, type: 'infinite' },
    ];
    const pages = { pages: [{ threads: [{ id: 'partage-1' }, { id: 'autre' }] }] };
    qc.setQueryData(key('draft'), pages);
    qc.setQueryData(key('inbox'), pages);
    qc.setQueryData(key('sent'), pages);

    // La clé de portée exacte utilisée par optimisticDeleteDraft :
    // infiniteQueryKey({ folder: 'draft' }) — input PARTIEL, toutes les
    // variantes q/labels du dossier draft, rien d'autre.
    qc.setQueriesData(
      { queryKey: [['mail', 'listThreads'], { input: { folder: 'draft' }, type: 'infinite' }] },
      (data: { pages: { threads: { id: string }[] }[] } | undefined) =>
        pruneThreadFromListPages(data, 'partage-1'),
    );

    expect(qc.getQueryData(key('draft'))).toEqual({
      pages: [{ threads: [{ id: 'autre' }] }],
    });
    // Inbox et Sent gardent le fil (exigence CUA : WHOOP reste en Inbox).
    expect(qc.getQueryData(key('inbox'))).toBe(pages);
    expect(qc.getQueryData(key('sent'))).toBe(pages);
    qc.clear();
  });

  it('une variante draft avec recherche/labels est aussi prunée (input partiel)', () => {
    const qc = new QueryClient();
    const searchKey = [
      ['mail', 'listThreads'],
      { input: { q: 'whoop', folder: 'draft', labelIds: ['x'] }, type: 'infinite' },
    ];
    qc.setQueryData(searchKey, { pages: [{ threads: [{ id: 'd1' }] }] });
    qc.setQueriesData(
      { queryKey: [['mail', 'listThreads'], { input: { folder: 'draft' }, type: 'infinite' }] },
      (data: { pages: { threads: { id: string }[] }[] } | undefined) =>
        pruneThreadFromListPages(data, 'd1'),
    );
    expect(qc.getQueryData(searchKey)).toEqual({ pages: [{ threads: [] }] });
    qc.clear();
  });
});
