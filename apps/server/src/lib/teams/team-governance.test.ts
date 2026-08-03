import { planTeamRestore, type RestoreContext } from './team-governance';
import type { TeamDataExport } from './team-governance-shared';
import { describe, expect, it } from 'vitest';

/**
 * Plan de restauration PUR : remap d'ids, écarts nommés, appelant owner,
 * règles désactivées. Aucune I/O — le contexte est entièrement injecté.
 */

const NOW = new Date('2026-08-03T00:00:00.000Z');

function makeContext(overrides: Partial<RestoreContext> = {}): RestoreContext {
  let n = 0;
  return {
    callerId: 'u-caller',
    users: new Map([
      ['u-caller', { email: 'caller@devlab.pf' }],
      ['u-owner', { email: 'owner@devlab.pf' }],
      ['u-member', { email: 'member@devlab.pf' }],
      ['u-guest', { email: 'guest@ext.pf' }],
      // Même id qu'à l'export mais email divergent : l'id ne suffit JAMAIS.
      ['u-spoof', { email: 'different@devlab.pf' }],
    ]),
    connectionsByUser: new Map([
      ['u-owner', [{ id: 'conn-owner', email: 'owner@devlab.pf' }]],
      ['u-member', [{ id: 'conn-member', email: 'member@devlab.pf' }]],
    ]),
    authorizedMemberIds: new Set(['u-owner', 'u-member', 'u-guest', 'u-gone', 'u-spoof']),
    sourceThreads: new Map([
      [
        'old-t1',
        {
          threadId: 'gmail-1',
          sharerUserId: 'u-owner',
          sharerEmail: 'owner@devlab.pf',
          providerId: 'google',
        },
      ],
      [
        'old-t2',
        {
          threadId: 'gmail-2',
          sharerUserId: 'u-member',
          sharerEmail: 'ancienne-boite@devlab.pf',
          providerId: 'google',
        },
      ],
    ]),
    sourceRules: new Map([
      ['old-r1', { createdBy: 'u-owner', watchedEmail: 'owner@devlab.pf' }],
      ['old-r2', { createdBy: 'u-member', watchedEmail: 'ancienne-boite@devlab.pf' }],
    ]),
    newId: () => `new-${++n}`,
    now: NOW,
    sourceDigest: 'digest-1',
    ...overrides,
  };
}

function makeExport(overrides: Partial<TeamDataExport> = {}): TeamDataExport {
  return {
    format: 'reta-team-export',
    version: 1,
    exportedAt: '2026-08-01T00:00:00.000Z',
    team: {
      id: 'old-team',
      name: 'Support',
      createdBy: 'u-owner',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    members: [
      { userId: 'u-owner', email: 'owner@devlab.pf', name: 'O', role: 'owner', prefs: {} },
      { userId: 'u-member', email: 'member@devlab.pf', name: 'M', role: 'member', prefs: {} },
      { userId: 'u-guest', email: 'guest@ext.pf', name: 'G', role: 'guest', prefs: {} },
      { userId: 'u-gone', email: 'gone@devlab.pf', name: 'X', role: 'member', prefs: {} },
      { userId: 'u-spoof', email: 'other@devlab.pf', name: 'S', role: 'member', prefs: {} },
    ],
    labels: [{ id: 'old-label', name: 'urgent', color: 'red', createdBy: 'u-gone' }],
    threads: [
      {
        id: 'old-t1',
        threadId: 'gmail-1',
        sharerUserId: 'u-owner',
        sharerEmail: 'owner@devlab.pf',
        providerId: 'google',
        visibility: 'team',
        subject: 'Devis',
        preview: 'aperçu',
        participants: [{ email: 'client@ext.pf' }],
        messageCount: 3,
        latestReceivedOn: '2026-07-01T00:00:00.000Z',
        status: 'open',
        assigneeUserId: 'u-guest',
        lastActivityAt: '2026-07-02T00:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        labelIds: ['old-label'],
        accessUserIds: ['u-guest', 'u-gone'],
      },
      {
        id: 'old-t2',
        threadId: 'gmail-2',
        sharerUserId: 'u-member',
        sharerEmail: 'ancienne-boite@devlab.pf', // connexion disparue
        providerId: 'google',
        visibility: 'restricted',
        subject: 'Contrat',
        preview: '',
        participants: [],
        messageCount: 1,
        latestReceivedOn: null,
        status: 'closed',
        assigneeUserId: null,
        lastActivityAt: '2026-07-02T00:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        labelIds: [],
        accessUserIds: [],
      },
    ],
    comments: [
      {
        id: 'old-c1',
        teamThreadId: 'old-t1',
        authorUserId: 'u-member',
        body: 'on répond quoi ?',
        mentions: ['u-owner', 'u-gone'],
        quote: null,
        createdAt: '2026-07-01T01:00:00.000Z',
        updatedAt: '2026-07-01T01:00:00.000Z',
        reactions: [
          { userId: 'u-owner', emoji: '👍' },
          { userId: 'u-gone', emoji: '🔥' },
        ],
      },
      {
        id: 'old-c2',
        teamThreadId: 'old-t2', // fil écarté → commentaire écarté
        authorUserId: 'u-owner',
        body: 'suivi',
        mentions: [],
        quote: null,
        createdAt: '2026-07-01T02:00:00.000Z',
        updatedAt: '2026-07-01T02:00:00.000Z',
        reactions: [],
      },
    ],
    rules: [
      {
        id: 'old-r1',
        name: 'VIP',
        triggers: { domains: ['ext.pf'] },
        actions: [{ kind: 'share', visibility: 'team' }],
        createdBy: 'u-owner',
        watchedEmail: 'owner@devlab.pf',
        createdAt: '2026-06-15T00:00:00.000Z',
      },
      {
        id: 'old-r2',
        name: 'orpheline',
        triggers: {},
        actions: [],
        createdBy: 'u-member',
        watchedEmail: 'ancienne-boite@devlab.pf',
        createdAt: '2026-06-15T00:00:00.000Z',
      },
    ],
    slaPolicy: {
      firstResponseMinutes: 60,
      resolutionMinutes: null,
      timeZone: 'Pacific/Tahiti',
      businessHours: { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' },
    },
    retentionPolicy: { auditDays: 180, ruleRunDays: null, notificationDays: 90 },
    absences: [
      {
        userId: 'u-member',
        startsAt: '2026-08-10T00:00:00.000Z',
        endsAt: '2026-08-20T00:00:00.000Z',
        note: null,
      },
      {
        userId: 'u-member',
        startsAt: '2026-05-01T00:00:00.000Z',
        endsAt: '2026-05-10T00:00:00.000Z',
        note: 'passée',
      },
      {
        userId: 'u-gone',
        startsAt: '2026-08-10T00:00:00.000Z',
        endsAt: '2026-08-20T00:00:00.000Z',
        note: null,
      },
    ],
    truncated: [],
    excluded: [],
    ...overrides,
  };
}

describe('planTeamRestore', () => {
  it('l’appelant devient owner ; l’owner exporté redescend admin', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    const roles = new Map(plan.members.map((m) => [m.userId, m.role]));
    expect(roles.get('u-caller')).toBe('owner');
    expect(roles.get('u-owner')).toBe('admin');
    expect(roles.get('u-member')).toBe('member');
    expect(roles.get('u-guest')).toBe('guest');
  });

  it('utilisateur absent ou email divergent → écarté et NOMMÉ', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.report.skipped).toContainEqual({
      kind: 'member',
      id: 'u-gone',
      reason: 'user_missing',
    });
    expect(plan.report.skipped).toContainEqual({
      kind: 'member',
      id: 'u-spoof',
      reason: 'user_email_mismatch',
    });
  });

  it('fil sans connexion du partageur → écarté, ses commentaires suivent', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.threads).toHaveLength(1);
    expect(plan.report.skipped).toContainEqual({
      kind: 'thread',
      id: 'old-t2',
      reason: 'sharer_connection_missing',
    });
    expect(plan.report.skipped).toContainEqual({
      kind: 'comment',
      id: 'old-c2',
      reason: 'thread_skipped',
    });
    expect(plan.comments).toHaveLength(1);
  });

  it('assigné sans thread.write (guest) → désassigné, écart nommé', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.threads[0]!['assigneeUserId']).toBeNull();
    expect(plan.report.skipped).toContainEqual({
      kind: 'assignee',
      id: 'old-t1',
      reason: 'assignee_not_writer',
    });
  });

  it('remap complet des ids : labels, accès, réactions cohérents', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    const newThreadId = plan.threads[0]!['id'];
    const newLabelId = plan.labels[0]!['id'];
    expect(plan.threadLabels).toEqual([
      { teamThreadId: newThreadId, labelId: newLabelId, createdAt: NOW },
    ]);
    // u-gone écarté des accès ; u-guest conservé.
    expect(plan.accessRows).toHaveLength(1);
    expect(plan.accessRows[0]!['userId']).toBe('u-guest');
    // Réaction de u-gone écartée, mention u-gone filtrée.
    expect(plan.reactions).toHaveLength(1);
    expect(plan.comments[0]!['mentions']).toEqual(['u-owner']);
    // Label d'un créateur disparu → propriété transférée à l'appelant.
    expect(plan.labels[0]!['createdBy']).toBe('u-caller');
  });

  it('règles : TOUJOURS désactivées ; boîte surveillée disparue → écartée', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.rules).toHaveLength(1);
    expect(plan.rules[0]!['enabled']).toBe(false);
    expect(plan.report.rulesRestoredDisabled).toBe(true);
    expect(plan.report.skipped).toContainEqual({
      kind: 'rule',
      id: 'old-r2',
      reason: 'watched_connection_missing',
    });
  });

  it('absences passées ignorées, absences d’utilisateurs absents écartées', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.absences).toHaveLength(1);
    expect(plan.absences[0]!['userId']).toBe('u-member');
    expect(plan.report.skipped).toContainEqual({
      kind: 'absence',
      id: 'u-gone:2026-08-10T00:00:00.000Z',
      reason: 'user_missing',
    });
  });

  it('politiques SLA + rétention reportées sur la nouvelle équipe', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.slaPolicy?.['timeZone']).toBe('Pacific/Tahiti');
    expect(plan.retentionPolicy?.['auditDays']).toBe(180);
    expect(plan.slaPolicy?.['teamId']).toBe(plan.team.id);
  });

  it('le rapport compte exactement ce qui est restauré', () => {
    const plan = planTeamRestore(makeExport(), makeContext());
    expect(plan.report.restored).toEqual({
      members: 4, // caller + owner(admin) + member + guest
      labels: 1,
      threads: 1,
      comments: 1,
      reactions: 1,
      rules: 1,
      absences: 1,
      accessRows: 1,
    });
    expect(plan.report.sourceDigest).toBe('digest-1');
  });

  it('appelant déjà présent dans l’export : pas de doublon, owner forcé', () => {
    const payload = makeExport({
      members: [
        {
          userId: 'u-caller',
          email: 'caller@devlab.pf',
          name: 'C',
          role: 'member',
          prefs: { onComment: false },
        },
      ],
    });
    const plan = planTeamRestore(payload, makeContext());
    const callers = plan.members.filter((m) => m.userId === 'u-caller');
    expect(callers).toHaveLength(1);
    expect(callers[0]!.role).toBe('owner');
    expect(callers[0]!.prefs).toEqual({ onComment: false });
  });
});
