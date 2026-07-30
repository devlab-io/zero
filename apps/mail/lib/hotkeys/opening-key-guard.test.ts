import {
  armOpeningKeyGuard,
  disarmOpeningKeyGuard,
  shouldSuppressOpeningKey,
} from './opening-key-guard';
import { describe, expect, it, beforeEach } from 'vitest';

/**
 * Garde anti-écho de la touche d'ouverture (CUA round 3, échec 2) : le « a »
 * du raccourci replyAll atterrissait dans le corps TipTap malgré le
 * preventDefault du keydown. Contrat : l'écho (même clé, fenêtre courte, aucun
 * keydown sur la surface) est absorbé UNE fois ; toute vraie saisie passe.
 */
describe('opening-key-guard', () => {
  beforeEach(() => disarmOpeningKeyGuard());

  it("absorbe l'écho : même clé, dans la fenêtre, sans keydown préalable", () => {
    armOpeningKeyGuard('a', 1_000);
    expect(shouldSuppressOpeningKey('a', 1_600)).toBe(true);
    // Consommée : un « a » réellement tapé ensuite passe.
    expect(shouldSuppressOpeningKey('a', 1_650)).toBe(false);
  });

  it('laisse passer un caractère différent et consomme la garde', () => {
    armOpeningKeyGuard('r', 1_000);
    expect(shouldSuppressOpeningKey('b', 1_100)).toBe(false);
    // Un « r » tapé après coup n'est plus suspect.
    expect(shouldSuppressOpeningKey('r', 1_200)).toBe(false);
  });

  it('expire au-delà de la fenêtre', () => {
    armOpeningKeyGuard('f', 1_000);
    expect(shouldSuppressOpeningKey('f', 3_000)).toBe(false);
  });

  it('un keydown sur la surface (vraie frappe) désarme avant toute insertion', () => {
    armOpeningKeyGuard('v', 1_000);
    disarmOpeningKeyGuard();
    expect(shouldSuppressOpeningKey('v', 1_050)).toBe(false);
  });

  it('sans armement, aucune insertion n’est touchée', () => {
    expect(shouldSuppressOpeningKey('a')).toBe(false);
  });

  it('un réarmement remplace la garde précédente', () => {
    armOpeningKeyGuard('r', 1_000);
    armOpeningKeyGuard('a', 1_200);
    expect(shouldSuppressOpeningKey('r', 1_300)).toBe(false);
    // La garde « a » a été consommée par la décision ci-dessus (une seule
    // décision par armement) — l'écho tardif ne peut plus rien absorber.
    expect(shouldSuppressOpeningKey('a', 1_350)).toBe(false);
  });
});
