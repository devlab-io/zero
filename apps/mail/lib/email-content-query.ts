export type EmailContentTheme = 'light' | 'dark';

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
    messageId,
    Boolean(shouldLoadImages),
    resolveEmailContentTheme(theme),
  ] as const;
}
