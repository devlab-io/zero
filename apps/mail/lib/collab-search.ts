/**
 * Opérateurs de recherche COLLABORATIFS (P12, parité décidée côté Reta) :
 * is:shared / is:assigned / has:comment / has:mention — composables avec le
 * reste de la requête. Ils sont extraits AVANT l'envoi au fournisseur (Gmail
 * ne les connaît pas et rendrait zéro résultat) puis appliqués côté client
 * contre les ensembles ACL-filtrés de teams.myCollabThreadSets.
 */

export type CollabFilters = {
  shared: boolean;
  assigned: boolean;
  commented: boolean;
  mentioned: boolean;
};

export type CollabSearchExtraction = {
  /** Requête débarrassée des opérateurs collaboratifs, pour le fournisseur. */
  providerQuery: string;
  filters: CollabFilters;
  hasFilters: boolean;
};

const OPERATORS: Record<string, keyof CollabFilters> = {
  'is:shared': 'shared',
  'is:assigned': 'assigned',
  'has:comment': 'commented',
  'has:comments': 'commented',
  'has:mention': 'mentioned',
  'has:mentions': 'mentioned',
};

export function extractCollabFilters(query: string): CollabSearchExtraction {
  const filters: CollabFilters = {
    shared: false,
    assigned: false,
    commented: false,
    mentioned: false,
  };
  let hasFilters = false;
  const kept: string[] = [];
  for (const token of query.split(/\s+/)) {
    const key = OPERATORS[token.toLowerCase()];
    if (key) {
      filters[key] = true;
      hasFilters = true;
    } else if (token) {
      kept.push(token);
    }
  }
  return { providerQuery: kept.join(' '), filters, hasFilters };
}

export type CollabThreadSets = {
  shared: string[];
  assigned: string[];
  commented: string[];
  mentioned: string[];
};

/** Intersection : un fil doit satisfaire TOUS les opérateurs actifs. */
export function filterThreadsByCollabSets<T extends { id: string }>(
  threads: T[],
  filters: CollabFilters,
  sets: CollabThreadSets,
): T[] {
  const required: Set<string>[] = [];
  if (filters.shared) required.push(new Set(sets.shared));
  if (filters.assigned) required.push(new Set(sets.assigned));
  if (filters.commented) required.push(new Set(sets.commented));
  if (filters.mentioned) required.push(new Set(sets.mentioned));
  if (required.length === 0) return threads;
  return threads.filter((thread) => required.every((set) => set.has(thread.id)));
}
