import { pruneThreadFromListPages } from './prune-thread-cache';
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
