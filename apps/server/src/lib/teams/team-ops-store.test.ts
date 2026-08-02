import { declareAbsence, setSlaPolicy, type SlaPolicyInput } from './team-ops-store';
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { DB } from '../../db';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'team-ops-store.ts'),
  'utf8',
);

// --- contrat source : ACL avant agrégation, bornes, honnêteté ----------------

describe('team ops store contract — ACL-first aggregation', () => {
  it('the base thread query applies the caller accessPredicate BEFORE any aggregate', () => {
    const overviewBlock = source.slice(source.indexOf('export async function getOpsOverview'));
    const aclAt = overviewBlock.indexOf('accessPredicate(userId)');
    const countsAt = overviewBlock.indexOf('counts: {');
    expect(aclAt).toBeGreaterThan(-1);
    expect(countsAt).toBeGreaterThan(aclAt);
  });

  it('audit events are restricted to the ACL-visible thread set, never the whole team', () => {
    expect(source).toContain('inArray(teamAuditLog.subjectId, teamThreadIds)');
  });

  it('first reply joins send_job on the EXACT (sharer connection, provider threadId) pair', () => {
    // Les threadIds Gmail sont scopés par connexion : un group-by threadId
    // seul serait une collision cross-account. Le couple exact + updatedAt
    // STRICTEMENT postérieur au partage éliminent les jobs pré-partage.
    expect(source).toContain('eq(sendJob.connectionId, teamThread.sharerConnectionId)');
    expect(source).toContain('eq(sendJob.threadId, teamThread.threadId)');
    expect(source).toContain("eq(sendJob.status, 'sent')");
    expect(source).toContain('${sendJob.updatedAt} > ${teamThread.createdAt}');
    expect(source).toContain('.groupBy(teamThread.id)');
    expect(source).toContain('min(sendJob.updatedAt)');
    // Plus aucun mapping par threadId provider seul.
    expect(source).not.toContain('.groupBy(sendJob.threadId)');
  });

  it('resolvedInWindow counts DISTINCT team threads, not repeated close events', () => {
    expect(source).toContain('const resolvedInWindowIds = new Set(');
    expect(source).toContain('const resolvedInWindow = resolvedInWindowIds.size');
  });

  it('label volumes are built on the ACL-visible thread set with team-scoped labels, bounded', () => {
    expect(source).toContain('inArray(teamThreadLabel.teamThreadId, teamThreadIds)');
    expect(source).toContain('innerJoin(teamLabel, eq(teamLabel.id, teamThreadLabel.labelId))');
    expect(source).toContain('eq(teamLabel.teamId, teamId)');
    expect(source).toContain('MAX_LABEL_LINKS = 5000');
    expect(source).toContain('labelsTruncated');
  });

  it('bounds are explicit and surfaced as truncated flags', () => {
    expect(source).toContain('MAX_OPS_THREADS = 1000');
    expect(source).toContain('MAX_OPS_EVENTS = 5000');
    expect(source).toContain('threadsTruncated');
    expect(source).toContain('eventsTruncated');
  });

  it('the window is clamped 1..90 days server-side too', () => {
    expect(source).toContain('Math.min(Math.max(Math.floor(options.windowDays), 1), 90)');
  });
});

describe('team ops store contract — write authorization', () => {
  it('setSlaPolicy is owner-write; reads are member-read', () => {
    const block = source.slice(
      source.indexOf('export async function setSlaPolicy'),
      source.indexOf('// --- disponibilité'),
    );
    expect(block).toContain('requireOwner');
    const readBlock = source.slice(
      source.indexOf('export async function getSlaPolicy'),
      source.indexOf('export async function setSlaPolicy'),
    );
    expect(readBlock).toContain('requireMembership');
    expect(readBlock).not.toContain('requireOwner');
  });

  it('absence writes are self-or-owner, never a member for someone else', () => {
    expect(source).toContain("if (input.targetUserId !== userId && membership.role !== 'owner')");
    expect(source).toContain("if (absence.userId !== userId && membership.role !== 'owner')");
  });

  it('policy and availability writes are audited', () => {
    expect(source).toContain("action: 'sla.updated'");
    expect(source).toContain("action: 'availability.declared'");
    expect(source).toContain("action: 'availability.removed'");
  });
});

// --- refus RÉELS sur fake drizzle séquentiel --------------------------------

function fakeDb(selectResults: unknown[][]): DB {
  let call = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResults[call++] ?? [],
        }),
      }),
    }),
    insert: () => ({
      values: () => {
        const thenable = {
          onConflictDoUpdate: async () => undefined,
          // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are awaitable; this mock reproduces that contract.
          then: (resolveFn: (value: unknown) => void) => resolveFn(undefined),
        };
        return thenable;
      },
    }),
  } as unknown as DB;
}

const validPolicy: SlaPolicyInput = {
  firstResponseMinutes: 60,
  resolutionMinutes: null,
  timeZone: 'Pacific/Tahiti',
  businessHours: { days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00' },
};

describe('setSlaPolicy — refus réels', () => {
  it('rejects a plain member (owner-write enforced in SQL-backed check)', async () => {
    await expect(
      setSlaPolicy(fakeDb([[{ role: 'member' }]]), 'u1', 't1', validPolicy),
    ).rejects.toThrow('forbidden');
  });

  it('rejects an invalid IANA timezone and inverted/empty business hours', async () => {
    const owner = () => fakeDb([[{ role: 'owner' }]]);
    await expect(
      setSlaPolicy(owner(), 'u1', 't1', { ...validPolicy, timeZone: 'Not/AZone' }),
    ).rejects.toThrow('invalid_hours');
    await expect(
      setSlaPolicy(owner(), 'u1', 't1', {
        ...validPolicy,
        businessHours: { days: [1], start: '17:00', end: '08:00' },
      }),
    ).rejects.toThrow('invalid_hours');
    await expect(
      setSlaPolicy(owner(), 'u1', 't1', {
        ...validPolicy,
        businessHours: { days: [], start: '08:00', end: '17:00' },
      }),
    ).rejects.toThrow('invalid_hours');
  });

  it('accepts a valid policy from an owner', async () => {
    await expect(
      setSlaPolicy(fakeDb([[{ role: 'owner' }]]), 'u1', 't1', validPolicy),
    ).resolves.toBeUndefined();
  });
});

describe('declareAbsence — refus réels', () => {
  const window = {
    startsAt: new Date('2026-08-10T00:00:00.000Z'),
    endsAt: new Date('2026-08-12T00:00:00.000Z'),
  };

  it('a member cannot declare an absence for someone ELSE', async () => {
    await expect(
      declareAbsence(fakeDb([[{ role: 'member' }]]), 'u1', 't1', {
        targetUserId: 'u2',
        ...window,
      }),
    ).rejects.toThrow('forbidden');
  });

  it('a member CAN declare their own absence; an owner can declare for anyone', async () => {
    await expect(
      declareAbsence(fakeDb([[{ role: 'member' }], [{ role: 'member' }]]), 'u1', 't1', {
        targetUserId: 'u1',
        ...window,
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
    await expect(
      declareAbsence(fakeDb([[{ role: 'owner' }], [{ role: 'member' }]]), 'u1', 't1', {
        targetUserId: 'u2',
        ...window,
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  it('rejects inverted or overlong periods and non-member targets', async () => {
    await expect(
      declareAbsence(fakeDb([[{ role: 'owner' }], [{ role: 'member' }]]), 'u1', 't1', {
        targetUserId: 'u2',
        startsAt: window.endsAt,
        endsAt: window.startsAt,
      }),
    ).rejects.toThrow('invalid_hours');
    await expect(
      declareAbsence(fakeDb([[{ role: 'owner' }], []]), 'u1', 't1', {
        targetUserId: 'ghost',
        ...window,
      }),
    ).rejects.toThrow('not_a_member');
  });
});
