/*
 * gmail-sync-persist.ts — persistance d'un thread synchronisé (issue #31).
 *
 * Extrait ENV-FREE de la boucle de `sync-threads-workflow.ts` pour rester testable en Node
 * (le workflow importe `cloudflare:workers`). Reproduit FIDÈLEMENT la sémantique du pré-slice
 * `ThreadSyncWorker.syncThread` (routes/agent) : R2 écrit INCONDITIONNELLEMENT dès qu'un thread
 * est récupéré, PUIS le résumé DB seulement s'il existe un `latest` (message non-brouillon).
 * Un thread 100 % brouillons (`latest === undefined`) persiste donc quand même en R2.
 */

export interface SyncPersistDeps<L> {
  /** Persistance R2 du thread complet (clé/metadata gérées par l'appelant). */
  putR2: (threadId: string, full: unknown) => Promise<void>;
  /** Résumé DB du dernier message non-brouillon. */
  storeSummary: (threadId: string, latest: L) => Promise<void>;
}

/**
 * `'synced'`  → R2 écrit + résumé DB stocké (thread avec un message non-brouillon).
 * `'r2-only'` → R2 écrit, résumé DB sauté (thread sans `latest`, ex. 100 % brouillons) —
 *               fidélité stricte au pré-slice, qui écrivait R2 même sans `latest`.
 */
export async function persistSyncedThread<L>(
  threadId: string,
  full: { latest?: L | null },
  deps: SyncPersistDeps<L>,
): Promise<'synced' | 'r2-only'> {
  // R2 INCONDITIONNEL (fidélité ThreadSyncWorker.syncThread) : la persistance ne dépend pas
  // de la présence d'un `latest`.
  await deps.putR2(threadId, full);

  const latest = full.latest;
  if (latest == null) return 'r2-only';

  await deps.storeSummary(threadId, latest);
  return 'synced';
}
