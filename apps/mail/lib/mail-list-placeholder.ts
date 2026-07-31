type MailListQueryDescriptor = {
  input?: {
    folder?: string;
  };
};

/**
 * Previous rows are useful while search/labels change inside one folder, but
 * they are actively misleading after a folder navigation. Never paint Inbox
 * rows under an Archive/Snoozed/Spam/Bin route while its query is in flight.
 */
export function canReuseMailListPlaceholder(
  previousQueryKey: readonly unknown[] | undefined,
  nextFolder: string | undefined,
): boolean {
  const descriptor = previousQueryKey?.[1];
  if (!descriptor || typeof descriptor !== 'object') return false;
  return (descriptor as MailListQueryDescriptor).input?.folder === nextFolder;
}
