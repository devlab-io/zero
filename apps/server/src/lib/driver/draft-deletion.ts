/**
 * Résolution d'identifiant pour la suppression de brouillon (CUA round 5, échec B).
 *
 * `users.drafts.delete` n'accepte QUE l'id de brouillon Gmail. Or les ids qui
 * circulent côté client peuvent dériver : id de MESSAGE du brouillon (fil,
 * projection, latestDraft) ou id de brouillon périmé après une mise à jour.
 * Le bouton « Delete draft » échouait alors en silence et la liste revenait
 * après sync. Contrat : tenter l'id tel quel ; sur 404, remapper via
 * drafts.list en n'acceptant QUE les correspondances exactes draft.id ou
 * message.id (jamais threadId ni sujet — on ne supprime jamais un autre
 * brouillon) ; plus aucune correspondance = déjà supprimé → succès idempotent.
 */

export interface DraftListEntry {
  id?: string | null;
  message?: { id?: string | null } | null;
}

/** L'id de brouillon Gmail à supprimer pour `requestedId`, ou null si introuvable (déjà supprimé). */
export function resolveDraftForDeletion(
  drafts: readonly DraftListEntry[],
  requestedId: string,
): string | null {
  for (const draft of drafts) {
    if (!draft.id) continue;
    if (draft.id === requestedId || draft.message?.id === requestedId) return draft.id;
  }
  return null;
}

/**
 * État du fil APRÈS suppression d'un brouillon (CUA round 6) : la projection DO
 * locale garde le fil marqué DRAFT tant qu'on ne l'informe pas. `messages` est
 * le fil Gmail post-suppression (format minimal : id + labelIds).
 */
export function threadHasOtherDrafts(
  messages: readonly { id?: string | null; labelIds?: string[] | null }[],
  deletedMessageId: string | null,
): boolean {
  return messages.some(
    (message) => message.id !== deletedMessageId && (message.labelIds ?? []).includes('DRAFT'),
  );
}

/**
 * Décision de nettoyage de la projection locale, exacte et minimale — aucun
 * autre brouillon ne doit être touché :
 * - fil disparu de Gmail (le brouillon était son seul message) → retirer le
 *   fil entier de la projection ;
 * - fil encore là sans AUCUN autre brouillon → retirer le label DRAFT du fil ;
 * - d'autres brouillons subsistent (les deux WHOOP restants) → ne rien toucher.
 */
export function planDraftProjectionCleanup(params: {
  threadId: string | null;
  threadGone: boolean;
  hasOtherDrafts: boolean;
}): { action: 'delete-thread' | 'remove-draft-label' | 'none'; threadId: string | null } {
  const { threadId, threadGone, hasOtherDrafts } = params;
  if (!threadId) return { action: 'none', threadId: null };
  if (threadGone) return { action: 'delete-thread', threadId };
  if (!hasOtherDrafts) return { action: 'remove-draft-label', threadId };
  return { action: 'none', threadId };
}

/** true ⇔ l'erreur Gmail est un « not found » (id inconnu/périmé) — candidate au remapping. */
export function isDraftNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as {
    code?: number | string;
    status?: number | string;
    response?: { status?: number };
    message?: string;
  };
  const codes = new Set([e.code, e.status, e.response?.status].map((c) => Number(c)));
  if (codes.has(404) || codes.has(400)) return true;
  return typeof e.message === 'string' && /not\s?found/i.test(e.message);
}
