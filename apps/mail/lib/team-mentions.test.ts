import {
  applyMention,
  extractMentionQuery,
  filterMentionCandidates,
  resolveMentions,
  segmentMentions,
  type MentionMember,
} from './team-mentions';
import { describe, expect, it } from 'vitest';

const members: MentionMember[] = [
  { userId: 'u-shane', name: 'Shane', email: 'shane@devlab.io' },
  { userId: 'u-omar', name: 'Omar', email: 'omar@devlab.io' },
  { userId: 'u-jp', name: 'Jean-Paul Dupont', email: 'jp@devlab.io' },
];

describe('extractMentionQuery', () => {
  it('détecte un token @ au caret', () => {
    expect(extractMentionQuery('Vois avec @Sha', 14)).toEqual({ query: 'Sha', start: 10 });
  });
  it('exige un séparateur avant le @ (pas d’email)', () => {
    expect(extractMentionQuery('mail shane@dev', 14)).toBeNull();
  });
  it('@ en début de texte accepté', () => {
    expect(extractMentionQuery('@Om', 3)).toEqual({ query: 'Om', start: 0 });
  });
  it('nul si saut de ligne ou second @ dans le token', () => {
    expect(extractMentionQuery('@a\nb', 4)).toBeNull();
  });
});

describe('filterMentionCandidates', () => {
  it('filtre par nom (contains) et email (préfixe), insensible à la casse', () => {
    expect(filterMentionCandidates(members, 'sha').map((m) => m.userId)).toEqual(['u-shane']);
    expect(filterMentionCandidates(members, 'paul').map((m) => m.userId)).toEqual(['u-jp']);
    expect(filterMentionCandidates(members, 'omar@').map((m) => m.userId)).toEqual(['u-omar']);
  });
  it('token vide → premiers membres', () => {
    expect(filterMentionCandidates(members, '')).toHaveLength(3);
  });
});

describe('applyMention', () => {
  it('remplace le token par @Nom + espace et replace le caret', () => {
    const out = applyMention('Vois avec @Sha stp', 14, 10, members[0]!);
    expect(out.text).toBe('Vois avec @Shane  stp');
    expect(out.caret).toBe(17);
  });
});

describe('resolveMentions', () => {
  it('ne retient que les membres dont le @nom est ENCORE présent au submit', () => {
    expect(resolveMentions('Vois avec @Shane et @Omar', members)).toEqual(['u-shane', 'u-omar']);
    expect(resolveMentions('Vois avec Shane (sans @)', members)).toEqual([]);
  });
  it('dédoublonne', () => {
    expect(resolveMentions('@Shane @Shane', members)).toEqual(['u-shane']);
  });
});

describe('segmentMentions', () => {
  it('découpe texte/mentions, noms longs prioritaires', () => {
    const segments = segmentMentions('cc @Jean-Paul Dupont et @Shane.', members);
    expect(segments).toEqual([
      { type: 'text', text: 'cc ' },
      { type: 'mention', text: '@Jean-Paul Dupont', userId: 'u-jp' },
      { type: 'text', text: ' et ' },
      { type: 'mention', text: '@Shane', userId: 'u-shane' },
      { type: 'text', text: '.' },
    ]);
  });
  it('un @ sans membre correspondant reste du texte', () => {
    expect(segmentMentions('mail @inconnu', members)).toEqual([
      { type: 'text', text: 'mail @inconnu' },
    ]);
  });
  it('texte sans @ intact', () => {
    expect(segmentMentions('rien ici', members)).toEqual([{ type: 'text', text: 'rien ici' }]);
  });
});
