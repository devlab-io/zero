type MailboxOverviewWithFolders = {
  folders: {
    drafts: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const hasDraftCount = (value: unknown): value is MailboxOverviewWithFolders => {
  if (!value || typeof value !== 'object') return false;
  const folders = (value as { folders?: unknown }).folders;
  if (!folders || typeof folders !== 'object') return false;
  return Number.isFinite((folders as { drafts?: unknown }).drafts);
};

export const adjustMailboxDraftCount = <T>(value: T, delta: number): T => {
  if (!hasDraftCount(value)) return value;
  return {
    ...value,
    folders: {
      ...value.folders,
      drafts: Math.max(0, value.folders.drafts + Math.trunc(delta)),
    },
  } as T;
};
