import {
  CORE_MAIL_FOLDER_PREFETCH_ORDER,
  FOLDER_REWARM_INTERVAL_MS,
  mailFolderFromHref,
  selectWarmFolderTargets,
} from './use-folder-prefetch';
import { mailListMaxResults, MAIL_LIST_PAGE_SIZE } from '@/lib/mail-pagination';
import { MAIL_LIST_STALE_MS } from '@/lib/mail-list-query';
import { describe, expect, it } from 'vitest';
import { FOLDERS } from '@/lib/utils';

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

describe('core folder warming (r6 : dossier chaud servi du snapshot local)', () => {
  it('covers every sidebar destination exactly once, inbox included', () => {
    expect(CORE_MAIL_FOLDER_PREFETCH_ORDER).toEqual([
      'inbox',
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

  it('depuis l’Inbox : chauffe tous les voisins, Drafts en différé, jamais le dossier courant', () => {
    const targets = selectWarmFolderTargets(FOLDERS.INBOX);
    expect(targets.projection).not.toContain(FOLDERS.INBOX);
    expect(targets.projection).toEqual(
      expect.arrayContaining([FOLDERS.SENT, FOLDERS.BIN, FOLDERS.ARCHIVE]),
    );
    // Drafts (Gmail live, lent) ne rejoint jamais le batch projection.
    expect(targets.projection).not.toContain(FOLDERS.DRAFT);
    expect(targets.deferred).toEqual([FOLDERS.DRAFT]);
  });

  it('depuis Drafts : l’Inbox est chauffée (retour instantané), Drafts exclu', () => {
    const targets = selectWarmFolderTargets(FOLDERS.DRAFT);
    expect(targets.projection).toContain(FOLDERS.INBOX);
    expect(targets.projection).not.toContain(FOLDERS.DRAFT);
    expect(targets.deferred).toEqual([]);
  });

  it('le dossier courant est TOUJOURS exclu — sa requête active suffit (zéro redondance)', () => {
    for (const folder of CORE_MAIL_FOLDER_PREFETCH_ORDER) {
      const targets = selectWarmFolderTargets(folder);
      expect([...targets.projection, ...targets.deferred]).not.toContain(folder);
    }
  });

  it('le cycle de re-chauffe est plus court que le staleTime (recouvrement — pas une garantie de fraîcheur, voir mail-list-query)', () => {
    expect(FOLDER_REWARM_INTERVAL_MS).toBeLessThan(MAIL_LIST_STALE_MS);
  });
});

describe('mailListMaxResults (clé partagée liste/chauffe)', () => {
  it('projection (inbox/sent/bin…) → pages de 50', () => {
    expect(mailListMaxResults(FOLDERS.INBOX, false)).toBe(MAIL_LIST_PAGE_SIZE);
    expect(mailListMaxResults(FOLDERS.SENT, false)).toBe(MAIL_LIST_PAGE_SIZE);
  });

  it('Drafts (listDrafts Gmail, fan-out possible) → défaut serveur, jamais 50', () => {
    expect(mailListMaxResults(FOLDERS.DRAFT, false)).toBeUndefined();
  });

  it('recherche (pages Gmail q chères) → défaut serveur', () => {
    expect(mailListMaxResults(FOLDERS.INBOX, true)).toBeUndefined();
  });
});
