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

export function shouldScheduleComposerAutosave(input: {
  dirty: boolean;
  status: ComposerSaveStatus;
  inFlight: boolean;
}): boolean {
  return input.dirty && input.status !== 'error' && !input.inFlight;
}

export type ComposerSaveDecision =
  | { effect: 'server'; dirty: false }
  | { effect: 'local'; dirty: true }
  | { effect: 'error'; dirty: true }
  | { effect: 'none' };

/**
 * Monotonic revision tracker for the real async autosave boundary. A response may
 * acknowledge only the snapshot revision it captured before awaiting the provider.
 */
export class ComposerAutosaveRevisions {
  private currentRevision = 0;
  private acknowledgedRevision = -1;

  markEdited(): number {
    this.currentRevision += 1;
    return this.currentRevision;
  }

  capture(): number {
    return this.currentRevision;
  }

  resolveSuccess(revision: number): ComposerSaveDecision {
    if (revision <= this.acknowledgedRevision) return { effect: 'none' };

    this.acknowledgedRevision = revision;
    return revision === this.currentRevision
      ? { effect: 'server', dirty: false }
      : { effect: 'local', dirty: true };
  }

  resolveFailure(revision: number): ComposerSaveDecision {
    if (revision <= this.acknowledgedRevision) return { effect: 'none' };
    return revision === this.currentRevision
      ? { effect: 'error', dirty: true }
      : { effect: 'local', dirty: true };
  }
}

export type VersionedComposerSaveResult<T> =
  | {
      ok: true;
      value: T;
      revision: number;
      decision: ComposerSaveDecision;
    }
  | {
      ok: false;
      error: unknown;
      revision: number;
      decision: ComposerSaveDecision;
    };

/** Capture-before-await seam shared by production and the deferred-request regression. */
export async function runVersionedComposerSave<T>(
  revisions: ComposerAutosaveRevisions,
  request: () => Promise<T>,
): Promise<VersionedComposerSaveResult<T>> {
  const revision = revisions.capture();

  try {
    const value = await request();
    return { ok: true, value, revision, decision: revisions.resolveSuccess(revision) };
  } catch (error) {
    return { ok: false, error, revision, decision: revisions.resolveFailure(revision) };
  }
}
