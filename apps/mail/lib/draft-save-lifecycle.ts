/**
 * Cycle de vie sauvegarde-de-brouillon vs fermeture du composer (CUA round 4,
 * échec 2).
 *
 * L'autosave (débounce 3 s) et la sauvegarde pré-envoi sont asynchrones : un
 * `drafts.create` parti AVANT la fermeture peut résoudre APRÈS — son
 * `setDraftId(id)` réécrivait alors l'URL purgée et ressuscitait l'état reply
 * sur staging. Contrat : après `markClosed()`, aucune sauvegarde ne démarre et
 * aucun résultat en vol n'est appliqué (ni draftId, ni snapshot).
 */
export interface DraftSaveLifecycle {
  /** `abandonedEmpty` : fermeture d'un composer VIDE — tout brouillon créé par une sauvegarde en vol est à supprimer. */
  markClosed(opts?: { abandonedEmpty?: boolean }): void;
  isClosed(): boolean;
  /** La fermeture était l'abandon d'un composer vide (compense les sauvegardes tardives). */
  wasAbandonedEmpty(): boolean;
  /** Une nouvelle sauvegarde (autosave, pré-envoi) peut-elle démarrer ? */
  canStartSave(): boolean;
  /** Le résultat d'une sauvegarde partie avant la fermeture peut-il écrire (draftId, URL) ? */
  canApplySaveResult(): boolean;
}

export function createDraftSaveLifecycle(): DraftSaveLifecycle {
  let closed = false;
  let abandonedEmpty = false;
  return {
    markClosed: (opts) => {
      closed = true;
      if (opts?.abandonedEmpty) abandonedEmpty = true;
    },
    isClosed: () => closed,
    wasAbandonedEmpty: () => abandonedEmpty,
    canStartSave: () => !closed,
    canApplySaveResult: () => !closed,
  };
}
