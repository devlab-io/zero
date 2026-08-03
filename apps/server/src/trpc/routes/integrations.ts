/**
 * Router des intégrations d'équipe (P18 — Linear seul, email-first, aucun
 * chat). Configuration owner-only ; usage borné par l'ACL du fil partagé ;
 * AUCUN secret ne traverse ce router (présence booléenne seule). Les secrets
 * OAuth/vault absents → fail closed avec des codes explicites que l'UI owner
 * traduit en « configuration manquante » sans bloquer le reste.
 */
import { OUTBOUND_EVENT_TYPES } from '../../lib/teams/team-integrations-shared';
import { getZeroDB } from '../../lib/server-utils';
import { privateProcedure, router } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const INTEGRATION_ERROR_CODES: Record<
  string,
  'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' | 'PRECONDITION_FAILED' | 'CONFLICT'
> = {
  not_found: 'NOT_FOUND',
  not_a_member: 'FORBIDDEN',
  forbidden: 'FORBIDDEN',
  integration_vault_unavailable: 'PRECONDITION_FAILED',
  integration_not_configured: 'PRECONDITION_FAILED',
  integration_not_installed: 'PRECONDITION_FAILED',
  integration_revoked: 'PRECONDITION_FAILED',
  mapping_missing: 'BAD_REQUEST',
  confirmation_required: 'BAD_REQUEST',
  invalid_url: 'BAD_REQUEST',
  issue_create_in_flight: 'CONFLICT',
  issue_create_failed: 'BAD_REQUEST',
  // hardening-10
  idempotency_conflict: 'CONFLICT',
  preview_expired: 'BAD_REQUEST',
  preview_invalid: 'BAD_REQUEST',
  needs_reconciliation: 'CONFLICT',
  oauth_scope_mismatch: 'BAD_REQUEST',
};

async function mapIntegrationErrors<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    const code = error instanceof Error ? INTEGRATION_ERROR_CODES[error.message] : undefined;
    if (code) {
      throw new TRPCError({ code, message: error instanceof Error ? error.message : code });
    }
    throw error;
  }
}

const teamIdInput = z.object({ teamId: z.string().min(1).max(64) });
const teamThreadIdInput = z.object({ teamThreadId: z.string().min(1).max(64) });

export const integrationsRouter = router({
  overview: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapIntegrationErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.getTeamIntegrationOverview(input.teamId);
    }),
  ),

  // --- OAuth (owner) — jamais exécuté en QA : aucune URL n'est suivie ici,
  // le client redirige l'owner vers authorizeUrl ; le callback appelle
  // completeInstall avec state+code sous session.
  beginInstall: privateProcedure
    .input(teamIdInput.extend({ reconnectConfirm: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.beginTeamLinearInstall(input.teamId, input.reconnectConfirm);
      }),
    ),
  completeInstall: privateProcedure
    .input(z.object({ state: z.string().min(1).max(128), code: z.string().min(1).max(512) }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.completeTeamLinearInstall(input);
      }),
    ),
  revokeInstall: privateProcedure.input(teamIdInput).mutation(async ({ ctx, input }) =>
    mapIntegrationErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.revokeTeamLinearInstall(input.teamId);
    }),
  ),

  // --- mappings (owner-only, EXPLICITES — jamais d'inférence) ---------------
  setMapping: privateProcedure
    .input(
      teamIdInput.extend({
        kind: z.enum(['team', 'status', 'assignee']),
        retaValue: z.string().min(1).max(128),
        externalId: z.string().max(128),
        externalLabel: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const { teamId, ...mapping } = input;
        return await db.setTeamIntegrationMapping(teamId, mapping);
      }),
    ),
  listLinearTargets: privateProcedure
    .input(teamIdInput.extend({ linearTeamId: z.string().min(1).max(128).optional() }))
    .query(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.listTeamLinearTargets(input.teamId, input.linearTeamId);
      }),
    ),

  // --- fil partagé : liens + création d'issue -------------------------------
  threadIntegration: privateProcedure.input(teamThreadIdInput).query(async ({ ctx, input }) =>
    mapIntegrationErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.listTeamThreadIntegration(input.teamThreadId);
    }),
  ),
  /**
   * APERÇU SERVEUR persisté : le client peut proposer titre/note, le serveur
   * renvoie le CANONIQUE (titre borné, backlink construit serveur, digest,
   * expiration). Rien ne part vers Linear ici.
   */
  previewIssue: privateProcedure
    .input(
      teamThreadIdInput.extend({
        clientRequestKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
        linearTeamId: z.string().min(1).max(128),
        stateId: z.string().min(1).max(128).nullish(),
        assigneeUserId: z.string().min(1).max(64).nullish(),
        title: z.string().max(500).nullish(),
        note: z.string().max(2_000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.previewTeamLinearIssue(input);
      }),
    ),
  /**
   * CONFIRMATION par RÉFÉRENCE seule : previewId + clé + digest — jamais de
   * titre/description arbitraires ni de booléen nu. Expiré/altéré/mapping
   * changé = refus ; issue réseau inconnue = needs_reconciliation.
   */
  confirmIssue: privateProcedure
    .input(
      z.object({
        previewId: z.string().min(1).max(64),
        clientRequestKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
        digest: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.confirmTeamLinearIssue(input);
      }),
    ),
  /** Accept d'une suggestion de lien — l'aperçu n'est jamais persisté. */
  acceptIssueLink: privateProcedure
    .input(teamThreadIdInput.extend({ identifier: z.string().regex(/^[A-Za-z]{1,10}-\d{1,8}$/) }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.acceptTeamIssueLink(input);
      }),
    ),
  unlinkIssue: privateProcedure
    .input(z.object({ linkId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.unlinkTeamIssue(input.linkId);
      }),
    ),
  addExternalLink: privateProcedure
    .input(
      teamThreadIdInput.extend({
        kind: z.enum(['crm', 'customer', 'other']),
        label: z.string().trim().min(1).max(200),
        url: z.string().url().max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        const { teamThreadId, ...link } = input;
        return await db.addTeamExternalLink(teamThreadId, link);
      }),
    ),
  removeExternalLink: privateProcedure
    .input(z.object({ linkId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.removeTeamExternalLink(input.linkId);
      }),
    ),

  // --- webhooks sortants (owner-only) ---------------------------------------
  listOutboundWebhooks: privateProcedure.input(teamIdInput).query(async ({ ctx, input }) =>
    mapIntegrationErrors(async () => {
      const db = await getZeroDB(ctx.sessionUser.id);
      return await db.listTeamOutboundWebhooks(input.teamId);
    }),
  ),
  createOutboundWebhook: privateProcedure
    .input(
      teamIdInput.extend({
        url: z.string().url().max(2000),
        events: z
          .array(z.enum(OUTBOUND_EVENT_TYPES as [string, ...string[]]))
          .min(1)
          .max(3),
        secret: z.string().min(16).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.createTeamOutboundWebhook(input.teamId, {
          url: input.url,
          events: input.events as Array<'thread.assigned' | 'thread.comment' | 'thread.status'>,
          secret: input.secret,
        });
      }),
    ),
  setOutboundWebhookActive: privateProcedure
    .input(teamIdInput.extend({ webhookId: z.string().min(1).max(64), active: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.setTeamOutboundWebhookActive(input.teamId, input.webhookId, input.active);
      }),
    ),
  listOutboundDeliveries: privateProcedure
    .input(
      teamIdInput.extend({
        webhookId: z.string().min(1).max(64),
        status: z.enum(['pending', 'sending', 'delivered', 'dead']).optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.listTeamOutboundDeliveries(input.teamId, input.webhookId, {
          status: input.status,
        });
      }),
    ),
  /** Rejeu MANUEL owner des livraisons mortes d'un webhook. */
  retryDeadOutbound: privateProcedure
    .input(teamIdInput.extend({ webhookId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.retryTeamDeadOutbound(input.teamId, input.webhookId);
      }),
    ),

  // --- export d'activité (owner, paginé, schéma stable) ---------------------
  exportActivity: privateProcedure
    .input(
      teamIdInput.extend({
        cursor: z
          .string()
          .max(128)
          .regex(/^\d{1,16}\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
          .nullish(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      mapIntegrationErrors(async () => {
        const db = await getZeroDB(ctx.sessionUser.id);
        return await db.exportTeamActivity(input.teamId, {
          cursor: input.cursor ?? null,
          limit: input.limit,
        });
      }),
    ),
});
