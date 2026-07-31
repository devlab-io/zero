import {
  emailContentQueryKey,
  resolveEmailContentTheme,
  EMAIL_CONTENT_RENDER_VERSION,
} from './email-content-query';
import { describe, expect, it } from 'vitest';

describe('email content query key', () => {
  it('normalizes system and undefined themes to light', () => {
    expect(resolveEmailContentTheme(undefined)).toBe('light');
    expect(resolveEmailContentTheme('system')).toBe('light');
  });

  it('uses the same normalized dimensions for prefetch and rendering', () => {
    expect(emailContentQueryKey('m1', undefined, 'system')).toEqual([
      'email-content',
      EMAIL_CONTENT_RENDER_VERSION,
      'm1',
      false,
      'light',
    ]);
    expect(emailContentQueryKey('m1', false, 'light')).toEqual([
      'email-content',
      EMAIL_CONTENT_RENDER_VERSION,
      'm1',
      false,
      'light',
    ]);
  });
});
