import {
  evaluateRule,
  isRunForeignActivity,
  normalizeActions,
  normalizeTriggers,
  requiresAclConfirmation,
  threadMetaForRules,
  verdictSummary,
  TeamRuleValidationError,
  type RuleThreadMeta,
} from './team-rules';
import type { IGetThreadResponse } from '../driver/types';
import { describe, expect, it } from 'vitest';

const meta = (overrides: Partial<RuleThreadMeta> = {}): RuleThreadMeta => ({
  senderEmail: 'client@pacific-freight.pf',
  recipients: ['sales@devlab.io', 'omar@devlab.io'],
  subject: 'Renewal quote — urgent',
  bodyText: 'Hello, can you confirm the freight surcharge before Friday?',
  gmailLabels: ['INBOX', 'Label_12', 'Clients'],
  receivedOn: '2026-08-03T09:30:00.000Z',
  ...overrides,
});

describe('normalizeTriggers', () => {
  it('lowercases, dedups, strips leading @ on domains and drops empty families', () => {
    const normalized = normalizeTriggers({
      senders: [' Client@Pacific-Freight.PF ', 'client@pacific-freight.pf'],
      domains: ['@Devlab.io'],
      keywords: ['', '  URGENT  '],
      recipients: [],
    });
    expect(normalized).toEqual({
      senders: ['client@pacific-freight.pf'],
      domains: ['devlab.io'],
      keywords: ['urgent'],
    });
  });

  it('rejects trigger-less rules and malformed hours', () => {
    expect(() => normalizeTriggers({})).toThrow(TeamRuleValidationError);
    expect(() => normalizeTriggers({ senders: ['   '] })).toThrow('no_trigger');
    expect(() =>
      normalizeTriggers({ hours: { from: '25:00', to: '10:00', timeZone: 'Pacific/Tahiti' } }),
    ).toThrow('invalid_hours');
    expect(() =>
      normalizeTriggers({ hours: { from: '08:00', to: '17:00', timeZone: 'Not/AZone' } }),
    ).toThrow('invalid_hours');
  });

  it('keeps valid hours with deduped days', () => {
    expect(
      normalizeTriggers({
        hours: { from: '08:00', to: '17:00', timeZone: 'Pacific/Tahiti', days: [1, 1, 5, 9] },
      }),
    ).toEqual({ hours: { from: '08:00', to: '17:00', timeZone: 'Pacific/Tahiti', days: [1, 5] } });
  });
});

describe('evaluateRule — familles individuelles', () => {
  it('matches sender exactly, with an explicit reason either way', () => {
    const hit = evaluateRule(meta(), { senders: ['client@pacific-freight.pf'] });
    expect(hit.matched).toBe(true);
    expect(hit.reasons[0]).toMatchObject({ trigger: 'senders', matched: true });

    const miss = evaluateRule(meta(), { senders: ['other@x.com'] });
    expect(miss.matched).toBe(false);
    expect(miss.reasons[0]?.detail).toContain('client@pacific-freight.pf');
  });

  it('matches the sender domain', () => {
    expect(evaluateRule(meta(), { domains: ['pacific-freight.pf'] }).matched).toBe(true);
    expect(evaluateRule(meta(), { domains: ['devlab.io'] }).matched).toBe(false);
  });

  it('matches any listed recipient in To/Cc', () => {
    expect(evaluateRule(meta(), { recipients: ['omar@devlab.io'] }).matched).toBe(true);
    expect(evaluateRule(meta(), { recipients: ['absent@devlab.io'] }).matched).toBe(false);
  });

  it('matches keywords in subject OR body, case-insensitively', () => {
    expect(evaluateRule(meta(), { keywords: ['urgent'] }).matched).toBe(true);
    expect(evaluateRule(meta(), { keywords: ['surcharge'] }).matched).toBe(true);
    expect(evaluateRule(meta(), { keywords: ['facture'] }).matched).toBe(false);
  });

  it('matches gmail labels by id or name, case-insensitively', () => {
    expect(evaluateRule(meta(), { gmailLabels: ['clients'] }).matched).toBe(true);
    expect(evaluateRule(meta(), { gmailLabels: ['Label_12'] }).matched).toBe(true);
    expect(evaluateRule(meta(), { gmailLabels: ['Suppliers'] }).matched).toBe(false);
  });
});

describe('evaluateRule — plages horaires', () => {
  // 2026-08-03T09:30Z = lundi 23:30 (2 août) à Tahiti (UTC-10).
  const hours = (from: string, to: string, days?: number[]) => ({
    hours: { from, to, timeZone: 'Pacific/Tahiti', ...(days ? { days } : {}) },
  });

  it('evaluates the received time in the rule time zone', () => {
    expect(evaluateRule(meta(), hours('22:00', '23:59')).matched).toBe(true);
    expect(evaluateRule(meta(), hours('08:00', '17:00')).matched).toBe(false);
  });

  it('supports overnight windows crossing midnight', () => {
    expect(evaluateRule(meta(), hours('22:00', '06:00')).matched).toBe(true);
    expect(evaluateRule(meta(), hours('06:00', '22:00')).matched).toBe(false);
  });

  it('restricts to listed local weekdays', () => {
    // Localement dimanche 2 août 23:30 → day 0.
    expect(evaluateRule(meta(), hours('22:00', '23:59', [0])).matched).toBe(true);
    expect(evaluateRule(meta(), hours('22:00', '23:59', [1, 2])).matched).toBe(false);
  });

  it('never matches when the received time is unknown', () => {
    const verdict = evaluateRule(meta({ receivedOn: null }), hours('00:00', '23:59'));
    expect(verdict.matched).toBe(false);
    expect(verdict.reasons[0]?.detail).toContain('unknown');
  });
});

describe('evaluateRule — combinaison ET', () => {
  it('requires every present family to match', () => {
    const both = { domains: ['pacific-freight.pf'], keywords: ['urgent'] };
    expect(evaluateRule(meta(), both).matched).toBe(true);
    expect(evaluateRule(meta({ subject: 'hello', bodyText: '' }), both).matched).toBe(false);
  });

  it('summarizes every family verdict for the run reason', () => {
    const verdict = evaluateRule(meta(), {
      domains: ['pacific-freight.pf'],
      keywords: ['facture'],
    });
    const summary = verdictSummary(verdict);
    expect(summary).toContain('domains: ✓');
    expect(summary).toContain('keywords: ✗');
  });
});

describe('threadMetaForRules', () => {
  it('projects the latest message and strips html from the body', () => {
    const thread = {
      latest: {
        sender: { email: 'A@B.com', name: 'A' },
        to: [{ email: 'C@D.com' }],
        cc: [{ email: 'E@F.com' }],
        subject: 'Sujet',
        decodedBody: '<p>Bonjour <b>monde</b></p>',
        tags: [{ id: 'Label_1', name: 'Clients' }],
        receivedOn: '2026-08-03T10:00:00.000Z',
      },
      messages: [{}],
    } as unknown as IGetThreadResponse;
    const projected = threadMetaForRules(thread);
    expect(projected).toMatchObject({
      senderEmail: 'a@b.com',
      recipients: ['c@d.com', 'e@f.com'],
      subject: 'Sujet',
      gmailLabels: ['Label_1', 'Clients'],
    });
    expect(projected?.bodyText).toBe('Bonjour monde');
  });

  it('returns null for empty threads', () => {
    expect(
      threadMetaForRules({ latest: undefined, messages: [] } as unknown as IGetThreadResponse),
    ).toBeNull();
  });
});

describe('evaluateRule — familles non évaluables (preview)', () => {
  it('marks unavailable families and yields a partial verdict from the rest', () => {
    const verdict = evaluateRule(
      meta(),
      { domains: ['pacific-freight.pf'], recipients: ['omar@devlab.io'], keywords: ['urgent'] },
      { unavailable: ['recipients', 'keywords'] },
    );
    expect(verdict.matched).toBe(true);
    expect(verdict.partial).toBe(true);
    const recipients = verdict.reasons.find((reason) => reason.trigger === 'recipients');
    expect(recipients).toMatchObject({ matched: false, unavailable: true });
  });

  it('does not match when every family is unavailable', () => {
    const verdict = evaluateRule(meta(), { keywords: ['urgent'] }, { unavailable: ['keywords'] });
    expect(verdict.matched).toBe(false);
    expect(verdict.partial).toBe(true);
  });

  it('full evaluation stays non-partial', () => {
    expect(evaluateRule(meta(), { keywords: ['urgent'] }).partial).toBe(false);
  });
});

describe('normalizeActions', () => {
  it('rejects empty action lists and puts share first', () => {
    expect(() => normalizeActions([])).toThrow('no_action');
    const ordered = normalizeActions([
      { kind: 'assign', userId: 'user-2' },
      { kind: 'share', visibility: 'team' },
    ]);
    expect(ordered[0]).toEqual({ kind: 'share', visibility: 'team' });
  });
});

describe('isRunForeignActivity — préflight d’unshare par provenance', () => {
  const RUN = 'run-1';

  it('les mutations de CE run (source rule + même runId) ne bloquent pas', () => {
    expect(
      isRunForeignActivity({ metadata: { source: 'rule', ruleId: 'r1', runId: RUN } }, RUN),
    ).toBe(false);
    expect(
      isRunForeignActivity(
        { metadata: { source: 'rule', ruleId: 'r1', runId: RUN, assigneeUserId: 'u2' } },
        RUN,
      ),
    ).toBe(false);
  });

  it('une action MANUELLE ultérieure — même par le créateur de la règle — bloque', () => {
    // Metadata d'un setThreadStatus manuel : aucune provenance.
    expect(isRunForeignActivity({ metadata: { status: 'closed' } }, RUN)).toBe(true);
    expect(isRunForeignActivity({ metadata: {} }, RUN)).toBe(true);
  });

  it('l’écriture d’une AUTRE règle (autre runId) bloque', () => {
    expect(
      isRunForeignActivity({ metadata: { source: 'rule', ruleId: 'r2', runId: 'run-2' } }, RUN),
    ).toBe(true);
  });

  it('une provenance partielle ou falsifiée ne passe jamais pour ce run', () => {
    expect(isRunForeignActivity({ metadata: { source: 'rule' } }, RUN)).toBe(true);
    expect(isRunForeignActivity({ metadata: { runId: RUN } }, RUN)).toBe(true);
    expect(isRunForeignActivity({ metadata: { source: 'manual', runId: RUN } }, RUN)).toBe(true);
  });
});

describe('requiresAclConfirmation', () => {
  it('is required exactly when a share action is present', () => {
    expect(requiresAclConfirmation([{ kind: 'share', visibility: 'team' }])).toBe(true);
    expect(
      requiresAclConfirmation([
        { kind: 'assign', userId: 'u' },
        { kind: 'share', visibility: 'team' },
      ]),
    ).toBe(true);
    expect(requiresAclConfirmation([{ kind: 'assign', userId: 'u' }])).toBe(false);
    expect(requiresAclConfirmation([{ kind: 'notify', userIds: ['u'] }])).toBe(false);
    expect(requiresAclConfirmation([])).toBe(false);
  });
});
