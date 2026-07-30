/**
 * Cible d'avance post-archive (CUA round 3, échec 4).
 *
 * L'ancien chemin (mailNavigationCommandAtom → effet → focusedIndex) était
 * asynchrone et dépendait d'un focusedIndex souvent null (fil ouvert au clic) :
 * l'avance arrivait à 1,3-1,5 s. Ici la cible est calculée SYNCHRONIQUEMENT
 * depuis la liste courante, AVANT la suppression optimiste, et l'appelant pose
 * le threadId directement — le shell optimiste peint sujet/expéditeur sans
 * attendre.
 *
 * `focusedIndexAfter` est la position de la cible APRÈS retrait du fil archivé,
 * pour que j/k reprennent au bon endroit.
 */
export function selectArchiveAdvanceTarget<T extends { id: string }>(
  items: T[],
  currentId: string,
  direction: 'next' | 'previous',
): { targetId: string | null; focusedIndexAfter: number | null } {
  const index = items.findIndex((item) => item.id === currentId);
  if (index === -1) {
    // Fil courant hors liste (deep link, vue déjà rafraîchie) : premier de la vue.
    const fallback = items[0];
    return fallback
      ? { targetId: fallback.id, focusedIndexAfter: 0 }
      : { targetId: null, focusedIndexAfter: null };
  }
  const forward = items[index + 1] ?? null;
  const backward = items[index - 1] ?? null;
  const target = direction === 'next' ? (forward ?? backward) : (backward ?? forward);
  if (!target) return { targetId: null, focusedIndexAfter: null };
  const position = items.findIndex((item) => item.id === target.id);
  return { targetId: target.id, focusedIndexAfter: position > index ? position - 1 : position };
}
