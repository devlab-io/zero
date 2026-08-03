/**
 * Gouvernance d'équipe (P17) — logique PURE de restauration : la
 * planification transforme un export versionné en lignes à insérer, avec
 * remap COMPLET des identifiants (nouvelle équipe, nouveaux ids partout) et
 * un rapport nommant chaque élément écarté. Aucune I/O ici — le store fournit
 * le contexte (utilisateurs existants, connexions) et exécute le plan en une
 * transaction.
 *
 * Décisions structurelles (documentées dans le rapport) :
 * - la restauration crée TOUJOURS une nouvelle équipe : jamais d'écrasement ;
 * - l'appelant devient owner, quel que soit son rôle dans l'export ;
 * - les règles sont restaurées DÉSACTIVÉES : ré-activer une règle share
 *   ré-arme un élargissement d'ACL et exige la confirmation fraîche (P14) ;
 * - le journal d'audit n'est JAMAIS restauré : l'histoire ne se forge pas —
 *   la restauration écrit une unique entrée team.restored avec le digest
 *   du document source.
 */
import type { TeamDataExport, TeamRestoreReport, TeamRestoreSkip } from './team-governance-shared';
import { isTeamRole, roleCan, type TeamRole } from './team-roles';

export type RestoreContext = {
  callerId: string;
  /** Utilisateurs existants dans CETTE instance, par id. */
  users: Map<string, { email: string }>;
  /** Connexions par utilisateur (id + email), pour re-résoudre partageur/boîte surveillée. */
  connectionsByUser: Map<string, { id: string; email: string }[]>;
  /** Membres encore autorisés de l'équipe source au moment de la restauration. */
  authorizedMemberIds: Set<string>;
  /** Liaisons source autoritatives : un JSON ne peut jamais forger un accès boîte. */
  sourceThreads: Map<
    string,
    { threadId: string; sharerUserId: string; sharerEmail: string; providerId: string }
  >;
  sourceRules: Map<string, { createdBy: string; watchedEmail: string }>;
  newId: () => string;
  now: Date;
  sourceDigest: string;
};

type Row = Record<string, unknown>;

export type TeamRestorePlan = {
  team: { id: string; name: string; createdBy: string };
  members: { teamId: string; userId: string; role: TeamRole; prefs: Row }[];
  labels: Row[];
  threads: Row[];
  threadLabels: Row[];
  accessRows: Row[];
  comments: Row[];
  reactions: Row[];
  rules: Row[];
  slaPolicy: Row | null;
  retentionPolicy: Row | null;
  absences: Row[];
  report: TeamRestoreReport;
};

/** L'utilisateur existe ET son email correspond à l'export (anti-réutilisation d'id). */
function matchUser(
  context: RestoreContext,
  userId: string,
  exportedEmail: string | null,
): 'ok' | 'user_missing' | 'user_email_mismatch' | 'user_not_source_member' {
  const existing = context.users.get(userId);
  if (!existing) return 'user_missing';
  if (userId !== context.callerId && !context.authorizedMemberIds.has(userId)) {
    return 'user_not_source_member';
  }
  if (exportedEmail !== null && existing.email.toLowerCase() !== exportedEmail.toLowerCase()) {
    return 'user_email_mismatch';
  }
  return 'ok';
}

function findConnection(
  context: RestoreContext,
  userId: string,
  email: string,
): { id: string } | null {
  const rows = context.connectionsByUser.get(userId) ?? [];
  return rows.find((row) => row.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function planTeamRestore(payload: TeamDataExport, context: RestoreContext): TeamRestorePlan {
  const skipped: TeamRestoreSkip[] = [];
  const teamId = context.newId();
  const now = context.now;

  // --- membres : ids conservés (mêmes utilisateurs), rôles validés ------------
  const members: TeamRestorePlan['members'] = [];
  const memberRoles = new Map<string, TeamRole>();
  for (const member of payload.members) {
    if (member.userId === context.callerId) continue; // ré-ajouté owner ci-dessous
    const verdict = matchUser(context, member.userId, member.email);
    if (verdict !== 'ok') {
      skipped.push({ kind: 'member', id: member.userId, reason: verdict });
      continue;
    }
    const role: TeamRole =
      isTeamRole(member.role) && member.role !== 'owner'
        ? member.role
        : member.role === 'owner'
          ? 'admin' // les owners de l'export redescendent admin — UN owner : l'appelant
          : 'member';
    members.push({ teamId, userId: member.userId, role, prefs: member.prefs });
    memberRoles.set(member.userId, role);
  }
  members.push({
    teamId,
    userId: context.callerId,
    role: 'owner',
    prefs: payload.members.find((member) => member.userId === context.callerId)?.prefs ?? {
      onComment: true,
      onMention: true,
      onAssignment: true,
    },
  });
  memberRoles.set(context.callerId, 'owner');

  // --- labels ------------------------------------------------------------------
  const labelIdMap = new Map<string, string>();
  const labels: Row[] = [];
  for (const label of payload.labels) {
    const id = context.newId();
    labelIdMap.set(label.id, id);
    labels.push({
      id,
      teamId,
      name: label.name,
      color: label.color,
      // Créateur absent de l'instance → l'appelant assume la propriété.
      createdBy: memberRoles.has(label.createdBy) ? label.createdBy : context.callerId,
      createdAt: now,
    });
  }

  // --- fils partagés -------------------------------------------------------------
  const threadIdMap = new Map<string, string>();
  const threads: Row[] = [];
  const threadLabels: Row[] = [];
  const accessRows: Row[] = [];
  for (const thread of payload.threads) {
    const source = context.sourceThreads.get(thread.id);
    if (
      !source ||
      source.threadId !== thread.threadId ||
      source.sharerUserId !== thread.sharerUserId ||
      source.sharerEmail.toLowerCase() !== thread.sharerEmail.toLowerCase() ||
      source.providerId !== thread.providerId
    ) {
      skipped.push({ kind: 'thread', id: thread.id, reason: 'source_thread_mismatch' });
      continue;
    }
    if (!memberRoles.has(thread.sharerUserId)) {
      skipped.push({ kind: 'thread', id: thread.id, reason: 'user_missing' });
      continue;
    }
    const connection = findConnection(context, thread.sharerUserId, thread.sharerEmail);
    if (!connection) {
      skipped.push({ kind: 'thread', id: thread.id, reason: 'sharer_connection_missing' });
      continue;
    }
    const id = context.newId();
    threadIdMap.set(thread.id, id);

    let assigneeUserId: string | null = thread.assigneeUserId;
    if (assigneeUserId) {
      const assigneeRole = memberRoles.get(assigneeUserId);
      if (!assigneeRole || !roleCan(assigneeRole, 'thread.write')) {
        skipped.push({ kind: 'assignee', id: thread.id, reason: 'assignee_not_writer' });
        assigneeUserId = null;
      }
    }

    threads.push({
      id,
      teamId,
      threadId: thread.threadId,
      sharerUserId: thread.sharerUserId,
      sharerConnectionId: connection.id,
      sharerEmail: thread.sharerEmail,
      providerId: thread.providerId,
      visibility: thread.visibility === 'restricted' ? 'restricted' : 'team',
      subject: thread.subject,
      preview: thread.preview,
      participants: thread.participants,
      messageCount: thread.messageCount,
      latestReceivedOn: thread.latestReceivedOn,
      status: thread.status === 'closed' ? 'closed' : 'open',
      assigneeUserId,
      lastActivityAt: new Date(thread.lastActivityAt),
      createdAt: new Date(thread.createdAt),
      updatedAt: now,
    });

    for (const oldLabelId of thread.labelIds) {
      const labelId = labelIdMap.get(oldLabelId);
      if (labelId) threadLabels.push({ teamThreadId: id, labelId, createdAt: now });
    }
    for (const accessUserId of thread.accessUserIds) {
      if (!memberRoles.has(accessUserId)) {
        skipped.push({
          kind: 'access',
          id: `${thread.id}:${accessUserId}`,
          reason: 'user_missing',
        });
        continue;
      }
      accessRows.push({
        id: context.newId(),
        teamThreadId: id,
        userId: accessUserId,
        source: 'manual',
        grantedBy: context.callerId,
        createdAt: now,
      });
    }
  }

  // --- commentaires + réactions ---------------------------------------------------
  const comments: Row[] = [];
  const reactions: Row[] = [];
  for (const comment of payload.comments) {
    const teamThreadId = threadIdMap.get(comment.teamThreadId);
    if (!teamThreadId) {
      skipped.push({ kind: 'comment', id: comment.id, reason: 'thread_skipped' });
      continue;
    }
    if (!context.users.has(comment.authorUserId)) {
      skipped.push({ kind: 'comment', id: comment.id, reason: 'author_missing' });
      continue;
    }
    const id = context.newId();
    comments.push({
      id,
      teamThreadId,
      authorUserId: comment.authorUserId,
      body: comment.body,
      mentions: comment.mentions.filter((userId) => memberRoles.has(userId)),
      quote: comment.quote,
      createdAt: new Date(comment.createdAt),
      updatedAt: new Date(comment.updatedAt),
    });
    for (const reaction of comment.reactions) {
      if (!context.users.has(reaction.userId)) {
        skipped.push({
          kind: 'reaction',
          id: `${comment.id}:${reaction.userId}:${reaction.emoji}`,
          reason: 'user_missing',
        });
        continue;
      }
      reactions.push({
        commentId: id,
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: now,
      });
    }
  }

  // --- règles : TOUJOURS désactivées, boîte surveillée re-résolue -------------------
  const rules: Row[] = [];
  for (const rule of payload.rules) {
    const source = context.sourceRules.get(rule.id);
    if (
      !source ||
      source.createdBy !== rule.createdBy ||
      source.watchedEmail.toLowerCase() !== rule.watchedEmail.toLowerCase()
    ) {
      skipped.push({ kind: 'rule', id: rule.id, reason: 'source_rule_mismatch' });
      continue;
    }
    if (!memberRoles.has(rule.createdBy)) {
      skipped.push({ kind: 'rule', id: rule.id, reason: 'user_missing' });
      continue;
    }
    const connection = findConnection(context, rule.createdBy, rule.watchedEmail);
    if (!connection) {
      skipped.push({ kind: 'rule', id: rule.id, reason: 'watched_connection_missing' });
      continue;
    }
    rules.push({
      id: context.newId(),
      teamId,
      name: rule.name,
      enabled: false,
      connectionId: connection.id,
      createdBy: rule.createdBy,
      triggers: rule.triggers,
      actions: rule.actions,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // --- politiques + absences --------------------------------------------------------
  const slaPolicy = payload.slaPolicy
    ? { ...payload.slaPolicy, teamId, updatedBy: context.callerId, createdAt: now, updatedAt: now }
    : null;
  const retentionPolicy = payload.retentionPolicy
    ? {
        teamId,
        auditDays: payload.retentionPolicy.auditDays,
        ruleRunDays: payload.retentionPolicy.ruleRunDays,
        notificationDays: payload.retentionPolicy.notificationDays,
        updatedBy: context.callerId,
        createdAt: now,
        updatedAt: now,
      }
    : null;

  const absences: Row[] = [];
  for (const absence of payload.absences) {
    const key = `${absence.userId}:${absence.startsAt}`;
    if (!memberRoles.has(absence.userId)) {
      skipped.push({ kind: 'absence', id: key, reason: 'user_missing' });
      continue;
    }
    if (new Date(absence.endsAt) <= now) continue; // absences passées : sans objet
    absences.push({
      id: context.newId(),
      teamId,
      userId: absence.userId,
      startsAt: new Date(absence.startsAt),
      endsAt: new Date(absence.endsAt),
      note: absence.note ?? '',
      createdBy: context.callerId,
      createdAt: now,
    });
  }

  const report: TeamRestoreReport = {
    teamId,
    teamName: payload.team.name,
    restored: {
      members: members.length,
      labels: labels.length,
      threads: threads.length,
      comments: comments.length,
      reactions: reactions.length,
      rules: rules.length,
      absences: absences.length,
      accessRows: accessRows.length,
    },
    skipped,
    rulesRestoredDisabled: true,
    sourceDigest: context.sourceDigest,
  };

  return {
    team: { id: teamId, name: payload.team.name, createdBy: context.callerId },
    members,
    labels,
    threads,
    threadLabels,
    accessRows,
    comments,
    reactions,
    rules,
    slaPolicy,
    retentionPolicy,
    absences,
    report,
  };
}
