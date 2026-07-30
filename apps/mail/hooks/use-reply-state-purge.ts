import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback } from 'react';

/**
 * Purge ATOMIQUE de l'état reply (CUA round 3, échec 3) : mode, activeReplyId,
 * draftId et picker tombent dans UNE seule écriture d'URL (useQueryStates).
 * Les setters séparés laissaient l'URL diverger de l'état client — composer
 * masqué mais `mode=replyAll&activeReplyId&draftId` conservés sur staging, et
 * le fil suivant s'ouvrait en reply.
 *
 * `threadId` peut être joint à la même écriture (avance post-archive) ; omis,
 * il reste intouché.
 */
export function useReplyStatePurge() {
  const [, setStates] = useQueryStates({
    threadId: parseAsString,
    mode: parseAsString,
    activeReplyId: parseAsString,
    draftId: parseAsString,
    picker: parseAsString,
  });
  return useCallback(
    (opts?: { threadId: string | null }) =>
      setStates({
        mode: null,
        activeReplyId: null,
        draftId: null,
        picker: null,
        ...(opts ? { threadId: opts.threadId } : {}),
      }),
    [setStates],
  );
}
