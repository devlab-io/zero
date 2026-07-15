import { describe, expect, it } from 'vitest';

import { emailContentQueryKey, resolveEmailContentTheme } from './email-content-cache';

describe('email content cache contract', () => {
  it('normalizes unresolved and explicit light themes to the same cache key', () => {
    const unresolved = resolveEmailContentTheme(undefined);
    const light = resolveEmailContentTheme('light');

    expect(unresolved).toBe('light');
    expect(emailContentQueryKey('message-1', false, unresolved)).toEqual(
      emailContentQueryKey('message-1', false, light),
    );
  });

  it('keeps dark content and image policy in distinct cache entries', () => {
    const dark = resolveEmailContentTheme('dark');

    expect(emailContentQueryKey('message-1', false, dark)).not.toEqual(
      emailContentQueryKey('message-1', true, dark),
    );
    expect(emailContentQueryKey('message-1', false, dark)).not.toEqual(
      emailContentQueryKey('message-1', false, 'light'),
    );
  });
});
