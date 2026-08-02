import {
  collabSnapshotStorageKey,
  completedStepCount,
  decideCollabAnalytics,
  firstOpenStep,
  parseCollabSnapshot,
  type CollabOnboardingStatus,
} from './collab-onboarding';
import { describe, expect, it } from 'vitest';

const status = (
  done: Partial<Record<keyof CollabOnboardingStatus['steps'], boolean>>,
  overrides: Partial<CollabOnboardingStatus> = {},
): CollabOnboardingStatus => ({
  teamId: 'team-1',
  teamCreatedAt: '2026-08-01T10:00:00.000Z',
  steps: {
    team_created: { done: done.team_created ?? true, at: null },
    invite_accepted: { done: done.invite_accepted ?? false, at: null },
    first_share: { done: done.first_share ?? false, at: null },
    first_comment: { done: done.first_comment ?? false, at: null },
    first_assignment_done: { done: done.first_assignment_done ?? false, at: null },
  },
  inviteSent: false,
  loopCompletedAt: null,
  loopElapsedMs: null,
  dismissedAt: null,
  ...overrides,
});

describe('firstOpenStep / completedStepCount', () => {
  it('walks the canonical order', () => {
    expect(firstOpenStep(status({}))).toBe('invite_accepted');
    expect(firstOpenStep(status({ invite_accepted: true }))).toBe('first_share');
    expect(
      firstOpenStep(
        status({
          invite_accepted: true,
          first_share: true,
          first_comment: true,
          first_assignment_done: true,
        }),
      ),
    ).toBeNull();
    expect(completedStepCount(status({ invite_accepted: true }))).toBe(2);
  });
});

describe('decideCollabAnalytics', () => {
  it('fires one event per newly completed step, never twice', () => {
    const first = decideCollabAnalytics(null, status({}));
    expect(first.events.map((event) => event.name)).toEqual(['collab_team_created']);

    const second = decideCollabAnalytics(first.snapshot, status({ invite_accepted: true }));
    expect(second.events.map((event) => event.name)).toEqual(['collab_invite_accepted']);

    const repeat = decideCollabAnalytics(second.snapshot, status({ invite_accepted: true }));
    expect(repeat.events).toEqual([]);
  });

  it('fires loop completion exactly once, carrying elapsedMs', () => {
    const complete = status(
      {
        invite_accepted: true,
        first_share: true,
        first_comment: true,
        first_assignment_done: true,
      },
      { loopCompletedAt: '2026-08-01T10:25:00.000Z', loopElapsedMs: 25 * 60_000 },
    );
    const decision = decideCollabAnalytics(null, complete);
    expect(decision.events.map((event) => event.name)).toEqual([
      'collab_team_created',
      'collab_invite_accepted',
      'collab_first_share',
      'collab_first_comment',
      'collab_first_assignment_completed',
      'collab_loop_completed',
    ]);
    expect(decision.events.at(-1)?.properties).toEqual({
      teamId: 'team-1',
      occurredAt: '2026-08-01T10:25:00.000Z',
      elapsedMs: 25 * 60_000,
      $insert_id: 'collab:team-1:collab_loop_completed:2026-08-01T10:25:00.000Z',
    });

    const again = decideCollabAnalytics(decision.snapshot, complete);
    expect(again.events).toEqual([]);
  });

  it('every event carries the teamId', () => {
    const decision = decideCollabAnalytics(null, status({ first_share: true }));
    for (const event of decision.events) {
      expect(event.properties['teamId']).toBe('team-1');
    }
  });
});

describe('snapshot storage', () => {
  it('round-trips through JSON and rejects corrupt payloads', () => {
    const decision = decideCollabAnalytics(null, status({}));
    const raw = JSON.stringify(decision.snapshot);
    expect(parseCollabSnapshot(raw)).toEqual({ fired: ['collab_team_created'] });
    expect(parseCollabSnapshot(null)).toBeNull();
    expect(parseCollabSnapshot('{not json')).toBeNull();
    expect(parseCollabSnapshot('{"fired": [1]}')).toBeNull();
    expect(parseCollabSnapshot('{"fired": ["invented_event"]}')).toBeNull();
  });

  it('keys the snapshot by user AND team', () => {
    expect(collabSnapshotStorageKey('user-1', 'team-1')).not.toBe(
      collabSnapshotStorageKey('user-1', 'team-2'),
    );
    expect(collabSnapshotStorageKey('user-1', 'team-1')).not.toBe(
      collabSnapshotStorageKey('user-2', 'team-1'),
    );
  });
});
