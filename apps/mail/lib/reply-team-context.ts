/**
 * Résolution PURE du contexte d'équipe du composeur de réponse (P15 final).
 *
 * Invariant : dès qu'un fil est partagé, la protection collision est ACTIVE —
 * il n'existe AUCUN état « plusieurs partages donc aucune protection ». À
 * partage unique, zéro friction (pas de sélecteur). À partages multiples, le
 * contexte est explicite : sélecteur compact accessible clavier, défaut
 * déterministe = premier partage (ordre serveur, createdAt croissant).
 */

export type ReplyShareOption = {
  id: string;
  teamId: string;
  teamName: string;
};

export type ReplyTeamContext = {
  /** Partage retenu pour l'intent + le préflight ; null si fil non partagé. */
  share: ReplyShareOption | null;
  /** true ⇢ plusieurs partages : le sélecteur DOIT être rendu. */
  requiresSelector: boolean;
};

export function resolveReplyTeamContext(
  shares: ReadonlyArray<ReplyShareOption>,
  selectedShareId: string | null,
): ReplyTeamContext {
  if (shares.length === 0) return { share: null, requiresSelector: false };
  if (shares.length === 1) return { share: shares[0]!, requiresSelector: false };
  // Multi-partage : la sélection explicite gagne si elle désigne toujours un
  // partage vivant ; sinon repli déterministe sur le premier — jamais null,
  // jamais de bypass silencieux de la protection.
  const selected = selectedShareId ? shares.find((share) => share.id === selectedShareId) : null;
  return { share: selected ?? shares[0]!, requiresSelector: true };
}
