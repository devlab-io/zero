import { armOpeningKeyGuard, disarmOpeningKeyGuard } from '@/lib/hotkeys/opening-key-guard';
import { pureInsertedText } from './opening-key-guard-extension';
import { describe, expect, it, beforeEach } from 'vitest';

/** Transaction factice au format duck-typé qu'inspecte pureInsertedText. */
const insertStep = (text: string, at = 1) => ({
  from: at,
  to: at,
  slice: { content: { size: text.length, textBetween: () => text } },
});

const tr = (steps: unknown[], docChanged = true) => ({ docChanged, steps });

describe('pureInsertedText — extraction du texte inséré par une transaction', () => {
  beforeEach(() => disarmOpeningKeyGuard());

  it('insertion pure d’un caractère → le caractère', () => {
    expect(pureInsertedText(tr([insertStep('a')]))).toBe('a');
  });

  it('transaction sans changement de doc ou sans step → null', () => {
    expect(pureInsertedText(tr([], true))).toBeNull();
    expect(pureInsertedText(tr([insertStep('a')], false))).toBeNull();
  });

  it('remplacement (from ≠ to, une suppression) → null, jamais filtré', () => {
    expect(pureInsertedText(tr([{ from: 1, to: 3, slice: undefined }]))).toBeNull();
    expect(
      pureInsertedText(
        tr([{ from: 1, to: 3, slice: { content: { size: 1, textBetween: () => 'x' } } }]),
      ),
    ).toBeNull();
  });

  it('le filet ne consomme la garde que sur une insertion de texte', () => {
    // Scénario CUA : garde armée par le raccourci « a » ; une transaction
    // non-textuelle (sélection, décoration) passe sans consommer la garde ;
    // l'écho « a » qui suit — par N'IMPORTE quel chemin DOM — produit une
    // transaction d'insertion pure et sera identifié.
    armOpeningKeyGuard('a', 1_000);
    expect(pureInsertedText(tr([], true))).toBeNull(); // rien consommé
    expect(pureInsertedText(tr([insertStep('a')]))).toBe('a'); // l'écho est visible du filet
  });

  it('vraie frappe identique : keydown éditeur → désarmement → l’insertion passe', () => {
    armOpeningKeyGuard('a', 1_000);
    // handleDOMEvents.keydown (vraie frappe) désarme AVANT la transaction.
    disarmOpeningKeyGuard();
    const text = pureInsertedText(tr([insertStep('a')]));
    expect(text).toBe('a');
    // Garde désarmée : filterTransaction laisserait passer (shouldSuppress → false).
  });
});
