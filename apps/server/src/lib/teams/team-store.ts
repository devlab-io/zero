import {
  defaultTeamNotificationPrefs,
  team,
  teamAuditLog,
  teamCommentReaction,
  teamInvite,
  teamLabel,
  teamMember,
  teamNotification,
  teamThread,
  teamThreadAccess,
  teamThreadComment,
  teamThreadLabel,
  teamThreadPresence,
  user,
  type TeamNotificationPrefs,
} from '../../db/schema';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { enqueueOutboundEvent } from './team-outbound';
import type { DB } from '../../db';

/**
 * Team collaboration store — exclusively email-thread-centred.
 *
 * Every read/write is scoped by the CALLER's userId (injected by the DO
 * façade, never client-supplied) and membership + thread ACL are checked in
 * SQL before touching team data. Errors use fixed codes (TeamStoreError) the
 * tRPC layer maps to wire codes.
 *
 * Access model: a share is visible to the whole team ('team' visibility) or
 * to an explicit, REVOCABLE access list ('restricted'): sharer, team owners
 * and active team_thread_access rows. Mentioning a member without access on a
 * restricted thread WIDENS access visibly (source='mention' + notification +
 * audit row). Full thread/attachment reads resolve through resolveAccess —
 * the sharer's connection is only ever used server-side AFTER that check.
 */
export type TeamRole = 'owner' | 'member';
export type TeamThreadStatus = 'open' | 'closed';
export type TeamThreadVisibility = 'team' | 'restricted';

export class TeamStoreError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'not_a_member'
      | 'forbidden'
      | 'already_member'
      | 'invite_already_pending'
      | 'invite_email_mismatch'
      | 'invite_not_pending'
      | 'last_owner'
      | 'assignee_not_member'
      | 'assignee_no_access'
      | 'mention_not_member'
      | 'label_conflict'
      | 'label_not_found'
      | 'run_not_undoable'
      | 'acl_confirmation_required'
      | 'draft_stale'
      | 'review_exists'
      | 'review_not_actionable'
      | 'not_draft_owner'
      | 'not_reviewer'
      | 'reply_claimed'
      | 'reply_intent_invalid'
      | 'override_not_armed'
      // P18 — intégrations
      | 'integration_vault_unavailable'
      | 'integration_not_configured'
      | 'integration_not_installed'
      | 'integration_revoked'
      | 'mapping_missing'
      | 'confirmation_required'
      | 'issue_create_failed'
      | 'issue_create_in_flight'
      | 'invalid_url'
      | 'idempotency_conflict'
      | 'preview_expired'
      | 'preview_invalid'
      | 'needs_reconciliation'
      | 'oauth_scope_mismatch',
  ) {
    super(code);
    this.name = 'TeamStoreError';
  }
}

const MAX_PARTICIPANTS = 20;
const COMMENT_PAGE = 200;
export const PRESENCE_STALE_MS = 45_000;

/**
 * Provenance d'une mutation déclenchée par une RÈGLE (P14) — fusionnée dans
 * la metadata d'audit. Le runId permet au préflight d'undo de distinguer les
 * écritures de CE run de toute autre activité (manuelle — même par le
 * créateur — ou d'une autre règle). Sans contexte, l'audit reste strictement
 * celui d'une action manuelle.
 */
export type RuleActionContext = { source: 'rule'; ruleId: string; runId: string };

export type TeamThreadMetadata = {
  threadId: string;
  sharerConnectionId: string;
  sharerEmail: string;
  providerId: string;
  subject: string;
  preview: string;
  participants: { name?: string; email: string }[];
  messageCount: number;
  latestReceivedOn: string | null;
};

export type CommentQuote = {
  messageId: string;
  authorEmail: string;
  authorName?: string;
  receivedOn: string;
  text: string;
};

// Drizzle's transaction handle exposes the same query surface as DB.
type DbOrTx = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

// --- membership helpers ------------------------------------------------------

async function findMembership(db: DbOrTx, teamId: string, userId: string) {
  const rows = await db
    .select()
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  return rows[0];
}

async function requireMembership(db: DbOrTx, teamId: string, userId: string) {
  const membership = await findMembership(db, teamId, userId);
  if (!membership) throw new TeamStoreError('not_a_member');
  return membership;
}

async function requireOwner(db: DbOrTx, teamId: string, userId: string) {
  const membership = await requireMembership(db, teamId, userId);
  if (membership.role !== 'owner') throw new TeamStoreError('forbidden');
  return membership;
}

// --- audit + notifications ---------------------------------------------------

async function audit(
  db: DbOrTx,
  entry: {
    teamId: string;
    /** null pour un acteur non humain — actorKind dit alors la vérité. */
    actorUserId: string | null;
    actorKind?: 'user' | 'system' | 'integration';
    action: string;
    subjectType: string;
    subjectId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const actorKind = entry.actorKind ?? 'user';
  // Garde applicative du sens interdit au CHECK SQL (le SET NULL de la
  // suppression de compte doit rester possible) : un audit 'user' s'ÉCRIT
  // toujours avec un acteur ; system/integration jamais (CHECK SQL).
  if (actorKind === 'user' && !entry.actorUserId) {
    throw new TeamStoreError('forbidden');
  }
  await db.insert(teamAuditLog).values({
    id: crypto.randomUUID(),
    teamId: entry.teamId,
    actorUserId: entry.actorUserId,
    actorKind,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    metadata: entry.metadata ?? {},
  });
}

/** Export P18 : les stores d'intégration auditent via le MÊME journal. */
export const appendTeamAudit = audit;

/**
 * Insert notifications for `recipients`, filtered by each recipient's
 * per-team prefs (prefKey) and excluding the actor. Recipients not member of
 * the team any more are silently skipped.
 */
async function notify(
  db: DbOrTx,
  input: {
    teamId: string;
    teamThreadId?: string | null;
    commentId?: string | null;
    kind:
      | 'mention'
      | 'comment'
      | 'assignment'
      | 'access_granted'
      | 'access_revoked'
      | 'status_changed'
      | 'rule'
      | 'draft_review';
    actorUserId: string;
    recipients: string[];
    prefKey: keyof TeamNotificationPrefs | null;
  },
) {
  const unique = [...new Set(input.recipients)].filter((id) => id !== input.actorUserId);
  if (unique.length === 0) return;
  const members = await db
    .select({ userId: teamMember.userId, prefs: teamMember.prefs })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, input.teamId), inArray(teamMember.userId, unique)));
  const allowed = members.filter((m) => {
    if (!input.prefKey) return true;
    const prefs = { ...defaultTeamNotificationPrefs, ...m.prefs };
    return prefs[input.prefKey] !== false;
  });
  if (allowed.length === 0) return;
  await db.insert(teamNotification).values(
    allowed.map((m) => ({
      id: crypto.randomUUID(),
      userId: m.userId,
      teamId: input.teamId,
      teamThreadId: input.teamThreadId ?? null,
      commentId: input.commentId ?? null,
      kind: input.kind,
      actorUserId: input.actorUserId,
    })),
  );
}

/**
 * Notification déclenchée par une RÈGLE (P14). prefKey null : l'action
 * `notify` d'une règle est une demande explicite de son créateur — elle est
 * délivrée même si le destinataire a coupé commentaires/mentions/assignations
 * (mêmes garanties qu'access_granted).
 */
export async function notifyRuleTargets(
  db: DB,
  input: {
    teamId: string;
    teamThreadId: string | null;
    actorUserId: string;
    recipients: string[];
  },
) {
  await notify(db, {
    teamId: input.teamId,
    teamThreadId: input.teamThreadId,
    kind: 'rule',
    actorUserId: input.actorUserId,
    recipients: input.recipients,
    prefKey: null,
  });
}

/** Notification de relecture de brouillon (P15) — toujours délivrée (interaction directe). */
export async function notifyDraftReview(
  db: DB,
  input: {
    teamId: string;
    teamThreadId: string;
    actorUserId: string;
    recipients: string[];
  },
) {
  await notify(db, {
    teamId: input.teamId,
    teamThreadId: input.teamThreadId,
    kind: 'draft_review',
    actorUserId: input.actorUserId,
    recipients: input.recipients,
    prefKey: null,
  });
}

// --- teams -------------------------------------------------------------------

export async function createTeam(db: DB, userId: string, name: string) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(team).values({ id, name, createdBy: userId });
    await tx.insert(teamMember).values({ teamId: id, userId, role: 'owner' });
    await audit(tx, {
      teamId: id,
      actorUserId: userId,
      action: 'team.created',
      subjectType: 'team',
      subjectId: id,
      metadata: { name },
    });
  });
  return { id, name };
}

export async function listMyTeams(db: DB, userId: string) {
  return await db
    .select({
      id: team.id,
      name: team.name,
      role: teamMember.role,
      prefs: teamMember.prefs,
      createdAt: team.createdAt,
      memberCount: sql<number>`(
        select count(*)::int from ${teamMember} tm where tm.team_id = ${team.id}
      )`,
    })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(eq(teamMember.userId, userId))
    .orderBy(asc(team.createdAt));
}

export async function renameTeam(db: DB, userId: string, teamId: string, name: string) {
  await requireOwner(db, teamId, userId);
  await db.update(team).set({ name, updatedAt: new Date() }).where(eq(team.id, teamId));
  await audit(db, {
    teamId,
    actorUserId: userId,
    action: 'team.renamed',
    subjectType: 'team',
    subjectId: teamId,
    metadata: { name },
  });
}

export async function deleteTeam(db: DB, userId: string, teamId: string) {
  await requireOwner(db, teamId, userId);
  await db.delete(team).where(eq(team.id, teamId));
}

/**
 * Leaving: a sole owner cannot leave while other members remain (promote one
 * first); the last remaining member leaving deletes the team entirely.
 */
export async function leaveTeam(db: DB, userId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const members = await tx
      .select({ userId: teamMember.userId, role: teamMember.role })
      .from(teamMember)
      .where(eq(teamMember.teamId, teamId))
      .for('update');
    const mine = members.find((m) => m.userId === userId);
    if (!mine) throw new TeamStoreError('not_a_member');
    if (members.length === 1) {
      await tx.delete(team).where(eq(team.id, teamId));
      return;
    }
    const otherOwners = members.some((m) => m.userId !== userId && m.role === 'owner');
    if (mine.role === 'owner' && !otherOwners) throw new TeamStoreError('last_owner');
    await tx
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
    await tx
      .update(teamThread)
      .set({ assigneeUserId: null })
      .where(and(eq(teamThread.teamId, teamId), eq(teamThread.assigneeUserId, userId)));
    await audit(tx, {
      teamId,
      actorUserId: userId,
      action: 'member.left',
      subjectType: 'user',
      subjectId: userId,
    });
  });
}

export async function listTeamMembers(db: DB, userId: string, teamId: string) {
  await requireMembership(db, teamId, userId);
  return await db
    .select({
      userId: teamMember.userId,
      role: teamMember.role,
      name: user.name,
      email: user.email,
      image: user.image,
      joinedAt: teamMember.createdAt,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(eq(teamMember.teamId, teamId))
    .orderBy(asc(teamMember.createdAt));
}

export async function removeTeamMember(db: DB, userId: string, teamId: string, targetId: string) {
  if (targetId === userId) throw new TeamStoreError('forbidden');
  await requireOwner(db, teamId, userId);
  const target = await findMembership(db, teamId, targetId);
  if (!target) throw new TeamStoreError('not_found');
  if (target.role === 'owner') throw new TeamStoreError('forbidden');
  await db.transaction(async (tx) => {
    await tx
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, targetId)));
    await tx
      .update(teamThread)
      .set({ assigneeUserId: null })
      .where(and(eq(teamThread.teamId, teamId), eq(teamThread.assigneeUserId, targetId)));
    await audit(tx, {
      teamId,
      actorUserId: userId,
      action: 'member.removed',
      subjectType: 'user',
      subjectId: targetId,
    });
  });
}

export async function updateMyPrefs(
  db: DB,
  userId: string,
  teamId: string,
  prefs: TeamNotificationPrefs,
) {
  // FUSION, jamais remplacement : le même jsonb porte aussi l'état
  // d'onboarding (onboardingDismissedAt) — régler les notifications ne doit
  // pas le réinitialiser.
  await requireMembership(db, teamId, userId);
  await db
    .update(teamMember)
    .set({ prefs: sql`${teamMember.prefs} || ${JSON.stringify(prefs)}::jsonb` })
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)));
}

// --- invites -----------------------------------------------------------------

export async function createInvite(
  db: DB,
  userId: string,
  teamId: string,
  rawEmail: string,
  role: TeamRole,
) {
  await requireMembership(db, teamId, userId);
  const email = rawEmail.trim().toLowerCase();
  const existingMember = await db
    .select({ userId: teamMember.userId })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(and(eq(teamMember.teamId, teamId), sql`lower(${user.email}) = ${email}`))
    .limit(1);
  if (existingMember.length > 0) throw new TeamStoreError('already_member');
  const pending = await db
    .select({ id: teamInvite.id })
    .from(teamInvite)
    .where(
      and(
        eq(teamInvite.teamId, teamId),
        eq(teamInvite.email, email),
        eq(teamInvite.status, 'pending'),
      ),
    )
    .limit(1);
  if (pending.length > 0) throw new TeamStoreError('invite_already_pending');
  const id = crypto.randomUUID();
  await db.insert(teamInvite).values({ id, teamId, email, role, invitedBy: userId });
  await audit(db, {
    teamId,
    actorUserId: userId,
    action: 'invite.created',
    subjectType: 'invite',
    subjectId: id,
    metadata: { email, role },
  });
  return { id, email, role };
}

export async function listTeamInvites(db: DB, userId: string, teamId: string) {
  await requireMembership(db, teamId, userId);
  return await db
    .select({
      id: teamInvite.id,
      email: teamInvite.email,
      role: teamInvite.role,
      status: teamInvite.status,
      createdAt: teamInvite.createdAt,
      invitedByName: user.name,
    })
    .from(teamInvite)
    .innerJoin(user, eq(user.id, teamInvite.invitedBy))
    .where(and(eq(teamInvite.teamId, teamId), eq(teamInvite.status, 'pending')))
    .orderBy(desc(teamInvite.createdAt));
}

export async function revokeInvite(db: DB, userId: string, inviteId: string) {
  const [invite] = await db.select().from(teamInvite).where(eq(teamInvite.id, inviteId)).limit(1);
  if (!invite || invite.status !== 'pending') throw new TeamStoreError('not_found');
  const membership = await requireMembership(db, invite.teamId, userId);
  if (membership.role !== 'owner' && invite.invitedBy !== userId) {
    throw new TeamStoreError('forbidden');
  }
  await db
    .update(teamInvite)
    .set({ status: 'revoked', respondedAt: new Date() })
    .where(and(eq(teamInvite.id, inviteId), eq(teamInvite.status, 'pending')));
  await audit(db, {
    teamId: invite.teamId,
    actorUserId: userId,
    action: 'invite.revoked',
    subjectType: 'invite',
    subjectId: inviteId,
  });
}

/** Invites addressed to the caller's SESSION email (never client-chosen). */
export async function listMyInvites(db: DB, sessionEmail: string) {
  const email = sessionEmail.trim().toLowerCase();
  return await db
    .select({
      id: teamInvite.id,
      teamId: teamInvite.teamId,
      teamName: team.name,
      role: teamInvite.role,
      createdAt: teamInvite.createdAt,
      invitedByName: user.name,
    })
    .from(teamInvite)
    .innerJoin(team, eq(team.id, teamInvite.teamId))
    .innerJoin(user, eq(user.id, teamInvite.invitedBy))
    .where(and(eq(teamInvite.email, email), eq(teamInvite.status, 'pending')))
    .orderBy(desc(teamInvite.createdAt));
}

export async function acceptInvite(db: DB, userId: string, sessionEmail: string, inviteId: string) {
  const email = sessionEmail.trim().toLowerCase();
  return await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(teamInvite)
      .where(eq(teamInvite.id, inviteId))
      .for('update');
    if (!invite) throw new TeamStoreError('not_found');
    if (invite.status !== 'pending') throw new TeamStoreError('invite_not_pending');
    if (invite.email !== email) throw new TeamStoreError('invite_email_mismatch');
    await tx
      .insert(teamMember)
      .values({ teamId: invite.teamId, userId, role: invite.role })
      .onConflictDoNothing();
    await tx
      .update(teamInvite)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(eq(teamInvite.id, inviteId));
    await audit(tx, {
      teamId: invite.teamId,
      actorUserId: userId,
      action: 'invite.accepted',
      subjectType: 'invite',
      subjectId: inviteId,
    });
    return { teamId: invite.teamId };
  });
}

export async function declineInvite(db: DB, sessionEmail: string, inviteId: string) {
  const email = sessionEmail.trim().toLowerCase();
  const updated = await db
    .update(teamInvite)
    .set({ status: 'declined', respondedAt: new Date() })
    .where(
      and(
        eq(teamInvite.id, inviteId),
        eq(teamInvite.status, 'pending'),
        eq(teamInvite.email, email),
      ),
    )
    .returning({ id: teamInvite.id });
  if (updated.length === 0) throw new TeamStoreError('not_found');
}

// --- thread ACL --------------------------------------------------------------

/**
 * SQL predicate: the caller can access this teamThread row. Team-visible
 * threads are open to every member; restricted threads require being the
 * sharer, a team owner, or holding an ACTIVE (non-revoked) access row.
 * (Membership itself is enforced separately.)
 */
/**
 * Prédicat ACL ENSEMBLISTE d'un fil partagé pour `userId` — la même porte que
 * resolveAccess, exprimée en SQL pour les requêtes de liste ET d'agrégation
 * (P16 : tout agrégat ops filtre par ce prédicat AVANT de compter).
 */
export function accessPredicate(userId: string): SQL {
  return or(
    eq(teamThread.visibility, 'team'),
    eq(teamThread.sharerUserId, userId),
    sql`exists (
      select 1 from ${teamMember} tm
      where tm.team_id = ${teamThread.teamId} and tm.user_id = ${userId} and tm.role = 'owner'
    )`,
    sql`exists (
      select 1 from ${teamThreadAccess} ta
      where ta.team_thread_id = ${teamThread.id} and ta.user_id = ${userId} and ta.revoked_at is null
    )`,
  )!;
}

/**
 * THE access gate for shared-thread reads (full thread, attachments, quotes,
 * comments, presence) — every surface INCLUDING AI must pass through it. On
 * success returns the thread row (with sharerConnectionId, only ever used
 * server-side after this point).
 */
export async function resolveAccess(db: DB, userId: string, teamThreadId: string) {
  const [row] = await db
    .select()
    .from(teamThread)
    .where(and(eq(teamThread.id, teamThreadId), accessPredicate(userId)))
    .limit(1);
  if (!row) {
    // Distinguish "thread gone" from "access denied" WITHOUT leaking data:
    // members of the team learn the thread exists (forbidden); everyone else
    // gets not_found.
    const [bare] = await db
      .select({ teamId: teamThread.teamId })
      .from(teamThread)
      .where(eq(teamThread.id, teamThreadId))
      .limit(1);
    if (!bare) throw new TeamStoreError('not_found');
    const membership = await findMembership(db, bare.teamId, userId);
    throw new TeamStoreError(membership ? 'forbidden' : 'not_found');
  }
  await requireMembership(db, row.teamId, userId);
  return row;
}

async function canAccessThread(db: DbOrTx, userId: string, teamThreadId: string) {
  const rows = await db
    .select({ id: teamThread.id })
    .from(teamThread)
    .where(and(eq(teamThread.id, teamThreadId), accessPredicate(userId)))
    .limit(1);
  return rows.length > 0;
}

export async function listThreadAccess(db: DB, userId: string, teamThreadId: string) {
  await resolveAccess(db, userId, teamThreadId);
  return await db
    .select({
      id: teamThreadAccess.id,
      userId: teamThreadAccess.userId,
      name: user.name,
      email: user.email,
      source: teamThreadAccess.source,
      grantedBy: teamThreadAccess.grantedBy,
      createdAt: teamThreadAccess.createdAt,
      revokedAt: teamThreadAccess.revokedAt,
      revokedBy: teamThreadAccess.revokedBy,
    })
    .from(teamThreadAccess)
    .innerJoin(user, eq(user.id, teamThreadAccess.userId))
    .where(eq(teamThreadAccess.teamThreadId, teamThreadId))
    .orderBy(asc(teamThreadAccess.createdAt));
}

/** Grant (or re-grant after revocation) access to a restricted thread. */
export async function grantThreadAccess(
  db: DB,
  userId: string,
  teamThreadId: string,
  targetUserId: string,
  source: 'share' | 'mention' | 'manual' = 'manual',
) {
  const row = await resolveAccess(db, userId, teamThreadId);
  const target = await findMembership(db, row.teamId, targetUserId);
  if (!target) throw new TeamStoreError('mention_not_member');
  await db.transaction(async (tx) => {
    await tx
      .insert(teamThreadAccess)
      .values({
        id: crypto.randomUUID(),
        teamThreadId,
        userId: targetUserId,
        source,
        grantedBy: userId,
      })
      .onConflictDoUpdate({
        target: [teamThreadAccess.teamThreadId, teamThreadAccess.userId],
        set: { source, grantedBy: userId, revokedAt: null, revokedBy: null },
      });
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'access.granted',
      subjectType: 'team_thread',
      subjectId: teamThreadId,
      metadata: { targetUserId, source },
    });
    await notify(tx, {
      teamId: row.teamId,
      teamThreadId,
      kind: 'access_granted',
      actorUserId: userId,
      recipients: [targetUserId],
      prefKey: null,
    });
  });
}

/** Revoke: the row is KEPT (revokedAt/revokedBy) — visible and auditable. */
export async function revokeThreadAccess(
  db: DB,
  userId: string,
  teamThreadId: string,
  targetUserId: string,
) {
  const row = await resolveAccess(db, userId, teamThreadId);
  const membership = await requireMembership(db, row.teamId, userId);
  if (row.sharerUserId !== userId && membership.role !== 'owner') {
    throw new TeamStoreError('forbidden');
  }
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(teamThreadAccess)
      .set({ revokedAt: new Date(), revokedBy: userId })
      .where(
        and(
          eq(teamThreadAccess.teamThreadId, teamThreadId),
          eq(teamThreadAccess.userId, targetUserId),
          isNull(teamThreadAccess.revokedAt),
        ),
      )
      .returning({ id: teamThreadAccess.id });
    if (updated.length === 0) throw new TeamStoreError('not_found');
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'access.revoked',
      subjectType: 'team_thread',
      subjectId: teamThreadId,
      metadata: { targetUserId },
    });
    await notify(tx, {
      teamId: row.teamId,
      teamThreadId,
      kind: 'access_revoked',
      actorUserId: userId,
      recipients: [targetUserId],
      prefKey: null,
    });
  });
}

// --- shared threads ----------------------------------------------------------

/**
 * Share (or refresh) a thread with a team. Metadata comes from the SERVER-side
 * read of the sharer's own mailbox — the route builds `meta`, never the
 * client. Idempotent on (team, sharerConnection, thread): re-sharing
 * refreshes the captured metadata and bumps activity. For 'restricted'
 * visibility, `accessUserIds` seeds the ACL (validated members).
 */
export async function shareThread(
  db: DB,
  userId: string,
  teamId: string,
  meta: TeamThreadMetadata,
  options: {
    visibility: TeamThreadVisibility;
    accessUserIds: string[];
    /** Provenance non humaine (P14) : rendue VISIBLE dans l'audit du partage. */
    context?: RuleActionContext;
  },
) {
  await requireMembership(db, teamId, userId);
  const accessIds = [...new Set(options.accessUserIds)].filter((id) => id !== userId);
  if (accessIds.length > 0) {
    const members = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), inArray(teamMember.userId, accessIds)));
    if (members.length !== accessIds.length) throw new TeamStoreError('mention_not_member');
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const participants = meta.participants.slice(0, MAX_PARTICIPANTS);
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(teamThread)
      .values({
        id,
        teamId,
        threadId: meta.threadId,
        sharerUserId: userId,
        sharerConnectionId: meta.sharerConnectionId,
        sharerEmail: meta.sharerEmail.toLowerCase(),
        providerId: meta.providerId,
        visibility: options.visibility,
        subject: meta.subject,
        preview: meta.preview,
        participants,
        messageCount: meta.messageCount,
        latestReceivedOn: meta.latestReceivedOn,
        lastActivityAt: now,
      })
      .onConflictDoUpdate({
        target: [teamThread.teamId, teamThread.sharerConnectionId, teamThread.threadId],
        set: {
          subject: meta.subject,
          preview: meta.preview,
          participants,
          messageCount: meta.messageCount,
          latestReceivedOn: meta.latestReceivedOn,
          lastActivityAt: now,
          updatedAt: now,
        },
      })
      .returning();
    if (!row) throw new TeamStoreError('not_found');
    if (options.visibility === 'restricted' && accessIds.length > 0) {
      for (const targetUserId of accessIds) {
        await tx
          .insert(teamThreadAccess)
          .values({
            id: crypto.randomUUID(),
            teamThreadId: row.id,
            userId: targetUserId,
            source: 'share',
            grantedBy: userId,
          })
          .onConflictDoUpdate({
            target: [teamThreadAccess.teamThreadId, teamThreadAccess.userId],
            set: { source: 'share', grantedBy: userId, revokedAt: null, revokedBy: null },
          });
      }
    }
    await audit(tx, {
      teamId,
      actorUserId: userId,
      action: 'thread.shared',
      subjectType: 'team_thread',
      subjectId: row.id,
      metadata: {
        visibility: options.visibility,
        accessUserIds: accessIds,
        ...options.context,
      },
    });
    return row;
  });
}

export async function unshareThread(db: DB, userId: string, teamThreadId: string) {
  const [row] = await db.select().from(teamThread).where(eq(teamThread.id, teamThreadId)).limit(1);
  if (!row) throw new TeamStoreError('not_found');
  const membership = await requireMembership(db, row.teamId, userId);
  if (row.sharerUserId !== userId && membership.role !== 'owner') {
    throw new TeamStoreError('forbidden');
  }
  await db.transaction(async (tx) => {
    await tx.delete(teamThread).where(eq(teamThread.id, teamThreadId));
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'thread.unshared',
      subjectType: 'team_thread',
      subjectId: teamThreadId,
      metadata: { threadId: row.threadId },
    });
  });
}

export type TeamThreadListFilter = {
  status?: TeamThreadStatus;
  assignee?: 'me' | 'unassigned' | { userId: string };
  labelId?: string;
  cursor?: { lastActivityAt: string; id: string } | null;
  limit?: number;
};

export async function listTeamThreads(
  db: DB,
  userId: string,
  teamId: string,
  filter: TeamThreadListFilter,
) {
  await requireMembership(db, teamId, userId);
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
  const conditions: SQL[] = [eq(teamThread.teamId, teamId), accessPredicate(userId)];
  if (filter.status) conditions.push(eq(teamThread.status, filter.status));
  if (filter.assignee === 'me') conditions.push(eq(teamThread.assigneeUserId, userId));
  else if (filter.assignee === 'unassigned') conditions.push(isNull(teamThread.assigneeUserId));
  else if (filter.assignee && typeof filter.assignee === 'object') {
    conditions.push(eq(teamThread.assigneeUserId, filter.assignee.userId));
  }
  if (filter.labelId) {
    conditions.push(
      sql`exists (
        select 1 from ${teamThreadLabel} tl
        where tl.team_thread_id = ${teamThread.id} and tl.label_id = ${filter.labelId}
      )`,
    );
  }
  if (filter.cursor) {
    const ts = new Date(filter.cursor.lastActivityAt);
    conditions.push(
      or(
        lt(teamThread.lastActivityAt, ts),
        and(eq(teamThread.lastActivityAt, ts), lt(teamThread.id, filter.cursor.id)),
      )!,
    );
  }
  const rows = await db
    .select({
      id: teamThread.id,
      teamId: teamThread.teamId,
      threadId: teamThread.threadId,
      sharerUserId: teamThread.sharerUserId,
      sharerEmail: teamThread.sharerEmail,
      providerId: teamThread.providerId,
      visibility: teamThread.visibility,
      subject: teamThread.subject,
      preview: teamThread.preview,
      participants: teamThread.participants,
      messageCount: teamThread.messageCount,
      latestReceivedOn: teamThread.latestReceivedOn,
      status: teamThread.status,
      assigneeUserId: teamThread.assigneeUserId,
      lastActivityAt: teamThread.lastActivityAt,
      createdAt: teamThread.createdAt,
      sharerName: user.name,
      commentCount: sql<number>`(
        select count(*)::int from ${teamThreadComment} c where c.team_thread_id = ${teamThread.id}
      )`,
      labels: sql<{ id: string; name: string; color: string }[]>`coalesce((
        select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) order by l.name)
        from ${teamThreadLabel} tl join ${teamLabel} l on l.id = tl.label_id
        where tl.team_thread_id = ${teamThread.id}
      ), '[]'::json)`,
    })
    .from(teamThread)
    .innerJoin(user, eq(user.id, teamThread.sharerUserId))
    .where(and(...conditions))
    .orderBy(desc(teamThread.lastActivityAt), desc(teamThread.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    threads: page,
    nextCursor:
      rows.length > limit && last
        ? { lastActivityAt: last.lastActivityAt.toISOString(), id: last.id }
        : null,
  };
}

/**
 * Shares visible from an OPEN thread in the caller's own mailbox: rows whose
 * captured mailbox (sharerEmail) matches the caller's active-connection email
 * (thread ids are mailbox-scoped, same mailbox ⇒ same ids), restricted to
 * teams the caller belongs to AND threads the ACL lets them see.
 */
export async function listSharesForThread(
  db: DB,
  userId: string,
  threadId: string,
  connectionEmail: string,
) {
  const email = connectionEmail.trim().toLowerCase();
  return await db
    .select({
      id: teamThread.id,
      teamId: teamThread.teamId,
      teamName: team.name,
      visibility: teamThread.visibility,
      status: teamThread.status,
      assigneeUserId: teamThread.assigneeUserId,
      sharerUserId: teamThread.sharerUserId,
      lastActivityAt: teamThread.lastActivityAt,
      commentCount: sql<number>`(
        select count(*)::int from ${teamThreadComment} c where c.team_thread_id = ${teamThread.id}
      )`,
    })
    .from(teamThread)
    .innerJoin(team, eq(team.id, teamThread.teamId))
    .innerJoin(
      teamMember,
      and(eq(teamMember.teamId, teamThread.teamId), eq(teamMember.userId, userId)),
    )
    .where(
      and(
        eq(teamThread.threadId, threadId),
        eq(teamThread.sharerEmail, email),
        accessPredicate(userId),
      ),
    )
    .orderBy(asc(teamThread.createdAt));
}

export async function getTeamThread(db: DB, userId: string, teamThreadId: string) {
  return await resolveAccess(db, userId, teamThreadId);
}

export async function setThreadStatus(
  db: DB,
  userId: string,
  teamThreadId: string,
  status: TeamThreadStatus,
  context?: RuleActionContext,
) {
  const row = await resolveAccess(db, userId, teamThreadId);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(teamThread)
      .set({ status, lastActivityAt: now, updatedAt: now })
      .where(eq(teamThread.id, teamThreadId));
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'thread.status_changed',
      subjectType: 'team_thread',
      subjectId: teamThreadId,
      metadata: { status, ...context },
    });
    await notify(tx, {
      teamId: row.teamId,
      teamThreadId,
      kind: 'status_changed',
      actorUserId: userId,
      recipients: [row.sharerUserId, row.assigneeUserId].filter((v): v is string => !!v),
      prefKey: 'onComment',
    });
    // P18 : outbox sortante — métadonnées seules, jamais de corps email.
    await enqueueOutboundEvent(tx, {
      teamId: row.teamId,
      eventType: 'thread.status',
      payload: { teamThreadId, status, actorUserId: userId, occurredAt: now.toISOString() },
    });
  });
}

export async function setThreadAssignee(
  db: DB,
  userId: string,
  teamThreadId: string,
  assigneeUserId: string | null,
  context?: RuleActionContext,
) {
  const row = await resolveAccess(db, userId, teamThreadId);
  if (assigneeUserId) {
    const assignee = await findMembership(db, row.teamId, assigneeUserId);
    if (!assignee) throw new TeamStoreError('assignee_not_member');
    const hasAccess = await canAccessThread(db, assigneeUserId, teamThreadId);
    if (!hasAccess) throw new TeamStoreError('assignee_no_access');
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(teamThread)
      .set({ assigneeUserId, lastActivityAt: now, updatedAt: now })
      .where(eq(teamThread.id, teamThreadId));
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'thread.assigned',
      subjectType: 'team_thread',
      subjectId: teamThreadId,
      metadata: { assigneeUserId, ...context },
    });
    if (assigneeUserId) {
      await notify(tx, {
        teamId: row.teamId,
        teamThreadId,
        kind: 'assignment',
        actorUserId: userId,
        recipients: [assigneeUserId],
        prefKey: 'onAssignment',
      });
    }
    // P18 : outbox sortante — métadonnées seules.
    await enqueueOutboundEvent(tx, {
      teamId: row.teamId,
      eventType: 'thread.assigned',
      payload: { teamThreadId, assigneeUserId, actorUserId: userId, occurredAt: now.toISOString() },
    });
  });
}

// --- comments ----------------------------------------------------------------

export async function addComment(
  db: DB,
  userId: string,
  teamThreadId: string,
  body: string,
  mentions: string[],
  quote: CommentQuote | null,
) {
  const row = await resolveAccess(db, userId, teamThreadId);
  const uniqueMentions = [...new Set(mentions)];
  if (uniqueMentions.length > 0) {
    const members = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, row.teamId), inArray(teamMember.userId, uniqueMentions)));
    if (members.length !== uniqueMentions.length) throw new TeamStoreError('mention_not_member');
  }
  const id = crypto.randomUUID();
  const now = new Date();
  return await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(teamThreadComment)
      .values({ id, teamThreadId, authorUserId: userId, body, mentions: uniqueMentions, quote })
      .returning();
    await tx
      .update(teamThread)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(teamThread.id, teamThreadId));
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'comment.created',
      subjectType: 'comment',
      subjectId: id,
      metadata: { teamThreadId, mentionedUserIds: uniqueMentions },
    });
    // P18 : outbox sortante — l'id du commentaire, JAMAIS son corps.
    await enqueueOutboundEvent(tx, {
      teamId: row.teamId,
      eventType: 'thread.comment',
      payload: { teamThreadId, commentId: id, actorUserId: userId, occurredAt: now.toISOString() },
    });
    // Mention on a restricted thread WIDENS access — visibly: the access row
    // carries source='mention', the audit trail records it, the target is
    // notified access_granted (pref-independent) in addition to the mention.
    if (row.visibility === 'restricted') {
      for (const mentioned of uniqueMentions) {
        const already = await canAccessThread(tx, mentioned, teamThreadId);
        if (already) continue;
        await tx
          .insert(teamThreadAccess)
          .values({
            id: crypto.randomUUID(),
            teamThreadId,
            userId: mentioned,
            source: 'mention',
            grantedBy: userId,
          })
          .onConflictDoUpdate({
            target: [teamThreadAccess.teamThreadId, teamThreadAccess.userId],
            set: { source: 'mention', grantedBy: userId, revokedAt: null, revokedBy: null },
          });
        await audit(tx, {
          teamId: row.teamId,
          actorUserId: userId,
          action: 'access.granted',
          subjectType: 'team_thread',
          subjectId: teamThreadId,
          metadata: { targetUserId: mentioned, source: 'mention' },
        });
        await notify(tx, {
          teamId: row.teamId,
          teamThreadId,
          kind: 'access_granted',
          actorUserId: userId,
          recipients: [mentioned],
          prefKey: null,
        });
      }
    }
    await notify(tx, {
      teamId: row.teamId,
      teamThreadId,
      commentId: id,
      kind: 'mention',
      actorUserId: userId,
      recipients: uniqueMentions,
      prefKey: 'onMention',
    });
    await notify(tx, {
      teamId: row.teamId,
      teamThreadId,
      commentId: id,
      kind: 'comment',
      actorUserId: userId,
      recipients: [row.sharerUserId, row.assigneeUserId]
        .filter((v): v is string => !!v)
        .filter((v) => !uniqueMentions.includes(v)),
      prefKey: 'onComment',
    });
    return comment;
  });
}

export async function editComment(db: DB, userId: string, commentId: string, body: string) {
  const [comment] = await db
    .select({
      teamThreadId: teamThreadComment.teamThreadId,
      authorUserId: teamThreadComment.authorUserId,
    })
    .from(teamThreadComment)
    .where(eq(teamThreadComment.id, commentId))
    .limit(1);
  if (!comment || comment.authorUserId !== userId) throw new TeamStoreError('not_found');
  const row = await resolveAccess(db, userId, comment.teamThreadId);
  await db.transaction(async (tx) => {
    await tx
      .update(teamThreadComment)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(teamThreadComment.id, commentId), eq(teamThreadComment.authorUserId, userId)));
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'comment.edited',
      subjectType: 'comment',
      subjectId: commentId,
      metadata: { teamThreadId: comment.teamThreadId },
    });
  });
  return { teamThreadId: comment.teamThreadId };
}

export async function deleteComment(db: DB, userId: string, commentId: string) {
  const [comment] = await db
    .select()
    .from(teamThreadComment)
    .where(eq(teamThreadComment.id, commentId))
    .limit(1);
  if (!comment) throw new TeamStoreError('not_found');
  const row = await resolveAccess(db, userId, comment.teamThreadId);
  let action = 'comment.deleted';
  if (comment.authorUserId !== userId) {
    const membership = await requireMembership(db, row.teamId, userId);
    if (membership.role !== 'owner') throw new TeamStoreError('forbidden');
    action = 'comment.deleted_by_owner';
  }
  await db.transaction(async (tx) => {
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action,
      subjectType: 'comment',
      subjectId: commentId,
      metadata: { authorUserId: comment.authorUserId },
    });
    await tx.delete(teamThreadComment).where(eq(teamThreadComment.id, commentId));
  });
  return { teamThreadId: comment.teamThreadId };
}

export async function listComments(db: DB, userId: string, teamThreadId: string) {
  await resolveAccess(db, userId, teamThreadId);
  const rows = await db
    .select({
      id: teamThreadComment.id,
      body: teamThreadComment.body,
      mentions: teamThreadComment.mentions,
      quote: teamThreadComment.quote,
      createdAt: teamThreadComment.createdAt,
      updatedAt: teamThreadComment.updatedAt,
      authorUserId: teamThreadComment.authorUserId,
      authorName: user.name,
      authorEmail: user.email,
      reactions: sql<{ emoji: string; userId: string }[]>`coalesce((
        select json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id) order by r.created_at)
        from ${teamCommentReaction} r where r.comment_id = ${teamThreadComment.id}
      ), '[]'::json)`,
    })
    .from(teamThreadComment)
    .innerJoin(user, eq(user.id, teamThreadComment.authorUserId))
    .where(eq(teamThreadComment.teamThreadId, teamThreadId))
    .orderBy(desc(teamThreadComment.createdAt), desc(teamThreadComment.id))
    .limit(COMMENT_PAGE);
  return rows.reverse();
}

export async function toggleReaction(db: DB, userId: string, commentId: string, emoji: string) {
  const [comment] = await db
    .select({ teamThreadId: teamThreadComment.teamThreadId })
    .from(teamThreadComment)
    .where(eq(teamThreadComment.id, commentId))
    .limit(1);
  if (!comment) throw new TeamStoreError('not_found');
  await resolveAccess(db, userId, comment.teamThreadId);
  const deleted = await db
    .delete(teamCommentReaction)
    .where(
      and(
        eq(teamCommentReaction.commentId, commentId),
        eq(teamCommentReaction.userId, userId),
        eq(teamCommentReaction.emoji, emoji),
      ),
    )
    .returning({ commentId: teamCommentReaction.commentId });
  if (deleted.length > 0) return { reacted: false, teamThreadId: comment.teamThreadId };
  await db.insert(teamCommentReaction).values({ commentId, userId, emoji });
  return { reacted: true, teamThreadId: comment.teamThreadId };
}

// --- labels ------------------------------------------------------------------

export async function createLabel(
  db: DB,
  userId: string,
  teamId: string,
  name: string,
  color: string,
) {
  await requireMembership(db, teamId, userId);
  const id = crypto.randomUUID();
  try {
    await db.insert(teamLabel).values({ id, teamId, name, color, createdBy: userId });
  } catch {
    throw new TeamStoreError('label_conflict');
  }
  await audit(db, {
    teamId,
    actorUserId: userId,
    action: 'label.created',
    subjectType: 'label',
    subjectId: id,
    metadata: { name, color },
  });
  return { id, name, color };
}

export async function deleteLabel(db: DB, userId: string, labelId: string) {
  const [label] = await db.select().from(teamLabel).where(eq(teamLabel.id, labelId)).limit(1);
  if (!label) throw new TeamStoreError('label_not_found');
  const membership = await requireMembership(db, label.teamId, userId);
  if (membership.role !== 'owner' && label.createdBy !== userId) {
    throw new TeamStoreError('forbidden');
  }
  await db.delete(teamLabel).where(eq(teamLabel.id, labelId));
  await audit(db, {
    teamId: label.teamId,
    actorUserId: userId,
    action: 'label.deleted',
    subjectType: 'label',
    subjectId: labelId,
    metadata: { name: label.name },
  });
}

export async function listLabels(db: DB, userId: string, teamId: string) {
  await requireMembership(db, teamId, userId);
  return await db
    .select({
      id: teamLabel.id,
      name: teamLabel.name,
      color: teamLabel.color,
      createdBy: teamLabel.createdBy,
    })
    .from(teamLabel)
    .where(eq(teamLabel.teamId, teamId))
    .orderBy(asc(teamLabel.name));
}

/** Replace the label set of a shared thread (labels must belong to its team). */
export async function setThreadLabels(
  db: DB,
  userId: string,
  teamThreadId: string,
  labelIds: string[],
  context?: RuleActionContext,
) {
  const row = await resolveAccess(db, userId, teamThreadId);
  const unique = [...new Set(labelIds)];
  if (unique.length > 0) {
    const labels = await db
      .select({ id: teamLabel.id })
      .from(teamLabel)
      .where(and(eq(teamLabel.teamId, row.teamId), inArray(teamLabel.id, unique)));
    if (labels.length !== unique.length) throw new TeamStoreError('label_not_found');
  }
  await db.transaction(async (tx) => {
    await tx.delete(teamThreadLabel).where(eq(teamThreadLabel.teamThreadId, teamThreadId));
    if (unique.length > 0) {
      await tx.insert(teamThreadLabel).values(unique.map((labelId) => ({ teamThreadId, labelId })));
    }
    await audit(tx, {
      teamId: row.teamId,
      actorUserId: userId,
      action: 'thread.labels_set',
      subjectType: 'team_thread',
      subjectId: teamThreadId,
      metadata: { labelIds: unique, ...context },
    });
  });
}

// --- notifications -----------------------------------------------------------

export async function listMyNotifications(
  db: DB,
  userId: string,
  options: { unreadOnly?: boolean; limit?: number },
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions: SQL[] = [eq(teamNotification.userId, userId)];
  if (options.unreadOnly) conditions.push(isNull(teamNotification.readAt));
  const actor = user;
  return await db
    .select({
      id: teamNotification.id,
      teamId: teamNotification.teamId,
      teamName: team.name,
      teamThreadId: teamNotification.teamThreadId,
      threadSubject: teamThread.subject,
      commentId: teamNotification.commentId,
      kind: teamNotification.kind,
      actorUserId: teamNotification.actorUserId,
      actorName: actor.name,
      createdAt: teamNotification.createdAt,
      readAt: teamNotification.readAt,
    })
    .from(teamNotification)
    .innerJoin(team, eq(team.id, teamNotification.teamId))
    .innerJoin(actor, eq(actor.id, teamNotification.actorUserId))
    .leftJoin(teamThread, eq(teamThread.id, teamNotification.teamThreadId))
    .where(and(...conditions))
    .orderBy(desc(teamNotification.createdAt))
    .limit(limit);
}

/** Non-lues totales + MENTIONS non lues distinctes (dashboard P6, sans IA). */
export async function countMyUnreadNotifications(
  db: DB,
  userId: string,
): Promise<{ count: number; mentions: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      mentions: sql<number>`count(*) filter (where ${teamNotification.kind} = 'mention')::int`,
    })
    .from(teamNotification)
    .where(and(eq(teamNotification.userId, userId), isNull(teamNotification.readAt)));
  return { count: row?.count ?? 0, mentions: row?.mentions ?? 0 };
}

// --- batch assignment (P5) ---------------------------------------------------

export type BatchAssignOutcome = 'assigned' | 'not_shared' | 'assignee_no_access';

/**
 * Assignation BATCH depuis la sélection de la liste mail : pour chaque
 * threadId (ids de MA boîte active), le fil partagé correspondant de CETTE
 * équipe est assigné — ACL complète : appartenance de l'appelant, prédicat
 * d'accès sur chaque fil, assigné membre ET porteur d'accès. Tout fil non
 * partagé (ou hors ACL) est SKIPPÉ avec un résultat explicite, jamais un
 * échec silencieux. Responsable UNIQUE par fil (colonne assignee).
 */
export async function assignSharedThreadsBatch(
  db: DB,
  userId: string,
  params: {
    teamId: string;
    connectionEmail: string;
    assigneeUserId: string | null;
    threadIds: string[];
  },
): Promise<{
  results: { threadId: string; outcome: BatchAssignOutcome; teamThreadId?: string }[];
}> {
  await requireMembership(db, params.teamId, userId);
  if (params.assigneeUserId) {
    const assignee = await findMembership(db, params.teamId, params.assigneeUserId);
    if (!assignee) throw new TeamStoreError('assignee_not_member');
  }
  const email = params.connectionEmail.trim().toLowerCase();
  const uniqueThreadIds = [...new Set(params.threadIds)];
  const rows = uniqueThreadIds.length
    ? await db
        .select({ id: teamThread.id, threadId: teamThread.threadId })
        .from(teamThread)
        .where(
          and(
            eq(teamThread.teamId, params.teamId),
            eq(teamThread.sharerEmail, email),
            inArray(teamThread.threadId, uniqueThreadIds),
            accessPredicate(userId),
          ),
        )
    : [];
  const byThreadId = new Map(rows.map((row) => [row.threadId, row]));
  const results: { threadId: string; outcome: BatchAssignOutcome; teamThreadId?: string }[] = [];
  const now = new Date();
  const assignedIds: string[] = [];

  await db.transaction(async (tx) => {
    for (const threadId of uniqueThreadIds) {
      const row = byThreadId.get(threadId);
      if (!row) {
        results.push({ threadId, outcome: 'not_shared' });
        continue;
      }
      if (params.assigneeUserId) {
        const assigneeHasAccess = await canAccessThread(tx, params.assigneeUserId, row.id);
        if (!assigneeHasAccess) {
          results.push({ threadId, outcome: 'assignee_no_access', teamThreadId: row.id });
          continue;
        }
      }
      await tx
        .update(teamThread)
        .set({ assigneeUserId: params.assigneeUserId, lastActivityAt: now, updatedAt: now })
        .where(eq(teamThread.id, row.id));
      assignedIds.push(row.id);
      results.push({ threadId, outcome: 'assigned', teamThreadId: row.id });
    }
    if (assignedIds.length > 0) {
      await audit(tx, {
        teamId: params.teamId,
        actorUserId: userId,
        action: 'thread.assigned_batch',
        subjectType: 'team_thread',
        subjectId: assignedIds[0]!,
        metadata: { assigneeUserId: params.assigneeUserId, teamThreadIds: assignedIds },
      });
      if (params.assigneeUserId) {
        await notify(tx, {
          teamId: params.teamId,
          teamThreadId: assignedIds[0],
          kind: 'assignment',
          actorUserId: userId,
          recipients: [params.assigneeUserId],
          prefKey: 'onAssignment',
        });
      }
    }
  });

  return { results };
}

export async function markNotificationsRead(db: DB, userId: string, ids: string[] | 'all') {
  const now = new Date();
  if (ids === 'all') {
    await db
      .update(teamNotification)
      .set({ readAt: now })
      .where(and(eq(teamNotification.userId, userId), isNull(teamNotification.readAt)));
    return;
  }
  if (ids.length === 0) return;
  await db
    .update(teamNotification)
    .set({ readAt: now })
    .where(
      and(
        eq(teamNotification.userId, userId),
        inArray(teamNotification.id, ids),
        isNull(teamNotification.readAt),
      ),
    );
}

// --- audit -------------------------------------------------------------------

export async function listTeamAudit(db: DB, userId: string, teamId: string, limit = 100) {
  await requireMembership(db, teamId, userId);
  // P18 : leftJoin — un audit système/intégration (actorUserId NULL) doit
  // apparaître dans l'historique, jamais être silencieusement filtré.
  return await db
    .select({
      id: teamAuditLog.id,
      action: teamAuditLog.action,
      subjectType: teamAuditLog.subjectType,
      subjectId: teamAuditLog.subjectId,
      metadata: teamAuditLog.metadata,
      createdAt: teamAuditLog.createdAt,
      actorUserId: teamAuditLog.actorUserId,
      actorKind: teamAuditLog.actorKind,
      actorName: user.name,
    })
    .from(teamAuditLog)
    .leftJoin(user, eq(user.id, teamAuditLog.actorUserId))
    .where(eq(teamAuditLog.teamId, teamId))
    .orderBy(desc(teamAuditLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

// --- presence ----------------------------------------------------------------

export async function heartbeatPresence(
  db: DB,
  userId: string,
  teamThreadId: string,
  typing: boolean,
  replying = false,
) {
  await resolveAccess(db, userId, teamThreadId);
  const now = new Date();
  const typingUntil = typing ? new Date(now.getTime() + 8_000) : null;
  // P15 fallback polling du « rédige une réponse » — TTL long, rafraîchi par
  // le heartbeat du composeur ouvert. Jamais de contenu, seulement des dates.
  const replyingUntil = replying ? new Date(now.getTime() + 60_000) : null;
  await db
    .insert(teamThreadPresence)
    .values({ teamThreadId, userId, lastSeenAt: now, typingUntil, replyingUntil })
    .onConflictDoUpdate({
      target: [teamThreadPresence.teamThreadId, teamThreadPresence.userId],
      set: { lastSeenAt: now, typingUntil, replyingUntil },
    });
}

export async function listPresence(db: DB, userId: string, teamThreadId: string) {
  await resolveAccess(db, userId, teamThreadId);
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS);
  return await db
    .select({
      userId: teamThreadPresence.userId,
      name: user.name,
      email: user.email,
      lastSeenAt: teamThreadPresence.lastSeenAt,
      typingUntil: teamThreadPresence.typingUntil,
      replyingUntil: teamThreadPresence.replyingUntil,
    })
    .from(teamThreadPresence)
    .innerJoin(user, eq(user.id, teamThreadPresence.userId))
    .where(
      and(
        eq(teamThreadPresence.teamThreadId, teamThreadId),
        gt(teamThreadPresence.lastSeenAt, cutoff),
      ),
    );
}

// --- search support ----------------------------------------------------------

/**
 * Collaboration thread-id sets for the caller's CURRENT mailbox (matched on
 * sharerEmail — thread ids are mailbox-scoped), ACL-filtered. Powers the
 * composable search operators is:shared / is:assigned / has:comment /
 * has:mention on the mail list.
 */
export async function listMyCollabThreadSets(db: DB, userId: string, connectionEmail: string) {
  const email = connectionEmail.trim().toLowerCase();
  const rows = await db
    .select({
      threadId: teamThread.threadId,
      assigneeUserId: teamThread.assigneeUserId,
      hasComment: sql<boolean>`exists (
        select 1 from ${teamThreadComment} c where c.team_thread_id = ${teamThread.id}
      )`,
      mentionsMe: sql<boolean>`exists (
        select 1 from ${teamThreadComment} c
        where c.team_thread_id = ${teamThread.id} and c.mentions @> ${JSON.stringify([userId])}::jsonb
      )`,
    })
    .from(teamThread)
    .innerJoin(
      teamMember,
      and(eq(teamMember.teamId, teamThread.teamId), eq(teamMember.userId, userId)),
    )
    .where(and(eq(teamThread.sharerEmail, email), accessPredicate(userId)));
  const shared: string[] = [];
  const assigned: string[] = [];
  const commented: string[] = [];
  const mentioned: string[] = [];
  for (const row of rows) {
    shared.push(row.threadId);
    if (row.assigneeUserId === userId) assigned.push(row.threadId);
    if (row.hasComment) commented.push(row.threadId);
    if (row.mentionsMe) mentioned.push(row.threadId);
  }
  return { shared, assigned, commented, mentioned };
}

// --- dashboard counters ------------------------------------------------------

/** Open shared threads assigned to me, across all my teams (sidebar badge). */
export async function countMyAssignedOpenThreads(db: DB, userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamThread)
    .innerJoin(
      teamMember,
      and(eq(teamMember.teamId, teamThread.teamId), eq(teamMember.userId, userId)),
    )
    .where(and(eq(teamThread.assigneeUserId, userId), eq(teamThread.status, 'open')));
  return row?.count ?? 0;
}
