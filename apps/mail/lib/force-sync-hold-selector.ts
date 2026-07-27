/**
 * Devlab (UX) : verrou perf forceSync (issue tracker axe 4, mesuré via wrangler
 * tail le 25/07/2026) — `mail.forceSync` purge les tables du Durable Object côté
 * serveur AVANT qu'un workflow asynchrone (~40-45 s) les repeuple. Pendant cette
 * fenêtre, `listThreads` renvoie des pages vides et l'utilisateur qui vient de
 * demander une resynchro voit sa boîte vide ~40 s. Le correctif est côté client
 * uniquement (le serveur reste un factory reset assumé) : on tient la dernière
 * liste connue à l'écran tant que la resynchro n'a pas repeuplé.
 *
 * Ce module ne contient QUE la logique de sélection, pure et testable — le
 * cablage react-query/jotai (capture du instantané, activation/désactivation,
 * timeout de sécurité) vit dans `store/force-sync-hold.ts`.
 */

/** One captured view of `mail.listThreads` (one folder/search/labels combination). */
export interface ForceSyncSnapshot<T> {
  /** react-query `hashKey` of the exact queryKey this snapshot was captured for. */
  hash: string;
  /** Flattened thread refs at the moment forceSync was triggered. */
  items: T[];
}

export interface ForceSyncHoldSelectionInput<T> {
  /** Whether a forceSync hold is currently armed. */
  active: boolean;
  /** The current (possibly empty, mid-resync) list from the live query. */
  freshItems: T[];
  /** The snapshot captured for the view currently being rendered, if any. */
  snapshotItems: T[] | undefined;
}

/**
 * Chooses what to render: the live list, unless the hold is active, the live
 * list came back empty (resync in progress), and a non-empty snapshot exists
 * for this exact view — in which case the snapshot is shown instead.
 */
export function selectForceSyncHoldItems<T>({
  active,
  freshItems,
  snapshotItems,
}: ForceSyncHoldSelectionInput<T>): T[] {
  if (active && freshItems.length === 0 && snapshotItems && snapshotItems.length > 0) {
    return snapshotItems;
  }
  return freshItems;
}

export type ForceSyncHoldPhaseTransition = 'observe-purge' | 'deactivate' | 'none';

export interface ForceSyncHoldPhaseInput {
  /** Whether a forceSync hold is currently armed. */
  active: boolean;
  /** Whether an empty response has already been observed since the hold armed. */
  purgeObserved: boolean;
  /** Item count of the most recent live (non-substituted) response. */
  freshItemsLength: number;
}

/**
 * The server purges the DO BEFORE it repopulates, but the purge itself only
 * reaches the client on its next fetch — at the instant of the click, the
 * cache still holds the OLD, non-empty list (server state and client cache
 * are not the same clock). Deactivating the hold the moment `freshItemsLength
 * > 0` would therefore disarm it immediately, on that still-stale pre-purge
 * data, before the empty response the hold exists to bridge ever arrives.
 *
 * The hold may only deactivate on a non-empty response that follows an
 * OBSERVED empty one — i.e. a genuine repopulate, not pre-purge leftovers.
 * `purgeObserved` is the latch that encodes "we have seen the empty page";
 * it is global to the hold (not per-view — see `store/force-sync-hold.ts`).
 * If the repopulate is so fast the client never observes an empty response,
 * the hold simply rides out the 90s safety timeout — harmless, since
 * `selectForceSyncHoldItems` only ever substitutes on an empty fresh response.
 */
export function nextForceSyncHoldPhase({
  active,
  purgeObserved,
  freshItemsLength,
}: ForceSyncHoldPhaseInput): ForceSyncHoldPhaseTransition {
  if (!active) return 'none';
  if (!purgeObserved && freshItemsLength === 0) return 'observe-purge';
  if (purgeObserved && freshItemsLength > 0) return 'deactivate';
  return 'none';
}

/** Finds the snapshot captured for the exact view (queryKey hash) being rendered. */
export function findForceSyncSnapshot<T>(
  snapshots: ForceSyncSnapshot<T>[],
  currentHash: string,
): T[] | undefined {
  return snapshots.find((snapshot) => snapshot.hash === currentHash)?.items;
}
