/**
 * Découpage honnête du premier-ever cold d'un fil (r16) : le queryFn
 * openThread projette en `performance.measure` la RTT réseau, le seed du
 * cache email-content, et — quand le serveur les fournit — les durées
 * getThread (Gmail/DO) vs sanitize. Durées seules, aucun identifiant ni
 * contenu ; les mesures portent le préfixe zero: et apparaissent donc dans
 * le panneau ?bootperf=1. Un fil servi depuis le cache n'exécute pas le
 * queryFn : aucune mesure — c'est le signal « zéro réseau ».
 */

export type OpenThreadTimingInput = {
  fetchStartMs: number;
  fetchEndMs: number;
  seedEndMs: number;
  server?: { getThreadMs?: number; renderMs?: number };
};

export type OpenThreadTimingMeasure = { name: string; startMs: number; durationMs: number };

const clampDuration = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** Construction pure des mesures — testée à part, l'application est triviale. */
export function buildOpenThreadTimingMeasures(
  input: OpenThreadTimingInput,
): OpenThreadTimingMeasure[] {
  const rttMs = clampDuration(input.fetchEndMs - input.fetchStartMs);
  const seedMs = clampDuration(input.seedEndMs - input.fetchEndMs);
  const measures: OpenThreadTimingMeasure[] = [
    { name: 'zero:thread:fetch', startMs: input.fetchStartMs, durationMs: rttMs },
    { name: 'zero:thread:seed-cache', startMs: input.fetchEndMs, durationMs: seedMs },
  ];

  const getThreadMs = clampDuration(input.server?.getThreadMs);
  const renderMs = clampDuration(input.server?.renderMs);
  if (getThreadMs > 0 || renderMs > 0) {
    // Ancrées au départ de la RTT : la position exacte dans la RTT importe
    // moins que la décomposition lisible getThread vs sanitize.
    measures.push({
      name: 'zero:thread:server-get',
      startMs: input.fetchStartMs,
      durationMs: getThreadMs,
    });
    measures.push({
      name: 'zero:thread:server-render',
      startMs: input.fetchStartMs + getThreadMs,
      durationMs: renderMs,
    });
  }
  return measures;
}

export function recordOpenThreadTimings(input: OpenThreadTimingInput): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return;
  for (const measure of buildOpenThreadTimingMeasures(input)) {
    try {
      performance.measure(measure.name, { start: measure.startMs, duration: measure.durationMs });
    } catch {
      // Environnement sans options de mesure (vieux runtime) : silencieux.
    }
  }
}
