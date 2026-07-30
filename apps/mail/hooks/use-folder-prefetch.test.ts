import { mailFolderFromHref } from './use-folder-prefetch';
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
