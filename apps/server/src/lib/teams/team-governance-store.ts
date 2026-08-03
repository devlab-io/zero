/**
 * Store de GOUVERNANCE d'équipe (P17) — export signé du journal d'audit (B),
 * politique de rétention bornée + sweep (C), export/restauration de données
 * d'équipe (E). Toutes les portes passent par la matrice de capacités
 * (team-roles.ts) via requireCapability ; la restauration crée TOUJOURS une
 * nouvelle équipe (plan pur dans team-governance.ts, exécution en UNE
 * transaction ici).
 */
import {
  connection,
  team,
  teamAuditLog,
  teamCommentReaction,
  teamLabel,
  teamMember,
  teamMemberAbsence,
  teamNotification,
  teamReplyIntent,
  teamRetentionPolicy,
  teamRule,
  teamRuleRun,
  teamSlaPolicy,
  teamThread,
  teamThreadAccess,
  teamThreadComment,
  teamThreadLabel,
  user,
} from '../../db/schema';
import type {
  AuditExportPayload,
  TeamDataExport,
  TeamRestoreReport,
  TeamRetentionPolicy,
} from './team-governance-shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from './team-governance-shared';
import { appendTeamAudit, requireCapability, TeamStoreError } from './team-store';
import { planTeamRestore, type RestoreContext } from './team-governance';
import { canonicalJson } from './team-audit-export';
import type { DB } from '../../db';

const AUDIT_EXPORT_MAX_ENTRIES = 5000;

// --- B : export du journal d'audit (payload — la ROUTE signe) -----------------

export async function buildAuditExportPayload(
  db: DB,
  userId: string,
  teamId: string,
  options: { from?: Date; to?: Date },
): Promise<AuditExportPayload> {
  await requireCapability(db, teamId, userId, 'audit.export');
  const [teamRow] = await db.select().from(team).where(eq(team.id, teamId)).limit(1);
  if (!teamRow) throw new TeamStoreError('not_found');

  const conditions = [eq(teamAuditLog.teamId, teamId)];
  if (options.from) conditions.push(gte(teamAuditLog.createdAt, options.from));
  if (options.to) conditions.push(lte(teamAuditLog.createdAt, options.to));

  // ASC : un export d'archive se lit chronologiquement ; borne + sonde
  // « une de plus » pour un flag truncated honnête.
  const rows = await db
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
    .where(and(...conditions))
    .orderBy(asc(teamAuditLog.createdAt), asc(teamAuditLog.id))
    .limit(AUDIT_EXPORT_MAX_ENTRIES + 1);

  const truncated = rows.length > AUDIT_EXPORT_MAX_ENTRIES;
  const entries = (truncated ? rows.slice(0, AUDIT_EXPORT_MAX_ENTRIES) : rows).map((row) => ({
    id: row.id,
    action: row.action,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
    actorKind: row.actorKind,
    actorName: row.actorName,
  }));

  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'audit.exported',
    subjectType: 'team',
    subjectId: teamId,
    metadata: {
      entryCount: entries.length,
      truncated,
      from: options.from?.toISOString() ?? null,
      to: options.to?.toISOString() ?? null,
    },
  });

  return {
    format: 'reta-team-audit-export',
    version: 1,
    teamId,
    teamName: teamRow.name,
    requestedByUserId: userId,
    range: {
      from: options.from?.toISOString() ?? null,
      to: options.to?.toISOString() ?? null,
    },
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    truncated,
    entries,
  };
}

// --- C : politique de rétention -------------------------------------------------

function validateRetentionDays(value: number | null): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < RETENTION_MIN_DAYS || value > RETENTION_MAX_DAYS) {
    throw new TeamStoreError('invalid_retention');
  }
}

export async function getRetentionPolicy(
  db: DB,
  userId: string,
  teamId: string,
): Promise<TeamRetentionPolicy | null> {
  await requireCapability(db, teamId, userId, 'audit.read');
  const rows = await db
    .select()
    .from(teamRetentionPolicy)
    .where(eq(teamRetentionPolicy.teamId, teamId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    teamId: row.teamId,
    auditDays: row.auditDays,
    ruleRunDays: row.ruleRunDays,
    notificationDays: row.notificationDays,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setRetentionPolicy(
  db: DB,
  userId: string,
  teamId: string,
  input: { auditDays: number | null; ruleRunDays: number | null; notificationDays: number | null },
): Promise<void> {
  await requireCapability(db, teamId, userId, 'team.manage');
  validateRetentionDays(input.auditDays);
  validateRetentionDays(input.ruleRunDays);
  validateRetentionDays(input.notificationDays);
  const now = new Date();
  await db
    .insert(teamRetentionPolicy)
    .values({
      teamId,
      auditDays: input.auditDays,
      ruleRunDays: input.ruleRunDays,
      notificationDays: input.notificationDays,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamRetentionPolicy.teamId,
      set: {
        auditDays: input.auditDays,
        ruleRunDays: input.ruleRunDays,
        notificationDays: input.notificationDays,
        updatedBy: userId,
        lastSweptAt: null,
        updatedAt: now,
      },
    });
  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'retention.policy_set',
    subjectType: 'team',
    subjectId: teamId,
    metadata: {
      auditDays: input.auditDays,
      ruleRunDays: input.ruleRunDays,
      notificationDays: input.notificationDays,
    },
  });
}

/** Bornes du sweep : jamais plus de N lignes par famille par équipe par run. */
const SWEEP_BATCH = 2000;
const SWEEP_TEAMS_PER_RUN = 200;
/** Les intents de réponse expirés sont moissonnés 7 jours après expiration. */
const INTENT_GRACE_MS = 7 * 24 * 3_600_000;

export type RetentionSweepSummary = {
  teams: number;
  audit: number;
  ruleRuns: number;
  notifications: number;
  replyIntents: number;
  truncated: boolean;
};

/**
 * Purge PLANIFIÉE par lots bornés — chaque famille supprime au plus
 * SWEEP_BATCH lignes par équipe par run (le reliquat part au run suivant).
 * Chaque purge non vide est AUDITÉE (actor system). La moisson des intents
 * de réponse expirés (P15, TTL 24 h + grâce 7 j) est indépendante des
 * politiques : c'est de l'hygiène, pas de la rétention.
 */
export async function sweepTeamRetention(db: DB, now: Date): Promise<RetentionSweepSummary> {
  const summary: RetentionSweepSummary = {
    teams: 0,
    audit: 0,
    ruleRuns: 0,
    notifications: 0,
    replyIntents: 0,
    truncated: false,
  };

  const policies = await db
    .select()
    .from(teamRetentionPolicy)
    // NULLS FIRST puis plus ancien sweep : chaque politique finit par passer,
    // même quand plus de 200 équipes ont configuré une rétention.
    .orderBy(
      sql`${teamRetentionPolicy.lastSweptAt} asc nulls first`,
      asc(teamRetentionPolicy.teamId),
    )
    .limit(SWEEP_TEAMS_PER_RUN);

  for (const policy of policies) {
    // Purge + trace d'audit d'UNE équipe en UNE transaction : une purge sans
    // trace (crash entre delete et audit) est impossible par construction.
    await db.transaction(async (tx) => {
      const counts = { audit: 0, ruleRuns: 0, notifications: 0 };

      if (policy.auditDays !== null) {
        const cutoff = new Date(now.getTime() - policy.auditDays * 24 * 3_600_000);
        const old = await tx
          .select({ id: teamAuditLog.id })
          .from(teamAuditLog)
          .where(and(eq(teamAuditLog.teamId, policy.teamId), lt(teamAuditLog.createdAt, cutoff)))
          .orderBy(asc(teamAuditLog.createdAt))
          .limit(SWEEP_BATCH);
        if (old.length > 0) {
          await tx.delete(teamAuditLog).where(
            inArray(
              teamAuditLog.id,
              old.map((row) => row.id),
            ),
          );
          counts.audit = old.length;
          if (old.length === SWEEP_BATCH) summary.truncated = true;
        }
      }

      if (policy.ruleRunDays !== null) {
        const cutoff = new Date(now.getTime() - policy.ruleRunDays * 24 * 3_600_000);
        // 'processing' est un CLAIM vivant — jamais purgé par la rétention.
        const old = await tx
          .select({ id: teamRuleRun.id })
          .from(teamRuleRun)
          .where(
            and(
              eq(teamRuleRun.teamId, policy.teamId),
              lt(teamRuleRun.createdAt, cutoff),
              inArray(teamRuleRun.outcome, ['applied', 'skipped', 'error', 'undone']),
            ),
          )
          .orderBy(asc(teamRuleRun.createdAt))
          .limit(SWEEP_BATCH);
        if (old.length > 0) {
          await tx.delete(teamRuleRun).where(
            inArray(
              teamRuleRun.id,
              old.map((row) => row.id),
            ),
          );
          counts.ruleRuns = old.length;
          if (old.length === SWEEP_BATCH) summary.truncated = true;
        }
      }

      if (policy.notificationDays !== null) {
        const cutoff = new Date(now.getTime() - policy.notificationDays * 24 * 3_600_000);
        const old = await tx
          .select({ id: teamNotification.id })
          .from(teamNotification)
          .where(
            and(eq(teamNotification.teamId, policy.teamId), lt(teamNotification.createdAt, cutoff)),
          )
          .orderBy(asc(teamNotification.createdAt))
          .limit(SWEEP_BATCH);
        if (old.length > 0) {
          await tx.delete(teamNotification).where(
            inArray(
              teamNotification.id,
              old.map((row) => row.id),
            ),
          );
          counts.notifications = old.length;
          if (old.length === SWEEP_BATCH) summary.truncated = true;
        }
      }

      const purged = counts.audit + counts.ruleRuns + counts.notifications;
      if (purged > 0) {
        summary.teams += 1;
        summary.audit += counts.audit;
        summary.ruleRuns += counts.ruleRuns;
        summary.notifications += counts.notifications;
        await appendTeamAudit(tx, {
          teamId: policy.teamId,
          actorUserId: null,
          actorKind: 'system',
          action: 'retention.swept',
          subjectType: 'team',
          subjectId: policy.teamId,
          metadata: {
            ...counts,
            policy: {
              auditDays: policy.auditDays,
              ruleRunDays: policy.ruleRunDays,
              notificationDays: policy.notificationDays,
            },
          },
        });
      }
      await tx
        .update(teamRetentionPolicy)
        .set({ lastSweptAt: now })
        .where(eq(teamRetentionPolicy.teamId, policy.teamId));
    });
  }

  // Hygiène P15 : intents expirés depuis plus de 7 jours, toutes équipes.
  const intentCutoff = new Date(now.getTime() - INTENT_GRACE_MS);
  const staleIntents = await db
    .select({ id: teamReplyIntent.id })
    .from(teamReplyIntent)
    .where(lt(teamReplyIntent.expiresAt, intentCutoff))
    .orderBy(asc(teamReplyIntent.expiresAt))
    .limit(SWEEP_BATCH);
  if (staleIntents.length > 0) {
    await db.delete(teamReplyIntent).where(
      inArray(
        teamReplyIntent.id,
        staleIntents.map((row) => row.id),
      ),
    );
    summary.replyIntents = staleIntents.length;
    if (staleIntents.length === SWEEP_BATCH) summary.truncated = true;
  }

  return summary;
}

// --- E : export de données d'équipe ------------------------------------------------

const EXPORT_BOUNDS = {
  members: 500,
  labels: 200,
  threads: 2000,
  comments: 10_000,
  rules: 200,
  absences: 500,
} as const;

export async function exportTeamData(
  db: DB,
  userId: string,
  teamId: string,
): Promise<TeamDataExport> {
  await requireCapability(db, teamId, userId, 'data.export');
  const [teamRow] = await db.select().from(team).where(eq(team.id, teamId)).limit(1);
  if (!teamRow) throw new TeamStoreError('not_found');
  const truncated: string[] = [];

  const memberRows = await db
    .select({
      userId: teamMember.userId,
      role: teamMember.role,
      prefs: teamMember.prefs,
      email: user.email,
      name: user.name,
    })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(eq(teamMember.teamId, teamId))
    .limit(EXPORT_BOUNDS.members + 1);
  if (memberRows.length > EXPORT_BOUNDS.members) truncated.push('members');

  const labelRows = await db
    .select()
    .from(teamLabel)
    .where(eq(teamLabel.teamId, teamId))
    .limit(EXPORT_BOUNDS.labels + 1);
  if (labelRows.length > EXPORT_BOUNDS.labels) truncated.push('labels');

  const threadRows = await db
    .select()
    .from(teamThread)
    .where(eq(teamThread.teamId, teamId))
    .orderBy(desc(teamThread.lastActivityAt))
    .limit(EXPORT_BOUNDS.threads + 1);
  if (threadRows.length > EXPORT_BOUNDS.threads) truncated.push('threads');
  const keptThreads = threadRows.slice(0, EXPORT_BOUNDS.threads);
  const threadIds = keptThreads.map((row) => row.id);

  const threadLabelRows = threadIds.length
    ? await db
        .select()
        .from(teamThreadLabel)
        .where(inArray(teamThreadLabel.teamThreadId, threadIds))
    : [];
  const accessRowsAll = threadIds.length
    ? await db
        .select()
        .from(teamThreadAccess)
        .where(
          and(
            inArray(teamThreadAccess.teamThreadId, threadIds),
            isNull(teamThreadAccess.revokedAt),
          ),
        )
    : [];

  const commentRows = threadIds.length
    ? await db
        .select()
        .from(teamThreadComment)
        .where(inArray(teamThreadComment.teamThreadId, threadIds))
        .orderBy(asc(teamThreadComment.createdAt))
        .limit(EXPORT_BOUNDS.comments + 1)
    : [];
  if (commentRows.length > EXPORT_BOUNDS.comments) truncated.push('comments');
  const keptComments = commentRows.slice(0, EXPORT_BOUNDS.comments);
  const commentIds = keptComments.map((row) => row.id);

  const reactionRows = commentIds.length
    ? await db
        .select()
        .from(teamCommentReaction)
        .where(inArray(teamCommentReaction.commentId, commentIds))
    : [];
  const reactionsByComment = new Map<string, { userId: string; emoji: string }[]>();
  for (const reaction of reactionRows) {
    const list = reactionsByComment.get(reaction.commentId) ?? [];
    list.push({ userId: reaction.userId, emoji: reaction.emoji });
    reactionsByComment.set(reaction.commentId, list);
  }

  const ruleRows = await db
    .select({
      id: teamRule.id,
      name: teamRule.name,
      triggers: teamRule.triggers,
      actions: teamRule.actions,
      createdBy: teamRule.createdBy,
      createdAt: teamRule.createdAt,
      watchedEmail: connection.email,
    })
    .from(teamRule)
    .innerJoin(connection, eq(connection.id, teamRule.connectionId))
    .where(and(eq(teamRule.teamId, teamId), isNull(teamRule.deletedAt)))
    .limit(EXPORT_BOUNDS.rules + 1);
  if (ruleRows.length > EXPORT_BOUNDS.rules) truncated.push('rules');

  const slaRows = await db
    .select()
    .from(teamSlaPolicy)
    .where(eq(teamSlaPolicy.teamId, teamId))
    .limit(1);
  const retentionRows = await db
    .select()
    .from(teamRetentionPolicy)
    .where(eq(teamRetentionPolicy.teamId, teamId))
    .limit(1);

  const absenceRows = await db
    .select()
    .from(teamMemberAbsence)
    .where(and(eq(teamMemberAbsence.teamId, teamId), gte(teamMemberAbsence.endsAt, new Date())))
    .limit(EXPORT_BOUNDS.absences + 1);
  if (absenceRows.length > EXPORT_BOUNDS.absences) truncated.push('absences');

  const labelsByThread = new Map<string, string[]>();
  for (const link of threadLabelRows) {
    const list = labelsByThread.get(link.teamThreadId) ?? [];
    list.push(link.labelId);
    labelsByThread.set(link.teamThreadId, list);
  }
  const accessByThread = new Map<string, string[]>();
  for (const access of accessRowsAll) {
    const list = accessByThread.get(access.teamThreadId) ?? [];
    list.push(access.userId);
    accessByThread.set(access.teamThreadId, list);
  }

  const payload: TeamDataExport = {
    format: 'reta-team-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    team: {
      id: teamRow.id,
      name: teamRow.name,
      createdBy: teamRow.createdBy,
      createdAt: teamRow.createdAt.toISOString(),
    },
    members: memberRows.slice(0, EXPORT_BOUNDS.members).map((row) => ({
      userId: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      prefs: row.prefs as Record<string, unknown>,
    })),
    labels: labelRows.slice(0, EXPORT_BOUNDS.labels).map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      createdBy: row.createdBy,
    })),
    threads: keptThreads.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      sharerUserId: row.sharerUserId,
      sharerEmail: row.sharerEmail,
      providerId: row.providerId,
      visibility: row.visibility,
      subject: row.subject,
      preview: row.preview,
      participants: row.participants,
      messageCount: row.messageCount,
      latestReceivedOn: row.latestReceivedOn,
      status: row.status,
      assigneeUserId: row.assigneeUserId,
      lastActivityAt: row.lastActivityAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      labelIds: labelsByThread.get(row.id) ?? [],
      accessUserIds: accessByThread.get(row.id) ?? [],
    })),
    comments: keptComments.map((row) => ({
      id: row.id,
      teamThreadId: row.teamThreadId,
      authorUserId: row.authorUserId,
      body: row.body,
      mentions: row.mentions,
      quote: row.quote ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reactions: reactionsByComment.get(row.id) ?? [],
    })),
    rules: ruleRows.slice(0, EXPORT_BOUNDS.rules).map((row) => ({
      id: row.id,
      name: row.name,
      triggers: row.triggers as Record<string, unknown>,
      actions: row.actions as unknown[],
      createdBy: row.createdBy,
      watchedEmail: row.watchedEmail,
      createdAt: row.createdAt.toISOString(),
    })),
    slaPolicy: slaRows[0]
      ? {
          firstResponseMinutes: slaRows[0].firstResponseMinutes,
          resolutionMinutes: slaRows[0].resolutionMinutes,
          timeZone: slaRows[0].timeZone,
          businessHours: slaRows[0].businessHours,
        }
      : null,
    retentionPolicy: retentionRows[0]
      ? {
          auditDays: retentionRows[0].auditDays,
          ruleRunDays: retentionRows[0].ruleRunDays,
          notificationDays: retentionRows[0].notificationDays,
        }
      : null,
    absences: absenceRows.slice(0, EXPORT_BOUNDS.absences).map((row) => ({
      userId: row.userId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      note: row.note || null,
    })),
    truncated,
    excluded: [
      'audit_log (export signé dédié : exportAudit)',
      'integrations (secrets scellés non exportables)',
      'draft_reviews + reply_claims + reply_intents (état éphémère)',
      'notifications + presence (état par utilisateur, non portable)',
      'rule_runs (historique d’exécution, non rejouable)',
    ],
  };

  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'data.exported',
    subjectType: 'team',
    subjectId: teamId,
    metadata: {
      threads: payload.threads.length,
      comments: payload.comments.length,
      truncated,
    },
  });

  return payload;
}

// --- E : restauration ---------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function chunk<T>(rows: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Restaure un export dans une NOUVELLE équipe dont l'appelant devient owner.
 * Le plan (pur) écarte tout ce qui ne se re-résout pas dans CETTE instance
 * (utilisateur absent, email divergent, connexion du partageur disparue) —
 * chaque écart est nommé dans le rapport. Insertion en UNE transaction.
 */
export async function restoreTeamData(
  db: DB,
  userId: string,
  payload: TeamDataExport,
): Promise<TeamRestoreReport> {
  if (payload.format !== 'reta-team-export' || payload.version !== 1) {
    throw new TeamStoreError('restore_invalid');
  }

  // Un export est un document de portabilité, PAS un bearer token vers les
  // boîtes des membres. La restauration ne peut re-lier des connexions mail
  // que si l'appelant possède encore data.export sur l'équipe source.
  await requireCapability(db, payload.team.id, userId, 'data.export');

  const sourceMemberRows = await db
    .select({ userId: teamMember.userId })
    .from(teamMember)
    .where(eq(teamMember.teamId, payload.team.id));
  const authorizedMemberIds = new Set(sourceMemberRows.map((row) => row.userId));

  const sourceThreadIds = [...new Set(payload.threads.map((thread) => thread.id))];
  const sourceThreadRows = sourceThreadIds.length
    ? await db
        .select({
          id: teamThread.id,
          threadId: teamThread.threadId,
          sharerUserId: teamThread.sharerUserId,
          sharerEmail: teamThread.sharerEmail,
          providerId: teamThread.providerId,
        })
        .from(teamThread)
        .where(and(eq(teamThread.teamId, payload.team.id), inArray(teamThread.id, sourceThreadIds)))
    : [];
  const sourceThreads = new Map(sourceThreadRows.map((row) => [row.id, row]));

  const sourceRuleIds = [...new Set(payload.rules.map((rule) => rule.id))];
  const sourceRuleRows = sourceRuleIds.length
    ? await db
        .select({
          id: teamRule.id,
          createdBy: teamRule.createdBy,
          watchedEmail: connection.email,
        })
        .from(teamRule)
        .innerJoin(connection, eq(connection.id, teamRule.connectionId))
        .where(
          and(
            eq(teamRule.teamId, payload.team.id),
            inArray(teamRule.id, sourceRuleIds),
            isNull(teamRule.deletedAt),
          ),
        )
    : [];
  const sourceRules = new Map(sourceRuleRows.map((row) => [row.id, row]));

  // Contexte du plan : utilisateurs et connexions référencés par l'export.
  const referencedUserIds = new Set<string>([userId]);
  for (const member of payload.members) referencedUserIds.add(member.userId);
  for (const thread of payload.threads) referencedUserIds.add(thread.sharerUserId);
  for (const comment of payload.comments) referencedUserIds.add(comment.authorUserId);
  for (const rule of payload.rules) referencedUserIds.add(rule.createdBy);

  const userRows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, [...referencedUserIds]));
  const users = new Map(userRows.map((row) => [row.id, { email: row.email }]));

  const connectionOwnerIds = new Set<string>();
  for (const thread of payload.threads) connectionOwnerIds.add(thread.sharerUserId);
  for (const rule of payload.rules) connectionOwnerIds.add(rule.createdBy);
  const connectionRows = connectionOwnerIds.size
    ? await db
        .select({ id: connection.id, userId: connection.userId, email: connection.email })
        .from(connection)
        .where(inArray(connection.userId, [...connectionOwnerIds]))
    : [];
  const connectionsByUser = new Map<string, { id: string; email: string }[]>();
  for (const row of connectionRows) {
    const list = connectionsByUser.get(row.userId) ?? [];
    list.push({ id: row.id, email: row.email });
    connectionsByUser.set(row.userId, list);
  }

  const context: RestoreContext = {
    callerId: userId,
    users,
    connectionsByUser,
    authorizedMemberIds,
    sourceThreads,
    sourceRules,
    newId: () => crypto.randomUUID(),
    now: new Date(),
    sourceDigest: await sha256Hex(canonicalJson(payload)),
  };
  const plan = planTeamRestore(payload, context);

  await db.transaction(async (tx) => {
    await tx.insert(team).values({
      id: plan.team.id,
      name: plan.team.name,
      createdBy: plan.team.createdBy,
    });
    for (const rows of chunk(plan.members)) {
      await tx.insert(teamMember).values(rows as (typeof teamMember.$inferInsert)[]);
    }
    for (const rows of chunk(plan.labels)) {
      await tx.insert(teamLabel).values(rows as (typeof teamLabel.$inferInsert)[]);
    }
    for (const rows of chunk(plan.threads)) {
      await tx.insert(teamThread).values(rows as (typeof teamThread.$inferInsert)[]);
    }
    for (const rows of chunk(plan.threadLabels)) {
      await tx.insert(teamThreadLabel).values(rows as (typeof teamThreadLabel.$inferInsert)[]);
    }
    for (const rows of chunk(plan.accessRows)) {
      await tx.insert(teamThreadAccess).values(rows as (typeof teamThreadAccess.$inferInsert)[]);
    }
    for (const rows of chunk(plan.comments)) {
      await tx.insert(teamThreadComment).values(rows as (typeof teamThreadComment.$inferInsert)[]);
    }
    for (const rows of chunk(plan.reactions)) {
      await tx
        .insert(teamCommentReaction)
        .values(rows as (typeof teamCommentReaction.$inferInsert)[]);
    }
    for (const rows of chunk(plan.rules)) {
      await tx.insert(teamRule).values(rows as (typeof teamRule.$inferInsert)[]);
    }
    if (plan.slaPolicy) {
      await tx.insert(teamSlaPolicy).values(plan.slaPolicy as typeof teamSlaPolicy.$inferInsert);
    }
    if (plan.retentionPolicy) {
      await tx
        .insert(teamRetentionPolicy)
        .values(plan.retentionPolicy as typeof teamRetentionPolicy.$inferInsert);
    }
    for (const rows of chunk(plan.absences)) {
      await tx.insert(teamMemberAbsence).values(rows as (typeof teamMemberAbsence.$inferInsert)[]);
    }
    await appendTeamAudit(tx, {
      teamId: plan.team.id,
      actorUserId: userId,
      action: 'team.restored',
      subjectType: 'team',
      subjectId: plan.team.id,
      metadata: {
        sourceTeamId: payload.team.id,
        sourceDigest: context.sourceDigest,
        restored: plan.report.restored,
        skippedCount: plan.report.skipped.length,
      },
    });
  });

  return plan.report;
}
