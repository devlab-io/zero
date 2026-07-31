/**
 * Nettoyage direct des clés reply dans l'URL (CUA round 5, échec A).
 *
 * La purge nuqs (useQueryStates) applique l'état client immédiatement mais son
 * écriture d'URL passe par la file/l'adaptateur React Router — mesurée ~3 s en
 * retard sur staging (mode/activeReplyId/draftId encore dans l'URL, UI fermée).
 * Ces helpers permettent une écriture directe `history.replaceState` (nuqs v2
 * patche history et se resynchronise) et la VÉRIFICATION périodique bornée qui
 * ré-applique le nettoyage si une écriture retardataire ressuscite les clés.
 */
export const REPLY_STATE_KEYS = ['mode', 'activeReplyId', 'draftId', 'picker'] as const;

/**
 * La search string sans les clés reply, ou null si elle est déjà propre.
 * `threadId` et toutes les autres clés sont conservés tels quels.
 */
export function stripReplyStateFromSearch(search: string): string | null {
  return replaceThreadAndStripReplyState(search);
}

/**
 * Purge reply state and optionally replace `threadId` in the same synchronous
 * URL write. This is the navigation-critical counterpart to the asynchronous
 * nuqs state update used by `useReplyStatePurge`.
 */
export function replaceThreadAndStripReplyState(
  search: string,
  threadId?: string | null,
): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  let changed = false;
  for (const key of REPLY_STATE_KEYS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (threadId !== undefined) {
    if (threadId === null) {
      if (params.has('threadId')) {
        params.delete('threadId');
        changed = true;
      }
    } else if (params.get('threadId') !== threadId) {
      params.set('threadId', threadId);
      changed = true;
    }
  }
  if (!changed) return null;
  const next = params.toString();
  return next ? `?${next}` : '';
}

// --- Marqueur de réouverture -----------------------------------------------------
// La boucle de vérification post-purge ne doit jamais avaler une NOUVELLE
// ouverture volontaire de reply (r/a/f pendant la fenêtre de retry) : les
// handlers d'ouverture posent ce marqueur, la boucle s'arrête dès qu'il est
// postérieur au début de la purge.
let replyOpenedAt = 0;

export function markReplyOpened(now: number = Date.now()): void {
  replyOpenedAt = now;
}

export function wasReplyOpenedSince(since: number): boolean {
  return replyOpenedAt > since;
}
