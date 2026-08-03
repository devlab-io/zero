// Durable Object database layer, extracted from main.ts during the V2.3
// routing-consolidation (issue devlab-io/zero#24). Pure move: the DbRpcDO
// (RpcTarget façade) and ZeroDB (SQLite-backed DurableObject) classes below
// are unchanged; main.ts re-exports them so the wrangler `ZERO_DB` binding and
// exported-class surface are identical. No routing logic lives here.
import {
  deleteRetaCredentialTx,
  selectRetaModelTx,
  type SelectRetaModelParams,
  type SelectRetaModelResult,
  type VaultTxStore,
} from '../lib/ask-reta/vault-transactions';
import {
  account,
  connection,
  note,
  retaByokCredential,
  session,
  user,
  userHotkeys,
  userSettings,
  writingStyleMatrix,
  emailTemplate,
} from './schema';
import {
  createUpdatedMatrixFromNewEmail,
  initializeStyleMatrixFromEmail,
  type EmailMatrix,
  type WritingStyleMatrix,
} from '../services/writing-style-service';
import * as teamIntegrationsStore from '../lib/teams/team-integrations-store';
import * as teamGovernanceStore from '../lib/teams/team-governance-store';
import * as teamDraftsStore from '../lib/teams/team-drafts-store';
import * as teamRulesStore from '../lib/teams/team-rules-store';
import * as teamOnboarding from '../lib/teams/team-onboarding';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import * as teamOpsStore from '../lib/teams/team-ops-store';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { consumeSlidingWindow } from '../lib/rate-limit';
import * as teamStore from '../lib/teams/team-store';
import { defaultUserSettings } from '../lib/schemas';
import { createDb, type DB } from './index';
import { EProviders } from '../types';
import type { ZeroEnv } from '../env';

export class DbRpcDO extends RpcTarget {
  constructor(
    private mainDo: ZeroDB,
    private userId: string,
  ) {
    super();
  }

  async findUser(): Promise<typeof user.$inferSelect | undefined> {
    return await this.mainDo.findUser(this.userId);
  }

  async findUserConnection(
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.mainDo.findUserConnection(this.userId, connectionId);
  }

  async updateUser(data: Partial<typeof user.$inferInsert>) {
    return await this.mainDo.updateUser(this.userId, data);
  }

  async deleteConnection(connectionId: string) {
    return await this.mainDo.deleteConnection(connectionId, this.userId);
  }

  async findFirstConnection(): Promise<typeof connection.$inferSelect | undefined> {
    return await this.mainDo.findFirstConnection(this.userId);
  }

  async findManyConnections(): Promise<(typeof connection.$inferSelect)[]> {
    return await this.mainDo.findManyConnections(this.userId);
  }

  async findManyNotesByThreadId(threadId: string): Promise<(typeof note.$inferSelect)[]> {
    return await this.mainDo.findManyNotesByThreadId(this.userId, threadId);
  }

  async createNote(payload: Omit<typeof note.$inferInsert, 'userId'>) {
    return await this.mainDo.createNote(this.userId, payload as typeof note.$inferInsert);
  }

  async updateNote(noteId: string, payload: Partial<typeof note.$inferInsert>) {
    return await this.mainDo.updateNote(this.userId, noteId, payload);
  }

  async updateManyNotes(
    notes: { id: string; order: number; isPinned?: boolean | null }[],
  ): Promise<boolean> {
    return await this.mainDo.updateManyNotes(this.userId, notes);
  }

  async findManyNotesByIds(noteIds: string[]): Promise<(typeof note.$inferSelect)[]> {
    return await this.mainDo.findManyNotesByIds(this.userId, noteIds);
  }

  async deleteNote(noteId: string) {
    return await this.mainDo.deleteNote(this.userId, noteId);
  }

  async findNoteById(noteId: string): Promise<typeof note.$inferSelect | undefined> {
    return await this.mainDo.findNoteById(this.userId, noteId);
  }

  async findHighestNoteOrder(): Promise<{ order: number } | undefined> {
    return await this.mainDo.findHighestNoteOrder(this.userId);
  }

  async deleteUser() {
    return await this.mainDo.deleteUser(this.userId);
  }

  async findUserSettings(): Promise<typeof userSettings.$inferSelect | undefined> {
    return await this.mainDo.findUserSettings(this.userId);
  }

  async findUserHotkeys(): Promise<(typeof userHotkeys.$inferSelect)[]> {
    return await this.mainDo.findUserHotkeys(this.userId);
  }

  async insertUserHotkeys(shortcuts: (typeof userHotkeys.$inferInsert)[]) {
    return await this.mainDo.insertUserHotkeys(this.userId, shortcuts);
  }

  async insertUserSettings(settings: typeof defaultUserSettings) {
    return await this.mainDo.insertUserSettings(this.userId, settings);
  }

  async updateUserSettings(settings: typeof defaultUserSettings) {
    return await this.mainDo.updateUserSettings(this.userId, settings);
  }

  async createConnection(
    providerId: EProviders,
    email: string,
    updatingInfo: {
      expiresAt: Date;
      scope: string;
      authAccountId?: string;
    },
  ): Promise<{ id: string }[]> {
    return await this.mainDo.createConnection(providerId, email, this.userId, updatingInfo);
  }

  async findConnectionById(
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.mainDo.findConnectionById(connectionId);
  }

  async syncUserMatrix(connectionId: string, emailStyleMatrix: EmailMatrix) {
    return await this.mainDo.syncUserMatrix(connectionId, emailStyleMatrix);
  }

  async findWritingStyleMatrix(
    connectionId: string,
  ): Promise<typeof writingStyleMatrix.$inferSelect | undefined> {
    return await this.mainDo.findWritingStyleMatrix(connectionId);
  }

  async deleteActiveConnection(connectionId: string) {
    return await this.mainDo.deleteActiveConnection(this.userId, connectionId);
  }

  async updateConnection(
    connectionId: string,
    updatingInfo: Partial<typeof connection.$inferInsert>,
  ) {
    return await this.mainDo.updateConnection(connectionId, updatingInfo);
  }

  async listEmailTemplates(): Promise<(typeof emailTemplate.$inferSelect)[]> {
    return await this.mainDo.findManyEmailTemplates(this.userId);
  }

  async createEmailTemplate(payload: Omit<typeof emailTemplate.$inferInsert, 'userId'>) {
    return await this.mainDo.createEmailTemplate(this.userId, payload);
  }

  async deleteEmailTemplate(templateId: string) {
    return await this.mainDo.deleteEmailTemplate(this.userId, templateId);
  }

  async updateEmailTemplate(templateId: string, data: Partial<typeof emailTemplate.$inferInsert>) {
    return await this.mainDo.updateEmailTemplate(this.userId, templateId, data);
  }

  // --- Ask Reta BYOK vault (slice 3A) --------------------------------------
  // Scoping is STRUCTURAL: this façade injects its own userId — no route can
  // name a user, so user A cannot find/list/replace/delete user B's rows.

  async findRetaByokCredential(provider: string) {
    return await this.mainDo.findRetaByokCredential(this.userId, provider);
  }

  async listRetaByokCredentialStatus() {
    return await this.mainDo.listRetaByokCredentialStatus(this.userId);
  }

  async replaceRetaByokCredential(data: {
    id: string;
    provider: string;
    ciphertext: string;
    iv: string;
    wrappedDek: string;
    wrapIv: string;
    kekVersion: string;
    consentVersion: string;
  }) {
    return await this.mainDo.replaceRetaByokCredential(this.userId, data);
  }

  async deleteRetaByokCredentialAndResetModel(
    provider: string,
    resetModelIds: string[],
    fallbackModelId: string,
  ) {
    return await this.mainDo.deleteRetaByokCredentialAndResetModel(
      this.userId,
      provider,
      resetModelIds,
      fallbackModelId,
    );
  }

  async selectRetaModel(params: SelectRetaModelParams): Promise<SelectRetaModelResult> {
    return await this.mainDo.selectRetaModel(this.userId, params);
  }

  /**
   * Ask Reta durable rate limit (prod fix 2026-08-01) — STRUCTURALLY scoped:
   * no identifier crosses this façade; the bucket lives in the per-user DO's
   * own storage (idFromName(userId)) under a fixed, PII-free key.
   */
  async consumeAskRetaRateLimit() {
    return await this.mainDo.consumeAskRetaRateLimit();
  }

  async rewrapRetaByokCredential(
    provider: string,
    params: {
      id: string;
      expectedKekVersion: string;
      wrappedDek: string;
      wrapIv: string;
      kekVersion: string;
    },
  ): Promise<boolean> {
    return await this.mainDo.rewrapRetaByokCredential(this.userId, provider, params);
  }

  // --- Team collaboration (email threads only) ------------------------------
  // Scoping is STRUCTURAL: the façade injects its own userId and the store
  // checks team membership in SQL on every call — no route can act as another
  // user, and no teamId is trusted without a membership row. `sessionEmail`
  // parameters are filled by the tRPC layer from the SESSION, never from
  // client input.

  async createTeam(name: string) {
    return await this.mainDo.teamOp((db) => teamStore.createTeam(db, this.userId, name));
  }

  async listMyTeams() {
    return await this.mainDo.teamOp((db) => teamStore.listMyTeams(db, this.userId));
  }

  async renameTeam(teamId: string, name: string) {
    return await this.mainDo.teamOp((db) => teamStore.renameTeam(db, this.userId, teamId, name));
  }

  async deleteTeam(teamId: string) {
    return await this.mainDo.teamOp((db) => teamStore.deleteTeam(db, this.userId, teamId));
  }

  async leaveTeam(teamId: string) {
    return await this.mainDo.teamOp((db) => teamStore.leaveTeam(db, this.userId, teamId));
  }

  async listTeamMembers(teamId: string) {
    return await this.mainDo.teamOp((db) => teamStore.listTeamMembers(db, this.userId, teamId));
  }

  async removeTeamMember(teamId: string, targetUserId: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.removeTeamMember(db, this.userId, teamId, targetUserId),
    );
  }

  async setTeamMemberRole(teamId: string, targetUserId: string, role: teamStore.TeamRole) {
    return await this.mainDo.teamOp((db) =>
      teamStore.setMemberRole(db, this.userId, teamId, targetUserId, role),
    );
  }

  async createTeamInvite(teamId: string, email: string, role: teamStore.TeamRole) {
    return await this.mainDo.teamOp((db) =>
      teamStore.createInvite(db, this.userId, teamId, email, role),
    );
  }

  async listTeamInvites(teamId: string) {
    return await this.mainDo.teamOp((db) => teamStore.listTeamInvites(db, this.userId, teamId));
  }

  async revokeTeamInvite(inviteId: string) {
    return await this.mainDo.teamOp((db) => teamStore.revokeInvite(db, this.userId, inviteId));
  }

  async listMyTeamInvites(sessionEmail: string) {
    return await this.mainDo.teamOp((db) => teamStore.listMyInvites(db, sessionEmail));
  }

  async acceptTeamInvite(inviteId: string, sessionEmail: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.acceptInvite(db, this.userId, sessionEmail, inviteId),
    );
  }

  async declineTeamInvite(inviteId: string, sessionEmail: string) {
    return await this.mainDo.teamOp((db) => teamStore.declineInvite(db, sessionEmail, inviteId));
  }

  async shareTeamThread(
    teamId: string,
    meta: teamStore.TeamThreadMetadata,
    options: { visibility: teamStore.TeamThreadVisibility; accessUserIds: string[] },
  ) {
    return await this.mainDo.teamOp((db) =>
      teamStore.shareThread(db, this.userId, teamId, meta, options),
    );
  }

  /** THE ACL gate for shared-thread reads — every surface incl. AI uses it. */
  async resolveTeamThreadAccess(teamThreadId: string) {
    return await this.mainDo.teamOp((db) => teamStore.resolveAccess(db, this.userId, teamThreadId));
  }

  async listTeamThreadAccess(teamThreadId: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.listThreadAccess(db, this.userId, teamThreadId),
    );
  }

  async grantTeamThreadAccess(teamThreadId: string, targetUserId: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.grantThreadAccess(db, this.userId, teamThreadId, targetUserId, 'manual'),
    );
  }

  async revokeTeamThreadAccess(teamThreadId: string, targetUserId: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.revokeThreadAccess(db, this.userId, teamThreadId, targetUserId),
    );
  }

  async updateMyTeamPrefs(teamId: string, prefs: Parameters<typeof teamStore.updateMyPrefs>[3]) {
    return await this.mainDo.teamOp((db) =>
      teamStore.updateMyPrefs(db, this.userId, teamId, prefs),
    );
  }

  async getTeamOnboarding(teamId: string) {
    return await this.mainDo.teamOp((db) =>
      teamOnboarding.getTeamOnboarding(db, this.userId, teamId),
    );
  }

  // --- règles d'équipe (P14) — mutations owner, lecture membre -------------
  async listTeamRules(teamId: string) {
    return await this.mainDo.teamOp((db) => teamRulesStore.listRules(db, this.userId, teamId));
  }

  async createTeamRule(
    teamId: string,
    watchedConnection: { id: string; email: string },
    input: Parameters<typeof teamRulesStore.createRule>[4],
  ) {
    return await this.mainDo.teamOp((db) =>
      teamRulesStore.createRule(db, this.userId, teamId, watchedConnection, input),
    );
  }

  async updateTeamRule(ruleId: string, patch: Parameters<typeof teamRulesStore.updateRule>[3]) {
    return await this.mainDo.teamOp((db) =>
      teamRulesStore.updateRule(db, this.userId, ruleId, patch),
    );
  }

  async setTeamRuleEnabled(ruleId: string, enabled: boolean, confirmAclExpansion?: boolean) {
    return await this.mainDo.teamOp((db) =>
      teamRulesStore.setRuleEnabled(db, this.userId, ruleId, enabled, confirmAclExpansion),
    );
  }

  async deleteTeamRule(ruleId: string) {
    return await this.mainDo.teamOp((db) => teamRulesStore.deleteRule(db, this.userId, ruleId));
  }

  async listTeamRuleRuns(
    teamId: string,
    options: { ruleId?: string; teamThreadId?: string; limit?: number },
  ) {
    return await this.mainDo.teamOp((db) =>
      teamRulesStore.listRuleRuns(db, this.userId, teamId, options),
    );
  }

  async previewTeamRule(
    teamId: string,
    input: Parameters<typeof teamRulesStore.previewRule>[3],
    candidates: Parameters<typeof teamRulesStore.previewRule>[4],
  ) {
    return await this.mainDo.teamOp((db) =>
      teamRulesStore.previewRule(db, this.userId, teamId, input, candidates),
    );
  }

  // --- SLA + opérations (P14 SLA / P16) ------------------------------------
  async getTeamSlaPolicy(teamId: string) {
    return await this.mainDo.teamOp((db) => teamOpsStore.getSlaPolicy(db, this.userId, teamId));
  }

  async setTeamSlaPolicy(teamId: string, input: teamOpsStore.SlaPolicyInput) {
    return await this.mainDo.teamOp((db) =>
      teamOpsStore.setSlaPolicy(db, this.userId, teamId, input),
    );
  }

  async listTeamAbsences(teamId: string) {
    return await this.mainDo.teamOp((db) => teamOpsStore.listAbsences(db, this.userId, teamId));
  }

  async declareTeamAbsence(
    teamId: string,
    input: Parameters<typeof teamOpsStore.declareAbsence>[3],
  ) {
    return await this.mainDo.teamOp((db) =>
      teamOpsStore.declareAbsence(db, this.userId, teamId, input),
    );
  }

  async removeTeamAbsence(absenceId: string) {
    return await this.mainDo.teamOp((db) => teamOpsStore.removeAbsence(db, this.userId, absenceId));
  }

  // --- brouillons collaboratifs (P15) --------------------------------------
  private async draftEffects() {
    // server-utils hors du graphe statique de la façade DO — import dynamique
    // comme pour les effets de règles.
    const { draftReadEffects } = await import('../lib/teams/team-drafts-runner');
    return draftReadEffects();
  }

  async requestTeamDraftReview(input: {
    teamThreadId: string;
    draftId: string;
    reviewerUserId: string;
  }) {
    const effects = await this.draftEffects();
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.requestReview(db, effects, this.userId, input),
    );
  }

  async getTeamThreadDraftReview(teamThreadId: string) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.getReviewForThread(db, this.userId, teamThreadId),
    );
  }

  async readTeamReviewDraft(reviewId: string) {
    const effects = await this.draftEffects();
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.readReviewDraft(db, effects, this.userId, reviewId),
    );
  }

  async suggestTeamDraftEdit(
    reviewId: string,
    input: { bodyText: string; note?: string; baseDigest: string },
  ) {
    const effects = await this.draftEffects();
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.suggestEdit(db, effects, this.userId, reviewId, input),
    );
  }

  async setTeamDraftReviewDecision(
    reviewId: string,
    input: { decision: 'approved' | 'changes_requested'; baseDigest: string },
  ) {
    const effects = await this.draftEffects();
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.setReviewDecision(db, effects, this.userId, reviewId, input),
    );
  }

  async rebaseTeamDraftReview(reviewId: string) {
    const effects = await this.draftEffects();
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.rebaseReview(db, effects, this.userId, reviewId),
    );
  }

  async markTeamDraftSuggestionApplied(suggestionId: string) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.markSuggestionApplied(db, this.userId, suggestionId),
    );
  }

  async cancelTeamDraftReview(reviewId: string) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.cancelReview(db, this.userId, reviewId),
    );
  }

  async markTeamThreadReviewsCompleted(teamThreadId: string) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.markThreadReviewsCompleted(db, this.userId, teamThreadId),
    );
  }

  async claimTeamReply(input: {
    teamThreadId: string;
    clientSubmissionKey: string;
    reviewId?: string | null;
  }) {
    return await this.mainDo.teamOp((db) => teamDraftsStore.claimTeamReply(db, this.userId, input));
  }

  async resolveTeamReplyClaim(claimId: string, outcome: 'accepted' | 'released') {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.resolveTeamReplyClaim(db, claimId, outcome),
    );
  }

  async createTeamReplyIntent(teamThreadId: string) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.createReplyIntent(db, this.userId, teamThreadId),
    );
  }

  async getValidTeamReplyIntent(input: {
    intentId: string;
    teamThreadId: string;
    providerThreadId: string;
  }) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.getValidReplyIntent(db, this.userId, input),
    );
  }

  async markTeamReplyIntentCollision(intentId: string) {
    return await this.mainDo.teamOp((db) => teamDraftsStore.markIntentCollision(db, intentId));
  }

  async consumeTeamReplyIntentOverride(intentId: string) {
    return await this.mainDo.teamOp((db) => teamDraftsStore.consumeIntentOverride(db, intentId));
  }

  async findOwnTeamReplyClaim(teamThreadId: string, clientSubmissionKey: string) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.findOwnReplyClaim(db, this.userId, teamThreadId, clientSubmissionKey),
    );
  }

  async teamSendCollisionPreflight(input: {
    teamThreadId: string;
    baselineMs: number;
    threadMessages: Array<{ senderEmail: string; receivedOnMs: number | null }>;
    myEmails: string[];
  }) {
    return await this.mainDo.teamOp((db) =>
      teamDraftsStore.sendCollisionPreflight(db, this.userId, input),
    );
  }

  async getTeamOpsOverview(teamId: string, options: { windowDays: number }) {
    return await this.mainDo.teamOp((db) =>
      teamOpsStore.getOpsOverview(db, this.userId, teamId, options),
    );
  }

  // --- P17 : gouvernance (export d'audit signé, rétention, export/restauration)

  async buildTeamAuditExport(teamId: string, options: { from?: Date; to?: Date }) {
    return await this.mainDo.teamOp((db) =>
      teamGovernanceStore.buildAuditExportPayload(db, this.userId, teamId, options),
    );
  }

  async getTeamRetentionPolicy(teamId: string) {
    return await this.mainDo.teamOp((db) =>
      teamGovernanceStore.getRetentionPolicy(db, this.userId, teamId),
    );
  }

  async setTeamRetentionPolicy(
    teamId: string,
    input: {
      auditDays: number | null;
      ruleRunDays: number | null;
      notificationDays: number | null;
    },
  ) {
    return await this.mainDo.teamOp((db) =>
      teamGovernanceStore.setRetentionPolicy(db, this.userId, teamId, input),
    );
  }

  async exportTeamData(teamId: string) {
    return await this.mainDo.teamOp((db) =>
      teamGovernanceStore.exportTeamData(db, this.userId, teamId),
    );
  }

  async restoreTeamData(payload: Parameters<typeof teamGovernanceStore.restoreTeamData>[2]) {
    return await this.mainDo.teamOp((db) =>
      teamGovernanceStore.restoreTeamData(db, this.userId, payload),
    );
  }

  // --- P18 : intégrations (Linear, email-first) ------------------------------
  // La configuration (env + ring KEK) est lue ICI, jamais côté client ; les
  // secrets scellés ne quittent jamais le serveur. Absente → fail closed avec
  // des drapeaux explicites pour l'UI owner.

  private async integrationRuntime() {
    const { env } = await import('../env');
    const { isIntegrationVaultConfigured } = await import('../lib/integrations/vault');
    const kekRing = {
      RETA_BYOK_KEK_V1: env.RETA_BYOK_KEK_V1,
      RETA_BYOK_KEK_V2: env.RETA_BYOK_KEK_V2,
      RETA_BYOK_KEK_ACTIVE: env.RETA_BYOK_KEK_ACTIVE,
    };
    return {
      kekRing,
      clientId: env.LINEAR_CLIENT_ID,
      clientSecret: env.LINEAR_CLIENT_SECRET,
      redirectUri: `${env.VITE_PUBLIC_APP_URL}/integrations/linear/callback`,
      flags: {
        vaultConfigured: isIntegrationVaultConfigured(kekRing),
        oauthConfigured: !!(env.LINEAR_CLIENT_ID && env.LINEAR_CLIENT_SECRET),
      },
    };
  }

  async getTeamIntegrationOverview(teamId: string) {
    const runtime = await this.integrationRuntime();
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.getIntegrationOverview(db, this.userId, teamId, runtime.flags),
    );
  }

  async beginTeamLinearInstall(teamId: string, reconnectConfirm?: boolean) {
    const runtime = await this.integrationRuntime();
    if (!runtime.flags.oauthConfigured) {
      throw new teamStore.TeamStoreError('integration_not_configured');
    }
    const { sealIntegrationSecret } = await import('../lib/integrations/vault');
    const { buildAuthorizeUrl, generatePkcePair, hashOauthState } = await import(
      '../lib/integrations/linear-oauth'
    );
    const { OAUTH_STATE_TTL_MS } = await import('../lib/teams/team-integrations-shared');
    const { verifier, challenge } = await generatePkcePair();
    // Seul le HASH du state est persisté ; le state brut ne vit que dans
    // l'URL d'autorisation renvoyée à l'owner.
    const state = crypto.randomUUID();
    const stateHash = await hashOauthState(state);
    const pkceVerifierEnvelope = await sealIntegrationSecret(
      runtime.kekRing,
      { teamId, purpose: 'linear:pkce', recordId: `pkce:${teamId}` },
      verifier,
    );
    await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.beginLinearInstall(db, this.userId, teamId, {
        stateHash,
        stateExpiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        pkceVerifierEnvelope,
        reconnectConfirm,
      }),
    );
    return {
      authorizeUrl: buildAuthorizeUrl({
        clientId: runtime.clientId!,
        redirectUri: runtime.redirectUri,
        state,
        codeChallenge: challenge,
      }),
    };
  }

  async completeTeamLinearInstall(input: { state: string; code: string }) {
    const runtime = await this.integrationRuntime();
    const { completeLinearOAuth } = await import('../lib/integrations/linear-runtime');
    return await this.mainDo.teamOp((db) =>
      completeLinearOAuth(
        db,
        {
          kekRing: runtime.kekRing,
          clientId: runtime.clientId,
          clientSecret: runtime.clientSecret,
          redirectUri: runtime.redirectUri,
        },
        { userId: this.userId, state: input.state, code: input.code },
      ),
    );
  }

  async revokeTeamLinearInstall(teamId: string) {
    const runtime = await this.integrationRuntime();
    const { revokeLinearInstallFully } = await import('../lib/integrations/linear-runtime');
    const { revokeLinearToken } = await import('../lib/integrations/linear-oauth');
    return await this.mainDo.teamOp((db) =>
      revokeLinearInstallFully(db, runtime, this.userId, teamId, (accessToken) =>
        revokeLinearToken({ fetchImpl: fetch, accessToken }),
      ),
    );
  }

  async setTeamIntegrationMapping(
    teamId: string,
    input: {
      kind: 'team' | 'status' | 'assignee';
      retaValue: string;
      externalId: string;
      externalLabel?: string;
    },
  ) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.setMapping(db, this.userId, teamId, input),
    );
  }

  /** Listes de configuration (owner) — lues via l'API Linear, jamais en QA. */
  async listTeamLinearTargets(teamId: string, linearTeamId?: string) {
    const runtime = await this.integrationRuntime();
    const { getLinearClientForInstall } = await import('../lib/integrations/linear-runtime');
    return await this.mainDo.teamOp(async (db) => {
      const overview = await teamIntegrationsStore.getIntegrationOverview(
        db,
        this.userId,
        teamId,
        runtime.flags,
      );
      if (!overview.isOwner) throw new teamStore.TeamStoreError('forbidden');
      if (!overview.install || overview.install.status !== 'active') {
        throw new teamStore.TeamStoreError('integration_not_installed');
      }
      const client = await getLinearClientForInstall(db, runtime, {
        id: overview.install.id,
        teamId,
      });
      const [teams, users] = await Promise.all([client.listTeams(), client.listUsers()]);
      const states = linearTeamId ? await client.listWorkflowStates(linearTeamId) : null;
      return { teams, users, states };
    });
  }

  async listTeamThreadIntegration(teamThreadId: string) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.listThreadIntegration(db, this.userId, teamThreadId),
    );
  }

  async addTeamExternalLink(
    teamThreadId: string,
    input: { kind: 'crm' | 'customer' | 'other'; label: string; url: string },
  ) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.addExternalLink(db, this.userId, teamThreadId, input),
    );
  }

  async removeTeamExternalLink(linkId: string) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.removeExternalLink(db, this.userId, linkId),
    );
  }

  async unlinkTeamIssue(linkId: string) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.unlinkIssue(db, this.userId, linkId),
    );
  }

  async previewTeamLinearIssue(input: {
    teamThreadId: string;
    clientRequestKey: string;
    linearTeamId: string;
    stateId?: string | null;
    assigneeUserId?: string | null;
    title?: string | null;
    note?: string | null;
  }) {
    const { env } = await import('../env');
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.previewIssue(db, this.userId, input, {
        appOrigin: env.VITE_PUBLIC_APP_URL,
      }),
    );
  }

  async confirmTeamLinearIssue(input: {
    previewId: string;
    clientRequestKey: string;
    digest: string;
  }) {
    const runtime = await this.integrationRuntime();
    const { getLinearClientForInstall } = await import('../lib/integrations/linear-runtime');
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.confirmIssue(
        db,
        (install) => getLinearClientForInstall(db, runtime, install),
        this.userId,
        input,
      ),
    );
  }

  async acceptTeamIssueLink(input: { teamThreadId: string; identifier: string }) {
    const runtime = await this.integrationRuntime();
    const { getLinearClientForInstall } = await import('../lib/integrations/linear-runtime');
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.acceptIssueLink(
        db,
        (install) => getLinearClientForInstall(db, runtime, install),
        this.userId,
        input,
      ),
    );
  }

  async listTeamOutboundWebhooks(teamId: string) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.listOutboundWebhooks(db, this.userId, teamId),
    );
  }

  async createTeamOutboundWebhook(
    teamId: string,
    input: {
      url: string;
      events: Array<'thread.assigned' | 'thread.comment' | 'thread.status'>;
      secret: string;
    },
  ) {
    const runtime = await this.integrationRuntime();
    const { sealIntegrationSecret } = await import('../lib/integrations/vault');
    const { dohResolver } = await import('../lib/integrations/outbound-security');
    const id = crypto.randomUUID();
    // Scellé sur l'id du webhook (AAD) — le secret en clair meurt ici.
    const secretEnvelope = await sealIntegrationSecret(
      runtime.kekRing,
      { teamId, purpose: 'outbound:secret', recordId: id },
      input.secret,
    );
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.createOutboundWebhook(
        db,
        this.userId,
        teamId,
        {
          id,
          url: input.url,
          events: input.events,
          secretEnvelope,
        },
        // Garde SSRF COMPLÈTE dès l'enregistrement (DoH).
        dohResolver(fetch),
      ),
    );
  }

  async setTeamOutboundWebhookActive(teamId: string, webhookId: string, active: boolean) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.setOutboundWebhookActive(db, this.userId, teamId, webhookId, active),
    );
  }

  async listTeamOutboundDeliveries(
    teamId: string,
    webhookId: string,
    options?: { status?: 'pending' | 'sending' | 'delivered' | 'dead' },
  ) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.listOutboundDeliveries(db, this.userId, teamId, webhookId, options),
    );
  }

  async retryTeamDeadOutbound(teamId: string, webhookId: string) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.retryDeadOutbound(db, this.userId, teamId, webhookId),
    );
  }

  async exportTeamActivity(teamId: string, input: { cursor?: string | null; limit?: number }) {
    return await this.mainDo.teamOp((db) =>
      teamIntegrationsStore.exportTeamActivity(db, this.userId, teamId, input),
    );
  }

  async undoTeamRuleRun(runId: string) {
    return await this.mainDo.teamOp(async (db) => {
      // Effets boîte (KV snooze, labels) chargés dynamiquement — server-utils
      // reste hors du graphe d'import statique de la façade DO.
      const { ruleMailboxEffects } = await import('../lib/teams/team-rules-runner');
      return teamRulesStore.undoRuleRun(db, ruleMailboxEffects(), this.userId, runId);
    });
  }

  async setTeamOnboardingDismissed(teamId: string, dismissed: boolean) {
    return await this.mainDo.teamOp((db) =>
      teamOnboarding.setOnboardingDismissed(db, this.userId, teamId, dismissed),
    );
  }

  async createTeamLabel(teamId: string, name: string, color: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.createLabel(db, this.userId, teamId, name, color),
    );
  }

  async deleteTeamLabel(labelId: string) {
    return await this.mainDo.teamOp((db) => teamStore.deleteLabel(db, this.userId, labelId));
  }

  async listTeamLabels(teamId: string) {
    return await this.mainDo.teamOp((db) => teamStore.listLabels(db, this.userId, teamId));
  }

  async setTeamThreadLabels(teamThreadId: string, labelIds: string[]) {
    return await this.mainDo.teamOp((db) =>
      teamStore.setThreadLabels(db, this.userId, teamThreadId, labelIds),
    );
  }

  async toggleTeamCommentReaction(commentId: string, emoji: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.toggleReaction(db, this.userId, commentId, emoji),
    );
  }

  async listMyTeamNotifications(options: { unreadOnly?: boolean; limit?: number }) {
    return await this.mainDo.teamOp((db) =>
      teamStore.listMyNotifications(db, this.userId, options),
    );
  }

  async countMyUnreadTeamNotifications() {
    return await this.mainDo.teamOp((db) => teamStore.countMyUnreadNotifications(db, this.userId));
  }

  async markTeamNotificationsRead(ids: string[] | 'all') {
    return await this.mainDo.teamOp((db) => teamStore.markNotificationsRead(db, this.userId, ids));
  }

  async listTeamAudit(teamId: string, limit?: number) {
    return await this.mainDo.teamOp((db) =>
      teamStore.listTeamAudit(db, this.userId, teamId, limit),
    );
  }

  async heartbeatTeamThreadPresence(teamThreadId: string, typing: boolean, replying = false) {
    return await this.mainDo.teamOp((db) =>
      teamStore.heartbeatPresence(db, this.userId, teamThreadId, typing, replying),
    );
  }

  async listTeamThreadPresence(teamThreadId: string) {
    return await this.mainDo.teamOp((db) => teamStore.listPresence(db, this.userId, teamThreadId));
  }

  async unshareTeamThread(teamThreadId: string) {
    return await this.mainDo.teamOp((db) => teamStore.unshareThread(db, this.userId, teamThreadId));
  }

  async listTeamThreads(teamId: string, filter: teamStore.TeamThreadListFilter) {
    return await this.mainDo.teamOp((db) =>
      teamStore.listTeamThreads(db, this.userId, teamId, filter),
    );
  }

  async listTeamSharesForThread(threadId: string, connectionEmail: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.listSharesForThread(db, this.userId, threadId, connectionEmail),
    );
  }

  async getTeamThread(teamThreadId: string) {
    return await this.mainDo.teamOp((db) => teamStore.getTeamThread(db, this.userId, teamThreadId));
  }

  async setTeamThreadStatus(teamThreadId: string, status: teamStore.TeamThreadStatus) {
    return await this.mainDo.teamOp((db) =>
      teamStore.setThreadStatus(db, this.userId, teamThreadId, status),
    );
  }

  async setTeamThreadAssignee(teamThreadId: string, assigneeUserId: string | null) {
    return await this.mainDo.teamOp((db) =>
      teamStore.setThreadAssignee(db, this.userId, teamThreadId, assigneeUserId),
    );
  }

  async addTeamThreadComment(
    teamThreadId: string,
    body: string,
    mentions: string[],
    quote: teamStore.CommentQuote | null,
  ) {
    return await this.mainDo.teamOp((db) =>
      teamStore.addComment(db, this.userId, teamThreadId, body, mentions, quote),
    );
  }

  async editTeamThreadComment(commentId: string, body: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.editComment(db, this.userId, commentId, body),
    );
  }

  async deleteTeamThreadComment(commentId: string) {
    return await this.mainDo.teamOp((db) => teamStore.deleteComment(db, this.userId, commentId));
  }

  async listTeamThreadComments(teamThreadId: string) {
    return await this.mainDo.teamOp((db) => teamStore.listComments(db, this.userId, teamThreadId));
  }

  async assignSharedThreadsBatch(params: {
    teamId: string;
    connectionEmail: string;
    assigneeUserId: string | null;
    threadIds: string[];
  }) {
    return await this.mainDo.teamOp((db) =>
      teamStore.assignSharedThreadsBatch(db, this.userId, params),
    );
  }

  async listMyCollabThreadSets(connectionEmail: string) {
    return await this.mainDo.teamOp((db) =>
      teamStore.listMyCollabThreadSets(db, this.userId, connectionEmail),
    );
  }

  async countMyAssignedOpenTeamThreads() {
    return await this.mainDo.teamOp((db) => teamStore.countMyAssignedOpenThreads(db, this.userId));
  }
}

export class ZeroDB extends DurableObject<ZeroEnv> {
  db: DB = createDb(this.env.HYPERDRIVE.connectionString).db;

  // Ask Reta durable rate limit (prod fix 2026-08-01): fixed, PII-free
  // storage key — this DO is DEDICATED to one user (idFromName(userId)), so
  // its own storage IS the per-user isolation.
  private static readonly ASK_RETA_RATE_KEY = 'reta:ask-rate:v1';
  private static readonly ASK_RETA_RATE_LIMIT = 20;
  private static readonly ASK_RETA_RATE_WINDOW_MS = 5 * 60 * 1000;

  /**
   * Exact 20-calls / 5-minute sliding window, persisted in ctx.storage and
   * consumed inside a storage TRANSACTION (concurrent requests serialize —
   * two racing calls each consume a distinct slot, never a lost update).
   * Expired timestamps are purged on every consume. Fallback path of
   * evaluateRateLimit when no remote Redis exists in production; Upstash
   * stays primary when configured.
   */
  async consumeAskRetaRateLimit(): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }> {
    return await this.ctx.storage.transaction(async (txn) => {
      const stored = (await txn.get<number[]>(ZeroDB.ASK_RETA_RATE_KEY)) ?? [];
      const result = consumeSlidingWindow(
        stored,
        Date.now(),
        ZeroDB.ASK_RETA_RATE_LIMIT,
        ZeroDB.ASK_RETA_RATE_WINDOW_MS,
      );
      await txn.put(ZeroDB.ASK_RETA_RATE_KEY, result.timestamps);
      return {
        allowed: result.allowed,
        limit: ZeroDB.ASK_RETA_RATE_LIMIT,
        remaining: result.remaining,
        reset: result.reset,
      };
    });
  }

  /**
   * Team collaboration ops run against the SHARED Postgres through this DO
   * (same Hyperdrive pool as every other query). The callback comes from the
   * local DbRpcDO façade only — functions cannot cross the RPC boundary, so
   * no external caller can reach this with arbitrary code.
   */
  async teamOp<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    return await fn(this.db);
  }

  // Ce DO est dédié à un utilisateur (idFromName(userId)) et toutes les écritures
  // user/connection transitent par lui : un cache mémoire local invalidé par ces
  // écritures est donc sûr. Il évite 2 à 3 requêtes Postgres séquentielles sur
  // chaque requête authentifiée.
  private activeConnectionCache: {
    userId: string;
    data: typeof connection.$inferSelect;
    expiresAt: number;
  } | null = null;
  // 10 min: every user/connection write transits through this DO and invalidates
  // the cache (resetConnection included, routed via updateConnection), so a long
  // TTL only expires on idle eviction.
  private static readonly ACTIVE_CONNECTION_TTL_MS = 600_000;

  private invalidateActiveConnectionCache() {
    this.activeConnectionCache = null;
  }

  async setMetaData(userId: string) {
    return new DbRpcDO(this, userId);
  }

  /**
   * Connexion active (défaut de l'utilisateur, sinon première) en UN SEUL RPC.
   * Remplace la cascade setMetaData → findUser → findUserConnection du chemin chaud.
   */
  async getActiveConnection(userId: string): Promise<typeof connection.$inferSelect | undefined> {
    const cached = this.activeConnectionCache;
    if (cached && cached.userId === userId && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const userData = await this.findUser(userId);
    let active = userData?.defaultConnectionId
      ? await this.findUserConnection(userId, userData.defaultConnectionId)
      : undefined;
    if (!active) active = await this.findFirstConnection(userId);

    if (active) {
      this.activeConnectionCache = {
        userId,
        data: active,
        expiresAt: Date.now() + ZeroDB.ACTIVE_CONNECTION_TTL_MS,
      };
    }
    return active;
  }

  async findUser(userId: string): Promise<typeof user.$inferSelect | undefined> {
    return await this.db.query.user.findFirst({
      where: eq(user.id, userId),
    });
  }

  async findUserConnection(
    userId: string,
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.db.query.connection.findFirst({
      where: and(eq(connection.userId, userId), eq(connection.id, connectionId)),
    });
  }

  async updateUser(userId: string, data: Partial<typeof user.$inferInsert>) {
    this.invalidateActiveConnectionCache();
    return await this.db.update(user).set(data).where(eq(user.id, userId));
  }

  async deleteConnection(connectionId: string, userId: string) {
    this.invalidateActiveConnectionCache();
    const connections = await this.findManyConnections(userId);
    if (connections.length <= 1) {
      throw new Error('Cannot delete the last connection. At least one connection is required.');
    }
    return await this.db
      .delete(connection)
      .where(and(eq(connection.id, connectionId), eq(connection.userId, userId)));
  }

  async findFirstConnection(userId: string): Promise<typeof connection.$inferSelect | undefined> {
    return await this.db.query.connection.findFirst({
      where: eq(connection.userId, userId),
    });
  }

  async findManyConnections(userId: string): Promise<(typeof connection.$inferSelect)[]> {
    return await this.db.query.connection.findMany({
      where: eq(connection.userId, userId),
    });
  }

  async findManyNotesByThreadId(
    userId: string,
    threadId: string,
  ): Promise<(typeof note.$inferSelect)[]> {
    return await this.db.query.note.findMany({
      where: and(eq(note.userId, userId), eq(note.threadId, threadId)),
      orderBy: [desc(note.isPinned), asc(note.order), desc(note.createdAt)],
    });
  }

  async createNote(userId: string, payload: typeof note.$inferInsert) {
    return await this.db
      .insert(note)
      .values({
        ...payload,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  async updateNote(
    userId: string,
    noteId: string,
    payload: Partial<typeof note.$inferInsert>,
  ): Promise<typeof note.$inferSelect | undefined> {
    const [updated] = await this.db
      .update(note)
      .set({
        ...payload,
        updatedAt: new Date(),
      })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)))
      .returning();
    return updated;
  }

  async updateManyNotes(
    userId: string,
    notes: { id: string; order: number; isPinned?: boolean | null }[],
  ): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      for (const n of notes) {
        const updateData: Record<string, unknown> = {
          order: n.order,
          updatedAt: new Date(),
        };

        if (n.isPinned !== undefined) {
          updateData.isPinned = n.isPinned;
        }
        await tx
          .update(note)
          .set(updateData)
          .where(and(eq(note.id, n.id), eq(note.userId, userId)));
      }
      return true;
    });
  }

  async findManyNotesByIds(
    userId: string,
    noteIds: string[],
  ): Promise<(typeof note.$inferSelect)[]> {
    return await this.db.query.note.findMany({
      where: and(eq(note.userId, userId), inArray(note.id, noteIds)),
    });
  }

  async deleteNote(userId: string, noteId: string) {
    return await this.db.delete(note).where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }

  async findNoteById(
    userId: string,
    noteId: string,
  ): Promise<typeof note.$inferSelect | undefined> {
    return await this.db.query.note.findFirst({
      where: and(eq(note.id, noteId), eq(note.userId, userId)),
    });
  }

  async findHighestNoteOrder(userId: string): Promise<{ order: number } | undefined> {
    return await this.db.query.note.findFirst({
      where: eq(note.userId, userId),
      orderBy: desc(note.order),
      columns: { order: true },
    });
  }

  async deleteUser(userId: string) {
    this.invalidateActiveConnectionCache();
    return await this.db.transaction(async (tx) => {
      await tx.delete(connection).where(eq(connection.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(userSettings).where(eq(userSettings.userId, userId));
      await tx.delete(user).where(eq(user.id, userId));
      await tx.delete(userHotkeys).where(eq(userHotkeys.userId, userId));
    });
  }

  async findUserSettings(userId: string): Promise<typeof userSettings.$inferSelect | undefined> {
    return await this.db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });
  }

  async findUserHotkeys(userId: string): Promise<(typeof userHotkeys.$inferSelect)[]> {
    return await this.db.query.userHotkeys.findMany({
      where: eq(userHotkeys.userId, userId),
    });
  }

  async insertUserHotkeys(userId: string, shortcuts: (typeof userHotkeys.$inferInsert)[]) {
    return await this.db
      .insert(userHotkeys)
      .values({
        userId,
        shortcuts,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userHotkeys.userId,
        set: {
          shortcuts,
          updatedAt: new Date(),
        },
      });
  }

  async insertUserSettings(userId: string, settings: typeof defaultUserSettings) {
    return await this.db.insert(userSettings).values({
      id: crypto.randomUUID(),
      userId,
      settings,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateUserSettings(userId: string, settings: typeof defaultUserSettings) {
    return await this.db
      .insert(userSettings)
      .values({
        id: crypto.randomUUID(),
        userId,
        settings,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          settings,
          updatedAt: new Date(),
        },
      });
  }

  // --- Ask Reta BYOK vault (slice 3A) --------------------------------------
  // The envelope is OPAQUE at this layer: no crypto, no plaintext, and every
  // query is bound to the caller-scoped userId (DbRpcDO). Envelope fields
  // never leave the tRPC layer — listRetaByokCredentialStatus is the only
  // read the routes expose and it carries provider + timestamps only.

  async findRetaByokCredential(
    userId: string,
    provider: string,
  ): Promise<typeof retaByokCredential.$inferSelect | undefined> {
    return await this.db.query.retaByokCredential.findFirst({
      where: and(eq(retaByokCredential.userId, userId), eq(retaByokCredential.provider, provider)),
    });
  }

  /**
   * Status only — NEVER envelope fields (no ciphertext/iv/wrappedDek/...).
   * consentVersion and kekVersion are part of the status because BOTH gate
   * usability: an older consent needs re-consent, and a KEK version the
   * deployment ring cannot open makes the credential unusable. These fields
   * are consumed SERVER-SIDE (route computes plain booleans) — neither ever
   * crosses the tRPC boundary.
   */
  async listRetaByokCredentialStatus(
    userId: string,
  ): Promise<{ provider: string; consentVersion: string; kekVersion: string; updatedAt: Date }[]> {
    return await this.db.query.retaByokCredential.findMany({
      where: eq(retaByokCredential.userId, userId),
      columns: { provider: true, consentVersion: true, kekVersion: true, updatedAt: true },
    });
  }

  /**
   * Drizzle binding of the transactional vault core (release-fix 3A):
   * credential row first (FOR UPDATE / DELETE), then settings (FOR UPDATE) —
   * the fixed lock order that serializes select vs delete.
   */
  private vaultTxStore(
    tx: Parameters<Parameters<DB['transaction']>[0]>[0],
    userId: string,
  ): VaultTxStore {
    return {
      lockCredential: async (provider) => {
        const rows = await tx
          .select({
            id: retaByokCredential.id,
            provider: retaByokCredential.provider,
            kekVersion: retaByokCredential.kekVersion,
            consentVersion: retaByokCredential.consentVersion,
          })
          .from(retaByokCredential)
          .where(
            and(eq(retaByokCredential.userId, userId), eq(retaByokCredential.provider, provider)),
          )
          .for('update');
        return rows[0] ?? null;
      },
      deleteCredential: async (provider) => {
        await tx
          .delete(retaByokCredential)
          .where(
            and(eq(retaByokCredential.userId, userId), eq(retaByokCredential.provider, provider)),
          );
      },
      lockSettings: async () => {
        const rows = await tx
          .select({ settings: userSettings.settings })
          .from(userSettings)
          .where(eq(userSettings.userId, userId))
          .for('update');
        return rows[0] ?? null;
      },
      writeSettings: async (settings) => {
        await tx
          .insert(userSettings)
          .values({
            id: crypto.randomUUID(),
            userId,
            settings,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: { settings, updatedAt: new Date() },
          });
      },
    };
  }

  /**
   * Eligibility + selection in ONE transaction (TOCTOU fix): the credential
   * is checked (existence + CURRENT consent + openable KEK version) under a
   * row lock, and the settings write happens in the same transaction — a
   * concurrent delete can never leave an orphan BYOK selection.
   */
  async selectRetaModel(
    userId: string,
    params: SelectRetaModelParams,
  ): Promise<SelectRetaModelResult> {
    return await this.db.transaction(async (tx) =>
      selectRetaModelTx(this.vaultTxStore(tx, userId), params),
    );
  }

  /**
   * CAS persistence of a lazy KEK rewrap: only wrappedDek/wrapIv/kekVersion
   * move (ciphertext + iv are IMMUTABLE here), and only if the row still
   * carries the expected old version — a concurrent rewrap loses the CAS
   * harmlessly (the caller reloads). Returns whether the row was updated.
   */
  async rewrapRetaByokCredential(
    userId: string,
    provider: string,
    params: {
      id: string;
      expectedKekVersion: string;
      wrappedDek: string;
      wrapIv: string;
      kekVersion: string;
    },
  ): Promise<boolean> {
    const updated = await this.db
      .update(retaByokCredential)
      .set({
        wrappedDek: params.wrappedDek,
        wrapIv: params.wrapIv,
        kekVersion: params.kekVersion,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(retaByokCredential.id, params.id),
          eq(retaByokCredential.userId, userId),
          eq(retaByokCredential.provider, provider),
          eq(retaByokCredential.kekVersion, params.expectedKekVersion),
        ),
      )
      .returning({ id: retaByokCredential.id });
    return updated.length > 0;
  }

  /**
   * Set/rotate in ONE transaction: the whole envelope is REPLACED (old row
   * deleted, new row inserted with its fresh id — the AAD is bound to that
   * id, so a half-written mix of old and new envelope cannot exist).
   */
  async replaceRetaByokCredential(
    userId: string,
    data: {
      id: string;
      provider: string;
      ciphertext: string;
      iv: string;
      wrappedDek: string;
      wrapIv: string;
      kekVersion: string;
      consentVersion: string;
    },
  ) {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(retaByokCredential)
        .where(
          and(
            eq(retaByokCredential.userId, userId),
            eq(retaByokCredential.provider, data.provider),
          ),
        );
      await tx.insert(retaByokCredential).values({
        ...data,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  }

  /**
   * Delete + model reset in ONE transaction, SAME lock order as
   * selectRetaModel (credential row first, then settings): any interleaving
   * with a concurrent selection serializes into either a valid selection
   * later reset by the delete, or a delete observed by the select — never a
   * surviving orphan selection.
   */
  async deleteRetaByokCredentialAndResetModel(
    userId: string,
    provider: string,
    resetModelIds: string[],
    fallbackModelId: string,
  ) {
    await this.db.transaction(async (tx) =>
      deleteRetaCredentialTx(this.vaultTxStore(tx, userId), {
        provider,
        resetModelIds,
        fallbackModelId,
      }),
    );
  }

  async createConnection(
    providerId: EProviders,
    email: string,
    userId: string,
    updatingInfo: {
      expiresAt: Date;
      scope: string;
      authAccountId?: string;
    },
  ): Promise<{ id: string }[]> {
    this.invalidateActiveConnectionCache();
    return await this.db
      .insert(connection)
      .values({
        ...updatingInfo,
        providerId,
        id: crypto.randomUUID(),
        email,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [connection.email, connection.userId],
        set: {
          ...updatingInfo,
          updatedAt: new Date(),
        },
      })
      .returning({ id: connection.id });
  }

  /**
   * @param connectionId Dangerous, use findUserConnection instead
   * @returns
   */
  async findConnectionById(
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.db.query.connection.findFirst({
      where: eq(connection.id, connectionId),
    });
  }

  async syncUserMatrix(connectionId: string, emailStyleMatrix: EmailMatrix) {
    await this.db.transaction(async (tx) => {
      const [existingMatrix] = await tx
        .select({
          numMessages: writingStyleMatrix.numMessages,
          style: writingStyleMatrix.style,
        })
        .from(writingStyleMatrix)
        .where(eq(writingStyleMatrix.connectionId, connectionId));

      if (existingMatrix) {
        const newStyle = createUpdatedMatrixFromNewEmail(
          existingMatrix.numMessages,
          existingMatrix.style as WritingStyleMatrix,
          emailStyleMatrix,
        );

        await tx
          .update(writingStyleMatrix)
          .set({
            numMessages: existingMatrix.numMessages + 1,
            style: newStyle,
          })
          .where(eq(writingStyleMatrix.connectionId, connectionId));
      } else {
        const newStyle = initializeStyleMatrixFromEmail(emailStyleMatrix);

        await tx
          .insert(writingStyleMatrix)
          .values({
            connectionId,
            numMessages: 1,
            style: newStyle,
          })
          .onConflictDoNothing();
      }
    });
  }

  async findWritingStyleMatrix(
    connectionId: string,
  ): Promise<typeof writingStyleMatrix.$inferSelect | undefined> {
    return await this.db.query.writingStyleMatrix.findFirst({
      where: eq(writingStyleMatrix.connectionId, connectionId),
      columns: {
        numMessages: true,
        style: true,
        updatedAt: true,
        connectionId: true,
      },
    });
  }

  async deleteActiveConnection(userId: string, connectionId: string) {
    this.invalidateActiveConnectionCache();
    return await this.db
      .delete(connection)
      .where(and(eq(connection.userId, userId), eq(connection.id, connectionId)));
  }

  async updateConnection(
    connectionId: string,
    updatingInfo: Partial<typeof connection.$inferInsert>,
  ) {
    this.invalidateActiveConnectionCache();
    return await this.db
      .update(connection)
      .set(updatingInfo)
      .where(eq(connection.id, connectionId));
  }

  async findManyEmailTemplates(userId: string): Promise<(typeof emailTemplate.$inferSelect)[]> {
    return await this.db.query.emailTemplate.findMany({
      where: eq(emailTemplate.userId, userId),
      orderBy: desc(emailTemplate.updatedAt),
    });
  }

  async createEmailTemplate(
    userId: string,
    payload: Omit<typeof emailTemplate.$inferInsert, 'userId'>,
  ) {
    return await this.db
      .insert(emailTemplate)
      .values({
        ...payload,
        userId,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  async deleteEmailTemplate(userId: string, templateId: string) {
    return await this.db
      .delete(emailTemplate)
      .where(and(eq(emailTemplate.id, templateId), eq(emailTemplate.userId, userId)));
  }

  async updateEmailTemplate(
    userId: string,
    templateId: string,
    data: Partial<typeof emailTemplate.$inferInsert>,
  ) {
    return await this.db
      .update(emailTemplate)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(emailTemplate.id, templateId), eq(emailTemplate.userId, userId)))
      .returning();
  }
}
