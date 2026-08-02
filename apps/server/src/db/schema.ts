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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
// Types des règles d'équipe (P14) : module feuille SANS import — la frontière
// tRPC les référence directement, le schema ne fait que typer ses colonnes.
import type {
  TeamBusinessHours,
  TeamRuleAction,
  TeamRuleTriggers,
} from '../lib/teams/team-rules-shared';
import { defaultUserSettings } from '../lib/schemas';
import { sql } from 'drizzle-orm';

export type {
  TeamBusinessHours,
  TeamRuleAction,
  TeamRuleTriggers,
} from '../lib/teams/team-rules-shared';
// Types des intégrations (P18) : module feuille SANS import, même contrainte.
import type {
  ExternalLinkKind,
  IntegrationInstallStatus,
  IntegrationMappingKind,
  IntegrationProvider,
  IssueCreateRequestStatus,
  OutboundDeliveryStatus,
  OutboundEventType,
  SealedSecret,
  TeamAuditActorKind,
} from '../lib/teams/team-integrations-shared';

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
    /** Better Auth provider accountId used to select the exact calendar account. */
    authAccountId: text('auth_account_id'),
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
    index('connection_auth_account_idx').on(t.userId, t.providerId, t.authAccountId),
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

/**
 * Prefs jsonb du membre : préférences de notification + état d'onboarding
 * PAR (équipe, utilisateur). Élargir le type ne demande aucune migration —
 * la colonne reste le même jsonb, les lignes existantes n'ont simplement pas
 * la clé. Toute écriture des prefs doit FUSIONNER (jamais remplacer) pour ne
 * pas effacer l'état d'onboarding en réglant les notifications, et vice
 * versa.
 */
export type TeamMemberPrefs = TeamNotificationPrefs & {
  /** ISO — checklist d'onboarding masquée par ce membre pour cette équipe. */
  onboardingDismissedAt?: string | null;
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
    prefs: jsonb('prefs').$type<TeamMemberPrefs>().notNull().default(defaultTeamNotificationPrefs),
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
        | 'rule'
        | 'draft_review'
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
    // P18 durci : NULLABLE + ON DELETE SET NULL — un audit système/intégration
    // n'a AUCUN acteur humain, et supprimer un compte n'efface JAMAIS l'audit
    // (append-only). Deux CHECKs SQL (0046) verrouillent actor_kind ∈
    // {user,system,integration} et system/integration ⇒ actor_user_id NULL ;
    // user ⇒ non-null est garanti à l'INSERT par audit() (un CHECK bilatéral
    // bloquerait le SET NULL de la suppression de compte).
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorKind: text('actor_kind').$type<TeamAuditActorKind>().notNull().default('user'),
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
    /** P15 : « rédige une réponse » — fallback polling du signal temps réel. */
    replyingUntil: timestamp('replying_until'),
  },
  (t) => [primaryKey({ columns: [t.teamThreadId, t.userId] })],
);

/**
 * Relecture de brouillon (P15). Le brouillon Gmail APPARTIENT au partageur :
 * `draftId` est scoped à teamThread.sharerConnectionId, résolu côté serveur —
 * jamais fourni avec un connectionId client, jamais exposé au-delà de
 * owner/reviewer. UNE review ACTIVE par (fil, brouillon) — index unique
 * partiel. `revision` est monotone ; `draftDigest` est le condensé serveur du
 * contenu au moment de la dernière transition : toute décision/suggestion
 * dont le digest de base ne correspond plus au brouillon réel est refusée
 * (stale). Le reviewer ne mute JAMAIS le Gmail du propriétaire.
 */
export const teamDraftReview = createTable(
  'team_draft_review',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    draftId: text('draft_id').notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reviewerUserId: text('reviewer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    state: text('state')
      .$type<'requested' | 'changes_requested' | 'approved' | 'cancelled' | 'completed'>()
      .notNull()
      .default('requested'),
    revision: integer('revision').notNull().default(1),
    draftDigest: text('draft_digest').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('team_draft_review_active_unique')
      .on(t.teamThreadId, t.draftId)
      .where(sql`${t.state} in ('requested', 'changes_requested', 'approved')`),
    index('team_draft_review_thread_idx').on(t.teamThreadId),
  ],
);

/**
 * Suggestion de relecture (P15) — TEXTE de corps proposé + note, bornés.
 * Pièces jointes, destinataires, threading et signature sont HORS du patch :
 * seule la prose voyage. L'owner seul « applique » (dans SON composeur, via
 * l'autosave existant) — le serveur ne fait que tracer appliedAt/appliedBy.
 */
export const teamDraftSuggestion = createTable(
  'team_draft_suggestion',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => teamDraftReview.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bodyText: text('body_text').notNull(),
    note: text('note').notNull().default(''),
    /** Digest du brouillon sur lequel la suggestion a été écrite. */
    baseDigest: text('base_digest').notNull(),
    appliedAt: timestamp('applied_at'),
    appliedBy: text('applied_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('team_draft_suggestion_review_idx').on(t.reviewId, t.createdAt)],
);

/**
 * Intent de réponse (P15, durci) — la BASELINE de collision est un fait
 * SERVEUR, jamais un timestamp client : émise à l'ouverture du composeur par
 * une mutation ACL-vérifiée, elle ne peut être ni forgée ni repoussée. Le
 * cycle d'override est armé serveur : une collision détectée est marquée
 * (collision_detected_at) et l'override humain est consommé UNE fois
 * (override_consumed_at) — pour CET intent uniquement.
 */
export const teamReplyIntent = createTable(
  'team_reply_intent',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerThreadId: text('provider_thread_id').notNull(),
    baselineAt: timestamp('baseline_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    collisionDetectedAt: timestamp('collision_detected_at'),
    overrideConsumedAt: timestamp('override_consumed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('team_reply_intent_thread_user_idx').on(t.teamThreadId, t.userId)],
);

/**
 * Claim de RÉPONSE d'équipe (P15, anti double-réponse) : UN claim actif par
 * fil partagé — deux acteurs (ou deux clés d'idempotence) ne peuvent pas
 * créer deux send jobs concurrents pour le même fil d'équipe. Le claim est
 * résolu 'accepted' (la ligne send_job DURABLE est acceptée — que l'envoi
 * parte immédiatement par la Queue ou plus tard par le sweep long-terme ;
 * JAMAIS une remise Gmail prouvée, l'échec ultérieur reste visible dans la
 * Queue) ou 'released'. L'historique 'accepted' alimente le preflight de
 * collision (un envoi postérieur exige un override humain frais).
 */
export const teamReplyClaim = createTable(
  'team_reply_claim',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reviewId: text('review_id'),
    clientSubmissionKey: text('client_submission_key').notNull(),
    outcome: text('outcome')
      .$type<'active' | 'accepted' | 'released'>()
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => [
    uniqueIndex('team_reply_claim_active_unique')
      .on(t.teamThreadId)
      .where(sql`${t.outcome} = 'active'`),
    index('team_reply_claim_thread_created_idx').on(t.teamThreadId, t.createdAt),
  ],
);

/**
 * Règles d'équipe (P14) — automatisations ACL-safe déclenchées à l'arrivée
 * d'un message. Une règle appartient à une équipe mais SURVEILLE une boîte
 * précise : la connexion active de son créateur (owner) au moment de la
 * création, capturée comme `connectionId` (même principe que
 * sharerConnectionId). À l'exécution, chaque action passe par les chemins
 * store existants AVEC userId = createdBy : une règle ne peut jamais faire
 * plus que ce que son créateur pourrait faire à la main, et un partage par
 * règle reste un élargissement d'ACL explicite (visibility 'team' uniquement,
 * audit source='rule', notifications identiques à un partage manuel).
 */
export const teamRule = createTable(
  'team_rule',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Boîte surveillée — connexion du créateur, jamais exposée au client. */
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    triggers: jsonb('triggers').$type<TeamRuleTriggers>().notNull(),
    actions: jsonb('actions').$type<TeamRuleAction[]>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    /**
     * Soft-delete : l'historique (team_rule_run, audit) survit à la
     * suppression — une règle supprimée ne s'exécute plus, ne se liste plus,
     * mais ses runs restent attribuables par nom. Jamais de hard delete
     * (le cascade FK n'est atteint que par la suppression de l'équipe).
     */
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    index('team_rule_team_idx').on(t.teamId),
    index('team_rule_connection_enabled_idx').on(t.connectionId, t.enabled),
  ],
);

/**
 * Journal d'exécution des règles : chaque application porte la RAISON du
 * match (explication par trigger), le détail par action (dont l'état inverse
 * pour l'undo) et l'issue. Un run 'applied' ou 'undone' pour (règle, fil)
 * empêche toute ré-application automatique — après un undo humain, la règle
 * ne rejoue jamais le même fil.
 */
export const teamRuleRun = createTable(
  'team_rule_run',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => teamRule.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    teamThreadId: text('team_thread_id'),
    /**
     * 'processing' est le CLAIM d'exécution : inséré atomiquement (ON
     * CONFLICT DO NOTHING sur l'unique rule+thread) AVANT tout effet, puis mis
     * à jour vers l'issue finale. Un crash laisse 'processing' — visible et
     * bloquant, jamais un rejeu silencieux.
     */
    outcome: text('outcome')
      .$type<'processing' | 'applied' | 'skipped' | 'error' | 'undone'>()
      .notNull(),
    reason: text('reason').notNull().default(''),
    /** Détail par action : {kind, ok, reason?, inverse?} — l'inverse alimente l'undo. */
    actionsApplied: jsonb('actions_applied')
      .$type<import('../lib/teams/team-rules-shared').RuleActionRecord[]>()
      .notNull()
      .default([]),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    undoneAt: timestamp('undone_at'),
    undoneBy: text('undone_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [
    // VERROU d'idempotence : une seule exécution par (règle, fil), quel que
    // soit le nombre de workers concurrents — le claim s'appuie dessus.
    uniqueIndex('team_rule_run_rule_thread_idx').on(t.ruleId, t.threadId),
    index('team_rule_run_team_created_idx').on(t.teamId, t.createdAt),
  ],
);

/**
 * Politique SLA d'une équipe (P14/P16) — UNE ligne par équipe (PK team_id).
 * Les objectifs sont en minutes OUVRÉES : la fenêtre ouvrée est définie par
 * une zone IANA + heures et jours ouvrés locaux (DST géré par le calcul, pas
 * par le stockage). Un objectif null = pas d'engagement sur cette métrique.
 * Écriture : owners uniquement, auditée ; lecture : tout membre.
 */
export const teamSlaPolicy = createTable('team_sla_policy', {
  teamId: text('team_id')
    .primaryKey()
    .references(() => team.id, { onDelete: 'cascade' }),
  firstResponseMinutes: integer('first_response_minutes'),
  resolutionMinutes: integer('resolution_minutes'),
  timeZone: text('time_zone').notNull().default('UTC'),
  businessHours: jsonb('business_hours')
    .$type<TeamBusinessHours>()
    .notNull()
    .default({ days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' }),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Absence DÉCLARÉE d'un membre (P16 couverture) : période plate, sans motif
 * santé ni catégorie RH — une simple fenêtre d'indisponibilité. Écriture :
 * le membre pour LUI-MÊME ou un owner ; lecture : tout membre. Auditée.
 */
export const teamMemberAbsence = createTable(
  'team_member_absence',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    note: text('note').notNull().default(''),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('team_member_absence_team_ends_idx').on(t.teamId, t.endsAt),
    index('team_member_absence_user_idx').on(t.userId),
  ],
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

// =============================================================================
// P18 — Intégrations d'équipe (Linear seul, email-first). Migration 0046.
// Tokens/secrets : enveloppes scellées (ring KEK du déploiement) — jamais
// renvoyés par une route, jamais loggés. Une installation par (équipe,
// provider). Toute configuration est owner-only ; l'usage suit l'ACL du fil.
// =============================================================================

export const teamIntegrationInstall = createTable(
  'team_integration_install',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<IntegrationProvider>().notNull().default('linear'),
    status: text('status').$type<IntegrationInstallStatus>().notNull().default('pending'),
    /** Organisation Linear (workspace) — corrélation EXACTE des webhooks. */
    workspaceId: text('workspace_id'),
    workspaceName: text('workspace_name'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    /**
     * OAuth PKCE en cours : HASH SHA-256 du state (jamais le state brut),
     * borné par state_expires_at, consommé ONE-SHOT atomiquement au callback ;
     * verifier SCELLÉ (jamais en clair).
     */
    oauthState: text('oauth_state'),
    stateExpiresAt: timestamp('state_expires_at'),
    pkceVerifierEnvelope: jsonb('pkce_verifier_envelope').$type<SealedSecret | null>(),
    accessTokenEnvelope: jsonb('access_token_envelope').$type<SealedSecret | null>(),
    refreshTokenEnvelope: jsonb('refresh_token_envelope').$type<SealedSecret | null>(),
    /** Les access tokens Linear expirent (~24 h) — refresh rotatif. */
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    /** SET NULL : la suppression du compte installateur ne détruit PAS l'installation. */
    installedBy: text('installed_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('team_integration_install_team_provider_unique').on(t.teamId, t.provider),
    index('team_integration_install_workspace_idx').on(t.provider, t.workspaceId),
  ],
);

/**
 * Mappings EXPLICITES (owner-only) — aucune inférence : `team` énumère les
 * équipes Linear autorisées à la création (retaValue = externalId, slot),
 * `status` lie un statut Reta (open/closed) à un workflow state Linear,
 * `assignee` lie un membre Reta (userId) à un utilisateur Linear.
 */
export const teamIntegrationMapping = createTable(
  'team_integration_mapping',
  {
    id: text('id').primaryKey(),
    installId: text('install_id')
      .notNull()
      .references(() => teamIntegrationInstall.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<IntegrationMappingKind>().notNull(),
    retaValue: text('reta_value').notNull(),
    externalId: text('external_id').notNull(),
    externalLabel: text('external_label').notNull().default(''),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('team_integration_mapping_slot_unique').on(t.installId, t.kind, t.retaValue),
    index('team_integration_mapping_install_idx').on(t.installId),
  ],
);

/**
 * Lien fil partagé ↔ issue Linear — persisté UNIQUEMENT après un issueCreate
 * réussi ou un Accept humain explicite (jamais d'association silencieuse).
 * Unlink = soft (audit conservé) ; un seul lien ACTIF par (fil, issue).
 */
export const teamThreadIssueLink = createTable(
  'team_thread_issue_link',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    installId: text('install_id')
      .notNull()
      .references(() => teamIntegrationInstall.id, { onDelete: 'cascade' }),
    issueId: text('issue_id').notNull(),
    issueIdentifier: text('issue_identifier').notNull().default(''),
    issueUrl: text('issue_url').notNull().default(''),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    unlinkedAt: timestamp('unlinked_at'),
    unlinkedBy: text('unlinked_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('team_thread_issue_link_active_unique')
      .on(t.teamThreadId, t.issueId)
      .where(sql`${t.unlinkedAt} is null`),
    index('team_thread_issue_link_issue_idx').on(t.installId, t.issueId),
    index('team_thread_issue_link_thread_idx').on(t.teamThreadId),
  ],
);

/** Lien externe MANUEL (CRM/client) — URL https, aucune donnée mailbox. */
export const teamExternalLink = createTable(
  'team_external_link',
  {
    id: text('id').primaryKey(),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ExternalLinkKind>().notNull().default('other'),
    label: text('label').notNull(),
    url: text('url').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    removedAt: timestamp('removed_at'),
    removedBy: text('removed_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [index('team_external_link_thread_idx').on(t.teamThreadId)],
);

/**
 * Demande de création d'issue : preview → confirmation humaine FRAÎCHE →
 * issueCreate. Idempotence par (install, clientRequestKey) — le retry rejoue
 * la MÊME demande, jamais deux issues. Le lien n'est persisté qu'au succès.
 */
export const teamIssueCreateRequest = createTable(
  'team_issue_create_request',
  {
    id: text('id').primaryKey(),
    installId: text('install_id')
      .notNull()
      .references(() => teamIntegrationInstall.id, { onDelete: 'cascade' }),
    teamThreadId: text('team_thread_id')
      .notNull()
      .references(() => teamThread.id, { onDelete: 'cascade' }),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    clientRequestKey: text('client_request_key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    linearTeamId: text('linear_team_id').notNull(),
    stateId: text('state_id'),
    assigneeExternalId: text('assignee_external_id'),
    status: text('status').$type<IssueCreateRequestStatus>().notNull().default('pending'),
    /** Digest SHA-256 de l'aperçu CANONIQUE serveur — la confirmation le référence. */
    previewDigest: text('preview_digest'),
    previewExpiresAt: timestamp('preview_expires_at'),
    /** Bail du claim 'pending' : expiré sans issue prouvée ⇒ needs_reconciliation. */
    leaseExpiresAt: timestamp('lease_expires_at'),
    issueId: text('issue_id'),
    issueIdentifier: text('issue_identifier'),
    issueUrl: text('issue_url'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => [
    uniqueIndex('team_issue_create_request_key_unique').on(t.installId, t.clientRequestKey),
    index('team_issue_create_request_thread_idx').on(t.teamThreadId),
  ],
);

/**
 * Claim de livraison webhook ENTRANT : Linear-Delivery unique atomique —
 * l'insert ON CONFLICT DO NOTHING est la barrière anti-replay (200 idempotent).
 */
export const integrationWebhookDelivery = createTable(
  'integration_webhook_delivery',
  {
    id: text('id').primaryKey(),
    provider: text('provider').$type<IntegrationProvider>().notNull().default('linear'),
    deliveryId: text('delivery_id').notNull(),
    eventType: text('event_type').notNull().default(''),
    receivedAt: timestamp('received_at').notNull().defaultNow(),
    processedAt: timestamp('processed_at'),
    outcome: text('outcome').notNull().default('received'),
  },
  (t) => [uniqueIndex('integration_webhook_delivery_unique').on(t.provider, t.deliveryId)],
);

/**
 * Abonnement webhook SORTANT Reta (owner-only) : HTTPS public exigé (défense
 * SSRF à l'envoi), secret SCELLÉ, événements bornés assign/comment/status —
 * métadonnées seules, jamais de corps email/PJ.
 */
export const teamOutboundWebhook = createTable(
  'team_outbound_webhook',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: jsonb('events').$type<OutboundEventType[]>().notNull().default([]),
    secretEnvelope: jsonb('secret_envelope').$type<SealedSecret | null>(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    disabledAt: timestamp('disabled_at'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  },
  (t) => [index('team_outbound_webhook_team_idx').on(t.teamId)],
);

/** Outbox sortante : retry borné avec backoff, 'dead' visible et rejouable. */
export const teamOutboundDelivery = createTable(
  'team_outbound_delivery',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references(() => teamOutboundWebhook.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<OutboundEventType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<OutboundDeliveryStatus>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    /** Bail du claim 'sending' (CAS) — deux crons ne livrent jamais en double. */
    claimedAt: timestamp('claimed_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at'),
  },
  (t) => [index('team_outbound_delivery_due_idx').on(t.status, t.nextAttemptAt)],
);
