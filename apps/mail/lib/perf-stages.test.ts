import {
  __resetPerfStagesOnceForTests,
  markStage,
  markStageAfterPaint,
  markStageOnce,
  whenBootStage,
} from './perf-stages';
import { describe, expect, it, beforeEach, vi } from 'vitest';

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
    // r15a : découpage honnête — données présentes vs corps réellement peint.
    markStage('thread:open');
    markStage('thread:data-ready');
    markStage('thread:content-painted');
    const measures = performance.getEntriesByName('zero:thread:open->thread:data-ready', 'measure');
    expect(measures).toHaveLength(1);
    expect(measures[0].duration).toBeGreaterThanOrEqual(0);
    expect(
      performance.getEntriesByName('zero:thread:open->thread:content-painted', 'measure'),
    ).toHaveLength(1);

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
    expect(() => markStage('thread:content-painted')).not.toThrow();
    expect(performance.getEntriesByName('zero:thread:content-painted', 'mark')).toHaveLength(1);
    expect(
      performance.getEntriesByName('zero:thread:open->thread:content-painted', 'measure'),
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

describe('whenBootStage — déclencheur différé sur signal réel (contre-revue r13)', () => {
  beforeEach(() => {
    __resetPerfStagesOnceForTests();
  });

  it('AUCUNE exécution avant le signal ; le jalon list-painted déclenche', () => {
    const run = vi.fn();
    whenBootStage('boot:list-painted', run, { fallbackMs: 60_000 });
    expect(run).not.toHaveBeenCalled();

    markStage('boot:list-painted'); // émet l'événement zero:perf-stage
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('un AUTRE jalon ne déclenche pas', () => {
    const run = vi.fn();
    const cancel = whenBootStage('boot:list-painted', run, { fallbackMs: 60_000 });
    markStage('boot:route-mounted');
    expect(run).not.toHaveBeenCalled();
    cancel();
  });

  it('jalon DÉJÀ marqué (abonné tardif) → exécution immédiate', () => {
    markStage('boot:list-painted');
    const run = vi.fn();
    whenBootStage('boot:list-painted', run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fallback borné : boîte vide/erreur (jalon jamais atteint) → exécution quand même', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      whenBootStage('boot:list-painted', run, { fallbackMs: 2_500 });
      vi.advanceTimersByTime(2_499);
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('annulation (unmount / changement d’owner) : ni signal ni fallback n’exécutent', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      const cancel = whenBootStage('boot:list-painted', run, { fallbackMs: 1_000 });
      cancel();
      markStage('boot:list-painted');
      vi.runAllTimers();
      expect(run).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('exécution AU PLUS une fois (signal puis fallback)', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      whenBootStage('boot:list-painted', run, { fallbackMs: 1_000 });
      markStage('boot:list-painted');
      vi.runAllTimers();
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
