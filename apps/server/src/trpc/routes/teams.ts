import {
  buildSharedQuote,
  buildTeamThreadMetadata,
  readSharedAttachment,
  readSharedThread,
  toPublicShare,
} from '../../lib/teams/team-access';
import {
  closeTeamRealtime,
  kickTeamRealtimeUser,
  publishTeamRealtime,
} from '../../routes/team-realtime';
import { getThread, getThreadsFromDB, getZeroDB } from '../../lib/server-utils';
import { activeDriverProcedure, privateProcedure, router } from '../trpc';
import { TEAM_ROLES } from '../../lib/teams/team-roles';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/** Diffusion realtime post-mutation (fire-and-forget, ACL déjà passée). */
type RtCtx = { c: { env: unknown; executionCtx?: { waitUntil: (p: Promise<unknown>) => void } } };
function rtPublish(
  ctx: RtCtx,
  teamThreadId: string,
  event: 'comments.invalidate' | 'thread.invalidate',
) {
  const task = publishTeamRealtime(
    ctx.c.env as Parameters<typeof publishTeamRealtime>[0],
    teamThreadId,
    { type: event },
  );
  try {
    ctx.c.executionCtx?.waitUntil(task);
  } catch {
    void task;
  }
}
function rtKick(ctx: RtCtx, teamThreadId: string, userId: string) {
  const task = kickTeamRealtimeUser(
    ctx.c.env as Parameters<typeof kickTeamRealtimeUser>[0],
    teamThreadId,
    userId,
  );
  try {
    ctx.c.executionCtx?.waitUntil(task);
  } catch {
    void task;
  }
}
function rtClose(ctx: RtCtx, teamThreadId: string) {
  const task = closeTeamRealtime(
    ctx.c.env as Parameters<typeof closeTeamRealtime>[0],
    teamThreadId,
  );
  try {
    ctx.c.executionCtx?.waitUntil(task);
  } catch {
    void task;
  }
}

/**
 * Team collaboration router — EXCLUSIVELY email-thread-centred (no channels,
 * no standalone messages). Authorization is structural: the DO façade injects
 * the session userId, the store checks membership + thread ACL in SQL, and
 * shared-thread reads (full thread, attachments, quotes) all resolve through
 * resolveAccess before the sharer's connection is used server-side.
 */

const TEAM_ERROR_CODES: Record<
  string,
  'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' | 'PRECONDITION_FAILED'
> = {
  not_found: 'NOT_FOUND',
  label_not_found: 'NOT_FOUND',
  message_not_in_thread: 'NOT_FOUND',
  attachment_not_found: 'NOT_FOUND',
  quote_not_in_message: 'BAD_REQUEST',
  not_a_member: 'FORBIDDEN',
  forbidden: 'FORBIDDEN',
  invite_email_mismatch: 'FORBIDDEN',
  last_owner: 'FORBIDDEN',
  already_member: 'BAD_REQUEST',
  invite_already_pending: 'BAD_REQUEST',
  invite_not_pending: 'BAD_REQUEST',
  assignee_not_member: 'BAD_REQUEST',
  assignee_no_access: 'BAD_REQUEST',
  mention_not_member: 'BAD_REQUEST',
  label_conflict: 'BAD_REQUEST',
  // P14 — règles d'équipe (TeamRuleValidationError transporte aussi son code
  // en message à travers le DO, comme TeamStoreError).
  run_not_undoable: 'BAD_REQUEST',
  no_trigger: 'BAD_REQUEST',
  no_action: 'BAD_REQUEST',
  invalid_hours: 'BAD_REQUEST',
  acl_confirmation_required: 'BAD_REQUEST',
  // P15 — brouillons collaboratifs.
  draft_stale: 'BAD_REQUEST',
  review_exists: 'BAD_REQUEST',
  review_not_actionable: 'BAD_REQUEST',
  reply_claimed: 'BAD_REQUEST',
  reply_intent_invalid: 'BAD_REQUEST',
  override_not_armed: 'BAD_REQUEST',
  not_draft_owner: 'FORBIDDEN',
  not_reviewer: 'FORBIDDEN',
  // P17 — gouvernance (export signé, rétention, export/restauration) + rôles.
  mention_requires_access: 'BAD_REQUEST',
  export_unavailable: 'PRECONDITION_FAILED',
  invalid_retention: 'BAD_REQUEST',
  restore_invalid: 'BAD_REQUEST',
  restore_too_large: 'BAD_REQUEST',
};

/** Store errors carry their fixed code as message — even across the DO RPC. */
async function mapTeamErrors<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    const code = error instanceof Error ? TEAM_ERROR_CODES[error.message] : undefined;
    if (code) {
      throw new TRPCError({ code, message: error instanceof Error ? error.message : code });
    }
    throw error;
  }
}

const teamIdInput = z.object({ teamId: z.string().min(1).max(64) });
const teamThreadIdInput = z.object({ teamThreadId: z.string().min(1).max(64) });
const teamNameSchema = z.string().trim().min(1).max(80);
const commentBodySchema = z.string().trim().min(1).max(5000);
const prefsSchema = z.object({
  onComment: z.boolean(),
  onMention: z.boolean(),
  onAssignment: z.boolean(),
});
const REACTION_EMOJIS = ['👍', '✅', '👀', '❤️', '🔥', '😂'] as const;

// --- P14 : règles d'équipe ---------------------------------------------------
const HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ruleTriggersSchema = z.object({
  senders: z.array(z.string().trim().toLowerCase().email().max(320)).max(30).optional(),
  domains: z.array(z.string().trim().toLowerCase().min(1).max(255)).max(30).optional(),
  recipients: z.array(z.string().trim().toLowerCase().email().max(320)).max(30).optional(),
  keywords: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  gmailLabels: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  hours: z
    .object({
      days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      from: z.string().regex(HOURS_RE),
      to: z.string().regex(HOURS_RE),
      timeZone: z.string().min(1).max(64),
    })
    .optional(),
});
const ruleActionSchema = z.discriminatedUnion('kind', [
  // Un partage déclenché par règle est TOUJOURS team-wide : un restricted
  // automatique rendrait l'étendue de l'ACL dépendante d'un moteur — refusé.
  z.object({ kind: z.literal('share'), visibility: z.literal('team') }),
  z.object({ kind: z.literal('assign'), userId: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal('label'),
    labelIds: z.array(z.string().min(1).max(64)).min(1).max(10),
  }),
  z.object({ kind: z.literal('todo'), assigneeUserId: z.string().min(1).max(64).optional() }),
  z.object({ kind: z.literal('snooze'), hours: z.number().int().min(1).max(720) }),
  z.object({
    kind: z.literal('notify'),
    userIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  }),
]);
const ruleNameSchema = z.string().trim().min(1).max(120);
const ruleIdInput = z.object({ ruleId: z.string().min(1).max(64) });

// --- P17 : document d'export de données d'équipe (restauration) ---------------
// Bornes ALIGNÉES sur celles de l'export (team-governance-store EXPORT_BOUNDS) :
// un export produit par ce serveur revalide toujours ; un document forgé
// au-delà des bornes est refusé au schéma, avant tout travail.
const isoDate = z.string().datetime();
const restoreQuoteSchema = z
  .object({
    messageId: z.string().max(256),
    authorEmail: z.string().max(320),
    authorName: z.string().max(256).optional(),
    receivedOn: z.string().max(64),
    text: z.string().max(8_000),
  })
  .nullable();
const teamDataExportSchema = z.object({
  format: z.literal('reta-team-export'),
  version: z.literal(1),
  exportedAt: isoDate,
  team: z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(80),
    createdBy: z.string().min(1).max(64),
    createdAt: isoDate,
  }),
  members: z
    .array(
      z.object({
        userId: z.string().min(1).max(64),
        email: z.string().max(320),
        name: z.string().max(256).nullable(),
        role: z.string().max(32),
        prefs: z.record(z.unknown()),
      }),
    )
    .max(500),
  labels: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(40),
        color: z.string().min(1).max(24),
        createdBy: z.string().min(1).max(64),
      }),
    )
    .max(200),
  threads: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        threadId: z.string().min(1).max(256),
        sharerUserId: z.string().min(1).max(64),
        sharerEmail: z.string().max(320),
        providerId: z.string().min(1).max(64),
        visibility: z.string().max(16),
        subject: z.string().max(2_000),
        preview: z.string().max(4_000),
        participants: z
          .array(z.object({ name: z.string().max(256).optional(), email: z.string().max(320) }))
          .max(100),
        messageCount: z.number().int().min(0).max(100_000),
        latestReceivedOn: z.string().max(64).nullable(),
        status: z.string().max(16),
        assigneeUserId: z.string().max(64).nullable(),
        lastActivityAt: isoDate,
        createdAt: isoDate,
        labelIds: z.array(z.string().min(1).max(64)).max(20),
        accessUserIds: z.array(z.string().min(1).max(64)).max(50),
      }),
    )
    .max(2_000),
  comments: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        teamThreadId: z.string().min(1).max(64),
        authorUserId: z.string().min(1).max(64),
        body: z.string().max(5_000),
        mentions: z.array(z.string().min(1).max(64)).max(20),
        quote: restoreQuoteSchema,
        createdAt: isoDate,
        updatedAt: isoDate,
        reactions: z
          .array(z.object({ userId: z.string().min(1).max(64), emoji: z.string().max(16) }))
          .max(100),
      }),
    )
    .max(10_000),
  rules: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        triggers: z.record(z.unknown()),
        actions: z.array(z.unknown()).max(10),
        createdBy: z.string().min(1).max(64),
        watchedEmail: z.string().max(320),
        createdAt: isoDate,
      }),
    )
    .max(200),
  slaPolicy: z
    .object({
      firstResponseMinutes: z.number().int().nullable(),
      resolutionMinutes: z.number().int().nullable(),
      timeZone: z.string().min(1).max(64),
      businessHours: z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        start: z.string().regex(HOURS_RE),
        end: z.string().regex(HOURS_RE),
      }),
    })
    .nullable(),
  retentionPolicy: z
    .object({
      auditDays: z.number().int().min(30).max(730).nullable(),
      ruleRunDays: z.number().int().min(30).max(730).nullable(),
      notificationDays: z.number().int().min(30).max(730).nullable(),
    })
    .nullable(),
  absences: z
    .array(
      z.object({
        userId: z.string().min(1).max(64),
        startsAt: isoDate,
        endsAt: isoDate,
        note: z.string().max(300).nullable(),
      }),
    )
    .max(500),
  truncated: z.array(z.string().max(64)).max(16),
  excluded: z.array(z.string().max(200)).max(16),
});

/**
 * Garde ROUTE de l'élargissement d'ACL (doublée d'une garde STORE) : une
 * action share = chaque fil qui matche devient lisible par TOUTE l'équipe —
 * refusée sans confirmation explicite fraîche dans la même requête.
 */
function requireShareConfirmation(
  actions: Array<{ kind: string }> | undefined,
  confirmAclExpansion: boolean | undefined,
) {
  if (actions?.some((action) => action.kind === 'share') && confirmAclExpansion !== true) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'acl_confirmation_required' });
  }
}

export const teamsRouter = router({
  // --- teams -----------------------------------------------------------------
  create: privateProcedure
    .input(z.object({ name: teamNameSchema }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.createTeam(input.name);
      }),
    ),
  list: privateProcedure.query(async ({ ctx }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { teams: await db.listMyTeams() };
    }),
  ),
  rename: privateProcedure
    .input(teamIdInput.extend({ name: teamNameSchema }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.renameTeam(input.teamId, input.name);
        return { success: true };
      }),
    ),
  delete: privateProcedure.input(teamIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      const result = await db.deleteTeam(input.teamId);
      for (const teamThreadId of result.realtimeThreadIds) rtClose(ctx, teamThreadId);
      return { success: true };
    }),
  ),
  leave: privateProcedure.input(teamIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      const result = await db.leaveTeam(input.teamId);
      for (const teamThreadId of result.realtimeThreadIds) {
        if (result.teamDeleted) rtClose(ctx, teamThreadId);
        else rtKick(ctx, teamThreadId, ctx.sessionUser.id);
      }
      return { success: true };
    }),
  ),

  // --- members ---------------------------------------------------------------
  listMembers: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { members: await db.listTeamMembers(input.teamId) };
    }),
  ),
  removeMember: privateProcedure
    .input(teamIdInput.extend({ userId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const result = await db.removeTeamMember(input.teamId, input.userId);
        for (const teamThreadId of result.realtimeThreadIds ?? []) {
          rtKick(ctx, teamThreadId, input.userId);
        }
        return { success: true };
      }),
    ),
  /**
   * P17 — changement de rôle. Gardes structurelles dans le store : rôle
   * attribuable par l'acteur (anti-escalade), owners/admins réservés aux
   * owners, dernier owner protégé, désassignation si le rôle perd l'écriture.
   */
  setMemberRole: privateProcedure
    .input(teamIdInput.extend({ userId: z.string().min(1).max(64), role: z.enum(TEAM_ROLES) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const result = await db.setTeamMemberRole(input.teamId, input.userId, input.role);
        for (const teamThreadId of result.realtimeThreadIds ?? []) {
          rtKick(ctx, teamThreadId, input.userId);
        }
        return { role: result.role };
      }),
    ),
  updateMyPrefs: privateProcedure
    .input(teamIdInput.extend({ prefs: prefsSchema }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.updateMyTeamPrefs(input.teamId, input.prefs);
        return { success: true };
      }),
    ),

  // --- onboarding collaboration (P13) ----------------------------------------
  // État DÉRIVÉ du store (audit log + état courant), jamais coché à la main ;
  // seul le masquage est un état par (équipe, membre).
  onboardingStatus: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.getTeamOnboarding(input.teamId);
    }),
  ),
  setOnboardingDismissed: privateProcedure
    .input(teamIdInput.extend({ dismissed: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamOnboardingDismissed(input.teamId, input.dismissed);
        return { success: true };
      }),
    ),

  // --- règles d'équipe (P14) -------------------------------------------------
  // Mutations : owners uniquement (rôles actuels) — vérifié en SQL dans le
  // store. Une règle surveille la boîte ACTIVE de son créateur au moment de la
  // création ; ses actions repassent par l'ACL du store à chaque exécution.
  listRules: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { rules: await db.listTeamRules(input.teamId) };
    }),
  ),
  createRule: activeDriverProcedure
    .input(
      teamIdInput.extend({
        name: ruleNameSchema,
        triggers: ruleTriggersSchema,
        actions: z.array(ruleActionSchema).min(1).max(10),
        confirmAclExpansion: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        requireShareConfirmation(input.actions, input.confirmAclExpansion);
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.createTeamRule(
          input.teamId,
          { id: ctx.activeConnection.id, email: ctx.activeConnection.email },
          {
            name: input.name,
            triggers: input.triggers,
            actions: input.actions,
            confirmAclExpansion: input.confirmAclExpansion,
          },
        );
      }),
    ),
  updateRule: privateProcedure
    .input(
      ruleIdInput.extend({
        name: ruleNameSchema.optional(),
        triggers: ruleTriggersSchema.optional(),
        actions: z.array(ruleActionSchema).min(1).max(10).optional(),
        confirmAclExpansion: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        // Garde route quand les actions sont fournies ; le store re-vérifie
        // aussi la règle RÉSULTANTE (share conservé sans re-fournir actions).
        requireShareConfirmation(input.actions, input.confirmAclExpansion);
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.updateTeamRule(input.ruleId, {
          name: input.name,
          triggers: input.triggers,
          actions: input.actions,
          confirmAclExpansion: input.confirmAclExpansion,
        });
        return { success: true };
      }),
    ),
  setRuleEnabled: privateProcedure
    .input(
      ruleIdInput.extend({ enabled: z.boolean(), confirmAclExpansion: z.boolean().optional() }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamRuleEnabled(input.ruleId, input.enabled, input.confirmAclExpansion);
        return { success: true };
      }),
    ),
  deleteRule: privateProcedure.input(ruleIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      await db.deleteTeamRule(input.ruleId);
      return { success: true };
    }),
  ),
  listRuleRuns: privateProcedure
    .input(
      teamIdInput.extend({
        ruleId: z.string().min(1).max(64).optional(),
        teamThreadId: z.string().min(1).max(64).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return {
          runs: await db.listTeamRuleRuns(input.teamId, {
            ruleId: input.ruleId,
            teamThreadId: input.teamThreadId,
            limit: input.limit,
          }),
        };
      }),
    ),
  // Simulation EXACTE (dry-run strict, zéro écriture) : un échantillon borné
  // des derniers fils inbox est lu EN ENTIER via getThread — même chemin
  // ACL/scopé à la connexion active que le reader — puis évalué sur les
  // vraies données (expéditeur, domaine, To/Cc, sujet + corps, labels,
  // heure). Une lecture échouée ressort « non évalué » (verdict null), jamais
  // comme un non-match.
  previewRule: activeDriverProcedure
    .input(
      teamIdInput.extend({
        triggers: ruleTriggersSchema,
        limit: z.number().int().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const projection = await getThreadsFromDB(ctx.activeConnection.id, {
          folder: 'inbox',
          maxResults: input.limit,
        });
        type ProjectedThread = { id: string; subject?: string; sender?: { email?: string } };
        const rows = (projection.threads as ProjectedThread[]).slice(0, input.limit);
        const { threadMetaForRules } = await import('../../lib/teams/team-rules');
        const candidates = await Promise.all(
          rows.map(async (row) => {
            const base = {
              threadId: row.id,
              subject: row.subject ?? '',
              senderEmail: row.sender?.email ?? '',
            };
            try {
              const { result } = await getThread(ctx.activeConnection.id, row.id);
              const meta = threadMetaForRules(result);
              return {
                ...base,
                subject: meta?.subject || base.subject,
                senderEmail: meta?.senderEmail || base.senderEmail,
                meta,
              };
            } catch {
              return { ...base, meta: null };
            }
          }),
        );
        return {
          rows: await db.previewTeamRule(input.teamId, { triggers: input.triggers }, candidates),
        };
      }),
    ),
  undoRuleRun: privateProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.undoTeamRuleRun(input.runId);
      }),
    ),

  // --- brouillons collaboratifs (P15) ----------------------------------------
  // Le brouillon appartient au PARTAGEUR : draftId est scoped à sa connexion,
  // résolue serveur depuis team_thread — jamais de connectionId client. Le
  // reviewer suggère et décide, il ne mute jamais le Gmail du propriétaire.
  requestDraftReview: privateProcedure
    .input(
      teamThreadIdInput.extend({
        draftId: z.string().min(1).max(128),
        reviewerUserId: z.string().min(1).max(64),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.requestTeamDraftReview({
          teamThreadId: input.teamThreadId,
          draftId: input.draftId,
          reviewerUserId: input.reviewerUserId,
        });
      }),
    ),
  threadDraftReview: privateProcedure.input(teamThreadIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { review: await db.getTeamThreadDraftReview(input.teamThreadId) };
    }),
  ),
  readReviewDraft: privateProcedure
    .input(z.object({ reviewId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.readTeamReviewDraft(input.reviewId);
      }),
    ),
  suggestDraftEdit: privateProcedure
    .input(
      z.object({
        reviewId: z.string().min(1).max(64),
        bodyText: z.string().min(1).max(100_000),
        note: z.string().max(2_000).optional(),
        baseDigest: z.string().min(16).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.suggestTeamDraftEdit(input.reviewId, {
          bodyText: input.bodyText,
          note: input.note,
          baseDigest: input.baseDigest,
        });
      }),
    ),
  draftReviewDecision: privateProcedure
    .input(
      z.object({
        reviewId: z.string().min(1).max(64),
        decision: z.enum(['approved', 'changes_requested']),
        baseDigest: z.string().min(16).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.setTeamDraftReviewDecision(input.reviewId, {
          decision: input.decision,
          baseDigest: input.baseDigest,
        });
      }),
    ),
  rebaseDraftReview: privateProcedure
    .input(z.object({ reviewId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.rebaseTeamDraftReview(input.reviewId);
      }),
    ),
  applyDraftSuggestion: privateProcedure
    .input(z.object({ suggestionId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.markTeamDraftSuggestionApplied(input.suggestionId);
        return { success: true };
      }),
    ),
  // Baseline de collision SERVEUR : émise à l'ouverture du composeur, jamais
  // fournie par le client — mail.send exige cet intent pour tout envoi lié
  // équipe.
  createReplyIntent: privateProcedure.input(teamThreadIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.createTeamReplyIntent(input.teamThreadId);
    }),
  ),
  cancelDraftReview: privateProcedure
    .input(z.object({ reviewId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.cancelTeamDraftReview(input.reviewId);
        return { success: true };
      }),
    ),

  // --- SLA + opérations (P14 SLA / P16) --------------------------------------
  // Politique : écriture OWNER (vérifiée en SQL), lecture membre. L'overview
  // est filtrée par l'ACL de l'appelant AVANT agrégation dans le store.
  getSlaPolicy: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { policy: await db.getTeamSlaPolicy(input.teamId) };
    }),
  ),
  setSlaPolicy: privateProcedure
    .input(
      teamIdInput.extend({
        firstResponseMinutes: z
          .number()
          .int()
          .min(5)
          .max(60 * 24 * 30)
          .nullable(),
        resolutionMinutes: z
          .number()
          .int()
          .min(5)
          .max(60 * 24 * 90)
          .nullable(),
        timeZone: z.string().min(1).max(64),
        businessHours: z.object({
          days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
          start: z.string().regex(HOURS_RE),
          end: z.string().regex(HOURS_RE),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamSlaPolicy(input.teamId, {
          firstResponseMinutes: input.firstResponseMinutes,
          resolutionMinutes: input.resolutionMinutes,
          timeZone: input.timeZone,
          businessHours: input.businessHours,
        });
        return { success: true };
      }),
    ),
  listAbsences: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { absences: await db.listTeamAbsences(input.teamId) };
    }),
  ),
  declareAbsence: privateProcedure
    .input(
      teamIdInput.extend({
        targetUserId: z.string().min(1).max(64),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.declareTeamAbsence(input.teamId, {
          targetUserId: input.targetUserId,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          note: input.note,
        });
      }),
    ),
  removeAbsence: privateProcedure
    .input(z.object({ absenceId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.removeTeamAbsence(input.absenceId);
        return { success: true };
      }),
    ),
  opsOverview: privateProcedure
    .input(teamIdInput.extend({ windowDays: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.getTeamOpsOverview(input.teamId, { windowDays: input.windowDays });
      }),
    ),

  // --- invites ---------------------------------------------------------------
  invite: privateProcedure
    .input(
      teamIdInput.extend({
        email: z.string().trim().toLowerCase().email().max(320),
        // P17 : rôle librement demandé, mais le store refuse tout rôle non
        // ATTRIBUABLE par l'acteur (anti-escalade, team-roles.assignableRoles).
        role: z.enum(TEAM_ROLES).default('member'),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.createTeamInvite(input.teamId, input.email, input.role);
      }),
    ),
  listInvites: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { invites: await db.listTeamInvites(input.teamId) };
    }),
  ),
  revokeInvite: privateProcedure
    .input(z.object({ inviteId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.revokeTeamInvite(input.inviteId);
        return { success: true };
      }),
    ),
  myInvites: privateProcedure.query(async ({ ctx }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { invites: await db.listMyTeamInvites(ctx.sessionUser.email) };
    }),
  ),
  acceptInvite: privateProcedure
    .input(z.object({ inviteId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.acceptTeamInvite(input.inviteId, ctx.sessionUser.email);
      }),
    ),
  declineInvite: privateProcedure
    .input(z.object({ inviteId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.declineTeamInvite(input.inviteId, ctx.sessionUser.email);
        return { success: true };
      }),
    ),

  // --- sharing ---------------------------------------------------------------
  /**
   * Share the CURRENTLY-OPEN thread of the caller's active connection.
   * Metadata is captured server-side from the caller's own mailbox — the
   * client only names the thread. Restricted visibility seeds a revocable
   * ACL; mentions can widen it later (visibly).
   */
  share: activeDriverProcedure
    .input(
      teamIdInput.extend({
        threadId: z.string().min(1).max(256),
        visibility: z.enum(['team', 'restricted']).default('team'),
        accessUserIds: z.array(z.string().min(1).max(64)).max(50).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const { result } = await getThread(ctx.activeConnection.id, input.threadId);
        const meta = buildTeamThreadMetadata(
          {
            id: ctx.activeConnection.id,
            email: ctx.activeConnection.email,
            providerId: ctx.activeConnection.providerId,
          },
          input.threadId,
          result,
        );
        const db = await getZeroDB(ctx.sessionUser.id);
        const row = await db.shareTeamThread(input.teamId, meta, {
          visibility: input.visibility,
          accessUserIds: input.accessUserIds,
        });
        return { share: toPublicShare(row) };
      }),
    ),
  unshare: privateProcedure.input(teamThreadIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      await db.unshareTeamThread(input.teamThreadId);
      rtClose(ctx, input.teamThreadId);
      return { success: true };
    }),
  ),
  listThreads: privateProcedure
    .input(
      teamIdInput.extend({
        status: z.enum(['open', 'closed']).optional(),
        assignee: z
          .union([
            z.literal('me'),
            z.literal('unassigned'),
            z.object({ userId: z.string().min(1).max(64) }),
          ])
          .optional(),
        labelId: z.string().min(1).max(64).optional(),
        cursor: z
          .object({ lastActivityAt: z.string().datetime(), id: z.string().min(1).max(64) })
          .nullish(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.listTeamThreads(input.teamId, {
          status: input.status,
          assignee: input.assignee,
          labelId: input.labelId,
          cursor: input.cursor ?? null,
          limit: input.limit,
        });
      }),
    ),
  sharesForThread: activeDriverProcedure
    .input(z.object({ threadId: z.string().min(1).max(256) }))
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return {
          shares: await db.listTeamSharesForThread(input.threadId, ctx.activeConnection.email),
        };
      }),
    ),
  getShare: privateProcedure.input(teamThreadIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      const row = await db.resolveTeamThreadAccess(input.teamThreadId);
      return { share: toPublicShare(row) };
    }),
  ),
  /**
   * FULL shared-thread read through the bounded ACL proxy — an authorized
   * teammate on ANY mailbox reads snapshot + future messages. The sharer's
   * connection is used strictly server-side, after resolveAccess.
   */
  readSharedThread: privateProcedure
    .input(teamThreadIdInput)
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => await readSharedThread(ctx.sessionUser.id, input.teamThreadId)),
    ),
  readSharedAttachment: privateProcedure
    .input(
      teamThreadIdInput.extend({
        messageId: z.string().min(1).max(256),
        attachmentId: z.string().min(1).max(512),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapTeamErrors(
        async () =>
          await readSharedAttachment(
            ctx.sessionUser.id,
            input.teamThreadId,
            input.messageId,
            input.attachmentId,
          ),
      ),
    ),
  setStatus: privateProcedure
    .input(teamThreadIdInput.extend({ status: z.enum(['open', 'closed']) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamThreadStatus(input.teamThreadId, input.status);
        rtPublish(ctx, input.teamThreadId, 'thread.invalidate');
        return { success: true };
      }),
    ),
  /**
   * P5 — assignation BATCH depuis la sélection de la liste (ids de la boîte
   * ACTIVE). ACL complète côté store ; tout fil non partagé ou hors accès est
   * SKIPPÉ avec un résultat par fil — jamais d'échec silencieux.
   */
  assignSharedBatch: activeDriverProcedure
    .input(
      teamIdInput.extend({
        assigneeUserId: z.string().min(1).max(64).nullable(),
        threadIds: z.array(z.string().min(1).max(256)).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const { results } = await db.assignSharedThreadsBatch({
          teamId: input.teamId,
          connectionEmail: ctx.activeConnection.email,
          assigneeUserId: input.assigneeUserId,
          threadIds: input.threadIds,
        });
        for (const result of results) {
          if (result.outcome === 'assigned' && result.teamThreadId) {
            rtPublish(ctx, result.teamThreadId, 'thread.invalidate');
          }
        }
        return {
          results,
          assigned: results.filter((r) => r.outcome === 'assigned').length,
          notShared: results.filter((r) => r.outcome === 'not_shared').length,
          skipped: results.filter((r) => r.outcome === 'assignee_no_access').length,
        };
      }),
    ),
  setAssignee: privateProcedure
    .input(teamThreadIdInput.extend({ assigneeUserId: z.string().min(1).max(64).nullable() }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamThreadAssignee(input.teamThreadId, input.assigneeUserId);
        rtPublish(ctx, input.teamThreadId, 'thread.invalidate');
        return { success: true };
      }),
    ),

  // --- thread ACL ------------------------------------------------------------
  listAccess: privateProcedure.input(teamThreadIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { access: await db.listTeamThreadAccess(input.teamThreadId) };
    }),
  ),
  grantAccess: privateProcedure
    .input(teamThreadIdInput.extend({ userId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.grantTeamThreadAccess(input.teamThreadId, input.userId);
        rtPublish(ctx, input.teamThreadId, 'thread.invalidate');
        return { success: true };
      }),
    ),
  revokeAccess: privateProcedure
    .input(teamThreadIdInput.extend({ userId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.revokeTeamThreadAccess(input.teamThreadId, input.userId);
        // La révocation COUPE immédiatement les sockets de l'utilisateur visé.
        rtKick(ctx, input.teamThreadId, input.userId);
        rtPublish(ctx, input.teamThreadId, 'thread.invalidate');
        return { success: true };
      }),
    ),

  // --- comments --------------------------------------------------------------
  addComment: privateProcedure
    .input(
      teamThreadIdInput.extend({
        body: commentBodySchema,
        mentions: z.array(z.string().min(1).max(64)).max(20).default([]),
        quoteMessageId: z.string().min(1).max(256).optional(),
        quoteText: z.string().trim().min(1).max(8_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        // The quote is captured SERVER-SIDE from the shared thread (same ACL
        // gate as readSharedThread) — client text never becomes a citation.
        const quote = input.quoteMessageId
          ? await buildSharedQuote(
              ctx.sessionUser.id,
              input.teamThreadId,
              input.quoteMessageId,
              input.quoteText,
            )
          : null;
        const db = await getZeroDB(ctx.sessionUser.id);
        const comment = await db.addTeamThreadComment(
          input.teamThreadId,
          input.body,
          input.mentions,
          quote,
        );
        rtPublish(ctx, input.teamThreadId, 'comments.invalidate');
        return { comment };
      }),
    ),
  editComment: privateProcedure
    .input(z.object({ commentId: z.string().min(1).max(64), body: commentBodySchema }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const edited = await db.editTeamThreadComment(input.commentId, input.body);
        rtPublish(ctx, edited.teamThreadId, 'comments.invalidate');
        return { success: true };
      }),
    ),
  deleteComment: privateProcedure
    .input(z.object({ commentId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const deleted = await db.deleteTeamThreadComment(input.commentId);
        rtPublish(ctx, deleted.teamThreadId, 'comments.invalidate');
        return { success: true };
      }),
    ),
  listComments: privateProcedure.input(teamThreadIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { comments: await db.listTeamThreadComments(input.teamThreadId) };
    }),
  ),
  toggleReaction: privateProcedure
    .input(
      z.object({
        commentId: z.string().min(1).max(64),
        emoji: z.enum(REACTION_EMOJIS),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const result = await db.toggleTeamCommentReaction(input.commentId, input.emoji);
        rtPublish(ctx, result.teamThreadId, 'comments.invalidate');
        return { reacted: result.reacted };
      }),
    ),

  // --- labels ----------------------------------------------------------------
  createLabel: privateProcedure
    .input(
      teamIdInput.extend({
        name: z.string().trim().min(1).max(40),
        color: z.string().trim().min(1).max(24).default('default'),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.createTeamLabel(input.teamId, input.name, input.color);
      }),
    ),
  deleteLabel: privateProcedure
    .input(z.object({ labelId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.deleteTeamLabel(input.labelId);
        return { success: true };
      }),
    ),
  listLabels: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { labels: await db.listTeamLabels(input.teamId) };
    }),
  ),
  setThreadLabels: privateProcedure
    .input(teamThreadIdInput.extend({ labelIds: z.array(z.string().min(1).max(64)).max(20) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamThreadLabels(input.teamThreadId, input.labelIds);
        rtPublish(ctx, input.teamThreadId, 'thread.invalidate');
        return { success: true };
      }),
    ),

  // --- notifications ---------------------------------------------------------
  listNotifications: privateProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return { notifications: await db.listMyTeamNotifications(input) };
      }),
    ),
  unreadNotificationCount: privateProcedure.query(async ({ ctx }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      const counts = await db.countMyUnreadTeamNotifications();
      // `count` = total (compat badge) ; `mentions` = MENTIONS non lues seules.
      return { count: counts.count, mentions: counts.mentions };
    }),
  ),
  markNotificationsRead: privateProcedure
    .input(
      z.object({
        ids: z.union([z.literal('all'), z.array(z.string().min(1).max(64)).max(100)]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.markTeamNotificationsRead(input.ids);
        return { success: true };
      }),
    ),

  // --- audit -----------------------------------------------------------------
  listAudit: privateProcedure
    .input(teamIdInput.extend({ limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return { entries: await db.listTeamAudit(input.teamId, input.limit) };
      }),
    ),

  // --- gouvernance (P17) -------------------------------------------------------
  /**
   * Export SIGNÉ du journal d'audit (capacité audit.export : owner/admin/
   * auditor). Le store construit le payload borné (et audite l'export) ; la
   * signature HMAC est dérivée du KEK ring serveur ICI — sans ring, fail
   * closed PRECONDITION_FAILED, le reste de l'app n'est pas affecté.
   */
  exportAudit: privateProcedure
    .input(
      teamIdInput.extend({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const payload = await db.buildTeamAuditExport(input.teamId, {
          from: input.from ? new Date(input.from) : undefined,
          to: input.to ? new Date(input.to) : undefined,
        });
        const { signAuditExport } = await import('../../lib/teams/team-audit-export');
        const env = ctx.c.env as {
          RETA_BYOK_KEK_V1?: string;
          RETA_BYOK_KEK_V2?: string;
          RETA_BYOK_KEK_ACTIVE?: string;
        };
        const doc = await signAuditExport(
          {
            RETA_BYOK_KEK_V1: env.RETA_BYOK_KEK_V1,
            RETA_BYOK_KEK_V2: env.RETA_BYOK_KEK_V2,
            RETA_BYOK_KEK_ACTIVE: env.RETA_BYOK_KEK_ACTIVE,
          },
          payload,
        );
        if (!doc) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'export_unavailable' });
        }
        return doc;
      }),
    ),
  /** Vérification serveur d'un export signé — validité seule, rien d'autre. */
  verifyAuditExport: privateProcedure
    .input(
      z.object({
        doc: z
          .object({
            payload: z.unknown(),
            signature: z.object({
              algorithm: z.string().max(32),
              kdf: z.string().max(32),
              kekVersion: z.string().max(16),
              mac: z.string().max(128),
            }),
          })
          .refine((doc) => JSON.stringify(doc.payload ?? null).length <= 8_000_000, {
            message: 'restore_too_large',
          }),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const { verifyAuditExport } = await import('../../lib/teams/team-audit-export');
        const env = ctx.c.env as {
          RETA_BYOK_KEK_V1?: string;
          RETA_BYOK_KEK_V2?: string;
          RETA_BYOK_KEK_ACTIVE?: string;
        };
        const verdict = await verifyAuditExport(
          {
            RETA_BYOK_KEK_V1: env.RETA_BYOK_KEK_V1,
            RETA_BYOK_KEK_V2: env.RETA_BYOK_KEK_V2,
            RETA_BYOK_KEK_ACTIVE: env.RETA_BYOK_KEK_ACTIVE,
          },
          input.doc as Parameters<typeof verifyAuditExport>[1],
        );
        if (!verdict) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'export_unavailable' });
        }
        return { verdict };
      }),
    ),
  getRetentionPolicy: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { policy: await db.getTeamRetentionPolicy(input.teamId) };
    }),
  ),
  setRetentionPolicy: privateProcedure
    .input(
      teamIdInput.extend({
        auditDays: z.number().int().min(30).max(730).nullable(),
        ruleRunDays: z.number().int().min(30).max(730).nullable(),
        notificationDays: z.number().int().min(30).max(730).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.setTeamRetentionPolicy(input.teamId, {
          auditDays: input.auditDays,
          ruleRunDays: input.ruleRunDays,
          notificationDays: input.notificationDays,
        });
        return { success: true };
      }),
    ),
  /** Export des données d'équipe (capacité data.export : owner/admin). Audité. */
  exportData: privateProcedure.input(teamIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.exportTeamData(input.teamId);
    }),
  ),
  /**
   * Restauration d'un export dans une NOUVELLE équipe (l'appelant devient
   * owner). Validation stricte du document ici ; le plan pur écarte tout ce
   * qui ne se re-résout pas et le rapport nomme chaque écart. Les règles
   * restaurées sont TOUJOURS désactivées (ré-armement ACL explicite).
   */
  restoreData: privateProcedure
    .input(z.object({ payload: teamDataExportSchema }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return { report: await db.restoreTeamData(input.payload) };
      }),
    ),

  // --- presence --------------------------------------------------------------
  heartbeat: privateProcedure
    .input(
      teamThreadIdInput.extend({
        typing: z.boolean().default(false),
        replying: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.heartbeatTeamThreadPresence(input.teamThreadId, input.typing, input.replying);
        return { success: true };
      }),
    ),
  listPresence: privateProcedure.input(teamThreadIdInput).query(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { presence: await db.listTeamThreadPresence(input.teamThreadId) };
    }),
  ),

  // --- search + dashboard ----------------------------------------------------
  myCollabThreadSets: activeDriverProcedure.query(async ({ ctx }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.listMyCollabThreadSets(ctx.activeConnection.email);
    }),
  ),
  myAssignedOpenCount: privateProcedure.query(async ({ ctx }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return { count: await db.countMyAssignedOpenTeamThreads() };
    }),
  ),
});
