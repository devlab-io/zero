import type { QueryClient } from '@tanstack/react-query';
import { mailListMaxResults } from './mail-pagination';

type MailListInput = {
  q?: string;
  folder?: string;
  labelIds?: string[];
  maxResults?: number;
};

type MailListKeyDescriptor = { input?: MailListInput; type?: string };

/**
 * Migration du snapshot persisté après le passage aux pages de 50 (r6) :
 * `maxResults` entre dans la clé de requête, donc les caches IndexedDB écrits
 * sous l'ancienne clé (20 lignes, input sans maxResults) ne serviraient plus
 * jamais — le premier boot post-déploiement serait artificiellement froid.
 * Au restore, chaque liste projection persistée sous l'ancienne clé est
 * recopiée vers la nouvelle (même input + maxResults) SI celle-ci est vide,
 * en préservant dataUpdatedAt : le snapshot peint immédiatement et la
 * réconciliation stale-only décide honnêtement de refetch. Idempotent —
 * jamais d'écrasement d'une donnée déjà présente sous la nouvelle clé.
 */
export function seedMailListPageSizeMigration(queryClient: QueryClient): number {
  const cache = queryClient.getQueryCache();
  let seeded = 0;

  for (const query of cache.findAll({ queryKey: [['mail', 'listThreads']], exact: false })) {
    const key = query.queryKey as readonly [unknown, MailListKeyDescriptor?];
    const descriptor = key[1];
    if (!descriptor || descriptor.type !== 'infinite') continue;

    const input = descriptor.input ?? {};
    // Déjà la nouvelle clé — ou une clé qui ne migre pas (drafts, recherche :
    // leur maxResults reste au défaut serveur, la clé n'a pas changé).
    if (input.maxResults !== undefined) continue;
    const isSearching = Boolean(input.q && input.q.trim().length > 0);
    const targetMaxResults = mailListMaxResults(input.folder, isSearching);
    if (targetMaxResults === undefined) continue;

    const data = query.state.data;
    if (!data) continue;

    const newKey = [key[0], { ...descriptor, input: { ...input, maxResults: targetMaxResults } }];
    if (queryClient.getQueryData(newKey)) continue;

    queryClient.setQueryData(newKey, data, { updatedAt: query.state.dataUpdatedAt });
    seeded += 1;
  }

  return seeded;
}
