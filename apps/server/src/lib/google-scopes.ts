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
