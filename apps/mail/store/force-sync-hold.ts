import type { ForceSyncSnapshot } from '@/lib/force-sync-hold-selector';
import { atom } from 'jotai';

// Devlab (UX) : verrou perf forceSync (~40-45s de repeuplement DO mesuré,
// wrangler tail 25/07/2026) — état mémoire seul (pas de persistance idb/atomWithStorage) :
// un reload pendant le hold doit retomber sur l'état réel du serveur, pas sur un
// instantané périmé. Suit le pattern jotai module-level déjà utilisé par
// `components/mail/use-do-state.ts` et `store/backgroundQueue.ts`.

/** Safety net: if the repopulate workflow stalls or errors, don't hold forever. */
const HOLD_TIMEOUT_MS = 90 * 1000;

export interface ForceSyncHoldState {
  active: boolean;
  /** Latch: has an empty response been observed since this hold armed? See
   * `lib/force-sync-hold-selector.ts` (`nextForceSyncHoldPhase`) for why this
   * gates deactivation. Global to the hold, not per-view. */
  purgeObserved: boolean;
  snapshots: ForceSyncSnapshot<unknown>[];
  /** Generation counter: lets a stale 90s timeout recognise it's been
   * superseded by a newer `activate` call (e.g. a second forceSync click
   * during an active hold) and no-op instead of clobbering it. */
  token: number;
}

const initialState: ForceSyncHoldState = {
  active: false,
  purgeObserved: false,
  snapshots: [],
  token: 0,
};

export const forceSyncHoldAtom = atom<ForceSyncHoldState>(initialState);

/**
 * Arms the hold with one snapshot per active `mail.listThreads` view. Called
 * from nav-user.tsx's `onMutate` — deliberately NOT `onSuccess`, since the
 * mutation itself resolves in ~4-5s while the server-side repopulate workflow
 * it kicks off keeps running for ~40s behind it.
 */
export const activateForceSyncHoldAtom = atom(
  null,
  (get, set, snapshots: ForceSyncSnapshot<unknown>[]) => {
    const token = get(forceSyncHoldAtom).token + 1;
    set(forceSyncHoldAtom, { active: true, purgeObserved: false, snapshots, token });
    setTimeout(() => {
      // No-op if a later `activate` (second forceSync click) already bumped
      // the token — that newer hold owns its own timeout.
      set(forceSyncHoldAtom, (current) =>
        current.token === token ? { ...initialState, token } : current,
      );
    }, HOLD_TIMEOUT_MS);
  },
);

/** Marks that an empty response has been observed — the purge reached the client. */
export const observeForceSyncPurgeAtom = atom(null, (_get, set) => {
  set(forceSyncHoldAtom, (current) =>
    current.active ? { ...current, purgeObserved: true } : current,
  );
});

/** Disarms the hold — a fresh non-empty response, following an observed purge, proved the view repopulated. */
export const deactivateForceSyncHoldAtom = atom(null, (get, set) => {
  set(forceSyncHoldAtom, { ...initialState, token: get(forceSyncHoldAtom).token });
});
