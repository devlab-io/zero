import { extractCollabFilters, filterThreadsByCollabSets } from './collab-search';
import { describe, expect, it } from 'vitest';

const sets = {
  shared: ['t1', 't2', 't3'],
  assigned: ['t2'],
  commented: ['t1', 't2'],
  mentioned: ['t3'],
};

describe('extractCollabFilters', () => {
  it('extrait les opérateurs collaboratifs et préserve le reste pour le fournisseur', () => {
    const out = extractCollabFilters('facture is:shared socredo has:comment');
    expect(out.providerQuery).toBe('facture socredo');
    expect(out.filters).toMatchObject({ shared: true, commented: true, assigned: false });
    expect(out.hasFilters).toBe(true);
  });

  it('insensible à la casse, pluriels acceptés', () => {
    const out = extractCollabFilters('IS:SHARED has:mentions');
    expect(out.filters.shared).toBe(true);
    expect(out.filters.mentioned).toBe(true);
    expect(out.providerQuery).toBe('');
  });

  it('requête sans opérateur : intacte, hasFilters=false', () => {
    const out = extractCollabFilters('Banque de Tahiti');
    expect(out).toMatchObject({ providerQuery: 'Banque de Tahiti', hasFilters: false });
  });

  it('les opérateurs Gmail natifs (is:unread, from:) ne sont PAS capturés', () => {
    const out = extractCollabFilters('is:unread from:shane is:shared');
    expect(out.providerQuery).toBe('is:unread from:shane');
    expect(out.filters.shared).toBe(true);
  });
});

describe('filterThreadsByCollabSets — intersection composable', () => {
  const threads = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];

  it('is:shared seul', () => {
    const { filters } = extractCollabFilters('is:shared');
    expect(filterThreadsByCollabSets(threads, filters, sets).map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
  });

  it('is:shared + is:assigned = intersection', () => {
    const { filters } = extractCollabFilters('is:shared is:assigned');
    expect(filterThreadsByCollabSets(threads, filters, sets).map((t) => t.id)).toEqual(['t2']);
  });

  it('has:mention + has:comment = vide si disjoint', () => {
    const { filters } = extractCollabFilters('has:mention has:comment');
    expect(filterThreadsByCollabSets(threads, filters, sets)).toEqual([]);
  });

  it('sans filtre actif : liste inchangée', () => {
    const { filters } = extractCollabFilters('rien');
    expect(filterThreadsByCollabSets(threads, filters, sets)).toHaveLength(4);
  });
});
