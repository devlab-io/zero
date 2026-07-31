export type EmailContentTheme = 'light' | 'dark';

// Increment when server-side rendering semantics change so persisted React
// Query entries cannot keep serving stale processed HTML after deployment.
export const EMAIL_CONTENT_RENDER_VERSION = 3;

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
