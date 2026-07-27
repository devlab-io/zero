import {
  clearActiveFilters,
  getRecentSearches,
  readActiveFilters,
  saveRecentSearch,
  writeActiveFilters,
} from './command-palette-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// pitbull (point 6b) — même classe de défaut que `undoEmailData` : la lecture de
// localStorage ne validait pas la FORME. Les valeurs injectées ci-dessous sont de vraies
// chaînes JSON écrites dans un vrai localStorage, exactement ce qu'une clé corrompue
// (édition manuelle, format d'une version antérieure, extension tierce) contient en
// production. Aucune erreur n'est fabriquée.

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const RECENT_SEARCHES_KEY = 'mail-recent-searches';
const ACTIVE_FILTERS_KEY = 'mail-active-filters';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('getRecentSearches — garde de forme', () => {
  it('rend la liste telle quelle quand elle est bien formée', () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['from:me', 'facture']));
    expect(getRecentSearches()).toEqual(['from:me', 'facture']);
  });

  it('rend [] et purge la clé quand la valeur stockée est un objet', () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, '{"0":"from:me"}');
    expect(getRecentSearches()).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });

  it('rend [] et purge la clé quand le tableau contient autre chose que des chaînes', () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, '["ok", 42, null]');
    expect(getRecentSearches()).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });

  it('rend [] sur JSON illisible, sans lever', () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, '{not json');
    expect(() => getRecentSearches()).not.toThrow();
    expect(getRecentSearches()).toEqual([]);
  });

  it("saveRecentSearch repart d'une base saine au lieu de casser sur .filter", () => {
    // Avant la garde : `searches.filter(...)` sur un objet levait un TypeError, avalé par
    // le catch — la recherche courante n'était jamais enregistrée.
    localStorage.setItem(RECENT_SEARCHES_KEY, '{"to":"x@y.co"}');
    saveRecentSearch('facture');
    expect(getRecentSearches()).toEqual(['facture']);
  });
});

describe('readActiveFilters — garde de forme sur les ÉLÉMENTS', () => {
  const filter = { id: 'f1', type: 'from', value: 'from:me', display: 'De: moi' };

  it('rend les filtres quand chaque entrée est complète', () => {
    writeActiveFilters([filter]);
    expect(readActiveFilters()).toEqual([filter]);
  });

  it('rend null et purge quand la valeur stockée est un objet', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, '{"id":"f1"}');
    expect(readActiveFilters()).toBeNull();
    expect(localStorage.getItem(ACTIVE_FILTERS_KEY)).toBeNull();
  });

  it('rend null et purge quand un élément du tableau est null (faisait lever f.value)', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify([filter, null]));
    expect(readActiveFilters()).toBeNull();
    expect(localStorage.getItem(ACTIVE_FILTERS_KEY)).toBeNull();
  });

  it('rend null et purge quand un élément a un champ manquant', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify([{ id: 'f1', type: 'from' }]));
    expect(readActiveFilters()).toBeNull();
    expect(localStorage.getItem(ACTIVE_FILTERS_KEY)).toBeNull();
  });

  it("rend null quand rien n'est stocké, sans purger quoi que ce soit d'autre", () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['facture']));
    expect(readActiveFilters()).toBeNull();
    expect(getRecentSearches()).toEqual(['facture']);
  });

  it('clearActiveFilters retire la clé', () => {
    writeActiveFilters([filter]);
    clearActiveFilters();
    expect(readActiveFilters()).toBeNull();
  });
});
