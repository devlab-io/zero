import { usePrefetchThread } from '@/hooks/use-threads';
import { useEffect, useMemo } from 'react';

const PREFETCH_COUNT = 2;
const PREVIOUS_PREFETCH_COUNT = 1;
const INITIAL_PREFETCH_COUNT = 3;
// Deux lignes d'avance sous le viewport, pas plus : ces openThread spéculatifs
// partagent le DO avec la pagination de liste — l'élargir concurrencerait
// précisément ce que le scroll attend (contre-revue r6), et ArrowDown est déjà
// couvert par le prefetch lecteur (précédent + deux suivants).
const VISIBLE_PREFETCH_AHEAD_COUNT = 2;
const VISIBLE_PREFETCH_BATCH_SIZE = 2;

export type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

export function shouldPrefetchThreadBodies(connection?: NetworkInformation): boolean {
  if (connection?.saveData) return false;
  return !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}

/**
 * The open thread can be keyed by a projection/message id that is absent from
 * the list; the focused row is then the only truthful position. Shared by the
 * prefetch selectors and the reader-driven page extension in thread-display.
 */
export function resolveActiveThreadIndex(
  ids: readonly string[],
  currentId: string | null,
  currentIndexHint: number | null = null,
): number {
  if (!currentId) return -1;
  const matchingIndex = ids.findIndex((id) => id === currentId);
  if (matchingIndex !== -1) return matchingIndex;
  return currentIndexHint !== null && currentIndexHint >= 0 && currentIndexHint < ids.length
    ? currentIndexHint
    : -1;
}

export function selectNextThreadIds(
  ids: readonly string[],
  currentId: string | null,
  currentIndexHint: number | null = null,
): string[] {
  const currentIndex = resolveActiveThreadIndex(ids, currentId, currentIndexHint);
  if (currentIndex === -1) return [];

  return [...new Set(ids.slice(currentIndex + 1).filter(Boolean))].slice(0, PREFETCH_COUNT);
}

/**
 * Reader warm set: the two threads ArrowDown/j opens next plus the one
 * ArrowUp/k returns to. Shortwave serves k-navigation from cache (CUA
 * 2026-07-31 : 664 ms, corps stable ~249 ms) — the previous body must already
 * be local when the reader sits on a row, wherever it is in the list.
 */
export function selectAdjacentThreadIds(
  ids: readonly string[],
  currentId: string | null,
  currentIndexHint: number | null = null,
): string[] {
  const currentIndex = resolveActiveThreadIndex(ids, currentId, currentIndexHint);
  if (currentIndex === -1) return [];

  const nextIds = [...new Set(ids.slice(currentIndex + 1).filter(Boolean))].slice(
    0,
    PREFETCH_COUNT,
  );
  const previousIds = ids
    .slice(Math.max(0, currentIndex - PREVIOUS_PREFETCH_COUNT), currentIndex)
    .filter(Boolean)
    .reverse();

  return [...new Set([...nextIds, ...previousIds])].filter((id) => id !== currentId);
}

export function selectInitialThreadIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(0, INITIAL_PREFETCH_COUNT);
}

/**
 * Select every thread the virtual list says is visible, plus the next two rows.
 * The bounds are clamped because Virtua can briefly report the previous range
 * while a page is appended. Keeping this selector pure makes the scroll-driven
 * prefetch policy deterministic and cheap to test.
 */
export function selectVisibleThreadIds(
  ids: readonly string[],
  startIndex: number,
  endIndex: number,
): string[] {
  if (
    ids.length === 0 ||
    !Number.isFinite(startIndex) ||
    !Number.isFinite(endIndex) ||
    endIndex < 0 ||
    startIndex >= ids.length
  ) {
    return [];
  }

  const start = Math.max(0, Math.floor(startIndex));
  const end = Math.min(
    ids.length - 1,
    Math.max(start, Math.floor(endIndex)) + VISIBLE_PREFETCH_AHEAD_COUNT,
  );

  return [...new Set(ids.slice(start, end + 1).filter(Boolean))];
}

export type VisiblePrefetchPlan = {
  /** Corps à réchauffer, du haut du viewport vers l'overscan bas. */
  ids: string[];
  /** Clé de plage — mémorisée par l'appelant une fois la file achevée. */
  key: string;
  /** true : plage vide ou identique à la dernière achevée — zéro requête. */
  skip: boolean;
};

/**
 * Décision compléte du réchauffage visible : plage (visible + overscan), clé
 * de dédup et verdict skip. Pure pour prouver en test le préchargement des
 * lignes visibles/overscan ET l'absence de requêtes redondantes quand la
 * plage n'a pas bougé (mêmes bornes → skip, aucune file relancée).
 */
export function planVisibleThreadPrefetch(
  ids: readonly string[],
  startIndex: number,
  endIndex: number,
  lastCompletedKey: string,
): VisiblePrefetchPlan {
  const selected = selectVisibleThreadIds(ids, startIndex, endIndex);
  const key = selected.join(':');
  return { ids: selected, key, skip: key === '' || key === lastCompletedKey };
}

/**
 * Plan de préchargement au CLIC (r15a). Preuve CUA : après un scroll profond,
 * l'openThread du fil cliqué partait en même temps que la file spéculative des
 * lignes visibles ET que les deux suivants — le fil lu concourait avec sa
 * propre ouverture sur le DO mailbox. Ordre garanti ici : la file spéculative
 * est annulée SYNCHRONEMENT avant le moindre départ, le fil courant part
 * seul, et les deux suivants ne chauffent qu'une fois le courant résolu (ou
 * échoué — le useQuery du lecteur déduplique et couvre le fallback).
 */
export async function runClickPrefetchPlan({
  currentId,
  nextIds,
  prefetch,
  cancelSpeculative,
}: {
  currentId: string;
  nextIds: readonly string[];
  prefetch: (id: string) => Promise<unknown>;
  cancelSpeculative: () => void;
}): Promise<void> {
  cancelSpeculative();
  try {
    await prefetch(currentId);
  } catch {
    // L'échec du warm courant n'empêche pas de chauffer la lecture qui suit.
  }
  await Promise.all(nextIds.map((id) => prefetch(id).catch(() => undefined)));
}

export async function prefetchThreadIdsInBatches(
  ids: readonly string[],
  prefetch: (id: string) => Promise<unknown>,
  shouldContinue: () => boolean,
): Promise<boolean> {
  for (let index = 0; index < ids.length; index += VISIBLE_PREFETCH_BATCH_SIZE) {
    if (!shouldContinue()) return false;
    await Promise.all(ids.slice(index, index + VISIBLE_PREFETCH_BATCH_SIZE).map(prefetch));
  }

  return shouldContinue();
}

/**
 * Warm only the first three inbox rows once the lightweight list is ready.
 * This covers the first cold click after boot/account switch without reviving
 * the former per-row request storm; React Query deduplicates later hover/click
 * and adjacent-thread prefetches against the same cache keys.
 */
export function useInitialThreadPrefetch(threads: readonly { id: string }[], enabled: boolean) {
  const prefetchThread = usePrefetchThread();
  const selectedIds = useMemo(
    () => selectInitialThreadIds(threads.map((thread) => thread.id)),
    [threads],
  );

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!enabled || !shouldPrefetchThreadBodies(connection) || selectedIds.length === 0) return;

    void Promise.all(selectedIds.map((id) => prefetchThread(id).catch(() => undefined)));
  }, [enabled, prefetchThread, selectedIds]);
}

/**
 * Warms the two threads ArrowDown will open next and the one ArrowUp returns
 * to. The active thread must already be rendered before this hook is enabled.
 * All requests start in the effect's first tick so the tRPC batch link can
 * share one HTTP request and one getActiveConnection lookup, while the hard
 * limit (three bodies) prevents the old row storm.
 */
export function useAdjacentThreadPrefetch(
  threads: readonly { id: string }[],
  currentId: string | null,
  enabled: boolean,
  currentIndexHint: number | null = null,
) {
  const prefetchThread = usePrefetchThread();
  const selectedIds = useMemo(
    () =>
      selectAdjacentThreadIds(
        threads.map((thread) => thread.id),
        currentId,
        currentIndexHint,
      ),
    [currentId, currentIndexHint, threads],
  );

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!enabled || !shouldPrefetchThreadBodies(connection) || selectedIds.length === 0) return;

    void Promise.all(selectedIds.map((id) => prefetchThread(id).catch(() => undefined)));
  }, [enabled, prefetchThread, selectedIds]);
}
