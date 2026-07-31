import {
  __resetPerfStagesOnceForTests,
  markStage,
  markStageAfterPaint,
  markStageOnce,
} from './perf-stages';
import { describe, expect, it, beforeEach } from 'vitest';

beforeEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

describe('markStage — jalons perf par étapes', () => {
  it('pose la marque préfixée zero:', () => {
    markStage('thread:open');
    expect(performance.getEntriesByName('zero:thread:open', 'mark')).toHaveLength(1);
  });

  it('mesure automatiquement les paires connues', () => {
    markStage('thread:open');
    markStage('thread:body-ready');
    const measures = performance.getEntriesByName('zero:thread:open->thread:body-ready', 'measure');
    expect(measures).toHaveLength(1);
    expect(measures[0].duration).toBeGreaterThanOrEqual(0);

    // r7 : « ouverture perçue » — le shell projection peint avant le corps.
    markStage('thread:open');
    markStage('thread:shell-ready');
    expect(
      performance.getEntriesByName('zero:thread:open->thread:shell-ready', 'measure'),
    ).toHaveLength(1);

    // r9 : waterfall du cold boot — l'amorce du <head> pose la marque brute
    // zero:boot:session-prime (même convention de préfixe que markStage).
    performance.mark('zero:boot:session-prime');
    markStage('boot:session-confirmed');
    markStage('boot:cache-restored');
    expect(
      performance.getEntriesByName('zero:boot:session-prime->boot:session-confirmed', 'measure'),
    ).toHaveLength(1);
    expect(
      performance.getEntriesByName('zero:boot:session-confirmed->boot:cache-restored', 'measure'),
    ).toHaveLength(1);

    markStage('search:applied');
    markStage('search:results-settled');
    expect(
      performance.getEntriesByName('zero:search:applied->search:results-settled', 'measure'),
    ).toHaveLength(1);

    markStage('send:dispatched');
    markStage('send:confirmed');
    expect(
      performance.getEntriesByName('zero:send:dispatched->send:confirmed', 'measure'),
    ).toHaveLength(1);
  });

  it('reste silencieux quand la marque de départ manque (parcours entamé avant chargement)', () => {
    expect(() => markStage('thread:body-ready')).not.toThrow();
    expect(performance.getEntriesByName('zero:thread:body-ready', 'mark')).toHaveLength(1);
    expect(
      performance.getEntriesByName('zero:thread:open->thread:body-ready', 'measure'),
    ).toHaveLength(0);
  });
});

describe('markStageOnce / markStageAfterPaint — une seule fois par chargement (r12)', () => {
  beforeEach(() => {
    __resetPerfStagesOnceForTests();
  });

  it('markStageOnce ne pose la marque qu’UNE fois malgré des re-montages', () => {
    markStageOnce('boot:route-mounted');
    markStageOnce('boot:route-mounted');
    markStageOnce('boot:route-mounted');
    expect(performance.getEntriesByName('zero:boot:route-mounted', 'mark')).toHaveLength(1);
  });

  it('markStageAfterPaint marque après DOUBLE rAF, une seule fois', async () => {
    const rafQueue: FrameRequestCallback[] = [];
    const original = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }) as typeof requestAnimationFrame;
    try {
      markStageAfterPaint('boot:list-painted');
      markStageAfterPaint('boot:list-painted'); // re-signalé : ignoré
      expect(performance.getEntriesByName('zero:boot:list-painted', 'mark')).toHaveLength(0);
      rafQueue.shift()!(0); // 1er rAF : avant présentation
      expect(performance.getEntriesByName('zero:boot:list-painted', 'mark')).toHaveLength(0);
      rafQueue.shift()!(0); // 2e rAF : frame peint → marque
      expect(performance.getEntriesByName('zero:boot:list-painted', 'mark')).toHaveLength(1);
      expect(rafQueue).toHaveLength(0); // le doublon n'a rien replanifié
    } finally {
      globalThis.requestAnimationFrame = original;
    }
  });

  it('les mesures du segment post-confirmation s’enchaînent (route → data → paint)', () => {
    markStage('boot:session-confirmed');
    markStage('boot:route-mounted');
    markStage('boot:list-data-ready');
    markStage('boot:list-painted');
    for (const name of [
      'zero:boot:session-confirmed->boot:route-mounted',
      'zero:boot:route-mounted->boot:list-data-ready',
      'zero:boot:list-data-ready->boot:list-painted',
    ]) {
      expect(performance.getEntriesByName(name, 'measure')).toHaveLength(1);
    }
  });
});
