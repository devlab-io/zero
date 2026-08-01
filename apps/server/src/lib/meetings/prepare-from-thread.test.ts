import { buildMeetingPreview, cleanSubject } from './prepare-from-thread';
import { describe, expect, it } from 'vitest';

// P11 — la preview est le SEUL produit : participants dédupliqués, no-reply
// et listes écartés mais VISIBLES, sujet nettoyé, contexte borné, et les
// verrous produit (pas de création sans humain, dispos = scope calendrier).

const msg = (
  senderEmail: string,
  overrides: Partial<{
    senderName: string;
    to: { email: string; name?: string }[];
    cc: { email: string }[];
    subject: string;
    listUnsubscribe: string;
    body: string;
  }> = {},
) => ({
  sender: { name: overrides.senderName, email: senderEmail },
  to: overrides.to ?? [{ email: 'thomas@devlab.io' }],
  cc: overrides.cc ?? null,
  subject: overrides.subject ?? 'Re: Devis Socredo',
  listUnsubscribe: overrides.listUnsubscribe,
  body: overrides.body ?? '<p>On se cale un point ?</p>',
});

describe('cleanSubject', () => {
  it('retire les préfixes Re:/Fwd:/Tr: empilés', () => {
    expect(cleanSubject('Re:  RE: Fwd: Tr: Devis Socredo')).toBe('Devis Socredo');
    expect(cleanSubject('Devis')).toBe('Devis');
  });
});

describe('buildMeetingPreview', () => {
  it('déduplique les participants sur tous les messages et marque isSelf', () => {
    const preview = buildMeetingPreview(
      {
        messages: [
          msg('client@ext.pf', { senderName: 'Olivier', cc: [{ email: 'shane@devlab.io' }] }),
          msg('thomas@devlab.io', { to: [{ email: 'client@ext.pf' }] }),
        ],
      },
      { selfEmail: 'Thomas@Devlab.io' },
    );
    const emails = preview.participants.map((participant) => participant.email);
    expect(emails).toEqual(['client@ext.pf', 'thomas@devlab.io', 'shane@devlab.io']);
    expect(preview.participants.find((p) => p.email === 'thomas@devlab.io')?.isSelf).toBe(true);
    expect(preview.participants.find((p) => p.email === 'client@ext.pf')?.name).toBe('Olivier');
  });

  it('écarte no-reply et expéditeurs de listes — VISIBLES dans excluded', () => {
    const preview = buildMeetingPreview(
      {
        messages: [
          msg('no-reply@banque.pf'),
          msg('newsletter@promo.pf', { listUnsubscribe: '<mailto:unsub@promo.pf>' }),
          msg('client@ext.pf'),
        ],
      },
      { selfEmail: 'thomas@devlab.io' },
    );
    expect(preview.participants.map((p) => p.email)).not.toContain('no-reply@banque.pf');
    expect(preview.participants.map((p) => p.email)).not.toContain('newsletter@promo.pf');
    expect(preview.excluded).toEqual(
      expect.arrayContaining([
        { email: 'no-reply@banque.pf', reason: 'no-reply' },
        { email: 'newsletter@promo.pf', reason: 'mailing-list' },
      ]),
    );
  });

  it('sujet nettoyé + contexte détaggé borné + fuseau + verrous produit', () => {
    const preview = buildMeetingPreview(
      {
        messages: [
          msg('client@ext.pf', {
            subject: 'Re: Fwd: Devis Socredo',
            body: '<div>Contexte <b>riche</b> ' + 'x'.repeat(1000) + '</div>',
          }),
        ],
      },
      { selfEmail: 'thomas@devlab.io', timeZone: 'Pacific/Tahiti' },
    );
    expect(preview.subject).toBe('RDV — Devis Socredo');
    expect(preview.context.startsWith('Contexte riche')).toBe(true);
    expect(preview.context.length).toBeLessThanOrEqual(400);
    expect(preview.timeZone).toBe('Pacific/Tahiti');
    expect(preview.suggestedDurationMinutes).toBe(30);
    // Les verrous : dispos = scope calendrier incrémental ; création = humain.
    expect(preview.availabilityRequiresCalendarScope).toBe(true);
    expect(preview.creationRequiresHumanConfirmation).toBe(true);
  });

  it('plafonne à 15 participants sans jamais lever', () => {
    const to = Array.from({ length: 30 }, (_, index) => ({ email: `p${index}@ext.pf` }));
    const preview = buildMeetingPreview(
      { messages: [msg('client@ext.pf', { to })] },
      { selfEmail: 'thomas@devlab.io' },
    );
    expect(preview.participants.length).toBeLessThanOrEqual(15);
  });
});
