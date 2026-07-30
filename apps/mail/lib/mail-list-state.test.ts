import { describe, expect, it } from 'vitest';
import { selectMailListState } from './mail-list-state';

// Issue #34, check points 1 & 2 (barème A9): a failed read NEVER renders "empty",
// and cached rows survive a failed refresh.

describe('selectMailListState', () => {
  it('uncached 500/offline → error (never empty)', () => {
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: true, isOffline: false }),
    ).toBe('error');
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: false, isOffline: true }),
    ).toBe('error');
  });

  it('cached refresh failure → stale (rows kept + notice)', () => {
    expect(
      selectMailListState({ itemCount: 12, isLoading: false, isError: true, isOffline: false }),
    ).toBe('stale');
    expect(
      selectMailListState({ itemCount: 12, isLoading: false, isError: false, isOffline: true }),
    ).toBe('stale');
  });

  it('first load in flight with no data → loading', () => {
    expect(
      selectMailListState({ itemCount: 0, isLoading: true, isError: false, isOffline: false }),
    ).toBe('loading');
  });

  it('resolved healthy with no rows → the only honest empty', () => {
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: false, isOffline: false }),
    ).toBe('empty');
  });

  it('rows present + healthy → ready', () => {
    expect(
      selectMailListState({ itemCount: 5, isLoading: false, isError: false, isOffline: false }),
    ).toBe('ready');
  });

  it('an error with cached rows is never reported as empty', () => {
    const state = selectMailListState({
      itemCount: 3,
      isLoading: false,
      isError: true,
      isOffline: false,
    });
    expect(state).not.toBe('empty');
  });

  // CUA 2026-07-30 (obs 3) : pendant une recherche, la query passe sur une nouvelle
  // clé avec placeholderData (lignes de la vue précédente, isLoading=false côté
  // react-query). Le vécu observé avant correctif était un écran-spinner bloquant de
  // 2,24 s ; le contrat est désormais : lignes placeholder présentes → JAMAIS
  // 'loading' — la vue reste rendue, le bandeau non bloquant de mail-list porte
  // l'état « recherche en cours » (isTransitionPending && isFiltering).
  it('search-in-flight with previous rows as placeholder stays ready (no blocking spinner)', () => {
    expect(
      selectMailListState({ itemCount: 15, isLoading: false, isError: false, isOffline: false }),
    ).toBe('ready');
  });
});
