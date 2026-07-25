import {
  decideHistoryLockAction,
  PROCESSING_STALE_AFTER_MS,
  DONE_MARK_TTL_MS,
  type HistoryLockRecord,
} from './history-lock';
import { describe, expect, it } from 'vitest';

/**
 * Unit proof of the Gmail history-notification idempotency decision (pitbull, axe
 * Robustesse: "le verrou d'idempotence du webhook Gmail est mort"). The four scenarios
 * below are exactly the ones the fix was required to cover: first arrival processes,
 * a concurrent redelivery is ignored, a redelivery after a successful run is ignored
 * within the retention window, and one arriving after the window expires processes
 * again. A fifth (stale processing reclaim) documents the crash-recovery path that
 * falls out of the same state machine.
 */

const NOW = 1_753_500_000_000; // arbitrary fixed instant

describe('decideHistoryLockAction', () => {
  it('première arrivée (aucun enregistrement) -> traiter', () => {
    const decision = decideHistoryLockAction(undefined, NOW);
    expect(decision).toEqual({ action: 'claim', reason: 'first-arrival' });
  });

  it('redélivrance concurrente (processing récent) -> ignorer', () => {
    const existing: HistoryLockRecord = { status: 'processing', claimedAt: NOW - 5_000 };
    const decision = decideHistoryLockAction(existing, NOW);
    expect(decision).toEqual({ action: 'skip', reason: 'concurrent' });
  });

  it('redélivrance post-succès dans la fenêtre de 24h -> ignorer', () => {
    const existing: HistoryLockRecord = {
      status: 'done',
      completedAt: NOW - 2 * 60 * 60 * 1000, // 2h ago, well inside the 24h window
    };
    const decision = decideHistoryLockAction(existing, NOW);
    expect(decision).toEqual({ action: 'skip', reason: 'post-success-window' });
  });

  it('redélivrance au-delà de la fenêtre de 24h -> traiter', () => {
    const existing: HistoryLockRecord = {
      status: 'done',
      completedAt: NOW - (DONE_MARK_TTL_MS + 60_000), // just past the window
    };
    const decision = decideHistoryLockAction(existing, NOW);
    expect(decision).toEqual({ action: 'claim', reason: 'post-success-window-expired' });
  });

  it('verrou "processing" abandonné (crash) au-delà du seuil de staleness -> traiter', () => {
    const existing: HistoryLockRecord = {
      status: 'processing',
      claimedAt: NOW - (PROCESSING_STALE_AFTER_MS + 1),
    };
    const decision = decideHistoryLockAction(existing, NOW);
    expect(decision).toEqual({ action: 'claim', reason: 'stale-processing-reclaimed' });
  });

  it('bornes exactes : juste avant le seuil de staleness -> encore concurrent', () => {
    const existing: HistoryLockRecord = {
      status: 'processing',
      claimedAt: NOW - PROCESSING_STALE_AFTER_MS + 1,
    };
    const decision = decideHistoryLockAction(existing, NOW);
    expect(decision).toEqual({ action: 'skip', reason: 'concurrent' });
  });

  it('bornes exactes : juste avant la fin de la fenêtre de 24h -> encore ignoré', () => {
    const existing: HistoryLockRecord = {
      status: 'done',
      completedAt: NOW - DONE_MARK_TTL_MS + 1,
    };
    const decision = decideHistoryLockAction(existing, NOW);
    expect(decision).toEqual({ action: 'skip', reason: 'post-success-window' });
  });
});
