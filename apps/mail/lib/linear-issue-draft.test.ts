import { buildIssueDraft, detectIssueIdentifiers } from './linear-issue-draft';
import { describe, expect, it } from 'vitest';

describe('detectIssueIdentifiers — suggestions de lien (aperçu seul)', () => {
  it('détecte les identifiants, déduplique, borne à 5', () => {
    expect(detectIssueIdentifiers('Re: ENG-123 et eng-123 puis OPS-9')).toEqual([
      'ENG-123',
      'OPS-9',
    ]);
    const many = Array.from({ length: 10 }, (_, i) => `AA-${i + 1}`).join(' ');
    expect(detectIssueIdentifiers(many)).toHaveLength(5);
  });

  it('ignore le bruit : dates, UUID partiels, mots composés', () => {
    expect(detectIssueIdentifiers('2026-08 devis-3 x A1B2C3D4-123456789')).toEqual([]);
    expect(detectIssueIdentifiers('rien à voir')).toEqual([]);
  });
});

describe('buildIssueDraft — extrait autorisé + backlink ACL', () => {
  const base = {
    subject: '  Panne serveur client X  ',
    teamThreadId: 'tt-1',
    teamId: 'team-1',
    appOrigin: 'https://app.example.test/',
  };

  it('titre = sujet trimé ; backlink /team?team=…&thread=… ; jamais de corps complet', () => {
    const draft = buildIssueDraft({ ...base, excerpt: 'Le client   signale\nune panne.' });
    expect(draft.title).toBe('Panne serveur client X');
    expect(draft.backlinkUrl).toBe('https://app.example.test/team?team=team-1&thread=tt-1');
    expect(draft.description).toContain('> Le client signale une panne.');
    expect(draft.description).toContain(
      '[Reta thread](https://app.example.test/team?team=team-1&thread=tt-1)',
    );
  });

  it('extrait BORNÉ à 500 caractères, sujet vide → titre de repli', () => {
    const draft = buildIssueDraft({ ...base, subject: '   ', excerpt: 'x'.repeat(2000) });
    expect(draft.title).toBe('Email thread');
    const quoted = draft.description.split('\n\n')[0]!;
    expect(quoted.length).toBeLessThanOrEqual(502); // '> ' + 500
  });

  it('sans extrait → description = backlink seul', () => {
    const draft = buildIssueDraft(base);
    expect(draft.description.startsWith('[Reta thread](')).toBe(true);
  });
});
