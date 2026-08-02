import {
  teamAuditLog,
  teamCommentReaction,
  teamDraftReview,
  teamDraftSuggestion,
  teamInvite,
  teamLabel,
  teamMember,
  teamNotification,
  teamIntegrationInstall,
  teamIntegrationMapping,
  teamIssueCreateRequest,
  integrationWebhookDelivery,
  teamOutboundDelivery,
  teamOutboundWebhook,
  teamReplyClaim,
  teamReplyIntent,
  teamThreadIssueLink,
  teamThread,
  teamThreadAccess,
  teamThreadComment,
  teamThreadLabel,
  teamThreadPresence,
} from './schema';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Contrat structurel du schéma collaboration (P0) : les colonnes qui portent
// les garanties produit — ACL révocable et VISIBLE, notifications lu/non-lu,
// audit, mentions/citations, présence — existent telles quelles, et la
// migration 0041 les crée réellement.

describe('team collaboration schema — structural contract', () => {
  it('team_thread_access porte une révocation EXPLICITE (revoked_at/revoked_by) et la source visible', () => {
    const columns = getTableConfig(teamThreadAccess).columns.map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'team_thread_id',
        'user_id',
        'source',
        'granted_by',
        'revoked_at',
        'revoked_by',
      ]),
    );
  });

  it('team_thread garde la connexion du partageur SERVEUR-only + visibilité + assignation unique + statut', () => {
    const columns = getTableConfig(teamThread).columns.map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'sharer_connection_id',
        'sharer_email',
        'visibility',
        'status',
        'assignee_user_id',
        'last_activity_at',
      ]),
    );
  });

  it('les commentaires portent mentions + citation structurée, jamais de HTML dédié', () => {
    const columns = getTableConfig(teamThreadComment).columns.map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['body', 'mentions', 'quote']));
    expect(columns).not.toContain('html');
  });

  it('notifications lu/non-lu (read_at) et préférences par membre (prefs)', () => {
    expect(getTableConfig(teamNotification).columns.map((c) => c.name)).toContain('read_at');
    expect(getTableConfig(teamMember).columns.map((c) => c.name)).toContain('prefs');
  });

  it('audit append-only et présence rattachée à un fil', () => {
    expect(getTableConfig(teamAuditLog).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['team_id', 'actor_user_id', 'action', 'subject_type', 'subject_id']),
    );
    expect(getTableConfig(teamThreadPresence).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['team_thread_id', 'user_id', 'last_seen_at', 'typing_until']),
    );
  });

  it('la migration 0041 crée toutes les tables collaboration', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('./migrations/0041_purple_mandroid.sql', import.meta.url).href),
      'utf8',
    );
    for (const table of [
      'mail0_team',
      'mail0_team_member',
      'mail0_team_invite',
      'mail0_team_thread',
      'mail0_team_thread_access',
      'mail0_team_thread_comment',
      'mail0_team_comment_reaction',
      'mail0_team_label',
      'mail0_team_thread_label',
      'mail0_team_notification',
      'mail0_team_audit_log',
      'mail0_team_thread_presence',
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).toContain('"revoked_at" timestamp');
    // Unicité d'idempotence du partage.
    expect(sql).toContain('team_thread_team_conn_thread_unique');
    // Une seule ligne d'accès par (fil, membre).
    expect(sql).toContain('team_thread_access_thread_user_unique');
  });

  it('les tables annexes existent (labels, réactions, invitations)', () => {
    expect(getTableConfig(teamLabel).columns.map((c) => c.name)).toContain('color');
    expect(getTableConfig(teamThreadLabel).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['team_thread_id', 'label_id']),
    );
    expect(getTableConfig(teamCommentReaction).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['comment_id', 'user_id', 'emoji']),
    );
    expect(getTableConfig(teamInvite).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['email', 'status', 'responded_at']),
    );
  });
});

describe('schéma 0045 — brouillons collaboratifs (P15)', () => {
  it('review : une seule ACTIVE par (fil, brouillon) via index unique PARTIEL ; revision + digest présents', () => {
    const config = getTableConfig(teamDraftReview);
    expect(config.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'team_thread_id',
        'draft_id',
        'owner_user_id',
        'reviewer_user_id',
        'state',
        'revision',
        'draft_digest',
      ]),
    );
    const unique = config.indexes.find(
      (index) => index.config.name === 'team_draft_review_active_unique',
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.where).toBeDefined();
  });

  it('claim : un seul ACTIF par fil via index unique partiel ; outcomes honnêtes', () => {
    const config = getTableConfig(teamReplyClaim);
    expect(config.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['team_thread_id', 'user_id', 'client_submission_key', 'outcome']),
    );
    const unique = config.indexes.find(
      (index) => index.config.name === 'team_reply_claim_active_unique',
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.where).toBeDefined();
  });

  it('suggestion bornée liée à sa review ; présence porte replying_until', () => {
    expect(getTableConfig(teamDraftSuggestion).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'review_id',
        'author_user_id',
        'body_text',
        'base_digest',
        'applied_at',
      ]),
    );
    expect(getTableConfig(teamThreadPresence).columns.map((c) => c.name)).toContain(
      'replying_until',
    );
  });

  it('reply intent : baseline SERVEUR (défaut now), expiration, collision et override one-shot en colonnes', () => {
    const config = getTableConfig(teamReplyIntent);
    const columns = config.columns.map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'team_thread_id',
        'user_id',
        'provider_thread_id',
        'baseline_at',
        'expires_at',
        'collision_detected_at',
        'override_consumed_at',
      ]),
    );
    // La baseline est émise par la BASE (default now()) — jamais par le client.
    const baseline = config.columns.find((c) => c.name === 'baseline_at');
    expect(baseline?.hasDefault).toBe(true);
    expect(baseline?.notNull).toBe(true);
    expect(config.columns.find((c) => c.name === 'expires_at')?.notNull).toBe(true);
    expect(
      config.indexes.some((index) => index.config.name === 'team_reply_intent_thread_user_idx'),
    ).toBe(true);
  });
});

describe('schéma 0046 — intégrations (P18)', () => {
  it('audit : actorUserId NULLABLE + actorKind défaut user — le schéma ne ment plus pour le système', () => {
    const config = getTableConfig(teamAuditLog);
    const actorUser = config.columns.find((c) => c.name === 'actor_user_id');
    expect(actorUser?.notNull).toBe(false);
    const actorKind = config.columns.find((c) => c.name === 'actor_kind');
    expect(actorKind?.notNull).toBe(true);
    expect(actorKind?.hasDefault).toBe(true);
  });

  it('install : UNE par (équipe, provider), enveloppes scellées en colonnes, index workspace pour la corrélation webhook', () => {
    const config = getTableConfig(teamIntegrationInstall);
    expect(config.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'workspace_id',
        'access_token_envelope',
        'refresh_token_envelope',
        'pkce_verifier_envelope',
        'access_token_expires_at',
        'revoked_at',
        'state_expires_at',
      ]),
    );
    // hardening-10 : installedBy NULLABLE (SET NULL) — la suppression du
    // compte installateur ne détruit pas l'installation ni ses tokens.
    expect(config.columns.find((c) => c.name === 'installed_by')?.notNull).toBe(false);
    const unique = config.indexes.find(
      (index) => index.config.name === 'team_integration_install_team_provider_unique',
    );
    expect(unique?.config.unique).toBe(true);
  });

  it('hardening-10 : colonnes preview/lease sur create_request, claimed_at sur l’outbox', () => {
    expect(getTableConfig(teamIssueCreateRequest).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['preview_digest', 'preview_expires_at', 'lease_expires_at']),
    );
    expect(getTableConfig(teamOutboundDelivery).columns.map((c) => c.name)).toContain('claimed_at');
  });

  it('mapping : slot unique (install, kind, retaValue) — les correspondances sont EXPLICITES', () => {
    const config = getTableConfig(teamIntegrationMapping);
    const unique = config.indexes.find(
      (index) => index.config.name === 'team_integration_mapping_slot_unique',
    );
    expect(unique?.config.unique).toBe(true);
  });

  it('issue link : un seul lien ACTIF par (fil, issue) via index unique PARTIEL ; unlink soft', () => {
    const config = getTableConfig(teamThreadIssueLink);
    const unique = config.indexes.find(
      (index) => index.config.name === 'team_thread_issue_link_active_unique',
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.where).toBeDefined();
    expect(config.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['unlinked_at', 'unlinked_by', 'issue_identifier', 'issue_url']),
    );
  });

  it('create request : idempotence par (install, clientRequestKey) unique', () => {
    const config = getTableConfig(teamIssueCreateRequest);
    const unique = config.indexes.find(
      (index) => index.config.name === 'team_issue_create_request_key_unique',
    );
    expect(unique?.config.unique).toBe(true);
  });

  it('webhook entrant : (provider, deliveryId) unique = barrière anti-replay atomique', () => {
    const config = getTableConfig(integrationWebhookDelivery);
    const unique = config.indexes.find(
      (index) => index.config.name === 'integration_webhook_delivery_unique',
    );
    expect(unique?.config.unique).toBe(true);
  });

  it('outbox sortante : secret scellé côté webhook, livraison avec attempts/nextAttemptAt indexés par échéance', () => {
    expect(getTableConfig(teamOutboundWebhook).columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['secret_envelope', 'events', 'active', 'consecutive_failures']),
    );
    const delivery = getTableConfig(teamOutboundDelivery);
    expect(delivery.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['attempts', 'next_attempt_at', 'status', 'last_error']),
    );
    expect(
      delivery.indexes.some((index) => index.config.name === 'team_outbound_delivery_due_idx'),
    ).toBe(true);
  });
});
