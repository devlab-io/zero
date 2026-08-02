import { FOLDERS } from '@/lib/utils';

/**
 * Ligne de statut de la liste (CUA P1) : contexte de boîte, compte réel et
 * fraîcheur de synchronisation. Logique pure — le composant ne fait que
 * rendre. On n'affiche JAMAIS un compte estimé : uniquement les dossiers dont
 * le provider donne le total (inbox, brouillons, envoyés), sinon rien.
 */

export type FolderCounts = { inbox: number; drafts: number; sent: number; queue: number };

const FOLDER_MESSAGE_KEYS: Record<string, string> = {
  [FOLDERS.INBOX]: 'inbox',
  [FOLDERS.DRAFT]: 'drafts',
  [FOLDERS.SENT]: 'sent',
  [FOLDERS.SPAM]: 'spam',
  [FOLDERS.ARCHIVE]: 'archive',
  [FOLDERS.BIN]: 'bin',
  [FOLDERS.SNOOZED]: 'snoozed',
};

/** Clé i18n `navigation.sidebar.*` du dossier courant (inbox par défaut). */
export function folderSidebarKey(folder: string | undefined): string {
  return FOLDER_MESSAGE_KEYS[folder ?? FOLDERS.INBOX] ?? 'inbox';
}

/** Compte RÉEL du dossier quand le provider le fournit, sinon null. */
export function folderCount(
  folder: string | undefined,
  counts: FolderCounts | undefined,
): number | null {
  if (!counts) return null;
  switch (folder ?? FOLDERS.INBOX) {
    case FOLDERS.INBOX:
      return counts.inbox;
    case FOLDERS.DRAFT:
      return counts.drafts;
    case FOLDERS.SENT:
      return counts.sent;
    default:
      return null;
  }
}

export type Freshness =
  | { kind: 'syncing' }
  | { kind: 'just-now' }
  | { kind: 'ago'; minutes: number }
  | { kind: 'unknown' };

const JUST_NOW_MS = 60_000;

export function freshness(
  dataUpdatedAt: number | undefined,
  now: number,
  isFetching: boolean,
): Freshness {
  if (isFetching) return { kind: 'syncing' };
  if (!dataUpdatedAt || dataUpdatedAt <= 0) return { kind: 'unknown' };
  const elapsed = now - dataUpdatedAt;
  if (elapsed < JUST_NOW_MS) return { kind: 'just-now' };
  return { kind: 'ago', minutes: Math.floor(elapsed / 60_000) };
}

/** Libellé relatif localisé (« il y a 3 minutes» / “3 minutes ago”). */
export function relativeMinutesLabel(minutes: number, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' });
  if (minutes >= 60) return formatter.format(-Math.floor(minutes / 60), 'hour');
  return formatter.format(-minutes, 'minute');
}
