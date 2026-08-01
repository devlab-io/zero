import {
  pgTableCreator,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { defaultUserSettings } from '../lib/schemas';

export const createTable = pgTableCreator((name) => `mail0_${name}`);

export const user = createTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  defaultConnectionId: text('default_connection_id'),
  customPrompt: text('custom_prompt'),
  phoneNumber: text('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified'),
});

export const session = createTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('session_user_id_idx').on(t.userId),
    index('session_expires_at_idx').on(t.expiresAt),
  ],
);

export const account = createTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    index('account_user_id_idx').on(t.userId),
    index('account_provider_user_id_idx').on(t.providerId, t.userId),
    index('account_expires_at_idx').on(t.accessTokenExpiresAt),
  ],
);

export const userHotkeys = createTable(
  'user_hotkeys',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    shortcuts: jsonb('shortcuts').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [index('user_hotkeys_shortcuts_idx').on(t.shortcuts)],
);

export const verification = createTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('verification_identifier_idx').on(t.identifier),
    index('verification_expires_at_idx').on(t.expiresAt),
  ],
);

export const earlyAccess = createTable(
  'early_access',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    isEarlyAccess: boolean('is_early_access').notNull().default(false),
    hasUsedTicket: text('has_used_ticket').default(''),
  },
  (t) => [index('early_access_is_early_access_idx').on(t.isEarlyAccess)],
);

export const connection = createTable(
  'connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    picture: text('picture'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    scope: text('scope').notNull(),
    providerId: text('provider_id').$type<'google' | 'microsoft'>().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    unique().on(t.userId, t.email),
    index('connection_user_id_idx').on(t.userId),
    index('connection_expires_at_idx').on(t.expiresAt),
    index('connection_provider_id_idx').on(t.providerId),
  ],
);

export const summary = createTable(
  'summary',
  {
    messageId: text('message_id').primaryKey(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    saved: boolean('saved').notNull().default(false),
    tags: text('tags'),
    suggestedReply: text('suggested_reply'),
  },
  (t) => [
    index('summary_connection_id_idx').on(t.connectionId),
    index('summary_connection_id_saved_idx').on(t.connectionId, t.saved),
    index('summary_saved_idx').on(t.saved),
  ],
);

// Testing
export const note = createTable(
  'note',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    content: text('content').notNull(),
    color: text('color').notNull().default('default'),
    isPinned: boolean('is_pinned').default(false),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('note_user_id_idx').on(t.userId),
    index('note_thread_id_idx').on(t.threadId),
    index('note_user_thread_idx').on(t.userId, t.threadId),
    index('note_is_pinned_idx').on(t.isPinned),
  ],
);

export const userSettings = createTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(),
    settings: jsonb('settings')
      .$type<typeof defaultUserSettings>()
      .notNull()
      .default(defaultUserSettings),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [index('user_settings_settings_idx').on(t.settings)],
);

/**
 * Ask Reta BYOK vault (slice 3A, spec docs/spec/mail-copilot.md).
 * NO plaintext anywhere — and NO key hint of ANY kind: no suffix, no prefix,
 * no length (contract: nothing derivable about the key in DB or API). The
 * API key is envelope-encrypted (AES-GCM DEK, wrapped by the Worker-secret
 * KEK) — only ciphertext/iv/wrappedDek/wrapIv/kekVersion are stored.
 * One credential per (user, provider); cascades away with the user.
 */
export const retaByokCredential = createTable(
  'reta_byok_credential',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    wrappedDek: text('wrapped_dek').notNull(),
    wrapIv: text('wrap_iv').notNull(),
    kekVersion: text('kek_version').notNull(),
    consentVersion: text('consent_version').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('reta_byok_credential_user_provider_unique').on(t.userId, t.provider),
    index('reta_byok_credential_user_id_idx').on(t.userId),
  ],
);

export const writingStyleMatrix = createTable(
  'writing_style_matrix',
  {
    connectionId: text()
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    numMessages: integer().notNull(),
    // TODO: way too much pain to get this type to work,
    // revisit later
    style: jsonb().$type<unknown>().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return [
      primaryKey({
        columns: [table.connectionId],
      }),
      index('writing_style_matrix_style_idx').on(table.style),
    ];
  },
);

export const jwks = createTable(
  'jwks',
  {
    id: text('id').primaryKey(),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [index('jwks_created_at_idx').on(t.createdAt)],
);

export const oauthApplication = createTable(
  'oauth_application',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    icon: text('icon'),
    metadata: text('metadata'),
    clientId: text('client_id').unique(),
    clientSecret: text('client_secret'),
    // Better Auth 1.6 MCP dynamic registration looks up this exact field key.
    // Keep the legacy SQL column name to avoid a destructive data migration.
    redirectUrls: text('redirect_u_r_ls'),
    type: text('type'),
    disabled: boolean('disabled'),
    userId: text('user_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('oauth_application_user_id_idx').on(t.userId),
    index('oauth_application_disabled_idx').on(t.disabled),
  ],
);

export const oauthAccessToken = createTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    accessToken: text('access_token').unique(),
    refreshToken: text('refresh_token').unique(),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    clientId: text('client_id'),
    userId: text('user_id'),
    scopes: text('scopes'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('oauth_access_token_user_id_idx').on(t.userId),
    index('oauth_access_token_client_id_idx').on(t.clientId),
    index('oauth_access_token_expires_at_idx').on(t.accessTokenExpiresAt),
  ],
);

export const oauthConsent = createTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id'),
    userId: text('user_id'),
    scopes: text('scopes'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
    consentGiven: boolean('consent_given'),
  },
  (t) => [
    index('oauth_consent_user_id_idx').on(t.userId),
    index('oauth_consent_client_id_idx').on(t.clientId),
    index('oauth_consent_given_idx').on(t.consentGiven),
  ],
);

export const emailTemplate = createTable(
  'email_template',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body'),
    to: jsonb('to'),
    cc: jsonb('cc'),
    bcc: jsonb('bcc'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_mail0_email_template_user_id').on(t.userId),
    unique('mail0_email_template_user_id_name_unique').on(t.userId, t.name),
  ],
);

export const draftOutbox = createTable(
  'draft_outbox',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    threadId: text('thread_id'),
    mission: text('mission'),
    status: text('status')
      .$type<
        | 'queued'
        | 'generating'
        | 'draft_ready'
        | 'approved'
        | 'sending'
        | 'sent'
        | 'cancelled'
        | 'failed'
      >()
      .notNull()
      .default('queued'),
    gmailDraftId: text('gmail_draft_id'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    scheduledSendAt: timestamp('scheduled_send_at'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('mail0_draft_outbox_idempotency_key_unique').on(t.idempotencyKey),
    index('draft_outbox_connection_status_idx').on(t.connectionId, t.status),
    index('draft_outbox_scheduled_send_at_idx').on(t.scheduledSendAt),
  ],
);

/**
 * Collaboration d'équipe — EXCLUSIVEMENT centrée sur les fils email.
 * Une équipe regroupe des utilisateurs (pas des connexions) ; l'appartenance
 * est par userId pour survivre à l'ajout/retrait de connexions. Toute lecture
 * ou écriture collaborative passe par une vérification d'appartenance en SQL
 * (couche DO) — jamais par confiance dans un teamId fourni par le client.
 */
export const team = createTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('team_created_by_idx').on(t.createdBy)],
);

export type TeamNotificationPrefs = {
  onComment: boolean;
  onMention: boolean;
  onAssignment: boolean;
};

export const defaultTeamNotificationPrefs: TeamNotificationPrefs = {
  onComment: true,
  onMention: true,
  onAssignment: true,
};

export const teamMember = createTable(
  'team_member',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<'owner' | 'member'>().notNull().default('member'),
    prefs: jsonb('prefs')
      .$type<TeamNotificationPrefs>()
      .notNull()
      .default(defaultTeamNotificationPrefs),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index('team_member_user_id_idx').on(t.userId),
  ],
);

// L'invitation est liée à une ADRESSE email (normalisée lowercase) — elle est
// résolue vers un userId uniquement à l'acceptation, contre l'email de session.
export const teamInvite = createTable(
  'team_invite',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').$type<'owner' | 'member'>().notNull().default('member'),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status')
      .$type<'pending' | 'accepted' | 'declined' | 'revoked'>()
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    respondedAt: timestamp('responded_at'),
  },
  (t) => [
    index('team_invite_team_id_idx').on(t.teamId),
    index('team_invite_email_status_idx').on(t.email, t.status),
  ],
);

/**
 * Un fil partagé à l'équipe. Les métadonnées (sujet, participants, aperçu)
 * sont capturées CÔTÉ SERVEUR depuis la boîte du partageur au moment du
 * partage — jamais fournies par le client — et servent aux LISTES. La lecture
 * complète (messages, PJ) passe par le proxy borné readSharedThread /
 * readSharedAttachment : le serveur n'utilise sharerConnectionId qu'APRÈS
 * resolveAccess(teamThreadId, sessionUserId), sans jamais exposer de
 * credentials ni ouvrir le reste de la boîte du partageur. `visibility`
 * 'team' = toute l'équipe ; 'restricted' = lignes team_thread_access actives
 * uniquement (+ partageur et owners).
 */
export const teamThread = createTable(
  'team_thread',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    sharerUserId: text('sharer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sharerConnectionId: text('sharer_connection_id').notNull(),
    sharerEmail: text('sharer_email').notNull(),
    providerId: text('provider_id').notNull(),
    visibility: text('visibility').$type<'team' | 'restricted'>().notNull().default('team'),
    subject: text('subject').notNull(),
    preview: text('preview').notNull().default(''),
    participants: jsonb('participants')
      .$type<{ name?: string; email: string }[]>()
      .notNull()
      .default([]),
    messageCount: integer('message_count').notNull().default(0),
    latestReceivedOn: text('latest_received_on'),
    status: text('status').$type<'open' | 'closed'>().notNull().default('open'),
    assigneeUserId: text('assignee_user_id').references(() => user.id, { onDelete: 'set null' }),
    lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('team_thread_team_conn_thread_unique').on(t.teamId, t.sharerConnectionId, t.threadId),
    index('team_thread_team_activity_idx').on(t.teamId, t.lastActivityAt),
    index('team_thread_team_status_idx').on(t.teamId, t.status),
    index('team_thread_assignee_idx').on(t.assigneeUserId),
    index('team_thread_thread_id_idx').on(t.threadId),
  ],
);

/**
 * ACL granulaire et RÉVOCABLE d'un fil partagé en visibilité 'restricted'.
 * La révocation est explicite et auditable : la ligne est conservée avec
 * revokedAt/revokedBy (jamais supprimée), et l'élargissement d'accès par
 * mention est VISIBLE (source='mention' + notification + audit).
 */
export const teamThreadAccess = createTable(
  'team_thread_access',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').$type<'share' | 'mention' | 'manual'>().notNull(),
    grantedBy: text('granted_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    revokedAt: timestamp('revoked_at'),
    revokedBy: text('revoked_by'),
  },
  (t) => [
    unique('team_thread_access_thread_user_unique').on(t.teamThreadId, t.userId),
    index('team_thread_access_user_idx').on(t.userId),
  ],
);

// Commentaire interne d'équipe sur un fil partagé : texte BRUT borné (jamais
// de HTML — rendu en texte, zéro surface XSS), mentions = userIds validés
// membres au moment de l'écriture. `quote` est une citation STRUCTURÉE d'un
// message du fil, capturée côté serveur depuis la boîte du partageur (même
// autorisation que readSharedThread) — jamais du texte client libre.
export const teamThreadComment = createTable(
  'team_thread_comment',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    mentions: jsonb('mentions').$type<string[]>().notNull().default([]),
    quote: jsonb('quote').$type<{
      messageId: string;
      authorEmail: string;
      authorName?: string;
      receivedOn: string;
      text: string;
    } | null>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('team_thread_comment_thread_created_idx').on(t.teamThreadId, t.createdAt),
    index('team_thread_comment_author_idx').on(t.authorUserId),
  ],
);

// Réaction emoji sur un commentaire — une ligne par (commentaire, membre,
// emoji), l'emoji est contraint à une allowlist côté route.
export const teamCommentReaction = createTable(
  'team_comment_reaction',
  {
    commentId: text('comment_id')
      .notNull()
      .references(() => teamThreadComment.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })],
);

// Labels d'équipe (équipe/projet), appliqués aux fils partagés uniquement.
export const teamLabel = createTable(
  'team_label',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('default'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('team_label_team_name_unique').on(t.teamId, t.name),
    index('team_label_team_idx').on(t.teamId),
  ],
);

export const teamThreadLabel = createTable(
  'team_thread_label',
  {
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => teamLabel.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teamThreadId, t.labelId] }),
    index('team_thread_label_label_idx').on(t.labelId),
  ],
);

// Notification collaborative lu/non-lu, filtrée à l'écriture par les
// préférences du membre (team_member.prefs). readAt = null tant que non lue.
export const teamNotification = createTable(
  'team_notification',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    teamThreadId: text('team_thread_id').references(() => teamThread.id, { onDelete: 'cascade' }),
    commentId: text('comment_id').references(() => teamThreadComment.id, { onDelete: 'cascade' }),
    kind: text('kind')
      .$type<
        | 'mention'
        | 'comment'
        | 'assignment'
        | 'access_granted'
        | 'access_revoked'
        | 'status_changed'
      >()
      .notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    readAt: timestamp('read_at'),
  },
  (t) => [
    index('team_notification_user_read_idx').on(t.userId, t.readAt),
    index('team_notification_user_created_idx').on(t.userId, t.createdAt),
  ],
);

// Journal d'audit append-only des actions collaboratives (partage, ACL,
// membres, labels, statut, suppression de commentaire par un owner…).
export const teamAuditLog = createTable(
  'team_audit_log',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('team_audit_team_created_idx').on(t.teamId, t.createdAt)],
);

// Présence/typing par polling : heartbeat upsert, lecture filtrée sur
// lastSeenAt récent. Aucun canal détaché des fils email — la présence est
// TOUJOURS rattachée à un fil partagé.
export const teamThreadPresence = createTable(
  'team_thread_presence',
  {
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    typingUntil: timestamp('typing_until'),
  },
  (t) => [primaryKey({ columns: [t.teamThreadId, t.userId] })],
);

// Outbox d'envoi autoritatif : chaque mail.send devient une ligne send_job avant
// tout contact Gmail. La contrainte unique (connection_id, client_submission_key)
// est la barrière d'idempotence des doubles clics/retries client ; `payload` est
// nullifié une fois `sent` (rétention minimale), conservé sur `failed` pour retry.
export const sendJob = createTable(
  'send_job',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    clientSubmissionKey: text('client_submission_key').notNull(),
    status: text('status')
      .$type<'queued' | 'sending' | 'sent' | 'cancelled' | 'failed'>()
      .notNull()
      .default('queued'),
    payload: jsonb('payload'),
    threadId: text('thread_id'),
    scheduledSendAt: timestamp('scheduled_send_at'),
    enqueuedAt: timestamp('enqueued_at'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('mail0_send_job_connection_submission_unique').on(t.connectionId, t.clientSubmissionKey),
    index('send_job_connection_status_idx').on(t.connectionId, t.status),
    index('send_job_status_scheduled_idx').on(t.status, t.scheduledSendAt),
  ],
);
