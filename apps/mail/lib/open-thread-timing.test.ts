import { buildOpenThreadTimingMeasures } from './open-thread-timing';
import { describe, expect, it } from 'vitest';

// r16 : découpage honnête du premier-ever cold — RTT / seed côté client,
// getThread vs sanitize côté serveur. Durées seules : les descripteurs ne
// portent que name/startMs/durationMs, jamais d'identifiant ni de contenu.

describe('buildOpenThreadTimingMeasures', () => {
  it('découpe RTT et seed, et projette les durées serveur getThread vs sanitize', () => {
    const measures = buildOpenThreadTimingMeasures({
      fetchStartMs: 1000,
      fetchEndMs: 1800,
      seedEndMs: 1815,
      server: { getThreadMs: 620, renderMs: 130 },
    });

    expect(measures).toEqual([
      { name: 'zero:thread:fetch', startMs: 1000, durationMs: 800 },
      { name: 'zero:thread:seed-cache', startMs: 1800, durationMs: 15 },
      { name: 'zero:thread:server-get', startMs: 1000, durationMs: 620 },
      { name: 'zero:thread:server-render', startMs: 1620, durationMs: 130 },
    ]);
  });

  it('sans timings serveur : seules les mesures client, rien d’inventé', () => {
    const names = buildOpenThreadTimingMeasures({
      fetchStartMs: 0,
      fetchEndMs: 100,
      seedEndMs: 101,
    }).map((measure) => measure.name);
    expect(names).toEqual(['zero:thread:fetch', 'zero:thread:seed-cache']);
  });

  it('borne les durées invalides à zéro (horloges qui reculent, NaN) — jamais de mesure négative', () => {
    const measures = buildOpenThreadTimingMeasures({
      fetchStartMs: 500,
      fetchEndMs: 400,
      seedEndMs: Number.NaN,
      server: { getThreadMs: -5, renderMs: Number.NaN },
    });
    for (const measure of measures) {
      expect(measure.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(measure.startMs)).toBe(true);
    }
  });

  it('aucune donnée sensible : uniquement name préfixé zero: + nombres', () => {
    const measures = buildOpenThreadTimingMeasures({
      fetchStartMs: 1,
      fetchEndMs: 2,
      seedEndMs: 3,
      server: { getThreadMs: 1, renderMs: 1 },
    });
    for (const measure of measures) {
      expect(Object.keys(measure).sort()).toEqual(['durationMs', 'name', 'startMs']);
      expect(measure.name.startsWith('zero:thread:')).toBe(true);
    }
  });
});
