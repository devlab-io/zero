/**
 * Normalisation déterministe du texte de recherche (contrat shortwave-parity,
 * item 2) : accents pliés vers l'ASCII, casse abaissée, espaces réduits.
 *
 * « réservation » doit trouver « Réservation » ET « reservation » (et
 * inversement) dans la préview projection comme dans le filtre synchrone du
 * premier paint. Le serveur applique la MÊME sémantique dans le LIKE SQLite de
 * la projection (apps/server/src/lib/search-fold.ts) : les deux côtés doivent
 * évoluer ensemble.
 */

/** Ligatures hors décomposition NFD (œ/æ ne portent pas de diacritique). */
const LIGATURES: Array<[RegExp, string]> = [
  [/œ/g, 'oe'],
  [/æ/g, 'ae'],
];

export function foldSearchText(text: string): string {
  let folded = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  folded = folded.toLowerCase();
  for (const [pattern, replacement] of LIGATURES) {
    folded = folded.replace(pattern, replacement);
  }
  return folded.replace(/\s+/g, ' ').trim();
}
