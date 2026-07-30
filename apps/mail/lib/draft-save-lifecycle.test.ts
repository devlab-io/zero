import { createDraftSaveLifecycle } from './draft-save-lifecycle';
import { describe, expect, it } from 'vitest';

/**
 * Course sauvegarde/fermeture (CUA round 4, échec 2) : un drafts.create parti
 * avant la fermeture résolvait après et réécrivait draftId dans l'URL purgée.
 */
describe('createDraftSaveLifecycle', () => {
  it('avant fermeture : sauvegardes et résultats passent', () => {
    const lc = createDraftSaveLifecycle();
    expect(lc.canStartSave()).toBe(true);
    expect(lc.canApplySaveResult()).toBe(true);
    expect(lc.wasAbandonedEmpty()).toBe(false);
  });

  it('race tardive : sauvegarde partie AVANT close, résolue APRÈS → résultat ignoré', () => {
    const lc = createDraftSaveLifecycle();
    // t0 : l'autosave démarre (autorisé)
    expect(lc.canStartSave()).toBe(true);
    // t1 : Escape ferme le composer
    lc.markClosed();
    // t2 : la promesse drafts.create résout — aucun setDraftId, aucune écriture d'URL
    expect(lc.canApplySaveResult()).toBe(false);
    // et aucune NOUVELLE sauvegarde ne peut partir
    expect(lc.canStartSave()).toBe(false);
  });

  it('abandon d’un composer vide → la sauvegarde tardive est à compenser (suppression)', () => {
    const lc = createDraftSaveLifecycle();
    lc.markClosed({ abandonedEmpty: true });
    expect(lc.canApplySaveResult()).toBe(false);
    expect(lc.wasAbandonedEmpty()).toBe(true);
  });

  it('confirmLeave (contenu conservé) : fermé mais pas un abandon-vide', () => {
    const lc = createDraftSaveLifecycle();
    lc.markClosed();
    expect(lc.isClosed()).toBe(true);
    expect(lc.wasAbandonedEmpty()).toBe(false);
  });
});
