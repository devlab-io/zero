import { atom } from 'jotai';

/** Folder selected by an input event before React Router commits the new route. */
export const pendingFolderNavigationAtom = atom<string | null>(null);

export function shouldMaskPendingMailFolder(
  pendingFolder: string | null,
  renderedFolder: string | undefined,
): boolean {
  return pendingFolder !== null && pendingFolder !== renderedFolder;
}
