/**
 * Types PARTAGÉS de la gouvernance d'équipe (P17) — module feuille STRICT :
 * aucun import. La frontière tRPC (app-router.boundary.d.ts) référence ce
 * module ; il ne doit jamais tirer le graphe serveur (schema, env, driver)
 * dans le tsc d'apps/mail.
 */

// --- B : export signé du journal d'audit --------------------------------------

/** Entrée d'audit telle qu'exportée — dates ISO (le document est du JSON pur). */
export type AuditExportEntry = {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorUserId: string | null;
  actorKind: string;
  actorName: string | null;
};

export type AuditExportPayload = {
  format: 'reta-team-audit-export';
  version: 1;
  teamId: string;
  teamName: string;
  requestedByUserId: string;
  range: { from: string | null; to: string | null };
  generatedAt: string;
  entryCount: number;
  /** true si la fenêtre contenait plus d'entrées que la borne d'export. */
  truncated: boolean;
  entries: AuditExportEntry[];
};

/**
 * Document exporté = payload + signature détachée. La MAC couvre la
 * sérialisation CANONIQUE du payload (clés triées récursivement) — toute
 * altération d'une entrée, du compte ou de la plage invalide la signature.
 */
export type SignedAuditExport = {
  payload: AuditExportPayload;
  signature: {
    algorithm: 'HMAC-SHA256';
    kdf: 'HKDF-SHA256';
    /** Version du KEK du ring serveur ayant dérivé la clé de signature. */
    kekVersion: string;
    /** base64url sans padding. */
    mac: string;
  };
};

export type AuditExportVerdict =
  | { valid: true; kekVersion: string }
  | { valid: false; reason: 'unknown_kek_version' | 'bad_signature' | 'malformed' };

// --- C : politique de rétention -----------------------------------------------

/** Bornes de rétention (jours). null = conserver indéfiniment. */
export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 730;

export type TeamRetentionPolicy = {
  teamId: string;
  auditDays: number | null;
  ruleRunDays: number | null;
  notificationDays: number | null;
  updatedAt: string;
};

// --- E : export / restauration de données d'équipe -----------------------------

export type TeamDataExportMember = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  prefs: Record<string, unknown>;
};

export type TeamDataExportThread = {
  id: string;
  threadId: string;
  sharerUserId: string;
  sharerEmail: string;
  providerId: string;
  visibility: string;
  subject: string;
  preview: string;
  participants: { name?: string; email: string }[];
  messageCount: number;
  latestReceivedOn: string | null;
  status: string;
  assigneeUserId: string | null;
  lastActivityAt: string;
  createdAt: string;
  labelIds: string[];
  accessUserIds: string[];
};

export type TeamDataExportComment = {
  id: string;
  teamThreadId: string;
  authorUserId: string;
  body: string;
  mentions: string[];
  quote: {
    messageId: string;
    authorEmail: string;
    authorName?: string;
    receivedOn: string;
    text: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  reactions: { userId: string; emoji: string }[];
};

export type TeamDataExportRule = {
  id: string;
  name: string;
  triggers: Record<string, unknown>;
  actions: unknown[];
  createdBy: string;
  /** Email de la boîte surveillée — la connexion est RE-RÉSOLUE à la restauration. */
  watchedEmail: string;
  createdAt: string;
};

export type TeamDataExport = {
  format: 'reta-team-export';
  version: 1;
  exportedAt: string;
  team: { id: string; name: string; createdBy: string; createdAt: string };
  members: TeamDataExportMember[];
  labels: { id: string; name: string; color: string; createdBy: string }[];
  threads: TeamDataExportThread[];
  comments: TeamDataExportComment[];
  rules: TeamDataExportRule[];
  slaPolicy: Record<string, unknown> | null;
  retentionPolicy: {
    auditDays: number | null;
    ruleRunDays: number | null;
    notificationDays: number | null;
  } | null;
  absences: { userId: string; startsAt: string; endsAt: string; note: string | null }[];
  /**
   * Bornes d'export atteintes : les collections tronquées sont NOMMÉES —
   * jamais de troncature silencieuse.
   */
  truncated: string[];
  /**
   * Exclusions structurelles, documentées dans le fichier lui-même :
   * l'audit s'exporte signé via exportAudit ; les intégrations portent des
   * secrets scellés non exportables ; l'état de relecture/claims est éphémère.
   */
  excluded: string[];
};

export type TeamRestoreSkip = {
  kind: 'member' | 'thread' | 'comment' | 'reaction' | 'absence' | 'rule' | 'access' | 'assignee';
  id: string;
  reason:
    | 'user_missing'
    | 'user_email_mismatch'
    | 'user_not_source_member'
    | 'sharer_connection_missing'
    | 'source_thread_mismatch'
    | 'watched_connection_missing'
    | 'source_rule_mismatch'
    | 'thread_skipped'
    | 'author_missing'
    | 'assignee_not_writer';
};

export type TeamRestoreReport = {
  teamId: string;
  teamName: string;
  restored: {
    members: number;
    labels: number;
    threads: number;
    comments: number;
    reactions: number;
    rules: number;
    absences: number;
    accessRows: number;
  };
  skipped: TeamRestoreSkip[];
  /** Les règles sont TOUJOURS restaurées désactivées (ré-armement ACL explicite). */
  rulesRestoredDisabled: boolean;
  sourceDigest: string;
};
