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
import { activeDriverProcedure, privateProcedure, router } from '../trpc';
import { getThread, getZeroDB } from '../../lib/server-utils';
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

const TEAM_ERROR_CODES: Record<string, 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'> = {
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
      await db.deleteTeam(input.teamId);
      return { success: true };
    }),
  ),
  leave: privateProcedure.input(teamIdInput).mutation(async ({ ctx, input }) =>
    mapTeamErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      await db.leaveTeam(input.teamId);
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
        await db.removeTeamMember(input.teamId, input.userId);
        return { success: true };
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

  // --- invites ---------------------------------------------------------------
  invite: privateProcedure
    .input(
      teamIdInput.extend({
        email: z.string().trim().toLowerCase().email().max(320),
        role: z.enum(['owner', 'member']).default('member'),
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

  // --- presence --------------------------------------------------------------
  heartbeat: privateProcedure
    .input(teamThreadIdInput.extend({ typing: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) =>
      mapTeamErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.heartbeatTeamThreadPresence(input.teamThreadId, input.typing);
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
