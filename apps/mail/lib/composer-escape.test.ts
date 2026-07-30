import { resolveComposerEscape } from './composer-escape';
import { describe, expect, it } from 'vitest';

describe('resolveComposerEscape — Escape du composer (CUA 2026-07-30, échec 6)', () => {
  it('reply vide, focus dans le composer → close (aucun brouillon créé/envoyé)', () => {
    expect(
      resolveComposerEscape({ hasContent: false, hasDraftId: false, targetInsideComposer: true }),
    ).toBe('close');
    // Un brouillon serveur déjà existant mais un éditeur vidé se ferme aussi.
    expect(
      resolveComposerEscape({ hasContent: false, hasDraftId: true, targetInsideComposer: true }),
    ).toBe('close');
  });

  it('contenu non vide sans brouillon serveur → confirm (garde anti-perte)', () => {
    expect(
      resolveComposerEscape({ hasContent: true, hasDraftId: false, targetInsideComposer: true }),
    ).toBe('confirm');
    // La garde vaut même hors focus composer (comportement historique conservé).
    expect(
      resolveComposerEscape({ hasContent: true, hasDraftId: false, targetInsideComposer: false }),
    ).toBe('confirm');
  });

  it('vide, focus hors composer → ignore (les surfaces par-dessus gardent leur Escape)', () => {
    expect(
      resolveComposerEscape({ hasContent: false, hasDraftId: false, targetInsideComposer: false }),
    ).toBe('ignore');
  });

  it('contenu avec brouillon serveur → ignore (déjà persisté, Radix peut fermer)', () => {
    expect(
      resolveComposerEscape({ hasContent: true, hasDraftId: true, targetInsideComposer: true }),
    ).toBe('ignore');
  });
});
