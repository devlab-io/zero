/**
 * Types PARTAGÉS des intégrations d'équipe (P18 — Linear, email-first) —
 * module feuille STRICT : aucun import. La frontière tRPC peut le référencer
 * sans tirer le graphe serveur ; le schema ne fait que typer ses colonnes.
 */

export type IntegrationProvider = 'linear';

export type IntegrationInstallStatus = 'pending' | 'active' | 'revoked';

export type IntegrationMappingKind = 'team' | 'status' | 'assignee';

/**
 * Enveloppe scellée (chiffrement d'enveloppe AES-GCM, ring KEK du déploiement
 * — même construction que le vault BYOK). JAMAIS renvoyée par une route,
 * jamais loggée : seule sa PRÉSENCE est exposée (hasToken booléen).
 */
export type SealedSecret = {
  ciphertext: string;
  iv: string;
  wrappedDek: string;
  wrapIv: string;
  kekVersion: string;
};

/**
 * P18 : l'audit peut désormais être porté par un humain, le système (révocation
 * OAuthApp, entretien) ou une intégration (webhook Linear entrant). Un audit
 * non-humain a actorUserId NULL — le schéma ne ment jamais.
 */
export type TeamAuditActorKind = 'user' | 'system' | 'integration';

/**
 * Cycle d'une demande d'issue (durci) : previewed (aperçu canonique serveur,
 * digest + expiry) → pending (claim avec bail, appel Linear en cours) →
 * created | failed (échec PROUVÉ avant/par la réponse — rejouable) |
 * needs_reconciliation (issue peut-être créée : bail expiré ou issue réseau
 * inconnue — JAMAIS rejoué automatiquement, relien manuel après recherche).
 */
export type IssueCreateRequestStatus =
  | 'previewed'
  | 'pending'
  | 'created'
  | 'failed'
  | 'needs_reconciliation';

/** Durées du flux preview/confirm + bail de création. */
export const ISSUE_PREVIEW_TTL_MS = 15 * 60_000;
export const ISSUE_CREATE_LEASE_MS = 90_000;

/** OAuth : durée de vie du state (one-shot), scopes EXACTS exigés au retour. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

/** Sortant : bail du statut 'sending' + seuil d'auto-désactivation. */
export const OUTBOUND_SENDING_LEASE_MS = 5 * 60_000;
export const OUTBOUND_DISABLE_THRESHOLD = 20;

export type ExternalLinkKind = 'crm' | 'customer' | 'other';

/** Événements sortants Reta — métadonnées SEULES, jamais de corps email/PJ. */
export type OutboundEventType = 'thread.assigned' | 'thread.comment' | 'thread.status';

export const OUTBOUND_EVENT_TYPES: readonly OutboundEventType[] = [
  'thread.assigned',
  'thread.comment',
  'thread.status',
] as const;

export type OutboundDeliveryStatus = 'pending' | 'sending' | 'delivered' | 'dead';

/** Scopes OAuth Linear MINIMAUX — jamais write/admin (webhooks côté app). */
export const LINEAR_OAUTH_SCOPES: readonly string[] = ['read', 'issues:create'] as const;

/** Tolérance d'horodatage des webhooks Linear (docs : ±60 s). */
export const LINEAR_WEBHOOK_MAX_SKEW_MS = 60_000;

/** Bornes outbox sortante : tentatives max puis 'dead' (visible, rejouable à la main). */
export const OUTBOUND_MAX_ATTEMPTS = 5;
export const OUTBOUND_BACKOFF_BASE_MS = 60_000;
