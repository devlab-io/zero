import {
  armOpeningKeyGuard,
  disarmOpeningKeyGuard,
  markGuardSurfaceFocused,
  resolveGuardedKeydown,
  shouldSuppressOpeningKey,
} from './opening-key-guard';
import { describe, expect, it, beforeEach } from 'vitest';

/**
 * Garde anti-écho de la touche d'ouverture (CUA rounds 3-7). Round 7 a prouvé
 * que l'écho peut se réinjecter comme un VRAI keydown sur l'éditeur focusé :
 * le discriminant est une fenêtre de grâce courte (250 ms) ancrée sur le
 * premier focus de la surface après armement.
 */
describe('opening-key-guard', () => {
  beforeEach(() => disarmOpeningKeyGuard());

  it('intégration — séquence round 7 : écho keydown supprimé, puis vraie même touche acceptée', () => {
    // t0 : raccourci « a » → armement (thread-display-hotkeys)
    armOpeningKeyGuard('a', 1_000);
    // t+440 ms : l'éditeur monte et prend le focus (autofocus)
    markGuardSurfaceFocused(1_440);
    // t+450 ms : l'écho « a » arrive comme keydown SUR l'éditeur —
    // même touche, dans la fenêtre de grâce post-focus → supprimé à la
    // source, aucune insertion (preventDefault côté éditeur).
    expect(resolveGuardedKeydown('a', 1_450)).toBe('suppress');
    // La garde est consommée : l'utilisateur tape un VRAI « a » ensuite —
    // keydown accepté ET insertion non filtrée par les filets.
    expect(resolveGuardedKeydown('a', 1_800)).toBe('pass');
    expect(shouldSuppressOpeningKey('a', 1_810)).toBe(false);
  });

  it('vraie même touche APRÈS stabilisation (hors grâce post-focus) → acceptée', () => {
    armOpeningKeyGuard('a', 1_000);
    markGuardSurfaceFocused(1_200);
    // 400 ms après le focus : humainement une vraie frappe → pass + désarme.
    expect(resolveGuardedKeydown('a', 1_600)).toBe('pass');
    expect(shouldSuppressOpeningKey('a', 1_610)).toBe(false);
  });

  it('autre touche dans la grâce → vraie saisie, désarme, tout passe ensuite', () => {
    armOpeningKeyGuard('r', 1_000);
    markGuardSurfaceFocused(1_100);
    expect(resolveGuardedKeydown('b', 1_110)).toBe('pass');
    expect(shouldSuppressOpeningKey('r', 1_120)).toBe(false);
  });

  it('touches de modification : ne consomment jamais la garde', () => {
    armOpeningKeyGuard('a', 1_000);
    markGuardSurfaceFocused(1_100);
    expect(resolveGuardedKeydown('Shift', 1_105)).toBe('pass');
    // La garde est toujours armée : l'écho qui suit est bien supprimé.
    expect(resolveGuardedKeydown('a', 1_110)).toBe('suppress');
  });

  it('écho SANS keydown (mutation/composition, round 4) : les filets d’insertion couvrent toujours', () => {
    armOpeningKeyGuard('a', 1_000);
    markGuardSurfaceFocused(1_440);
    expect(shouldSuppressOpeningKey('a', 1_450)).toBe(true);
    expect(shouldSuppressOpeningKey('a', 1_460)).toBe(false); // consommée
  });

  it('sans focus marqué, un keydown même-touche est une vraie saisie (contexte hors surface)', () => {
    armOpeningKeyGuard('a', 1_000);
    expect(resolveGuardedKeydown('a', 1_050)).toBe('pass');
  });

  it('seul le PREMIER focus après armement ancre la grâce — un clic ultérieur ne re-piège pas', () => {
    armOpeningKeyGuard('a', 1_000);
    markGuardSurfaceFocused(1_100);
    // Clic dans l'éditeur bien plus tard : n'écrase pas l'ancre.
    markGuardSurfaceFocused(2_000);
    // 2 010 : à 910 ms du premier focus → hors grâce → vraie saisie.
    expect(resolveGuardedKeydown('a', 2_010)).toBe('pass');
  });

  it('fenêtre d’armement expirée → plus aucune suppression', () => {
    armOpeningKeyGuard('f', 1_000);
    markGuardSurfaceFocused(2_400);
    expect(resolveGuardedKeydown('f', 2_600)).toBe('pass');
    armOpeningKeyGuard('f', 1_000);
    expect(shouldSuppressOpeningKey('f', 3_000)).toBe(false);
  });

  it('disarmOpeningKeyGuard (picker) : désarmement inconditionnel conservé', () => {
    armOpeningKeyGuard('v', 1_000);
    disarmOpeningKeyGuard();
    expect(resolveGuardedKeydown('v', 1_010)).toBe('pass');
    expect(shouldSuppressOpeningKey('v', 1_020)).toBe(false);
  });

  it('un réarmement remplace la garde précédente (nouvelle ancre de focus)', () => {
    armOpeningKeyGuard('r', 1_000);
    markGuardSurfaceFocused(1_050);
    armOpeningKeyGuard('a', 2_000);
    markGuardSurfaceFocused(2_300);
    expect(resolveGuardedKeydown('a', 2_310)).toBe('suppress');
  });
});
