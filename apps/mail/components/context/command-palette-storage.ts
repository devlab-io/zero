import { log } from '@/lib/log';
import type { ActiveFilter } from './command-registry';

/**
 * localStorage helpers for the command palette. Pure, side-effecting only on the
 * browser storage — extracted from the palette component so the persistence
 * contract is unit-testable and lives in one place.
 */

const RECENT_SEARCHES_KEY = 'mail-recent-searches';
const ACTIVE_FILTERS_KEY = 'mail-active-filters';

export const getRecentSearches = (): string[] => {
  try {
    const searches = localStorage.getItem(RECENT_SEARCHES_KEY);
    return searches ? JSON.parse(searches) : [];
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

/** Reads persisted active filters. Returns null when nothing is stored or on error. */
export const readActiveFilters = (): ActiveFilter[] | null => {
  try {
    const saved = localStorage.getItem(ACTIVE_FILTERS_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as ActiveFilter[]) : null;
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
