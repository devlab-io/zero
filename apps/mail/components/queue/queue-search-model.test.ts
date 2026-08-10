import { describe, expect, it } from 'vitest';

import { matchesQueueSearch, type QueueSearchableItem } from './queue-search-model';

const item: QueueSearchableItem = {
  to: ['guillaume@brapac.pf'],
  cc: ['rahiti@pgd.pf'],
  bcc: [],
  subject: 'Point d’avancement BRAPAC',
  body: '<p>Migration du DWH en attente.</p>',
  mission: 'Répondre au dernier message entrant',
  classificationReason: null,
  sourceAttachments: [{ filename: 'schema-reseau.pdf' }],
};

describe('matchesQueueSearch', () => {
  it('matches recipients, subject, body, mission and attachment names', () => {
    expect(matchesQueueSearch(item, 'brapac')).toBe(true);
    expect(matchesQueueSearch(item, 'migration')).toBe(true);
    expect(matchesQueueSearch(item, 'dernier message')).toBe(true);
    expect(matchesQueueSearch(item, 'schema-reseau')).toBe(true);
  });

  it('is case- and accent-insensitive', () => {
    expect(matchesQueueSearch(item, 'AVANCEMENT')).toBe(true);
    expect(matchesQueueSearch(item, 'réseau')).toBe(true);
  });

  it('keeps all items visible for an empty query', () => {
    expect(matchesQueueSearch(item, '   ')).toBe(true);
  });

  it('rejects unrelated queries', () => {
    expect(matchesQueueSearch(item, 'newsletter exotic')).toBe(false);
  });
});
