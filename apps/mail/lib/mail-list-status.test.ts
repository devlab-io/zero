import {
  folderCount,
  folderSidebarKey,
  freshness,
  relativeMinutesLabel,
  type FolderCounts,
} from './mail-list-status';
import { describe, expect, it } from 'vitest';

const counts: FolderCounts = { inbox: 128, drafts: 4, sent: 913, queue: 2 };

describe('folderSidebarKey', () => {
  it('maps folders to sidebar i18n keys, defaulting to inbox', () => {
    expect(folderSidebarKey('inbox')).toBe('inbox');
    expect(folderSidebarKey('draft')).toBe('drafts');
    expect(folderSidebarKey('sent')).toBe('sent');
    expect(folderSidebarKey('bin')).toBe('bin');
    expect(folderSidebarKey(undefined)).toBe('inbox');
    expect(folderSidebarKey('nonsense')).toBe('inbox');
  });
});

describe('folderCount', () => {
  it('returns a real count only when the provider reports one', () => {
    expect(folderCount('inbox', counts)).toBe(128);
    expect(folderCount('draft', counts)).toBe(4);
    expect(folderCount('sent', counts)).toBe(913);
    expect(folderCount('spam', counts)).toBeNull();
    expect(folderCount('archive', counts)).toBeNull();
    expect(folderCount('inbox', undefined)).toBeNull();
  });
});

describe('freshness', () => {
  const now = 1_000_000_000;
  it('reports syncing while fetching, whatever the timestamps', () => {
    expect(freshness(now - 5_000, now, true)).toEqual({ kind: 'syncing' });
    expect(freshness(undefined, now, true)).toEqual({ kind: 'syncing' });
  });
  it('reports just-now under a minute and whole minutes after', () => {
    expect(freshness(now - 59_000, now, false)).toEqual({ kind: 'just-now' });
    expect(freshness(now - 60_000, now, false)).toEqual({ kind: 'ago', minutes: 1 });
    expect(freshness(now - 3 * 60_000 - 1, now, false)).toEqual({ kind: 'ago', minutes: 3 });
  });
  it('reports unknown without a timestamp', () => {
    expect(freshness(undefined, now, false)).toEqual({ kind: 'unknown' });
    expect(freshness(0, now, false)).toEqual({ kind: 'unknown' });
  });
});

describe('relativeMinutesLabel', () => {
  it('localizes minutes and rolls over to hours', () => {
    expect(relativeMinutesLabel(3, 'en')).toBe('3 minutes ago');
    expect(relativeMinutesLabel(3, 'fr')).toBe('il y a 3 minutes');
    expect(relativeMinutesLabel(90, 'en')).toBe('1 hour ago');
  });
});
