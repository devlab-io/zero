import { describe, expect, it, vi } from 'vitest';
import { memoizedImport } from './memoized-import';

// CUA 2026-07-30, revue Codex : un rejet mémoïsé empoisonnait définitivement
// React.lazy (le warm échoué servait sa promesse rejetée à toutes les
// tentatives suivantes). Contrat figé ici : (1) succès mémoïsé — une seule
// invocation réelle ; (2) rejet → cache réinitialisé, l'appel suivant
// ré-importe et peut réussir ; (3) pas d'unhandledrejection quand personne
// d'autre n'écoute la promesse rejetée.

describe('memoizedImport', () => {
  it('memoizes success: one factory call, same promise returned', async () => {
    const factory = vi.fn(async () => ({ mod: 'ok' }));
    const load = memoizedImport(factory);

    const p1 = load();
    const p2 = load();
    expect(p1).toBe(p2);
    await expect(p1).resolves.toEqual({ mod: 'ok' });
    load();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('resets its cache on rejection so a later call retries and can succeed', async () => {
    let calls = 0;
    const factory = vi.fn(() => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error('transient network failure'))
        : Promise.resolve({ mod: 'recovered' });
    });
    const load = memoizedImport(factory);

    await expect(load()).rejects.toThrow('transient network failure');
    // L'observateur interne (reset) court en microtâche — laisser le tour passer.
    await Promise.resolve();

    await expect(load()).resolves.toEqual({ mod: 'recovered' });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('a rejected warm with no external handler produces no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const load = memoizedImport(() => Promise.reject(new Error('warm failed, nobody listens')));
      load(); // volontairement sans .catch côté appelant (cas du warm best-effort)
      // Laisser la boucle d'événements signaler d'éventuels rejets non gérés.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
