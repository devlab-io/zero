import type { ActiveFilter } from './command-registry';
import { log } from '@/lib/log';

/**
 * localStorage helpers for the command palette. Pure, side-effecting only on the
 * browser storage — extracted from the palette component so the persistence
 * contract is unit-testable and lives in one place.
 */

const RECENT_SEARCHES_KEY = 'mail-recent-searches';
const ACTIVE_FILTERS_KEY = 'mail-active-filters';

/**
 * Garde de forme sur la valeur relue. Même patron que `isStoredDraft`
 * (@/lib/draft-storage) : localStorage est une entrée non fiable (édition manuelle,
 * clé écrite par une version antérieure, extension tierce), donc `JSON.parse` peut
 * rendre n'importe quoi. Sans cette garde, un objet ou un tableau non homogène
 * ressortait tel quel et cassait les consommateurs (`searches.filter(...)` ici,
 * `recentSearches.map(...)` pendant le render du palette dialog).
 */
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const getRecentSearches = (): string[] => {
  try {
    const searches = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!searches) return [];
    const parsed: unknown = JSON.parse(searches);
    if (!isStringArray(parsed)) {
      // Valeur corrompue : on la purge, sinon la garde échouerait à chaque lecture
      // et l'utilisateur resterait sans historique sans moyen de s'en sortir.
      log.error('Discarding malformed recent searches from storage');
      localStorage.removeItem(RECENT_SEARCHES_KEY);
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
};

export const saveRecentSearch = (search: string) => {
  try {
    const searches = getRecentSearches();
    const updated = [search, ...searches.filter((s) => s !== search)].slice(0, 10);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (error) {
    log.error('Failed to save recent search:', error);
  }
};

/**
 * `Array.isArray` seul ne suffit pas : le cast `as ActiveFilter[]` qui suivait était
 * aveugle sur les ÉLÉMENTS. Un tableau contenant `null` faisait lever `f.value` chez le
 * consommateur (command-palette-context, restauration au montage). On valide donc chaque
 * entrée, comme `isStoredDraft` (@/lib/draft-storage).
 */
const isActiveFilter = (value: unknown): value is ActiveFilter => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.type === 'string' &&
    typeof v.value === 'string' &&
    typeof v.display === 'string'
  );
};

/** Reads persisted active filters. Returns null when nothing is stored or on error. */
export const readActiveFilters = (): ActiveFilter[] | null => {
  try {
    const saved = localStorage.getItem(ACTIVE_FILTERS_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isActiveFilter)) {
      log.error('Discarding malformed active filters from storage');
      localStorage.removeItem(ACTIVE_FILTERS_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    log.error('Failed to load active filters:', error);
    return null;
  }
};

export const writeActiveFilters = (filters: ActiveFilter[]) => {
  try {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify(filters));
  } catch (error) {
    log.error('Failed to save filters:', error);
  }
};

export const clearActiveFilters = () => {
  try {
    localStorage.removeItem(ACTIVE_FILTERS_KEY);
  } catch (error) {
    log.error('Failed to clear filters:', error);
  }
};
