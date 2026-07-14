// label-move-picker.logic — pure logic for the `l`/`v` pickers (issue #32), kept out of
// the component so it is unit-testable without mounting the CommandDialog/query graph.

export type MoveDestinationId = 'inbox' | 'archive' | 'spam' | 'bin';

export interface MoveDestination {
  id: MoveDestinationId;
  label: string;
}

/** All folder moves the `v` picker can offer, in display order. */
export const MOVE_DESTINATIONS: MoveDestination[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'archive', label: 'Archive' },
  { id: 'spam', label: 'Spam' },
  { id: 'bin', label: 'Bin' },
];

/**
 * Destinations offered for a thread currently in `folder` — every move target except the
 * folder it already lives in, so the picker never offers a no-op "move to here".
 */
export function availableMoveDestinations(folder: string | null | undefined): MoveDestination[] {
  return MOVE_DESTINATIONS.filter((destination) => destination.id !== folder);
}

/** Whether a label is currently applied to the thread (used to toggle add vs remove). */
export function isLabelOnThread(threadLabelIds: Set<string>, labelId: string): boolean {
  return threadLabelIds.has(labelId);
}
