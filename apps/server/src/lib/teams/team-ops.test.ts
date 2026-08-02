import {
  computeOverdue,
  coverage,
  durationStats,
  labelVolumes,
  nearestRank,
  oldestOpenWithoutReply,
  reopeningsAndTransfers,
  responseAndResolutionStats,
  stuckProcessingRuns,
  workloadByMember,
  type OpsThreadRow,
} from './team-ops';
import type { BusinessWindow } from './business-time';
import { describe, expect, it } from 'vitest';

const tahiti: BusinessWindow = {
  timeZone: 'Pacific/Tahiti',
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '16:00',
};

// Lundi 3 août 2026 10:00 locale Tahiti = 20:00 UTC.
const NOW = Date.parse('2026-08-03T20:00:00.000Z');
const hoursAgo = (h: number) => NOW - h * 3_600_000;

const row = (overrides: Partial<OpsThreadRow>): OpsThreadRow => ({
  teamThreadId: 'tt-1',
  subject: 'Sujet',
  status: 'open',
  assigneeUserId: null,
  sharedAtMs: hoursAgo(3),
  firstReplyAtMs: null,
  firstClosedAtMs: null,
  ...overrides,
});

describe('nearestRank / durationStats', () => {
  it('computes nearest-rank percentiles with explicit sample size', () => {
    expect(nearestRank([], 50)).toBeNull();
    expect(nearestRank([10], 90)).toBe(10);
    expect(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(nearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(durationStats([30, 10, 20])).toEqual({
      medianMinutes: 20,
      p90Minutes: 30,
      sampleSize: 3,
    });
  });
});

describe('computeOverdue — SLA en minutes ouvrées', () => {
  it('without a policy, overdue metrics are ABSENT (null), never zero', () => {
    expect(computeOverdue([row({})], null, NOW)).toEqual({
      firstResponse: null,
      resolution: null,
    });
  });

  it('counts open threads whose BUSINESS age exceeds the target, ignoring replied/closed', () => {
    const sla = { firstResponseMinutes: 60, resolutionMinutes: 240, window: tahiti };
    const rows = [
      // Partagé lundi 08:00 locale (2h ouvrées avant NOW=10:00) — première
      // réponse en retard (>60 min), résolution pas encore (<240).
      row({ teamThreadId: 'a', sharedAtMs: hoursAgo(2) }),
      // Partagé il y a 30 min ouvrées — dans les clous.
      row({ teamThreadId: 'b', sharedAtMs: NOW - 30 * 60_000 }),
      // En retard mais DÉJÀ répondu via Reta → pas overdue first response.
      row({ teamThreadId: 'c', sharedAtMs: hoursAgo(2), firstReplyAtMs: hoursAgo(1) }),
      // Clos → ni l'un ni l'autre.
      row({ teamThreadId: 'd', status: 'closed', sharedAtMs: hoursAgo(50) }),
    ];
    expect(computeOverdue(rows, sla, NOW)).toEqual({ firstResponse: 1, resolution: 0 });
  });

  it('weekend hours do not age a thread (shared Friday evening, checked Monday morning)', () => {
    // Vendredi 31/07 17:00 locale (après fermeture) → lundi 10:00 : 2h ouvrées.
    const fridayEvening = Date.parse('2026-08-01T03:00:00.000Z'); // ven 17:00 Tahiti
    const sla = { firstResponseMinutes: 180, resolutionMinutes: null, window: tahiti };
    expect(computeOverdue([row({ sharedAtMs: fridayEvening })], sla, NOW)).toEqual({
      firstResponse: 0,
      resolution: null,
    });
  });
});

describe('oldestOpenWithoutReply', () => {
  it('picks the oldest OPEN thread with no reply recorded through Reta', () => {
    const oldest = row({ teamThreadId: 'old', sharedAtMs: hoursAgo(100) });
    const result = oldestOpenWithoutReply([
      row({ teamThreadId: 'young', sharedAtMs: hoursAgo(1) }),
      oldest,
      row({ teamThreadId: 'replied', sharedAtMs: hoursAgo(200), firstReplyAtMs: hoursAgo(199) }),
      row({ teamThreadId: 'closed', status: 'closed', sharedAtMs: hoursAgo(300) }),
    ]);
    expect(result?.teamThreadId).toBe('old');
    expect(oldestOpenWithoutReply([])).toBeNull();
  });
});

describe('responseAndResolutionStats', () => {
  it('measures business durations only for threads with recorded events', () => {
    const rows = [
      // 60 min ouvrées entre partage (08:00 locale) et réponse (09:00).
      row({ sharedAtMs: hoursAgo(2), firstReplyAtMs: hoursAgo(1) }),
      row({ sharedAtMs: hoursAgo(3), firstReplyAtMs: null }),
      // Partagé 08:00 locale, clos 10:00 → 120 min ouvrées.
      row({ status: 'closed', sharedAtMs: hoursAgo(2), firstClosedAtMs: NOW }),
    ];
    const stats = responseAndResolutionStats(rows, tahiti);
    expect(stats.firstResponse).toMatchObject({ medianMinutes: 60, sampleSize: 1 });
    expect(stats.resolution).toMatchObject({ medianMinutes: 120, sampleSize: 1 });
  });
});

describe('reopeningsAndTransfers', () => {
  const event = (
    subjectId: string,
    action: string,
    metadata: Record<string, unknown>,
    minutes: number,
  ) => ({ subjectId, action, metadata, createdAtMs: NOW + minutes * 60_000 });

  it('counts closed→open transitions and reassignments between two members', () => {
    const result = reopeningsAndTransfers([
      event('t1', 'thread.status_changed', { status: 'closed' }, 1),
      event('t1', 'thread.status_changed', { status: 'open' }, 2), // réouverture
      event('t1', 'thread.assigned', { assigneeUserId: 'u1' }, 3),
      event('t1', 'thread.assigned', { assigneeUserId: 'u2' }, 4), // transfert
      event('t1', 'thread.assigned', { assigneeUserId: null }, 5), // désassignation ≠ transfert
      event('t2', 'thread.status_changed', { status: 'open' }, 1), // open sans closed avant
      event('t2', 'thread.assigned', { assigneeUserId: 'u1' }, 2), // première assignation
    ]);
    expect(result).toEqual({ reopenings: 1, transfers: 1 });
  });

  it('sorts events per thread before deriving', () => {
    const result = reopeningsAndTransfers([
      event('t1', 'thread.status_changed', { status: 'open' }, 10),
      event('t1', 'thread.status_changed', { status: 'closed' }, 5),
    ]);
    expect(result.reopenings).toBe(1);
  });
});

describe('workloadByMember — alphabétique, sans score', () => {
  it('counts open assigned threads per member, alphabetically, zero included', () => {
    const rows = [
      row({ assigneeUserId: 'u2' }),
      row({ assigneeUserId: 'u2' }),
      row({ assigneeUserId: 'u1' }),
      row({ status: 'closed', assigneeUserId: 'u1' }),
    ];
    const result = workloadByMember(rows, [
      { userId: 'u1', name: 'Zoé' },
      { userId: 'u2', name: 'Ari' },
      { userId: 'u3', name: 'Moe' },
    ]);
    expect(result).toEqual([
      { userId: 'u2', name: 'Ari', openAssigned: 2 },
      { userId: 'u3', name: 'Moe', openAssigned: 0 },
      { userId: 'u1', name: 'Zoé', openAssigned: 1 },
    ]);
  });
});

describe('labelVolumes — ACL-first, multi-label, shared/resolved distincts', () => {
  const links = [
    { teamThreadId: 't1', labelId: 'l1', labelName: 'Clients' },
    { teamThreadId: 't1', labelId: 'l2', labelName: 'Urgent' },
    { teamThreadId: 't2', labelId: 'l1', labelName: 'Clients' },
    { teamThreadId: 't-restricted', labelId: 'l1', labelName: 'Clients' },
  ];

  it('a multi-label thread counts in EACH of its labels; shared and resolved stay distinct', () => {
    const result = labelVolumes(links, new Set(['t1', 't2']), new Set(['t1']));
    expect(result).toEqual([
      { labelId: 'l1', name: 'Clients', shared: 2, resolved: 1 },
      { labelId: 'l2', name: 'Urgent', shared: 1, resolved: 1 },
    ]);
  });

  it('a link to a thread OUTSIDE the visible window sets contributes nothing (restricted invisible)', () => {
    // t-restricted n'est ni dans shared ni dans resolved : le store ne
    // fournit que des fils ACL-visibles, et même un lien résiduel ne compte pas.
    const result = labelVolumes(links, new Set(['t2']), new Set());
    expect(result).toEqual([{ labelId: 'l1', name: 'Clients', shared: 1, resolved: 0 }]);
  });

  it('deduplicates repeated (thread, label) links and sorts alphabetically', () => {
    const result = labelVolumes(
      [
        { teamThreadId: 't1', labelId: 'lz', labelName: 'Zèbre' },
        { teamThreadId: 't1', labelId: 'lz', labelName: 'Zèbre' },
        { teamThreadId: 't1', labelId: 'la', labelName: 'Alpha' },
      ],
      new Set(['t1']),
      new Set(),
    );
    expect(result).toEqual([
      { labelId: 'la', name: 'Alpha', shared: 1, resolved: 0 },
      { labelId: 'lz', name: 'Zèbre', shared: 1, resolved: 0 },
    ]);
  });
});

describe('stuckProcessingRuns', () => {
  it('flags processing claims older than 15 minutes', () => {
    const result = stuckProcessingRuns(
      [
        { id: 'r1', ruleName: 'A', createdAtMs: NOW - 20 * 60_000 },
        { id: 'r2', ruleName: 'B', createdAtMs: NOW - 5 * 60_000 },
      ],
      NOW,
    );
    expect(result).toEqual([{ id: 'r1', ruleName: 'A', ageMinutes: 20 }]);
  });
});

describe('coverage', () => {
  it('marks members absent only during a declared window, alphabetically', () => {
    const result = coverage(
      [
        { userId: 'u1', name: 'Zoé' },
        { userId: 'u2', name: 'Ari' },
      ],
      [
        { userId: 'u1', startsAtMs: NOW - 1000, endsAtMs: NOW + 1000 },
        { userId: 'u2', startsAtMs: NOW + 5000, endsAtMs: NOW + 9000 }, // future
      ],
      NOW,
    );
    expect(result.rows[0]).toEqual({ userId: 'u2', name: 'Ari', absentUntilMs: null });
    expect(result.rows[1]).toEqual({ userId: 'u1', name: 'Zoé', absentUntilMs: NOW + 1000 });
    expect(result.availableCount).toBe(1);
  });
});
