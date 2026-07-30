/**
 * Garde anti-écho de la touche d'ouverture (CUA round 3, échec 2).
 *
 * Un raccourci (a/r/f, l/v) monte une surface qui prend le focus pendant la
 * frappe même. Selon le moteur d'événements (frappe synthétique CDP incluse),
 * l'écho texte de CETTE touche peut atterrir dans l'éditeur/combobox
 * fraîchement focusé MALGRÉ le preventDefault du keydown — mesuré sur staging :
 * « a » littéral dans le corps du reply.
 *
 * Discriminant fiable, sans faux positif sur la vraie saisie : une vraie
 * frappe suivante émet TOUJOURS son propre keydown sur l'élément focusé ;
 * l'écho jamais (son keydown a ciblé la liste ou le body). Protocole :
 * - `armOpeningKeyGuard(clé)` dans le handler du raccourci ;
 * - keydown reçu par la surface → `disarmOpeningKeyGuard()` (vraie saisie) ;
 * - insertion de texte sans keydown préalable, égale à la clé, dans la
 *   fenêtre → écho, supprimée. Une seule décision par armement.
 */
const WINDOW_MS = 1500;

let pending: { key: string; armedAt: number } | null = null;

export function armOpeningKeyGuard(key: string, now: number = Date.now()): void {
  pending = { key, armedAt: now };
}

export function disarmOpeningKeyGuard(): void {
  pending = null;
}

/**
 * true ⇔ `text` est l'écho de la touche d'ouverture — à supprimer. Consomme la
 * garde quel que soit le verdict : la première insertion réelle (autre
 * caractère, ou après keydown) rend la surface à son comportement normal.
 */
export function shouldSuppressOpeningKey(text: string, now: number = Date.now()): boolean {
  if (!pending) return false;
  const { key, armedAt } = pending;
  pending = null;
  if (now - armedAt > WINDOW_MS) return false;
  return text === key;
}
