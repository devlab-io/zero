export type ComposerSaveStatus = 'idle' | 'local' | 'saving' | 'server' | 'error';

export type ComposerSaveEvent =
  | { type: 'LOCAL_PERSISTED' }
  | { type: 'SAVE_STARTED' }
  | { type: 'SAVE_SUCCEEDED' }
  | { type: 'SAVE_FAILED' };

/**
 * Small truthful state machine shared by the composer and its frozen UX tests.
 * In particular, a failed server save can never fall through to the "server" state.
 */
export function reduceComposerSaveStatus(
  current: ComposerSaveStatus,
  event: ComposerSaveEvent,
): ComposerSaveStatus {
  switch (event.type) {
    case 'LOCAL_PERSISTED':
      return 'local';
    case 'SAVE_STARTED':
      return 'saving';
    case 'SAVE_SUCCEEDED':
      return 'server';
    case 'SAVE_FAILED':
      return 'error';
    default:
      return current;
  }
}

export function canRetryComposerSave(status: ComposerSaveStatus): boolean {
  return status === 'error';
}
