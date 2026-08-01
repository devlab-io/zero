import {
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
