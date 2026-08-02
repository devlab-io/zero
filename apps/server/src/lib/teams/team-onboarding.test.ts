import { deriveTeamOnboarding, type OnboardingAuditEvent } from './team-onboarding';
import { describe, expect, it } from 'vitest';

const T0 = new Date('2026-08-01T10:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const event = (
  action: string,
  minutes: number,
  overrides: Partial<OnboardingAuditEvent> = {},
): OnboardingAuditEvent => ({
  action,
  subjectId: overrides.subjectId ?? 'thread-1',
  metadata: overrides.metadata ?? {},
  createdAt: at(minutes),
});

const base = {
  teamId: 'team-1',
  teamCreatedAt: T0,
  memberCount: 1,
  secondMemberJoinedAt: null,
  inviteSent: false,
  events: [] as OnboardingAuditEvent[],
  auditTruncated: false,
  closedAssignedThreadAt: null,
  dismissedAt: null,
};

describe('deriveTeamOnboarding', () => {
  it('a fresh team has only team_created done and no completed loop', () => {
    const status = deriveTeamOnboarding(base);
    expect(status.steps.team_created).toEqual({ done: true, at: T0.toISOString() });
    expect(status.steps.invite_accepted.done).toBe(false);
    expect(status.steps.first_share.done).toBe(false);
    expect(status.steps.first_comment.done).toBe(false);
    expect(status.steps.first_assignment_done.done).toBe(false);
    expect(status.loopCompletedAt).toBeNull();
    expect(status.loopElapsedMs).toBeNull();
  });

  it('derives each step from its founding audit event, keeping the FIRST occurrence', () => {
    const status = deriveTeamOnboarding({
      ...base,
      memberCount: 2,
      events: [
        event('invite.accepted', 5),
        event('invite.accepted', 50),
        event('thread.shared', 10),
        event('comment.created', 15, { subjectId: 'comment-1' }),
        event('comment.created', 45, { subjectId: 'comment-2' }),
      ],
    });
    expect(status.steps.invite_accepted).toEqual({ done: true, at: at(5).toISOString() });
    expect(status.steps.first_share).toEqual({ done: true, at: at(10).toISOString() });
    expect(status.steps.first_comment).toEqual({ done: true, at: at(15).toISOString() });
    expect(status.steps.first_assignment_done.done).toBe(false);
  });

  it('completes first_assignment_done only when a previously ASSIGNED thread is closed', () => {
    const assignedElsewhere = deriveTeamOnboarding({
      ...base,
      events: [
        // Closed WITHOUT ever being assigned → not the assignment loop.
        event('thread.status_changed', 5, { metadata: { status: 'closed' } }),
        // Assigned but never closed.
        event('thread.assigned', 10, {
          subjectId: 'thread-2',
          metadata: { assigneeUserId: 'user-2' },
        }),
      ],
    });
    expect(assignedElsewhere.steps.first_assignment_done.done).toBe(false);

    const done = deriveTeamOnboarding({
      ...base,
      events: [
        event('thread.assigned', 10, { metadata: { assigneeUserId: 'user-2' } }),
        event('thread.status_changed', 20, { metadata: { status: 'closed' } }),
      ],
    });
    expect(done.steps.first_assignment_done).toEqual({ done: true, at: at(20).toISOString() });
  });

  it('an unassignment (assigneeUserId null) does not qualify a later close', () => {
    const status = deriveTeamOnboarding({
      ...base,
      events: [
        event('thread.assigned', 10, { metadata: { assigneeUserId: null } }),
        event('thread.status_changed', 20, { metadata: { status: 'closed' } }),
      ],
    });
    expect(status.steps.first_assignment_done.done).toBe(false);
  });

  it('removes a prior assignment when the same thread is unassigned before close', () => {
    const status = deriveTeamOnboarding({
      ...base,
      events: [
        event('thread.assigned', 5, { metadata: { assigneeUserId: 'user-2' } }),
        event('thread.assigned', 10, { metadata: { assigneeUserId: null } }),
        event('thread.status_changed', 20, { metadata: { status: 'closed' } }),
      ],
    });
    expect(status.steps.first_assignment_done.done).toBe(false);
  });

  it('does not qualify a thread closed before it was assigned', () => {
    const status = deriveTeamOnboarding({
      ...base,
      events: [
        event('thread.status_changed', 5, { metadata: { status: 'closed' } }),
        event('thread.assigned', 10, { metadata: { assigneeUserId: 'user-2' } }),
      ],
    });
    expect(status.steps.first_assignment_done.done).toBe(false);
  });

  it('reopening after the loop keeps the first completion timestamp', () => {
    const status = deriveTeamOnboarding({
      ...base,
      events: [
        event('thread.assigned', 10, { metadata: { assigneeUserId: 'user-2' } }),
        event('thread.status_changed', 20, { metadata: { status: 'closed' } }),
        event('thread.status_changed', 30, { metadata: { status: 'open' } }),
        event('thread.status_changed', 40, { metadata: { status: 'closed' } }),
      ],
    });
    expect(status.steps.first_assignment_done.at).toBe(at(20).toISOString());
  });

  it('falls back to membership and current thread state when audit events are out of scan bound', () => {
    const status = deriveTeamOnboarding({
      ...base,
      memberCount: 3,
      secondMemberJoinedAt: at(7),
      closedAssignedThreadAt: at(90),
      auditTruncated: true,
      events: [],
    });
    expect(status.steps.invite_accepted).toEqual({ done: true, at: at(7).toISOString() });
    expect(status.steps.first_assignment_done).toEqual({ done: true, at: at(90).toISOString() });
  });

  it('never uses current closed+assigned state when the audit scan is complete', () => {
    const status = deriveTeamOnboarding({
      ...base,
      closedAssignedThreadAt: at(90),
      auditTruncated: false,
    });
    expect(status.steps.first_assignment_done.done).toBe(false);
  });

  it('completes the loop with elapsed time from team creation to the LAST step', () => {
    const status = deriveTeamOnboarding({
      ...base,
      memberCount: 2,
      inviteSent: true,
      events: [
        event('invite.accepted', 5),
        event('thread.shared', 10),
        event('comment.created', 15, { subjectId: 'comment-1' }),
        event('thread.assigned', 20, { metadata: { assigneeUserId: 'user-2' } }),
        event('thread.status_changed', 25, { metadata: { status: 'closed' } }),
      ],
    });
    expect(status.loopCompletedAt).toBe(at(25).toISOString());
    expect(status.loopElapsedMs).toBe(25 * 60_000);
  });

  it('sorts unordered events before deriving', () => {
    const status = deriveTeamOnboarding({
      ...base,
      events: [
        event('thread.status_changed', 25, { metadata: { status: 'closed' } }),
        event('thread.assigned', 20, { metadata: { assigneeUserId: 'user-2' } }),
      ],
    });
    expect(status.steps.first_assignment_done.done).toBe(true);
  });

  it('carries dismissal and inviteSent through untouched', () => {
    const status = deriveTeamOnboarding({
      ...base,
      inviteSent: true,
      dismissedAt: '2026-08-01T12:00:00.000Z',
    });
    expect(status.inviteSent).toBe(true);
    expect(status.dismissedAt).toBe('2026-08-01T12:00:00.000Z');
  });
});
