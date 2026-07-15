export type EmailContentTheme = 'light' | 'dark';

/** Keep the query key and mutation input on the same effective theme. */
export const resolveEmailContentTheme = (resolvedTheme: string | undefined): EmailContentTheme =>
  resolvedTheme === 'dark' ? 'dark' : 'light';

// Shared by the consumer and prefetcher. Normalizing the theme prevents an initial
// `undefined` key from caching content processed as light, then missing once next-themes
// resolves to `light`.
export const emailContentQueryKey = (
  messageId: string | undefined,
  shouldLoadImages: boolean,
  theme: EmailContentTheme,
) => ['email-content', messageId, shouldLoadImages, theme] as const;
