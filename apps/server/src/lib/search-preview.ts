/**
 * Normalisation de la requête pour la PRÉVIEW de recherche projection-first
 * (CUA 2026-07-30, obs 3 — reliquat serveur).
 *
 * Contrat : la préview est servie par la projection DO (`threads.latest_subject`
 * / `latest_sender`, LIKE substring) pendant que Gmail `q` reste la réponse
 * authoritative. Elle ne sait honorer QUE du texte littéral : toute requête
 * portant un opérateur Gmail (`from:x`, `is:unread`, `after:2026/01/01`, …)
 * est hors de sa sémantique → on renvoie '' et la route répond une page vide,
 * que le client interprète comme « pas de préview » (fallback comportement
 * actuel, vue précédente + bandeau). Un `Re: sujet` (deux-points suivi d'un
 * espace) n'est PAS un opérateur.
 *
 * `%` et `_` sont depuis le pliage accent-insensible traités LITTÉRALEMENT par
 * la couche DB (motif échappé + `ESCAPE '\'`, voir lib/search-fold.ts) : ils ne
 * sont plus des jokers vivants et n'ont plus à être rejetés ici — « 100% » est
 * une préview substring valide.
 */
const GMAIL_OPERATOR = /(^|\s)[a-zA-Z_]+:[^\s]/;

/**
 * Texte de recherche utilisable par la préview projection, ou '' si la requête
 * dépasse la sémantique substring (opérateurs). Les guillemets englobants d'une
 * phrase exacte sont retirés : LIKE %phrase% EST déjà la recherche exacte.
 */
export function previewSearchText(q: string): string {
  let text = q.trim();
  const quoted =
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('«') && text.endsWith('»')));
  if (quoted) text = text.slice(1, -1).trim();
  if (!text || GMAIL_OPERATOR.test(text)) return '';
  return text;
}
