import {
  buildRuleActions,
  buildRuleTriggers,
  emptyRuleForm,
  parseCsv,
  ruleFormFromRule,
  ruleFormReady,
  type TeamRuleView,
} from './team-rules-form';
import { describe, expect, it } from 'vitest';

const TZ = 'Pacific/Tahiti';

describe('parseCsv', () => {
  it('trims, drops empties, returns undefined when nothing remains', () => {
    expect(parseCsv(' a@x.com , , b@y.com ')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseCsv('  ,  ')).toBeUndefined();
    expect(parseCsv('')).toBeUndefined();
  });
});

describe('buildRuleTriggers / buildRuleActions', () => {
  it('builds only the provided families and carries the timezone into hours', () => {
    const triggers = buildRuleTriggers(
      { ...emptyRuleForm, domains: 'a.pf', hoursEnabled: true, hoursDays: [1, 5] },
      TZ,
    );
    expect(triggers).toEqual({
      domains: ['a.pf'],
      hours: { from: '08:00', to: '17:00', timeZone: TZ, days: [1, 5] },
    });
  });

  it('assembles actions, clamping snooze hours and skipping empty ones', () => {
    const actions = buildRuleActions({
      ...emptyRuleForm,
      share: true,
      assignUserId: 'u2',
      snoozeHours: '9999',
      notifyUserIds: ['u3'],
    });
    expect(actions).toEqual([
      { kind: 'share', visibility: 'team' },
      { kind: 'assign', userId: 'u2' },
      { kind: 'snooze', hours: 720 },
      { kind: 'notify', userIds: ['u3'] },
    ]);
  });
});

describe('ruleFormReady — la confirmation ACL conditionne la soumission', () => {
  const base = { ...emptyRuleForm, name: 'R', domains: 'a.pf' };
  it('a share rule is NOT submittable without a fresh confirmation', () => {
    expect(ruleFormReady({ ...base, share: true, confirmAclExpansion: false }, TZ)).toBe(false);
    expect(ruleFormReady({ ...base, share: true, confirmAclExpansion: true }, TZ)).toBe(true);
  });
  it('a rule without share needs no confirmation', () => {
    expect(
      ruleFormReady({ ...base, share: false, confirmAclExpansion: false, assignUserId: 'u2' }, TZ),
    ).toBe(true);
  });
  it('still requires name, a trigger and an action', () => {
    expect(ruleFormReady({ ...base, name: ' ', share: true, confirmAclExpansion: true }, TZ)).toBe(
      false,
    );
    expect(
      ruleFormReady({ ...base, domains: '', share: true, confirmAclExpansion: true }, TZ),
    ).toBe(false);
    expect(ruleFormReady({ ...base, share: false, confirmAclExpansion: false }, TZ)).toBe(false);
  });
});

describe('ruleFormFromRule', () => {
  it('hydrates the form but NEVER pre-checks the ACL confirmation', () => {
    const rule: TeamRuleView = {
      id: 'r1',
      teamId: 't1',
      name: 'Partage clients',
      enabled: true,
      createdByName: 'Thomas',
      watchesEmail: 'contact@devlab.io',
      triggers: { domains: ['a.pf'], hours: { from: '08:00', to: '17:00', timeZone: TZ } },
      actions: [
        { kind: 'share', visibility: 'team' },
        { kind: 'todo', assigneeUserId: 'u2' },
      ],
    };
    const form = ruleFormFromRule(rule);
    expect(form.share).toBe(true);
    expect(form.confirmAclExpansion).toBe(false);
    expect(form.todo).toBe(true);
    expect(form.todoAssigneeUserId).toBe('u2');
    expect(form.hoursEnabled).toBe(true);
  });
});
