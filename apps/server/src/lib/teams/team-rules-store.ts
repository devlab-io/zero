import {
  evaluateRule,
  isRunForeignActivity,
  normalizeActions,
  normalizeTriggers,
  requiresAclConfirmation,
  threadMetaForRules,
  verdictSummary,
  type RuleThreadMeta,
} from './team-rules';
import {
  connection,
  teamAuditLog,
  teamLabel,
  teamMember,
  teamRule,
  teamRuleRun,
  teamThread,
  teamThreadComment,
  teamThreadLabel,
  user,
} from '../../db/schema';
import {
  accessPredicate,
  notifyRuleTargets,
  setThreadAssignee,
  setThreadLabels,
  setThreadStatus,
  shareThread,
  unshareThread,
  TeamStoreError,
} from './team-store';
import type {
  RuleActionRecord,
  RuleUndoResult,
  RuleVerdict,
  TeamRuleAction,
  TeamRuleTriggers,
} from './team-rules-shared';
import { and, count, desc, eq, gte, isNull, inArray, or } from 'drizzle-orm';
import type { IGetThreadResponse } from '../driver/types';
import { buildTeamThreadMetadata } from './team-access';
import type { DB } from '../../db';

/**
 * Règles d'équipe (P14) — persistance et EXÉCUTION.
 *
 * Modèle d'autorité : une règle ne peut jamais faire plus que son créateur.
 * Chaque action passe par les fonctions store existantes avec
 * userId = rule.createdBy — l'ACL (membership, resolveAccess,
 * assignee_no_access, labels d'équipe) est revérifiée en SQL à CHAQUE
 * exécution, pas seulement à la création. Mutations de règles : owners
 * uniquement (rôles actuels owner/member) ; lecture : tout membre. Toute
 * règle portant une action `share` (élargissement d'ACL à l'équipe entière)
 * exige une confirmation explicite FRAÎCHE à la création, à la modification
 * et à la réactivation — vérifiée ici, pas seulement dans l'UI.
 *
 * Idempotence : UNE exécution par (règle, fil), garantie par l'index UNIQUE
 * team_rule_run_rule_thread_idx + un CLAIM inséré atomiquement (ON CONFLICT
 * DO NOTHING, outcome 'processing') AVANT tout effet. Le même run est ensuite
 * mis à jour vers applied/skipped/error ; un crash laisse 'processing' —
 * visible et bloquant, jamais un rejeu silencieux. Les non-matchs ne créent
 * PAS de run (la simulation sert à comprendre un non-match).
 *
 * Historique durable : la suppression d'une règle est un SOFT delete
 * (deleted_at + enabled=false + audit) — les runs et l'audit restent
 * attribuables ; seul le delete de l'équipe cascade réellement.
 */

// --- effets hors Postgres, injectés (testables ; fournis par worker/pipeline)
export type RuleMailboxEffects = {
  /** KV snooze : mêmes clés `${threadId}__${connectionId}` que la route mail. */
  snoozePut: (key: string, wakeAtIso: string) => Promise<unknown>;
  snoozeGet: (key: string) => Promise<string | null>;
  snoozeDelete: (key: string) => Promise<unknown>;
  /** Labels de la boîte du créateur (projection + provider), via server-utils. */
  modifyMailboxLabels: (
    connectionId: string,
    threadId: string,
    addLabels: string[],
    removeLabels: string[],
  ) => Promise<unknown>;
};

export type { RuleActionRecord, RuleUndoResult } from './team-rules-shared';

const MAX_RULES_PER_TEAM = 50;
const RUNS_PAGE = 100;

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

async function audit(
  db: DB,
  entry: {
    teamId: string;
    actorUserId: string;
    action: string;
    subjectId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(teamAuditLog).values({
    id: crypto.randomUUID(),
    teamId: entry.teamId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    subjectType: 'team_rule',
    subjectId: entry.subjectId,
    metadata: entry.metadata ?? {},
  });
}

/** Cibles d'actions revalidées contre l'équipe (création ET mise à jour). */
async function validateActionTargets(db: DB, teamId: string, actions: TeamRuleAction[]) {
  const userIds = new Set<string>();
  const labelIds = new Set<string>();
  for (const action of actions) {
    if (action.kind === 'assign') userIds.add(action.userId);
    if (action.kind === 'todo' && action.assigneeUserId) userIds.add(action.assigneeUserId);
    if (action.kind === 'notify') action.userIds.forEach((id) => userIds.add(id));
    if (action.kind === 'label') action.labelIds.forEach((id) => labelIds.add(id));
  }
  if (userIds.size > 0) {
    const members = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(eq(teamMember.teamId, teamId), inArray(teamMember.userId, [...userIds])));
    if (members.length !== userIds.size) throw new TeamStoreError('assignee_not_member');
  }
  if (labelIds.size > 0) {
    const labels = await db
      .select({ id: teamLabel.id })
      .from(teamLabel)
      .where(and(eq(teamLabel.teamId, teamId), inArray(teamLabel.id, [...labelIds])));
    if (labels.length !== labelIds.size) throw new TeamStoreError('label_not_found');
  }
}

/**
 * Garde serveur de l'élargissement d'ACL : une action `share` (équipe
 * entière) sans confirmation explicite fraîche est refusée — quel que soit le
 * chemin (create, update, ré-enable).
 */
function requireAclConfirmation(actions: TeamRuleAction[], confirmed: boolean | undefined) {
  if (requiresAclConfirmation(actions) && confirmed !== true) {
    throw new TeamStoreError('acl_confirmation_required');
  }
}

/** Projection publique — connectionId ne traverse JAMAIS vers le client. */
function toPublicRule(row: {
  id: string;
  teamId: string;
  name: string;
  enabled: boolean;
  createdBy: string;
  triggers: TeamRuleTriggers;
  actions: TeamRuleAction[];
  createdAt: Date;
  updatedAt: Date;
  watchesEmail: string | null;
  createdByName: string | null;
}) {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    enabled: row.enabled,
    createdBy: row.createdBy,
    createdByName: row.createdByName ?? '',
    watchesEmail: row.watchesEmail ?? '',
    triggers: row.triggers,
    actions: row.actions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listRules(db: DB, userId: string, teamId: string) {
  await requireMembership(db, teamId, userId);
  const rows = await db
    .select({
      id: teamRule.id,
      teamId: teamRule.teamId,
      name: teamRule.name,
      enabled: teamRule.enabled,
      createdBy: teamRule.createdBy,
      triggers: teamRule.triggers,
      actions: teamRule.actions,
      createdAt: teamRule.createdAt,
      updatedAt: teamRule.updatedAt,
      watchesEmail: connection.email,
      createdByName: user.name,
    })
    .from(teamRule)
    .leftJoin(connection, eq(connection.id, teamRule.connectionId))
    .leftJoin(user, eq(user.id, teamRule.createdBy))
    // Exclusion SQL explicite : une règle supprimée ne se liste plus.
    .where(and(eq(teamRule.teamId, teamId), isNull(teamRule.deletedAt)))
    .orderBy(desc(teamRule.createdAt));
  return rows.map(toPublicRule);
}

export async function createRule(
  db: DB,
  userId: string,
  teamId: string,
  watchedConnection: { id: string; email: string },
  input: {
    name: string;
    triggers: TeamRuleTriggers;
    actions: TeamRuleAction[];
    confirmAclExpansion?: boolean;
  },
) {
  await requireOwner(db, teamId, userId);
  const existing = await db
    .select({ id: teamRule.id })
    .from(teamRule)
    .where(and(eq(teamRule.teamId, teamId), isNull(teamRule.deletedAt)));
  if (existing.length >= MAX_RULES_PER_TEAM) throw new TeamStoreError('forbidden');
  const triggers = normalizeTriggers(input.triggers);
  const actions = normalizeActions(input.actions);
  requireAclConfirmation(actions, input.confirmAclExpansion);
  await validateActionTargets(db, teamId, actions);
  const id = crypto.randomUUID();
  await db.insert(teamRule).values({
    id,
    teamId,
    name: input.name,
    connectionId: watchedConnection.id,
    createdBy: userId,
    triggers,
    actions,
  });
  await audit(db, {
    teamId,
    actorUserId: userId,
    action: 'rule.created',
    subjectId: id,
    metadata: {
      name: input.name,
      watchesEmail: watchedConnection.email,
      aclExpansionConfirmed: requiresAclConfirmation(actions),
    },
  });
  return { id };
}

/** Charge une règle pour MUTATION : une règle soft-supprimée n'est plus mutable. */
async function requireRule(db: DB, ruleId: string) {
  const rows = await db
    .select()
    .from(teamRule)
    .where(and(eq(teamRule.id, ruleId), isNull(teamRule.deletedAt)))
    .limit(1);
  const rule = rows[0];
  if (!rule) throw new TeamStoreError('not_found');
  return rule;
}

export async function updateRule(
  db: DB,
  userId: string,
  ruleId: string,
  patch: {
    name?: string;
    triggers?: TeamRuleTriggers;
    actions?: TeamRuleAction[];
    confirmAclExpansion?: boolean;
  },
) {
  const rule = await requireRule(db, ruleId);
  await requireOwner(db, rule.teamId, userId);
  const triggers = patch.triggers ? normalizeTriggers(patch.triggers) : undefined;
  const actions = patch.actions ? normalizeActions(patch.actions) : undefined;
  // Une règle share modifiée re-cible ce qui sera partagé (actions OU
  // triggers) : la confirmation est exigée dès que la règle RÉSULTANTE porte
  // un share, pas seulement quand on l'ajoute.
  requireAclConfirmation(actions ?? rule.actions, patch.confirmAclExpansion);
  if (actions) await validateActionTargets(db, rule.teamId, actions);
  await db
    .update(teamRule)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(triggers ? { triggers } : {}),
      ...(actions ? { actions } : {}),
      updatedAt: new Date(),
    })
    .where(eq(teamRule.id, ruleId));
  await audit(db, {
    teamId: rule.teamId,
    actorUserId: userId,
    action: 'rule.updated',
    subjectId: ruleId,
    metadata: { name: patch.name ?? rule.name },
  });
}

/** Désactivation IMMÉDIATE : `enabled` est relu à chaque exécution. */
export async function setRuleEnabled(
  db: DB,
  userId: string,
  ruleId: string,
  enabled: boolean,
  confirmAclExpansion?: boolean,
) {
  const rule = await requireRule(db, ruleId);
  await requireOwner(db, rule.teamId, userId);
  // RÉACTIVER une règle share ré-arme un élargissement d'ACL : confirmation
  // fraîche exigée. Désactiver, jamais.
  if (enabled) requireAclConfirmation(rule.actions, confirmAclExpansion);
  await db.update(teamRule).set({ enabled, updatedAt: new Date() }).where(eq(teamRule.id, ruleId));
  await audit(db, {
    teamId: rule.teamId,
    actorUserId: userId,
    action: enabled ? 'rule.enabled' : 'rule.disabled',
    subjectId: ruleId,
    metadata: { name: rule.name },
  });
}

/**
 * SOFT delete : la règle disparaît des listes et de l'exécution, ses runs et
 * son audit restent. Aucun hard delete de règle — jamais.
 */
export async function deleteRule(db: DB, userId: string, ruleId: string) {
  const rule = await requireRule(db, ruleId);
  await requireOwner(db, rule.teamId, userId);
  await db
    .update(teamRule)
    .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
    .where(eq(teamRule.id, ruleId));
  await audit(db, {
    teamId: rule.teamId,
    actorUserId: userId,
    action: 'rule.deleted',
    subjectId: ruleId,
    metadata: { name: rule.name },
  });
}

export async function listRuleRuns(
  db: DB,
  userId: string,
  teamId: string,
  options: { ruleId?: string; teamThreadId?: string; limit?: number },
) {
  await requireMembership(db, teamId, userId);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), RUNS_PAGE);
  // Jointure SANS filtre deleted_at : l'historique des règles supprimées
  // reste visible et nommé.
  const rows = await db
    .select({
      id: teamRuleRun.id,
      ruleId: teamRuleRun.ruleId,
      ruleName: teamRule.name,
      ruleDeletedAt: teamRule.deletedAt,
      threadId: teamRuleRun.threadId,
      teamThreadId: teamRuleRun.teamThreadId,
      subject: teamThread.subject,
      outcome: teamRuleRun.outcome,
      reason: teamRuleRun.reason,
      actionsApplied: teamRuleRun.actionsApplied,
      createdAt: teamRuleRun.createdAt,
      undoneAt: teamRuleRun.undoneAt,
    })
    .from(teamRuleRun)
    .innerJoin(teamRule, eq(teamRule.id, teamRuleRun.ruleId))
    .leftJoin(teamThread, eq(teamThread.id, teamRuleRun.teamThreadId))
    .where(
      and(
        eq(teamRuleRun.teamId, teamId),
        // Un run ne doit jamais devenir un canal latéral vers la boîte du
        // créateur de la règle. Le créateur voit ses propres exécutions ; un
        // autre membre ne voit que les runs rattachés à un fil dont il passe
        // déjà l'ACL stricte (team/restricted). Les runs sans partage restent
        // privés au créateur.
        or(eq(teamRuleRun.actorUserId, userId), accessPredicate(userId)),
        ...(options.ruleId ? [eq(teamRuleRun.ruleId, options.ruleId)] : []),
        // Filtre « runs de CE fil » (panneau Team) — la même porte ACL
        // ci-dessus s'applique : un fil restricted inaccessible ne rend rien.
        ...(options.teamThreadId ? [eq(teamRuleRun.teamThreadId, options.teamThreadId)] : []),
      ),
    )
    .orderBy(desc(teamRuleRun.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    ruleDeletedAt: row.ruleDeletedAt ? row.ruleDeletedAt.toISOString() : null,
    // États internes de l'undo (inverse + applied) — pas au client.
    actionsApplied: row.actionsApplied.map(
      ({ inverse: _inverse, applied: _applied, ...rest }) => rest,
    ),
  }));
}

// --- simulation ---------------------------------------------------------------

export type RulePreviewCandidate = {
  threadId: string;
  subject: string;
  senderEmail: string;
  /** Métadonnées COMPLÈTES du fil (lecture réelle) — null si la lecture a échoué. */
  meta: RuleThreadMeta | null;
};

/**
 * Simulation exacte, 100 % sans écriture : la route lit chaque fil de
 * l'échantillon via le chemin getThread (scoped à la connexion active de
 * l'appelant) et fournit des métadonnées complètes — sender, domaine, To/Cc,
 * sujet + corps, labels, heure de réception. Un fil illisible arrive avec
 * meta null et ressort verdict null : « non évalué », jamais « non-match ».
 */
export async function previewRule(
  db: DB,
  userId: string,
  teamId: string,
  input: { triggers: TeamRuleTriggers },
  candidates: RulePreviewCandidate[],
): Promise<
  Array<{ threadId: string; subject: string; senderEmail: string; verdict: RuleVerdict | null }>
> {
  await requireMembership(db, teamId, userId);
  const triggers = normalizeTriggers(input.triggers);
  return candidates.map((candidate) => ({
    threadId: candidate.threadId,
    subject: candidate.subject,
    senderEmail: candidate.senderEmail,
    verdict: candidate.meta ? evaluateRule(candidate.meta, triggers) : null,
  }));
}

// --- exécution ----------------------------------------------------------------

const snoozeKey = (threadId: string, connectionId: string) => `${threadId}__${connectionId}`;

async function executeActions(
  db: DB,
  effects: RuleMailboxEffects,
  rule: typeof teamRule.$inferSelect,
  watchedConnection: { id: string; email: string; providerId: string },
  threadId: string,
  thread: IGetThreadResponse,
  runId: string,
): Promise<{ records: RuleActionRecord[]; teamThreadId: string | null }> {
  const records: RuleActionRecord[] = [];
  const ordered = normalizeActions(rule.actions);
  // Provenance de TOUTES les mutations team de ce run : le préflight d'undo
  // ne considère « du run » que les audits portant exactement ce runId.
  const context = { source: 'rule' as const, ruleId: rule.id, runId };

  const existingShare = await db
    .select({
      id: teamThread.id,
      status: teamThread.status,
      assigneeUserId: teamThread.assigneeUserId,
    })
    .from(teamThread)
    .where(
      and(
        eq(teamThread.teamId, rule.teamId),
        eq(teamThread.sharerConnectionId, rule.connectionId),
        eq(teamThread.threadId, threadId),
      ),
    )
    .limit(1);
  let shareRow = existingShare[0] ?? null;
  const alreadyShared = shareRow !== null;

  const requireShared = (): string | null => shareRow?.id ?? null;

  for (const action of ordered) {
    try {
      switch (action.kind) {
        case 'share': {
          if (alreadyShared) {
            records.push({
              kind: 'share',
              ok: true,
              reason: 'already shared with this team — undo will not unshare',
              applied: null,
              inverse: null,
            });
            break;
          }
          const meta = buildTeamThreadMetadata(watchedConnection, threadId, thread);
          const row = await shareThread(db, rule.createdBy, rule.teamId, meta, {
            visibility: action.visibility,
            accessUserIds: [],
            context,
          });
          shareRow = { id: row.id, status: row.status, assigneeUserId: row.assigneeUserId };
          records.push({
            kind: 'share',
            ok: true,
            applied: { teamThreadId: row.id },
            inverse: { type: 'unshare' },
          });
          break;
        }
        case 'assign': {
          const teamThreadId = requireShared();
          if (!teamThreadId) {
            records.push({
              kind: 'assign',
              ok: false,
              reason: 'thread is not shared with this team',
            });
            break;
          }
          const previous = shareRow?.assigneeUserId ?? null;
          await setThreadAssignee(db, rule.createdBy, teamThreadId, action.userId, context);
          if (shareRow) shareRow.assigneeUserId = action.userId;
          records.push({
            kind: 'assign',
            ok: true,
            applied: { assigneeUserId: action.userId },
            inverse: { type: 'assign', previous },
          });
          break;
        }
        case 'label': {
          const teamThreadId = requireShared();
          if (!teamThreadId) {
            records.push({
              kind: 'label',
              ok: false,
              reason: 'thread is not shared with this team',
            });
            break;
          }
          const previousRows = await db
            .select({ labelId: teamThreadLabel.labelId })
            .from(teamThreadLabel)
            .where(eq(teamThreadLabel.teamThreadId, teamThreadId));
          const previous = previousRows.map((row) => row.labelId);
          const union = [...new Set([...previous, ...action.labelIds])];
          await setThreadLabels(db, rule.createdBy, teamThreadId, union, context);
          records.push({
            kind: 'label',
            ok: true,
            applied: { labelIds: [...union].sort() },
            inverse: { type: 'labels', previous },
          });
          break;
        }
        case 'todo': {
          const teamThreadId = requireShared();
          if (!teamThreadId) {
            records.push({
              kind: 'todo',
              ok: false,
              reason: 'thread is not shared with this team',
            });
            break;
          }
          const previousStatus = shareRow?.status ?? 'open';
          const previousAssignee = shareRow?.assigneeUserId ?? null;
          await setThreadStatus(db, rule.createdBy, teamThreadId, 'open', context);
          if (action.assigneeUserId) {
            await setThreadAssignee(
              db,
              rule.createdBy,
              teamThreadId,
              action.assigneeUserId,
              context,
            );
            if (shareRow) shareRow.assigneeUserId = action.assigneeUserId;
          }
          if (shareRow) shareRow.status = 'open';
          records.push({
            kind: 'todo',
            ok: true,
            applied: { status: 'open', assigneeUserId: action.assigneeUserId ?? null },
            inverse: { type: 'todo', previousStatus, previousAssignee },
          });
          break;
        }
        case 'snooze': {
          const wakeAt = new Date(Date.now() + action.hours * 3_600_000).toISOString();
          const key = snoozeKey(threadId, rule.connectionId);
          await effects.modifyMailboxLabels(rule.connectionId, threadId, ['SNOOZED'], ['INBOX']);
          await effects.snoozePut(key, wakeAt);
          records.push({
            kind: 'snooze',
            ok: true,
            applied: { key, wakeAt },
            inverse: { type: 'unsnooze', key },
          });
          break;
        }
        case 'notify': {
          await notifyRuleTargets(db, {
            teamId: rule.teamId,
            teamThreadId: shareRow?.id ?? null,
            actorUserId: rule.createdBy,
            recipients: action.userIds,
          });
          records.push({ kind: 'notify', ok: true, applied: null, inverse: null });
          break;
        }
      }
    } catch (error) {
      records.push({
        kind: action.kind,
        ok: false,
        reason: error instanceof TeamStoreError ? error.code : 'action_failed',
      });
    }
  }

  return { records, teamThreadId: shareRow?.id ?? null };
}

export type IncomingRuleRun = {
  ruleId: string;
  ruleName: string;
  teamId: string;
  outcome: 'applied' | 'skipped' | 'error';
  reason: string;
};

/**
 * Point d'entrée du pipeline d'ingestion : applique les règles ACTIVES (et
 * non supprimées) de la boîte `connectionId` au fil fraîchement synchronisé.
 *
 * Concurrence : le CLAIM (insert ON CONFLICT DO NOTHING sur l'unique
 * rule+thread, outcome 'processing') précède TOUT effet — deux workers ne
 * peuvent jamais exécuter la même règle sur le même fil ; le perdant du claim
 * ne produit aucun effet. Le run claimé est mis à jour vers son issue finale
 * dans tous les chemins (y compris exception) ; seul un crash process laisse
 * 'processing', qui bloque tout rejeu et reste visible dans l'historique.
 * Fail-safe : toute erreur est absorbée par règle (le mail ne casse jamais).
 */
export async function executeRulesForIncomingThread(
  db: DB,
  effects: RuleMailboxEffects,
  input: { connectionId: string; threadId: string; thread: IGetThreadResponse },
): Promise<IncomingRuleRun[]> {
  const rules = await db
    .select()
    .from(teamRule)
    .where(
      and(
        eq(teamRule.connectionId, input.connectionId),
        eq(teamRule.enabled, true),
        // Exclusion SQL explicite : une règle supprimée ne s'exécute plus.
        isNull(teamRule.deletedAt),
      ),
    );
  if (rules.length === 0) return [];

  const meta = threadMetaForRules(input.thread);
  if (!meta) return [];

  const connectionRows = await db
    .select({ id: connection.id, email: connection.email, providerId: connection.providerId })
    .from(connection)
    .where(eq(connection.id, input.connectionId))
    .limit(1);
  const watchedConnection = connectionRows[0];
  if (!watchedConnection) return [];

  const results: IncomingRuleRun[] = [];
  for (const rule of rules) {
    try {
      const verdict = evaluateRule(meta, rule.triggers);
      if (!verdict.matched) continue;
      const reason = verdictSummary(verdict);

      // CLAIM atomique avant tout effet — l'unique (rule, thread) arbitre.
      const runId = crypto.randomUUID();
      const claimed = await db
        .insert(teamRuleRun)
        .values({
          id: runId,
          ruleId: rule.id,
          teamId: rule.teamId,
          threadId: input.threadId,
          outcome: 'processing',
          reason,
          actorUserId: rule.createdBy,
        })
        .onConflictDoNothing({ target: [teamRuleRun.ruleId, teamRuleRun.threadId] })
        .returning({ id: teamRuleRun.id });
      if (claimed.length === 0) continue; // déjà exécuté/claimé ailleurs — ZÉRO effet

      try {
        const membership = await db
          .select({ userId: teamMember.userId })
          .from(teamMember)
          .where(and(eq(teamMember.teamId, rule.teamId), eq(teamMember.userId, rule.createdBy)))
          .limit(1);
        if (membership.length === 0) {
          const skipReason = 'rule creator is no longer a team member';
          await db
            .update(teamRuleRun)
            .set({ outcome: 'skipped', reason: skipReason })
            .where(eq(teamRuleRun.id, runId));
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            teamId: rule.teamId,
            outcome: 'skipped',
            reason: skipReason,
          });
          continue;
        }

        const { records, teamThreadId } = await executeActions(
          db,
          effects,
          rule,
          watchedConnection,
          input.threadId,
          input.thread,
          runId,
        );
        const outcome = records.some((record) => record.ok) ? 'applied' : 'error';
        await db
          .update(teamRuleRun)
          .set({ outcome, reason, actionsApplied: records, teamThreadId })
          .where(eq(teamRuleRun.id, runId));
        await audit(db, {
          teamId: rule.teamId,
          actorUserId: rule.createdBy,
          action: outcome === 'applied' ? 'rule.applied' : 'rule.failed',
          subjectId: rule.id,
          metadata: { runId, threadId: input.threadId, teamThreadId, reason },
        });
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          teamId: rule.teamId,
          outcome,
          reason,
        });
      } catch (error) {
        // Le run claimé n'est JAMAIS laissé en processing sur une exception.
        const message = error instanceof Error ? error.message : 'unexpected error';
        await db
          .update(teamRuleRun)
          .set({ outcome: 'error', reason: message })
          .where(eq(teamRuleRun.id, runId));
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          teamId: rule.teamId,
          outcome: 'error',
          reason: message,
        });
      }
    } catch (error) {
      // Fail-safe : une règle cassée (avant claim) n'affecte ni les autres
      // règles ni l'ingestion du mail.
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        teamId: rule.teamId,
        outcome: 'error',
        reason: error instanceof Error ? error.message : 'unexpected error',
      });
    }
  }
  return results;
}

// --- undo ---------------------------------------------------------------------

type UndoPreflightContext = {
  currentThread: { status: string; assigneeUserId: string | null } | null;
  currentLabels: string[] | null;
};

/**
 * Annule un run 'applied' — PRÉFLIGHT COMPLET avant toute mutation :
 * chaque inverse n'est appliqué que si l'état courant correspond encore
 * EXACTEMENT à l'état posé par ce run (assignation, labels, statut, valeur KV
 * du snooze), et l'unshare d'un partage créé par la règle est refusé dès
 * qu'un humain a commenté ou agi sur le fil depuis le run.
 *
 * Issues : 'conflicted' = zéro mutation, audit rule.undo_conflicted, le run
 * reste applied. 'failed' = un inverse a échoué en cours de route — jamais
 * marqué undone, audit rule.undo_failed avec le détail honnête ; l'état peut
 * être PARTIELLEMENT défait (les inverses déjà passés le restent) : le run
 * reste applied et une revue manuelle du fil est requise — un retry n'est pas
 * garanti sûr (les préflights des inverses déjà passés divergeront).
 * 'undone' UNIQUEMENT quand tous les inverses requis ont réussi. Les inverses
 * s'exécutent en ordre INVERSE des actions.
 */
export async function undoRuleRun(
  db: DB,
  effects: RuleMailboxEffects,
  userId: string,
  runId: string,
): Promise<RuleUndoResult> {
  const rows = await db.select().from(teamRuleRun).where(eq(teamRuleRun.id, runId)).limit(1);
  const run = rows[0];
  if (!run) throw new TeamStoreError('not_found');
  await requireOwner(db, run.teamId, userId);
  if (run.outcome !== 'applied') throw new TeamStoreError('run_not_undoable');

  // L'historique est durable : l'undo d'un run d'une règle SUPPRIMÉE reste
  // possible — lecture directe, sans le filtre deleted_at des mutations.
  const ruleRows = await db.select().from(teamRule).where(eq(teamRule.id, run.ruleId)).limit(1);
  const rule = ruleRows[0];
  if (!rule) throw new TeamStoreError('not_found');

  const okRecords = run.actionsApplied.filter((record) => record.ok && record.inverse);
  const sharedByRun = okRecords.some(
    (record) => record.kind === 'share' && record.inverse?.['type'] === 'unshare',
  );

  // --- PRÉFLIGHT : lectures seulement, la moindre divergence stoppe tout ---
  const conflicts: string[] = [];
  let context: UndoPreflightContext = { currentThread: null, currentLabels: null };

  if (run.teamThreadId) {
    const threadRows = await db
      .select({ status: teamThread.status, assigneeUserId: teamThread.assigneeUserId })
      .from(teamThread)
      .where(eq(teamThread.id, run.teamThreadId))
      .limit(1);
    const labelRows = threadRows[0]
      ? await db
          .select({ labelId: teamThreadLabel.labelId })
          .from(teamThreadLabel)
          .where(eq(teamThreadLabel.teamThreadId, run.teamThreadId))
      : [];
    context = {
      currentThread: threadRows[0] ?? null,
      currentLabels: threadRows[0] ? labelRows.map((row) => row.labelId) : null,
    };
  }

  if (sharedByRun && run.teamThreadId && context.currentThread) {
    // Toute activité ÉTRANGÈRE au run depuis le claim → l'unshare détruirait
    // du travail d'équipe : refus. Grâce à la provenance {source:'rule',
    // runId} portée par CHAQUE mutation du run, seuls les audits de CE run
    // sont ignorés — une action manuelle ultérieure (y compris du créateur de
    // la règle) ou l'écriture d'une AUTRE règle est un conflit. Les
    // commentaires sont toujours humains, donc toujours bloquants.
    const [commentCount] = await db
      .select({ value: count() })
      .from(teamThreadComment)
      .where(
        and(
          eq(teamThreadComment.teamThreadId, run.teamThreadId),
          gte(teamThreadComment.createdAt, run.createdAt),
        ),
      );
    if ((commentCount?.value ?? 0) > 0) {
      conflicts.push('share: the thread received comments since this run');
    }
    const auditRows = await db
      .select({ metadata: teamAuditLog.metadata })
      .from(teamAuditLog)
      .where(
        and(
          eq(teamAuditLog.subjectId, run.teamThreadId),
          gte(teamAuditLog.createdAt, run.createdAt),
        ),
      )
      .limit(200);
    if (auditRows.some((entry) => isRunForeignActivity(entry, runId))) {
      conflicts.push('share: the thread has activity since this run');
    }
  }

  for (const record of okRecords) {
    const applied = record.applied ?? null;
    switch (record.kind) {
      case 'assign': {
        if (sharedByRun) break; // meurt avec l'unshare
        if (!context.currentThread) {
          conflicts.push('assign: the thread is no longer shared');
        } else if (
          applied &&
          context.currentThread.assigneeUserId !== ((applied['assigneeUserId'] as string) ?? null)
        ) {
          conflicts.push('assign: the assignee changed since this run');
        }
        break;
      }
      case 'todo': {
        if (sharedByRun) break;
        if (!context.currentThread) {
          conflicts.push('todo: the thread is no longer shared');
        } else {
          if (context.currentThread.status !== 'open') {
            conflicts.push('todo: the status changed since this run');
          }
          const appliedAssignee = (applied?.['assigneeUserId'] as string | null) ?? null;
          if (appliedAssignee && context.currentThread.assigneeUserId !== appliedAssignee) {
            conflicts.push('todo: the assignee changed since this run');
          }
        }
        break;
      }
      case 'label': {
        if (sharedByRun) break;
        if (!context.currentLabels) {
          conflicts.push('label: the thread is no longer shared');
        } else {
          const appliedLabels = [...((applied?.['labelIds'] as string[]) ?? [])].sort();
          const currentLabels = [...context.currentLabels].sort();
          if (JSON.stringify(appliedLabels) !== JSON.stringify(currentLabels)) {
            conflicts.push('label: the labels changed since this run');
          }
        }
        break;
      }
      case 'snooze': {
        const key = (applied?.['key'] as string) ?? snoozeKey(run.threadId, rule.connectionId);
        const currentWakeAt = await effects.snoozeGet(key);
        if (currentWakeAt !== ((applied?.['wakeAt'] as string) ?? null)) {
          conflicts.push('snooze: the snooze changed since this run');
        }
        break;
      }
      default:
        break;
    }
  }

  if (conflicts.length > 0) {
    await audit(db, {
      teamId: run.teamId,
      actorUserId: userId,
      action: 'rule.undo_conflicted',
      subjectId: run.ruleId,
      metadata: { runId, threadId: run.threadId, conflicts },
    });
    return { status: 'conflicted', conflicts, undone: [] };
  }

  // --- EXÉCUTION en ordre INVERSE — premier échec = arrêt honnête ---------
  const undone: RuleUndoResult['undone'] = [];
  const fail = async (kind: RuleActionRecord['kind'], reason: string): Promise<RuleUndoResult> => {
    undone.push({ kind, ok: false, reason });
    await audit(db, {
      teamId: run.teamId,
      actorUserId: userId,
      action: 'rule.undo_failed',
      subjectId: run.ruleId,
      metadata: { runId, threadId: run.threadId, undone },
    });
    return { status: 'failed', conflicts: [], undone };
  };

  for (const record of [...okRecords].reverse()) {
    const inverse = record.inverse!;
    switch (record.kind) {
      case 'snooze': {
        try {
          await effects.modifyMailboxLabels(
            rule.connectionId,
            run.threadId,
            ['INBOX'],
            ['SNOOZED'],
          );
          await effects.snoozeDelete(String(inverse['key']));
          undone.push({ kind: 'snooze', ok: true });
        } catch {
          return await fail('snooze', 'unsnooze failed');
        }
        break;
      }
      case 'assign': {
        if (sharedByRun) break;
        try {
          await setThreadAssignee(
            db,
            userId,
            run.teamThreadId!,
            (inverse['previous'] as string | null) ?? null,
          );
          undone.push({ kind: 'assign', ok: true });
        } catch (error) {
          return await fail('assign', error instanceof TeamStoreError ? error.code : 'undo failed');
        }
        break;
      }
      case 'todo': {
        if (sharedByRun) break;
        try {
          await setThreadStatus(
            db,
            userId,
            run.teamThreadId!,
            inverse['previousStatus'] === 'closed' ? 'closed' : 'open',
          );
          await setThreadAssignee(
            db,
            userId,
            run.teamThreadId!,
            (inverse['previousAssignee'] as string | null) ?? null,
          );
          undone.push({ kind: 'todo', ok: true });
        } catch (error) {
          return await fail('todo', error instanceof TeamStoreError ? error.code : 'undo failed');
        }
        break;
      }
      case 'label': {
        if (sharedByRun) break;
        try {
          await setThreadLabels(
            db,
            userId,
            run.teamThreadId!,
            (inverse['previous'] as string[]) ?? [],
          );
          undone.push({ kind: 'label', ok: true });
        } catch (error) {
          return await fail('label', error instanceof TeamStoreError ? error.code : 'undo failed');
        }
        break;
      }
      case 'share': {
        // Partage créé par la règle : l'unshare arrive en DERNIER (ordre
        // inverse). Fil déjà retiré entre-temps par un humain → plus rien à
        // défaire, no-op réussi.
        if (!run.teamThreadId || !context.currentThread) {
          undone.push({ kind: 'share', ok: true, reason: 'nothing left to unshare' });
          break;
        }
        try {
          await unshareThread(db, userId, run.teamThreadId);
          undone.push({ kind: 'share', ok: true });
        } catch (error) {
          return await fail('share', error instanceof TeamStoreError ? error.code : 'undo failed');
        }
        break;
      }
      default:
        break;
    }
  }

  await db
    .update(teamRuleRun)
    .set({ outcome: 'undone', undoneAt: new Date(), undoneBy: userId })
    .where(eq(teamRuleRun.id, runId));
  await audit(db, {
    teamId: run.teamId,
    actorUserId: userId,
    action: 'rule.undone',
    subjectId: run.ruleId,
    metadata: { runId, threadId: run.threadId, undone },
  });
  return { status: 'undone', conflicts: [], undone };
}
