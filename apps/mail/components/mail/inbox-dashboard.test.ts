import { formatFloorCount, formatSavedTime, metricState } from './inbox-dashboard-model';
import { describe, expect, it } from 'vitest';

describe('formatSavedTime', () => {
  it('formats minutes and mixed hour values compactly', () => {
    expect(formatSavedTime(18)).toBe('18 min');
    expect(formatSavedTime(60)).toBe('1h');
    expect(formatSavedTime(138)).toBe('2h 18m');
  });
});

describe('metricState — jamais un faux zéro (P6)', () => {
  it("une requête en ÉCHEC est 'error', même avec un formateur qui rendrait 0", () => {
    expect(metricState({ isPending: false, isError: true, data: undefined }, () => '0')).toEqual({
      kind: 'error',
    });
    // Erreur PRIME sur des données périmées présentes en cache.
    expect(metricState({ isPending: false, isError: true, data: 5 }, () => '5')).toEqual({
      kind: 'error',
    });
  });

  it('en vol (ou sans données) : loading — pas de valeur affichée', () => {
    expect(metricState({ isPending: true, isError: false, data: undefined }, () => 'x')).toEqual({
      kind: 'loading',
    });
    expect(metricState({ isPending: false, isError: false, data: undefined }, () => 'x')).toEqual({
      kind: 'loading',
    });
  });

  it('prête : le zéro RÉEL est affiché comme zéro', () => {
    expect(metricState({ isPending: false, isError: false, data: 0 }, () => '0')).toEqual({
      kind: 'ready',
      value: '0',
    });
  });
});

describe('formatFloorCount — troncature honnête', () => {
  it('exact sans troncature, plancher « + » avec', () => {
    expect(formatFloorCount(12, false)).toBe('12');
    expect(formatFloorCount(100, true)).toBe('100+');
    expect(formatFloorCount(0, false)).toBe('0');
  });
});
