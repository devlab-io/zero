/**
 * Minimum Gmail scope union used by the interactive client.
 *
 * gmail.modify covers reading and mailbox triage. gmail.compose is required for drafts and the
 * human-triggered send flow. The unrestricted mail.google.com scope is intentionally excluded.
 */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export const GOOGLE_OAUTH_SCOPE_STRING = GOOGLE_OAUTH_SCOPES.join(' ');

/**
 * P11 — autorisation calendrier INCRÉMENTALE (DISPONIBILITÉS uniquement).
 *
 * Scope MINIMAL pour FreeBusy.query : calendar.freebusy expose seulement les
 * créneaux libre/occupé — JAMAIS calendar.readonly, qui permettrait de voir
 * et télécharger les événements (source officielle Google Calendar scopes).
 * JAMAIS ajouté à GOOGLE_OAUTH_SCOPES : demandé uniquement à la demande
 * explicite de l'utilisateur via better-auth `/link-social` (consentement
 * Google dédié, le login par défaut n'est jamais élargi). Aucun scope
 * d'ÉCRITURE ni de LECTURE d'événements n'existe nulle part — la création
 * d'événement reste hors produit (deeplink fournisseur, Save humain).
 * Le test google-scopes.test.ts fige ces invariants.
 */
export const GOOGLE_CALENDAR_FREEBUSY_SCOPE =
  'https://www.googleapis.com/auth/calendar.freebusy' as const;
