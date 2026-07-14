import {
  canRetryComposerSave,
  ComposerAutosaveRevisions,
  reduceComposerSaveStatus,
  runVersionedComposerSave,
  shouldScheduleComposerAutosave,
} from './composer-trust';
import { draftStorageKey, loadLocalDraft, saveLocalDraft } from '@/lib/draft-storage';
import { MailListSkeleton, ReplyComposerSkeleton } from './mail-skeleton';
import { selectThreadViewState } from '@/lib/thread-view-state';
import { selectMailListState } from '@/lib/mail-list-state';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('mail UX trust contracts', () => {
  it('keeps cached rows when refresh/offline fails and never calls failure empty', () => {
    expect(
      selectMailListState({ itemCount: 4, isLoading: false, isError: true, isOffline: false }),
    ).toBe('stale');
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: true, isOffline: false }),
    ).toBe('error');
    expect(
      selectMailListState({ itemCount: 0, isLoading: false, isError: false, isOffline: true }),
    ).toBe('error');
  });

  it('turns a missing failed thread into a finite retry state, while stale data stays ready', () => {
    expect(
      selectThreadViewState({
        hasSelection: true,
        hasData: false,
        isLoading: false,
        isError: true,
        isOffline: false,
      }),
    ).toBe('error');
    expect(
      selectThreadViewState({
        hasSelection: true,
        hasData: true,
        isLoading: false,
        isError: true,
        isOffline: true,
      }),
    ).toBe('ready');
  });

  it('never turns a failed autosave into a server-saved announcement', () => {
    const local = reduceComposerSaveStatus('idle', { type: 'LOCAL_PERSISTED' });
    const saving = reduceComposerSaveStatus(local, { type: 'SAVE_STARTED' });
    const failed = reduceComposerSaveStatus(saving, { type: 'SAVE_FAILED' });

    expect([local, saving, failed]).toEqual(['local', 'saving', 'error']);
    expect(canRetryComposerSave(failed)).toBe(true);
    expect(reduceComposerSaveStatus(failed, { type: 'SAVE_SUCCEEDED' })).toBe('server');
  });

  it('keeps edit B local after suspended save A succeeds, then acknowledges B itself', async () => {
    const revisions = new ComposerAutosaveRevisions();
    let resolveA!: (value: { id: string }) => void;
    const deferredA = new Promise<{ id: string }>((resolve) => {
      resolveA = resolve;
    });

    revisions.markEdited(); // snapshot A
    const saveA = runVersionedComposerSave(revisions, () => deferredA);

    revisions.markEdited(); // snapshot B while A is still in flight
    resolveA({ id: 'draft-1' });
    const resultA = await saveA;

    expect(resultA.ok).toBe(true);
    expect(resultA.decision).toEqual({ effect: 'local', dirty: true });
    expect(
      shouldScheduleComposerAutosave({
        dirty: true,
        status: 'local',
        inFlight: false,
      }),
    ).toBe(true);

    let resolveB!: (value: { id: string }) => void;
    const deferredB = new Promise<{ id: string }>((resolve) => {
      resolveB = resolve;
    });
    const saveB = runVersionedComposerSave(revisions, () => deferredB);
    let saveBSettled = false;
    void saveB.then(() => {
      saveBSettled = true;
    });

    await Promise.resolve();
    expect(saveBSettled).toBe(false);

    resolveB({ id: 'draft-1' });
    const resultB = await saveB;

    expect(resultB.ok).toBe(true);
    expect(resultB.revision).toBeGreaterThan(resultA.revision);
    expect(resultB.decision).toEqual({ effect: 'server', dirty: false });
  });

  it('restores recipients, subject and body from the durable local snapshot', () => {
    const key = draftStorageKey({ threadId: 'thread-1', replyId: 'message-2' });
    const snapshot = {
      to: ['client@example.com'],
      cc: ['finance@example.com'],
      bcc: ['archive@example.com'],
      subject: 'Quarterly follow-up',
      message: '<p>Full restored body</p>',
      savedAt: Date.now(),
    };

    expect(saveLocalDraft(key, snapshot)).toBe(true);
    expect(loadLocalDraft(key)).toEqual(snapshot);
    window.localStorage.removeItem(key);
  });

  it('renders stable, named list and reply placeholders instead of blank Suspense fallbacks', () => {
    const list = renderToStaticMarkup(<MailListSkeleton />);
    const composer = renderToStaticMarkup(<ReplyComposerSkeleton />);

    expect(list).toContain('role="status"');
    expect(list).toContain('min-h-24');
    expect(composer).toContain('role="status"');
    expect(composer).toContain('min-h-[18rem]');
    expect(composer).toContain('Loading composer');
  });
});
