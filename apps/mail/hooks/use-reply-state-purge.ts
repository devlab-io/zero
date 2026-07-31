import {
  replaceThreadAndStripReplyState,
  stripReplyStateFromSearch,
  wasReplyOpenedSince,
} from '@/lib/reply-search-params';
import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback } from 'react';

/** Cadence et borne de la boucle de vérification post-purge (~2,3 s au total). */
const VERIFY_INTERVAL_MS = 300;
const VERIFY_MAX_TICKS = 7;

/**
 * Purge ATOMIQUE de l'état reply (CUA rounds 3-5) : mode, activeReplyId,
 * draftId et picker tombent ensemble.
 *
 * - `useQueryStates` : état client + écriture d'URL canonique nuqs (une seule
 *   écriture, plus de divergence entre setters séparés) ;
 * - écriture DIRECTE `history.replaceState` : l'URL est propre IMMÉDIATEMENT —
 *   l'écriture nuqs, routée par l'adaptateur React Router, a été mesurée ~3 s
 *   en retard sur staging (round 5, échec A). nuqs v2 patche history et se
 *   resynchronise sur cette écriture ;
 * - boucle de vérification bornée : si une écriture retardataire ressuscite
 *   les clés, elles sont re-nettoyées ; la boucle s'arrête immédiatement si
 *   une NOUVELLE ouverture de reply survient (markReplyOpened, posé par les
 *   handlers r/a/f) — jamais d'avalement d'une intention réelle.
 *
 * `threadId` peut être joint à la même écriture (avance post-archive, épinglage
 * à la fermeture du reply) ; omis, il reste intouché.
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
    (opts?: { threadId: string | null }) => {
      const startedAt = Date.now();
      const result = setStates({
        mode: null,
        activeReplyId: null,
        draftId: null,
        picker: null,
        ...(opts ? { threadId: opts.threadId } : {}),
      });

      const writeSearch = (threadId?: string | null) => {
        const stripped =
          threadId === undefined
            ? stripReplyStateFromSearch(window.location.search)
            : replaceThreadAndStripReplyState(window.location.search, threadId);
        if (stripped === null) return;
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${stripped}${window.location.hash}`,
        );
      };
      // Navigation must be visible synchronously. Verification ticks below only
      // strip reply keys and intentionally preserve whatever thread a later key
      // press selected, so rapid ArrowDown presses can never be rolled back.
      writeSearch(opts?.threadId);

      let ticks = 0;
      const verify = () => {
        if (wasReplyOpenedSince(startedAt)) return;
        writeSearch();
        if (++ticks < VERIFY_MAX_TICKS) window.setTimeout(verify, VERIFY_INTERVAL_MS);
      };
      window.setTimeout(verify, VERIFY_INTERVAL_MS);

      return result;
    },
    [setStates],
  );
}
