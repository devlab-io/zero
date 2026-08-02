import { team, teamAuditLog, teamInvite, teamMember, teamThread } from '../../db/schema';
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { TeamStoreError } from './team-store';
import type { DB } from '../../db';

/**
 * Onboarding collaboration — état DÉRIVÉ des données réelles, jamais coché à
 * la main. Chaque étape de la checklist correspond à un fait durable du store
 * (équipe créée, invitation acceptée, premier partage, premier commentaire,
 * première assignation menée à Done) reconstruit depuis l'audit log
 * append-only. La progression est donc persistante par construction, par
 * équipe ; seul le masquage de la carte est un état par (équipe, membre),
 * rangé dans les prefs jsonb du membre.
 */

export type TeamOnboardingStepKey =
  | 'team_created'
  | 'invite_accepted'
  | 'first_share'
  | 'first_comment'
  | 'first_assignment_done';

export type TeamOnboardingStep = { done: boolean; at: string | null };

export type TeamOnboardingStatus = {
  teamId: string;
  teamCreatedAt: string;
  steps: Record<TeamOnboardingStepKey, TeamOnboardingStep>;
  /** Signal intermédiaire pour l'UI : une invitation est partie mais n'est pas encore acceptée. */
  inviteSent: boolean;
  loopCompletedAt: string | null;
  /** Durée équipe créée → boucle complète, en ms. Null tant que la boucle est ouverte. */
  loopElapsedMs: number | null;
  dismissedAt: string | null;
};

export type OnboardingAuditEvent = {
  action: string;
  subjectId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

/**
 * Seules actions utiles à la dérivation. Bornées aux premières occurrences :
 * les « premières fois » sont par définition au début de l'audit log, donc un
 * LIMIT ascendant suffit. Au-delà de la borne, une équipe assez active a de
 * toute façon complété la boucle — le fallback d'état courant (fil clos ET
 * assigné) couvre le cas résiduel.
 */
export const ONBOARDING_AUDIT_ACTIONS = [
  'invite.accepted',
  'thread.shared',
  'comment.created',
  'thread.assigned',
  'thread.status_changed',
] as const;

export const ONBOARDING_AUDIT_SCAN_LIMIT = 500;

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export function deriveTeamOnboarding(input: {
  teamId: string;
  teamCreatedAt: Date;
  memberCount: number;
  /** Date d'arrivée du premier membre non-créateur (fallback si l'audit est hors borne). */
  secondMemberJoinedAt: Date | null;
  inviteSent: boolean;
  events: OnboardingAuditEvent[];
  /** True uniquement quand la requête a réellement dépassé la borne de scan. */
  auditTruncated: boolean;
  /** Fallback d'état courant : plus ancien fil à la fois clos ET assigné. */
  closedAssignedThreadAt: Date | null;
  dismissedAt: string | null;
}): TeamOnboardingStatus {
  const events = [...input.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let inviteAcceptedAt: Date | null = null;
  let firstShareAt: Date | null = null;
  let firstCommentAt: Date | null = null;
  let firstAssignmentDoneAt: Date | null = null;
  const assignedThreadIds = new Set<string>();

  for (const event of events) {
    switch (event.action) {
      case 'invite.accepted':
        inviteAcceptedAt ??= event.createdAt;
        break;
      case 'thread.shared':
        firstShareAt ??= event.createdAt;
        break;
      case 'comment.created':
        firstCommentAt ??= event.createdAt;
        break;
      case 'thread.assigned':
        if (event.metadata['assigneeUserId']) assignedThreadIds.add(event.subjectId);
        else assignedThreadIds.delete(event.subjectId);
        break;
      case 'thread.status_changed':
        if (
          firstAssignmentDoneAt === null &&
          event.metadata['status'] === 'closed' &&
          assignedThreadIds.has(event.subjectId)
        ) {
          firstAssignmentDoneAt = event.createdAt;
        }
        break;
    }
  }

  // Fallbacks d'état courant, si l'événement fondateur est sorti de la borne
  // de scan : l'étape reste correcte, seul l'horodatage est approché.
  if (inviteAcceptedAt === null && input.memberCount > 1) {
    inviteAcceptedAt = input.secondMemberJoinedAt;
  }
  if (firstAssignmentDoneAt === null && input.auditTruncated && input.closedAssignedThreadAt) {
    firstAssignmentDoneAt = input.closedAssignedThreadAt;
  }

  const steps: TeamOnboardingStatus['steps'] = {
    team_created: { done: true, at: iso(input.teamCreatedAt) },
    invite_accepted: {
      done: inviteAcceptedAt !== null || input.memberCount > 1,
      at: iso(inviteAcceptedAt),
    },
    first_share: { done: firstShareAt !== null, at: iso(firstShareAt) },
    first_comment: { done: firstCommentAt !== null, at: iso(firstCommentAt) },
    first_assignment_done: {
      done: firstAssignmentDoneAt !== null,
      at: iso(firstAssignmentDoneAt),
    },
  };

  const allDone = Object.values(steps).every((step) => step.done);
  let loopCompletedAt: string | null = null;
  let loopElapsedMs: number | null = null;
  if (allDone) {
    const stepTimes = Object.values(steps)
      .map((step) => (step.at ? Date.parse(step.at) : null))
      .filter((time): time is number => time !== null);
    const completed = Math.max(...stepTimes);
    loopCompletedAt = new Date(completed).toISOString();
    loopElapsedMs = Math.max(0, completed - input.teamCreatedAt.getTime());
  }

  return {
    teamId: input.teamId,
    teamCreatedAt: input.teamCreatedAt.toISOString(),
    steps,
    inviteSent: input.inviteSent,
    loopCompletedAt,
    loopElapsedMs,
    dismissedAt: input.dismissedAt,
  };
}

export async function getTeamOnboarding(
  db: DB,
  userId: string,
  teamId: string,
): Promise<TeamOnboardingStatus> {
  const membershipRows = await db
    .select({ prefs: teamMember.prefs })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  const membership = membershipRows[0];
  if (!membership) throw new TeamStoreError('not_a_member');

  const teamRows = await db
    .select({ id: team.id, createdAt: team.createdAt, createdBy: team.createdBy })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);
  const teamRow = teamRows[0];
  if (!teamRow) throw new TeamStoreError('not_found');

  const memberCounts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMember)
    .where(eq(teamMember.teamId, teamId));
  const memberCount = memberCounts[0]?.count ?? 0;

  const nonCreatorJoin = await db
    .select({ createdAt: teamMember.createdAt })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), ne(teamMember.userId, teamRow.createdBy)))
    .orderBy(asc(teamMember.createdAt))
    .limit(1);
  const secondMemberJoinedAt = nonCreatorJoin[0]?.createdAt ?? null;

  const invites = await db
    .select({ id: teamInvite.id })
    .from(teamInvite)
    .where(and(eq(teamInvite.teamId, teamId), eq(teamInvite.status, 'pending')))
    .limit(1);

  const events = await db
    .select({
      action: teamAuditLog.action,
      subjectId: teamAuditLog.subjectId,
      metadata: teamAuditLog.metadata,
      createdAt: teamAuditLog.createdAt,
    })
    .from(teamAuditLog)
    .where(
      and(
        eq(teamAuditLog.teamId, teamId),
        inArray(teamAuditLog.action, [...ONBOARDING_AUDIT_ACTIONS]),
      ),
    )
    .orderBy(asc(teamAuditLog.createdAt))
    .limit(ONBOARDING_AUDIT_SCAN_LIMIT + 1);
  const auditTruncated = events.length > ONBOARDING_AUDIT_SCAN_LIMIT;
  const scannedEvents = auditTruncated ? events.slice(0, ONBOARDING_AUDIT_SCAN_LIMIT) : events;

  const closedAssigned = await db
    .select({ updatedAt: teamThread.updatedAt })
    .from(teamThread)
    .where(
      and(
        eq(teamThread.teamId, teamId),
        eq(teamThread.status, 'closed'),
        isNotNull(teamThread.assigneeUserId),
      ),
    )
    .orderBy(asc(teamThread.updatedAt))
    .limit(1);

  return deriveTeamOnboarding({
    teamId,
    teamCreatedAt: teamRow.createdAt,
    memberCount,
    secondMemberJoinedAt,
    inviteSent: invites.length > 0,
    events: scannedEvents.map((event) => ({
      action: event.action,
      subjectId: event.subjectId,
      metadata: (event.metadata ?? {}) as Record<string, unknown>,
      createdAt: event.createdAt,
    })),
    auditTruncated,
    closedAssignedThreadAt: closedAssigned[0]?.updatedAt ?? null,
    dismissedAt: membership.prefs.onboardingDismissedAt ?? null,
  });
}

/** Masque/réaffiche la checklist pour CE membre sur CETTE équipe (fusion des prefs). */
export async function setOnboardingDismissed(
  db: DB,
  userId: string,
  teamId: string,
  dismissed: boolean,
) {
  const membershipRows = await db
    .select({ userId: teamMember.userId })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  if (!membershipRows[0]) throw new TeamStoreError('not_a_member');
  await db
    .update(teamMember)
    .set({
      // Fusion atomique côté PostgreSQL : évite de perdre une préférence de
      // notification modifiée en parallèle entre le SELECT et l'UPDATE.
      prefs: sql`${teamMember.prefs} || ${JSON.stringify({
        onboardingDismissedAt: dismissed ? new Date().toISOString() : null,
      })}::jsonb`,
    })
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
}
