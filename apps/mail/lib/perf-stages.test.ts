import { describe, expect, it, beforeEach } from 'vitest';
import { markStage } from './perf-stages';

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
