import {
  computeOverdue,
  coverage,
  labelVolumes,
  oldestOpenWithoutReply,
  reopeningsAndTransfers,
  responseAndResolutionStats,
  stuckProcessingRuns,
  workloadByMember,
  PROCESSING_STUCK_MINUTES,
  type OpsAuditEvent,
  type OpsThreadRow,
} from './team-ops';
import {
  sendJob,
  teamAuditLog,
  teamLabel,
  teamMember,
  teamMemberAbsence,
  teamRule,
  teamRuleRun,
  teamSlaPolicy,
  teamThread,
  teamThreadLabel,
  user,
} from '../../db/schema';
import { and, asc, eq, gte, inArray, lt, min, sql } from 'drizzle-orm';
import { accessPredicate, TeamStoreError } from './team-store';
import type { TeamBusinessHours } from './team-rules-shared';
import { TeamRuleValidationError } from './team-rules';
import type { DB } from '../../db';

/**
 * P14 SLA + P16 opérations — persistance.
 *
 * Autorisation : politique SLA = écriture OWNER, lecture membre. Absences =
 * écriture par le membre POUR LUI-MÊME ou par un owner (un membre ne déclare
 * jamais l'absence d'autrui), lecture membre. Tout est audité.
 *
 * ACL d'agrégation : l'overview ne compte QUE les fils que l'utilisateur
 * appelant peut voir — le même `accessPredicate` ensembliste que les listes
 * est appliqué à la requête de base AVANT toute agrégation, et les
 * événements d'audit sont restreints aux fils de cet ensemble. Un membre
 * sans accès à un fil restricted ne le voit dans AUCUN compteur.
 *
 * Honnêteté : « première réponse » = premier envoi d'un membre ENREGISTRÉ VIA
 * RETA (send_job) — les réponses parties de Gmail directement sont inconnues
 * et ne sont jamais devinées. Fils retirés du partage : sortis des agrégats.
 * Toutes les bornes (fils, événements) sont explicites via des flags
 * `truncated`.
 */

const MAX_OPS_THREADS = 1000;
const MAX_OPS_EVENTS = 5000;
const MAX_LABEL_LINKS = 5000;
const MAX_ABSENCE_DAYS = 366;
const MAX_STUCK_RUNS = 50;
const MAX_ABSENCES = 200;

async function requireMembership(db: DB, teamId: string, userId: string) {
  const rows = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  const membership = rows[0];
  if (!membership) throw new TeamStoreError('not_a_member');
  return membership;
}

async function requireOwner(db: DB, teamId: string, userId: string) {
  const membership = await requireMembership(db, teamId, userId);
  if (membership.role !== 'owner') throw new TeamStoreError('forbidden');
  return membership;
}

async function auditOps(
  db: DB,
  entry: {
    teamId: string;
    actorUserId: string;
    action: string;
    subjectType: string;
    subjectId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(teamAuditLog).values({
    id: crypto.randomUUID(),
    teamId: entry.teamId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    metadata: entry.metadata ?? {},
  });
}

// --- politique SLA -----------------------------------------------------------

export type SlaPolicyInput = {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  timeZone: string;
  businessHours: TeamBusinessHours;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (time: string) => {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
};

function validatePolicy(input: SlaPolicyInput) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone });
  } catch {
    throw new TeamRuleValidationError('invalid_hours');
  }
  const { days, start, end } = input.businessHours;
  if (
    !TIME_RE.test(start) ||
    !TIME_RE.test(end) ||
    toMinutes(end) <= toMinutes(start) ||
    days.length === 0 ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new TeamRuleValidationError('invalid_hours');
  }
}

export async function getSlaPolicy(db: DB, userId: string, teamId: string) {
  await requireMembership(db, teamId, userId);
  const rows = await db
    .select({
      teamId: teamSlaPolicy.teamId,
      firstResponseMinutes: teamSlaPolicy.firstResponseMinutes,
      resolutionMinutes: teamSlaPolicy.resolutionMinutes,
      timeZone: teamSlaPolicy.timeZone,
      businessHours: teamSlaPolicy.businessHours,
      updatedAt: teamSlaPolicy.updatedAt,
    })
    .from(teamSlaPolicy)
    .where(eq(teamSlaPolicy.teamId, teamId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setSlaPolicy(db: DB, userId: string, teamId: string, input: SlaPolicyInput) {
  await requireOwner(db, teamId, userId);
  validatePolicy(input);
  const now = new Date();
  await db
    .insert(teamSlaPolicy)
    .values({
      teamId,
      firstResponseMinutes: input.firstResponseMinutes,
      resolutionMinutes: input.resolutionMinutes,
      timeZone: input.timeZone,
      businessHours: input.businessHours,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamSlaPolicy.teamId,
      set: {
        firstResponseMinutes: input.firstResponseMinutes,
        resolutionMinutes: input.resolutionMinutes,
        timeZone: input.timeZone,
        businessHours: input.businessHours,
        updatedBy: userId,
        updatedAt: now,
      },
    });
  await auditOps(db, {
    teamId,
    actorUserId: userId,
    action: 'sla.updated',
    subjectType: 'team',
    subjectId: teamId,
    metadata: {
      firstResponseMinutes: input.firstResponseMinutes,
      resolutionMinutes: input.resolutionMinutes,
      timeZone: input.timeZone,
      businessHours: input.businessHours,
    },
  });
}

// --- disponibilité / absences ------------------------------------------------

export async function listAbsences(db: DB, userId: string, teamId: string) {
  await requireMembership(db, teamId, userId);
  const rows = await db
    .select({
      id: teamMemberAbsence.id,
      userId: teamMemberAbsence.userId,
      userName: user.name,
      startsAt: teamMemberAbsence.startsAt,
      endsAt: teamMemberAbsence.endsAt,
      note: teamMemberAbsence.note,
      createdBy: teamMemberAbsence.createdBy,
    })
    .from(teamMemberAbsence)
    .leftJoin(user, eq(user.id, teamMemberAbsence.userId))
    .where(and(eq(teamMemberAbsence.teamId, teamId), gte(teamMemberAbsence.endsAt, new Date())))
    .orderBy(asc(teamMemberAbsence.startsAt))
    .limit(MAX_ABSENCES);
  return rows.map((row) => ({ ...row, userName: row.userName ?? '' }));
}

/**
 * Déclare une absence : un membre pour LUI-MÊME, ou un owner pour n'importe
 * quel membre de l'équipe. Jamais un membre pour autrui.
 */
export async function declareAbsence(
  db: DB,
  userId: string,
  teamId: string,
  input: { targetUserId: string; startsAt: Date; endsAt: Date; note?: string },
) {
  const membership = await requireMembership(db, teamId, userId);
  if (input.targetUserId !== userId && membership.role !== 'owner') {
    throw new TeamStoreError('forbidden');
  }
  await requireMembership(db, teamId, input.targetUserId);
  if (
    input.endsAt <= input.startsAt ||
    input.endsAt.getTime() - input.startsAt.getTime() > MAX_ABSENCE_DAYS * 24 * 3_600_000
  ) {
    throw new TeamRuleValidationError('invalid_hours');
  }
  const id = crypto.randomUUID();
  await db.insert(teamMemberAbsence).values({
    id,
    teamId,
    userId: input.targetUserId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    note: (input.note ?? '').slice(0, 300),
    createdBy: userId,
  });
  await auditOps(db, {
    teamId,
    actorUserId: userId,
    action: 'availability.declared',
    subjectType: 'user',
    subjectId: input.targetUserId,
    metadata: {
      absenceId: id,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
    },
  });
  return { id };
}

export async function removeAbsence(db: DB, userId: string, absenceId: string) {
  const rows = await db
    .select()
    .from(teamMemberAbsence)
    .where(eq(teamMemberAbsence.id, absenceId))
    .limit(1);
  const absence = rows[0];
  if (!absence) throw new TeamStoreError('not_found');
  const membership = await requireMembership(db, absence.teamId, userId);
  if (absence.userId !== userId && membership.role !== 'owner') {
    throw new TeamStoreError('forbidden');
  }
  await db.delete(teamMemberAbsence).where(eq(teamMemberAbsence.id, absenceId));
  await auditOps(db, {
    teamId: absence.teamId,
    actorUserId: userId,
    action: 'availability.removed',
    subjectType: 'user',
    subjectId: absence.userId,
    metadata: { absenceId },
  });
}

// --- overview ----------------------------------------------------------------

export async function getOpsOverview(
  db: DB,
  userId: string,
  teamId: string,
  options: { windowDays: number },
) {
  await requireMembership(db, teamId, userId);
  const windowDays = Math.min(Math.max(Math.floor(options.windowDays), 1), 90);
  const nowMs = Date.now();
  const windowStart = new Date(nowMs - windowDays * 24 * 3_600_000);

  const policyRow = await getSlaPolicyRow(db, teamId);
  const sla = policyRow
    ? {
        firstResponseMinutes: policyRow.firstResponseMinutes,
        resolutionMinutes: policyRow.resolutionMinutes,
        window: { ...policyRow.businessHours, timeZone: policyRow.timeZone },
      }
    : null;

  const members = await db
    .select({ userId: teamMember.userId, name: user.name })
    .from(teamMember)
    .leftJoin(user, eq(user.id, teamMember.userId))
    .where(eq(teamMember.teamId, teamId));
  const memberList = members.map((member) => ({
    userId: member.userId,
    name: member.name ?? '',
  }));

  // BASE ACL-first : uniquement les fils que L'APPELANT peut voir — fils
  // ouverts (toutes dates) + fils partagés dans la fenêtre. Borné, flag
  // explicite si tronqué.
  const threadRows = await db
    .select({
      id: teamThread.id,
      threadId: teamThread.threadId,
      subject: teamThread.subject,
      status: teamThread.status,
      assigneeUserId: teamThread.assigneeUserId,
      createdAt: teamThread.createdAt,
    })
    .from(teamThread)
    .where(
      and(
        eq(teamThread.teamId, teamId),
        accessPredicate(userId),
        sql`(${teamThread.status} = 'open' or ${teamThread.createdAt} >= ${windowStart})`,
      ),
    )
    .orderBy(asc(teamThread.createdAt))
    .limit(MAX_OPS_THREADS + 1);
  const threadsTruncated = threadRows.length > MAX_OPS_THREADS;
  const threads = threadsTruncated ? threadRows.slice(0, MAX_OPS_THREADS) : threadRows;
  const teamThreadIds = threads.map((thread) => thread.id);

  // Première réponse ENREGISTRÉE VIA RETA — jointure sur le COUPLE EXACT
  // (connexion du PARTAGEUR, threadId provider) : les threadIds Gmail sont
  // scopés par connexion — le même id chez deux comptes désigne deux fils
  // sans rapport, un group-by threadId seul serait une collision
  // cross-account. L'instant retenu est `updatedAt` du job (passage à
  // 'sent'), STRICTEMENT postérieur au partage : un job créé/envoyé avant le
  // partage n'est pas une réponse au fil d'équipe. Mappé par teamThreadId.
  const firstReplyByTeamThread = new Map<string, number>();
  if (teamThreadIds.length > 0) {
    const replies = await db
      .select({ teamThreadId: teamThread.id, firstAt: min(sendJob.updatedAt) })
      .from(sendJob)
      .innerJoin(
        teamThread,
        and(
          eq(sendJob.connectionId, teamThread.sharerConnectionId),
          eq(sendJob.threadId, teamThread.threadId),
        ),
      )
      .where(
        and(
          eq(sendJob.status, 'sent'),
          inArray(teamThread.id, teamThreadIds),
          sql`${sendJob.updatedAt} > ${teamThread.createdAt}`,
        ),
      )
      .groupBy(teamThread.id);
    for (const reply of replies) {
      if (reply.teamThreadId && reply.firstAt) {
        firstReplyByTeamThread.set(reply.teamThreadId, reply.firstAt.getTime());
      }
    }
  }

  // Événements d'audit des fils VISIBLES uniquement (même ensemble ACL).
  let events: OpsAuditEvent[] = [];
  let eventsTruncated = false;
  if (teamThreadIds.length > 0) {
    const eventRows = await db
      .select({
        subjectId: teamAuditLog.subjectId,
        action: teamAuditLog.action,
        metadata: teamAuditLog.metadata,
        createdAt: teamAuditLog.createdAt,
      })
      .from(teamAuditLog)
      .where(
        and(
          eq(teamAuditLog.teamId, teamId),
          inArray(teamAuditLog.action, ['thread.status_changed', 'thread.assigned']),
          inArray(teamAuditLog.subjectId, teamThreadIds),
        ),
      )
      .orderBy(asc(teamAuditLog.createdAt))
      .limit(MAX_OPS_EVENTS + 1);
    eventsTruncated = eventRows.length > MAX_OPS_EVENTS;
    events = (eventsTruncated ? eventRows.slice(0, MAX_OPS_EVENTS) : eventRows).map((row) => ({
      subjectId: row.subjectId,
      action: row.action,
      metadata: row.metadata ?? {},
      createdAtMs: row.createdAt.getTime(),
    }));
  }

  const firstClosedByThread = new Map<string, number>();
  for (const event of events) {
    if (event.action === 'thread.status_changed' && event.metadata['status'] === 'closed') {
      const existing = firstClosedByThread.get(event.subjectId);
      if (existing === undefined || event.createdAtMs < existing) {
        firstClosedByThread.set(event.subjectId, event.createdAtMs);
      }
    }
  }

  const opsRows: OpsThreadRow[] = threads.map((thread) => ({
    teamThreadId: thread.id,
    subject: thread.subject,
    status: thread.status,
    assigneeUserId: thread.assigneeUserId,
    sharedAtMs: thread.createdAt.getTime(),
    firstReplyAtMs: firstReplyByTeamThread.get(thread.id) ?? null,
    firstClosedAtMs: firstClosedByThread.get(thread.id) ?? null,
  }));

  const windowRows = opsRows.filter((row) => row.sharedAtMs >= windowStart.getTime());
  const windowEvents = events.filter((event) => event.createdAtMs >= windowStart.getTime());
  // FILS distincts passés en Done dans la fenêtre — un fil re-clos plusieurs
  // fois (close → reopen → close) compte UNE fois, pas une par événement.
  const resolvedInWindowIds = new Set(
    windowEvents
      .filter(
        (event) =>
          event.action === 'thread.status_changed' && event.metadata['status'] === 'closed',
      )
      .map((event) => event.subjectId),
  );
  const resolvedInWindow = resolvedInWindowIds.size;

  // Volume par LABEL d'équipe — liens restreints aux fils VISIBLES (le même
  // ensemble ACL que tout le reste) ; le join teamLabel garantit des labels
  // team-scopés. Borné + flag.
  const windowRowIds = new Set(windowRows.map((row) => row.teamThreadId));
  let labelLinks: Array<{ teamThreadId: string; labelId: string; labelName: string }> = [];
  let labelsTruncated = false;
  if (teamThreadIds.length > 0) {
    const labelRows = await db
      .select({
        teamThreadId: teamThreadLabel.teamThreadId,
        labelId: teamLabel.id,
        labelName: teamLabel.name,
      })
      .from(teamThreadLabel)
      .innerJoin(teamLabel, eq(teamLabel.id, teamThreadLabel.labelId))
      .where(
        and(eq(teamLabel.teamId, teamId), inArray(teamThreadLabel.teamThreadId, teamThreadIds)),
      )
      .limit(MAX_LABEL_LINKS + 1);
    labelsTruncated = labelRows.length > MAX_LABEL_LINKS;
    labelLinks = labelsTruncated ? labelRows.slice(0, MAX_LABEL_LINKS) : labelRows;
  }

  const stuckRuns = await db
    .select({ id: teamRuleRun.id, ruleName: teamRule.name, createdAt: teamRuleRun.createdAt })
    .from(teamRuleRun)
    .innerJoin(teamRule, eq(teamRule.id, teamRuleRun.ruleId))
    .where(
      and(
        eq(teamRuleRun.teamId, teamId),
        eq(teamRuleRun.outcome, 'processing'),
        lt(teamRuleRun.createdAt, new Date(nowMs - PROCESSING_STUCK_MINUTES * 60_000)),
      ),
    )
    .orderBy(asc(teamRuleRun.createdAt))
    .limit(MAX_STUCK_RUNS);

  const absences = await db
    .select({
      userId: teamMemberAbsence.userId,
      startsAt: teamMemberAbsence.startsAt,
      endsAt: teamMemberAbsence.endsAt,
    })
    .from(teamMemberAbsence)
    .where(and(eq(teamMemberAbsence.teamId, teamId), gte(teamMemberAbsence.endsAt, new Date())))
    .limit(MAX_ABSENCES);

  const oldest = oldestOpenWithoutReply(opsRows);
  const stats = responseAndResolutionStats(windowRows, sla ? sla.window : null);

  return {
    window: {
      days: windowDays,
      from: windowStart.toISOString(),
      to: new Date(nowMs).toISOString(),
    },
    sla: policyRow
      ? {
          firstResponseMinutes: policyRow.firstResponseMinutes,
          resolutionMinutes: policyRow.resolutionMinutes,
          timeZone: policyRow.timeZone,
          businessHours: policyRow.businessHours,
        }
      : null,
    counts: {
      open: opsRows.filter((row) => row.status === 'open').length,
      unassigned: opsRows.filter((row) => row.status === 'open' && !row.assigneeUserId).length,
      sharedInWindow: windowRows.length,
      resolvedInWindow,
    },
    overdue: computeOverdue(opsRows, sla, nowMs),
    oldestOpenWithoutReply: oldest
      ? {
          teamThreadId: oldest.teamThreadId,
          subject: oldest.subject,
          sharedAt: new Date(oldest.sharedAtMs).toISOString(),
        }
      : null,
    firstResponse: stats.firstResponse,
    resolution: stats.resolution,
    ...reopeningsAndTransfers(windowEvents),
    labelVolumes: labelVolumes(labelLinks, windowRowIds, resolvedInWindowIds),
    workload: workloadByMember(opsRows, memberList),
    coverage: (() => {
      const result = coverage(
        memberList,
        absences.map((absence) => ({
          userId: absence.userId,
          startsAtMs: absence.startsAt.getTime(),
          endsAtMs: absence.endsAt.getTime(),
        })),
        nowMs,
      );
      return {
        availableCount: result.availableCount,
        totalCount: memberList.length,
        rows: result.rows.map((entry) => ({
          userId: entry.userId,
          name: entry.name,
          absentUntil: entry.absentUntilMs ? new Date(entry.absentUntilMs).toISOString() : null,
        })),
      };
    })(),
    stuckProcessing: stuckProcessingRuns(
      stuckRuns.map((run) => ({
        id: run.id,
        ruleName: run.ruleName,
        createdAtMs: run.createdAt.getTime(),
      })),
      nowMs,
    ),
    limits: {
      threadsTruncated,
      eventsTruncated,
      labelsTruncated,
      maxThreads: MAX_OPS_THREADS,
      maxEvents: MAX_OPS_EVENTS,
      maxLabelLinks: MAX_LABEL_LINKS,
    },
  };
}

async function getSlaPolicyRow(db: DB, teamId: string) {
  const rows = await db
    .select({
      firstResponseMinutes: teamSlaPolicy.firstResponseMinutes,
      resolutionMinutes: teamSlaPolicy.resolutionMinutes,
      timeZone: teamSlaPolicy.timeZone,
      businessHours: teamSlaPolicy.businessHours,
    })
    .from(teamSlaPolicy)
    .where(eq(teamSlaPolicy.teamId, teamId))
    .limit(1);
  return rows[0] ?? null;
}
