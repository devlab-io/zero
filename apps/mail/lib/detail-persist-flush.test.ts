import {
  __resetDetailPersistFlushForTests,
  registerDetailPersistFlusher,
  requestImmediateDetailPersist,
  DETAIL_PERSIST_COALESCE_MS,
} from './detail-persist-flush';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// r16 : le persist des corps fraîchement chargés est demandé EXPLICITEMENT par
// le queryFn openThread — coalescé, et strictement scopé au couple
// (owner, persister) enregistré : une demande pendant un logout/switch est un
// no-op, jamais une écriture sous la mauvaise clé.

beforeEach(() => {
  vi.useFakeTimers();
  __resetDetailPersistFlushForTests();
});

afterEach(() => {
  __resetDetailPersistFlushForTests();
  vi.useRealTimers();
});

describe('detail-persist-flush', () => {
  it('coalesce une rafale (clic + next2) en UNE écriture après la fenêtre', () => {
    const flush = vi.fn();
    registerDetailPersistFlusher(flush);

    requestImmediateDetailPersist();
    requestImmediateDetailPersist();
    requestImmediateDetailPersist();
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DETAIL_PERSIST_COALESCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);

    // Nouvelle lecture après la fenêtre : nouvelle écriture.
    requestImmediateDetailPersist();
    vi.advanceTimersByTime(DETAIL_PERSIST_COALESCE_MS);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('sans flusher enregistré (session pending, logout) : no-op total', () => {
    requestImmediateDetailPersist();
    vi.advanceTimersByTime(DETAIL_PERSIST_COALESCE_MS * 2);
    // Rien à observer — l'absence d'erreur ET aucun timer résiduel suffisent.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('race logout/switch : le désenregistrement PENDANT la fenêtre annule l’écriture', () => {
    const flush = vi.fn();
    registerDetailPersistFlusher(flush);
    requestImmediateDetailPersist();

    // L'owner change avant le tir : le provider désenregistre — l'écriture
    // planifiée sous l'ancien couple (owner, persister) ne part jamais.
    registerDetailPersistFlusher(null);
    vi.advanceTimersByTime(DETAIL_PERSIST_COALESCE_MS * 2);
    expect(flush).not.toHaveBeenCalled();

    // Le nouveau propriétaire enregistre son flusher : cycle propre.
    const nextFlush = vi.fn();
    registerDetailPersistFlusher(nextFlush);
    requestImmediateDetailPersist();
    vi.advanceTimersByTime(DETAIL_PERSIST_COALESCE_MS);
    expect(nextFlush).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });
});
