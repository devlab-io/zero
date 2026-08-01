import { summarizeAssignOutcomes } from './assign-batch-summary';
import { describe, expect, it } from 'vitest';

const labels = {
  assigned: (count: number) => `${count} assignés`,
  notShared: (count: number) => `${count} non partagés`,
  skipped: (count: number) => `${count} sans accès`,
};

describe('summarizeAssignOutcomes — aucun skip silencieux', () => {
  it('énonce chaque catégorie non nulle', () => {
    expect(summarizeAssignOutcomes({ assigned: 3, notShared: 2, skipped: 1 }, labels)).toBe(
      '3 assignés · 2 non partagés · 1 sans accès',
    );
  });

  it('omet les catégories à zéro', () => {
    expect(summarizeAssignOutcomes({ assigned: 5, notShared: 0, skipped: 0 }, labels)).toBe(
      '5 assignés',
    );
    expect(summarizeAssignOutcomes({ assigned: 0, notShared: 4, skipped: 0 }, labels)).toBe(
      '4 non partagés',
    );
  });

  it('tout à zéro → chaîne vide (l’appelant affiche son propre message)', () => {
    expect(summarizeAssignOutcomes({ assigned: 0, notShared: 0, skipped: 0 }, labels)).toBe('');
  });
});
