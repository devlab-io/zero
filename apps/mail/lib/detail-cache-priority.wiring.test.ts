import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// r16 : garde structurelle du câblage priorité-cache-corps. Les comportements
// (restore prioritaire, coalescence, mesures) sont prouvés unitairement dans
// split-persister.test.ts / detail-persist-flush.test.ts /
// open-thread-timing.test.ts ; ici on fige les points de branchement.

const read = (relative: string) => readFileSync(join(__dirname, '..', relative), 'utf8');

const queryProvider = read('providers/query-provider.tsx');
const useThreads = read('hooks/use-threads.ts');

describe('câblage r16 — priorité cache corps', () => {
  it('le persister du provider reçoit le threadId de l’URL pour le restore bloquant', () => {
    expect(queryProvider).toContain('getPriorityThreadId: () =>');
    expect(queryProvider).toContain('readPriorityThreadIdFromSearch(window.location.search)');
  });

  it('le flusher immédiat est enregistré pour l’owner CONFIRMÉ et désenregistré sinon', () => {
    const guardIndex = queryProvider.indexOf('if (!isConfirmedIdentity) {');
    const unregisterIndex = queryProvider.indexOf(
      'registerDetailPersistFlusher(null);',
      guardIndex,
    );
    const registerIndex = queryProvider.indexOf('registerDetailPersistFlusher(() => {');
    const saveIndex = queryProvider.indexOf('void persistQueryClientSave({');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(unregisterIndex).toBeGreaterThan(guardIndex);
    expect(registerIndex).toBeGreaterThan(unregisterIndex);
    expect(saveIndex).toBeGreaterThan(registerIndex);
    // Le save explicite passe par la MÊME politique de déshydratation que
    // l'abonnement (shouldPersistQuery) et le même buster.
    const saveBlock = queryProvider.slice(saveIndex, saveIndex + 400);
    // P0 secret-cache : le flush immédiat passe par les MÊMES options de
    // déshydratation que le provider — requêtes filtrées ET mutations
    // JAMAIS déshydratées (une mutation paused peut porter un secret BYOK).
    expect(saveBlock).toContain('dehydrateOptions: QUERY_DEHYDRATE_OPTIONS');
    expect(saveBlock).toContain('buster: CACHE_BURST_KEY');
    // …et la constante partagée porte bien la barrière anti-mutations.
    expect(queryProvider).toContain('shouldDehydrateMutation: () => false');
    // Cleanup du hook : le flusher ne survit jamais à son owner.
    expect(queryProvider).toContain('return () => registerDetailPersistFlusher(null);');
  });

  it('le queryFn openThread demande le persist immédiat APRÈS le seed, et mesure le découpage', () => {
    const fetchIndex = useThreads.indexOf('trpcClient.mail.openThread.query(');
    const seedIndex = useThreads.indexOf('queryClient.setQueryData(', fetchIndex);
    const timingIndex = useThreads.indexOf('recordOpenThreadTimings({', fetchIndex);
    const flushIndex = useThreads.indexOf('requestImmediateDetailPersist();', fetchIndex);
    expect(fetchIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeGreaterThan(fetchIndex);
    expect(timingIndex).toBeGreaterThan(seedIndex);
    expect(flushIndex).toBeGreaterThan(timingIndex);
    expect(useThreads).toContain('server: result.timings');
  });
});
