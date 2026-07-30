import { selectArchiveAdvanceTarget } from './archive-advance';
import { describe, expect, it } from 'vitest';

/**
 * Avance post-archive synchrone (CUA round 3, échec 4) : la cible est choisie
 * AVANT la suppression optimiste, et `focusedIndexAfter` est sa position dans
 * la liste APRÈS retrait du fil archivé (pour que j/k reprennent juste).
 */
describe('selectArchiveAdvanceTarget', () => {
  const items = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

  it('next au milieu → le suivant, qui prend la place du fil retiré', () => {
    expect(selectArchiveAdvanceTarget(items, 't2', 'next')).toEqual({
      targetId: 't3',
      focusedIndexAfter: 1,
    });
  });

  it('next en tête → le suivant, index 0', () => {
    expect(selectArchiveAdvanceTarget(items, 't1', 'next')).toEqual({
      targetId: 't2',
      focusedIndexAfter: 0,
    });
  });

  it('next en bout de liste → repli sur le précédent', () => {
    expect(selectArchiveAdvanceTarget(items, 't3', 'next')).toEqual({
      targetId: 't2',
      focusedIndexAfter: 1,
    });
  });

  it('previous → le précédent, qui garde son index', () => {
    expect(selectArchiveAdvanceTarget(items, 't2', 'previous')).toEqual({
      targetId: 't1',
      focusedIndexAfter: 0,
    });
  });

  it('previous en tête → repli sur le suivant', () => {
    expect(selectArchiveAdvanceTarget(items, 't1', 'previous')).toEqual({
      targetId: 't2',
      focusedIndexAfter: 0,
    });
  });

  it('dernier fil de la vue → aucune cible (état vide)', () => {
    expect(selectArchiveAdvanceTarget([{ id: 'seul' }], 'seul', 'next')).toEqual({
      targetId: null,
      focusedIndexAfter: null,
    });
  });

  it('fil courant hors liste (deep link) → premier de la vue, liste vide → null', () => {
    expect(selectArchiveAdvanceTarget(items, 'absent', 'next')).toEqual({
      targetId: 't1',
      focusedIndexAfter: 0,
    });
    expect(selectArchiveAdvanceTarget([], 'absent', 'next')).toEqual({
      targetId: null,
      focusedIndexAfter: null,
    });
  });
});
