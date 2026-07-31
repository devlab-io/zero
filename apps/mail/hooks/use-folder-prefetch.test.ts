import { CORE_MAIL_FOLDER_PREFETCH_ORDER, mailFolderFromHref } from './use-folder-prefetch';
import { describe, expect, it } from 'vitest';

describe('mailFolderFromHref', () => {
  it.each([
    ['/mail/inbox', 'inbox'],
    ['/mail/draft', 'draft'],
    ['/mail/sent?from=sidebar', 'sent'],
    ['/mail/archive#top', 'archive'],
  ])('maps %s to %s', (href, folder) => {
    expect(mailFolderFromHref(href)).toBe(folder);
  });

  it.each(['/queue', '/settings/general', 'https://feedback.0.email'])(
    'ignores non-mail navigation %s',
    (href) => {
      expect(mailFolderFromHref(href)).toBeNull();
    },
  );
});

describe('core folder warming', () => {
  it('covers every sidebar destination exactly once', () => {
    expect(CORE_MAIL_FOLDER_PREFETCH_ORDER).toEqual([
      'bin',
      'sent',
      'archive',
      'snoozed',
      'spam',
      'draft',
    ]);
    expect(new Set(CORE_MAIL_FOLDER_PREFETCH_ORDER).size).toBe(
      CORE_MAIL_FOLDER_PREFETCH_ORDER.length,
    );
  });
});
