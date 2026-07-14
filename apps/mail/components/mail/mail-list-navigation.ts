import { FOLDERS } from '@/lib/utils';

export type MailListNavigationTarget = {
  threadId: string | null;
  draftId: string | null;
  composeOpen: 'true' | null | undefined;
};

export function resolveMailListNavigation(
  folder: string | undefined,
  targetId: string | null,
): MailListNavigationTarget {
  if (folder === FOLDERS.DRAFT) {
    return {
      threadId: null,
      draftId: targetId,
      composeOpen: targetId ? 'true' : null,
    };
  }

  return {
    threadId: targetId,
    draftId: null,
    composeOpen: undefined,
  };
}
