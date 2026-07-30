/**
 * Garde anti-écho de la touche d'ouverture (CUA rounds 3-7, échec « a »).
 *
 * Un raccourci (a/r/f, l/v) monte une surface qui prend le focus pendant la
 * frappe même. Selon le moteur d'événements (frappe synthétique CDP/AX
 * comprise), l'écho de CETTE touche peut se réinjecter dans la surface — round
 * 7 a prouvé qu'il peut arriver comme un VRAI keydown sur l'éditeur focusé
 * (l'ancien discriminant « l'écho n'a jamais de keydown » désarmait alors la
 * garde et laissait passer l'insertion).
 *
 * Discriminant déterministe : une fenêtre de grâce très courte ancrée sur le
 * PREMIER focus de la surface après l'armement.
 * - keydown de la MÊME touche dans la fenêtre de grâce post-focus → écho :
 *   il ne désarme pas, il est supprimé à la source (aucune insertion) ;
 * - toute autre touche, ou la même touche APRÈS la fenêtre → vraie saisie :
 *   désarme, tout passe (une vraie « a » après stabilisation est acceptée —
 *   humainement, on ne tape pas < 250 ms après l'apparition du composer) ;
 * - insertion SANS keydown (chemins mutation/composition, round 4) → toujours
 *   couverte par les filets shouldSuppressOpeningKey (beforeinput,
 *   handleTextInput, filterTransaction).
 * Une seule décision par armement, dans tous les cas.
 */
const WINDOW_MS = 1500;
/** Fenêtre écho après le premier focus de la surface — un humain ne tape pas si vite après le mount. */
const FOCUS_GRACE_MS = 250;

/** Touches de modification : jamais une « vraie saisie », ne consomment pas la garde. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

let pending: { key: string; armedAt: number; surfaceFocusedAt: number | null } | null = null;

export function armOpeningKeyGuard(key: string, now: number = Date.now()): void {
  pending = { key, armedAt: now, surfaceFocusedAt: null };
}

export function disarmOpeningKeyGuard(): void {
  pending = null;
}

/**
 * À appeler quand la surface gardée (éditeur, combo) reçoit le focus. Seul le
 * PREMIER focus après l'armement ancre la fenêtre de grâce : un clic ultérieur
 * dans l'éditeur ne peut pas re-piéger une vraie frappe.
 */
export function markGuardSurfaceFocused(now: number = Date.now()): void {
  if (pending && pending.surfaceFocusedAt === null) pending.surfaceFocusedAt = now;
}

/**
 * Décision sur un keydown reçu par la surface gardée :
 * - `suppress` → c'est l'écho de la touche d'ouverture (même touche, fenêtre
 *   de grâce post-focus) — preventDefault, aucune insertion, garde consommée ;
 * - `pass` → vraie saisie (garde consommée) ou garde inactive.
 */
export function resolveGuardedKeydown(key: string, now: number = Date.now()): 'suppress' | 'pass' {
  if (!pending) return 'pass';
  if (MODIFIER_KEYS.has(key)) return 'pass';
  const { key: armedKey, armedAt, surfaceFocusedAt } = pending;
  if (now - armedAt > WINDOW_MS) {
    pending = null;
    return 'pass';
  }
  pending = null;
  if (key === armedKey && surfaceFocusedAt !== null && now - surfaceFocusedAt <= FOCUS_GRACE_MS) {
    return 'suppress';
  }
  return 'pass';
}

/**
 * true ⇔ `text` est l'écho de la touche d'ouverture arrivé SANS keydown
 * (mutation/composition) — à supprimer. Consomme la garde quel que soit le
 * verdict : la première insertion réelle rend la surface à son comportement
 * normal.
 */
export function shouldSuppressOpeningKey(text: string, now: number = Date.now()): boolean {
  if (!pending) return false;
  const { key, armedAt } = pending;
  pending = null;
  if (now - armedAt > WINDOW_MS) return false;
  return text === key;
}
