export type EmailContentTheme = 'light' | 'dark';

// Increment when server-side rendering semantics change so persisted React
// Query entries cannot keep serving stale processed HTML after deployment.
// v4 (r17) : réparation de contraste contextuelle — les rendus persistés
// avant le correctif garderaient un texte blanc-sur-blanc.
// v5 (r17b) : canevas :host verrouillé !important — les rendus v4 (staging)
// n'ont pas la garde et restent renversables par une classe du document hôte.
export const EMAIL_CONTENT_RENDER_VERSION = 5;

export function resolveEmailContentTheme(theme?: string | null): EmailContentTheme {
  return theme === 'dark' ? 'dark' : 'light';
}

export function emailContentQueryKey(
  messageId: string | undefined,
  shouldLoadImages: boolean | undefined,
  theme: string | null | undefined,
) {
  return [
    'email-content',
    EMAIL_CONTENT_RENDER_VERSION,
    messageId,
    Boolean(shouldLoadImages),
    resolveEmailContentTheme(theme),
  ] as const;
}
