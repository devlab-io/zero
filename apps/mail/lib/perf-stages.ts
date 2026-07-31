/**
 * Jalons de performance par étapes (contrat shortwave-parity, item 6).
 *
 * Chaque étape clé du chemin critique pose un `performance.mark` préfixé
 * `zero:` ; les paires connues produisent automatiquement le
 * `performance.measure` correspondant. Zéro coût réseau, zéro log : les durées
 * se lisent dans DevTools (onglet Performance / `performance.getEntriesByType
 * ('measure')`) et par les runs CUA. Toujours silencieux en cas de marque
 * manquante (page rechargée au milieu d'un parcours).
 */

/** Étape → étape de départ de la mesure auto. */
const MEASURE_FROM: Record<string, string> = {
  'search:results-settled': 'search:applied',
  'thread:body-ready': 'thread:open',
};

export function markStage(
  stage: 'search:applied' | 'search:results-settled' | 'thread:open' | 'thread:body-ready',
): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(`zero:${stage}`);
    const from = MEASURE_FROM[stage];
    if (from) {
      performance.measure(`zero:${from}->${stage}`, `zero:${from}`, `zero:${stage}`);
    }
  } catch {
    // Marque de départ absente — parcours entamé avant le chargement : ignoré.
  }
}
