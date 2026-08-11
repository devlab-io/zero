import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'queue-review.tsx'), 'utf8');

describe('queue draft editor synchronization', () => {
  it('does not replace unsaved edits on every polling response', () => {
    expect(source).toContain('key={`${selectedItem.id}:${selectedItem.contentRevision}`}');
    expect(source).not.toContain('key={item.id}\n                      item={item}');
  });

  it('loads a new server revision into TipTap without emitting another edit', () => {
    expect(source).toContain('editor.commands.setContent(nextContent, false)');
  });

  it('keeps ready drafts editable in the queue and saves them automatically', () => {
    expect(source).toContain("item.status === 'draft_ready' ?");
    expect(source).toContain('<QueueBodyEditor');
    expect(source).toContain('window.setTimeout(() =>');
    expect(source).toContain('await persistCurrentDraft()');
    expect(source).not.toContain("m['queue.actions.save']()");
  });

  it('does not autosave TipTap normalization before the user edits the body', () => {
    expect(source).toContain('const hasUserInputRef = useRef(false)');
    expect(source).toContain('hasUserInputRef.current && currentEditor.isFocused');
    expect(source).toContain('event.isTrusted && view.hasFocus()');
    expect(source).toContain('beforeinput: (view, event) =>');
  });

  it('uses a searchable master-detail layout instead of stacking every editor', () => {
    expect(source).toContain("m['queue.search.placeholder']()");
    expect(source).toContain('lg:grid-cols-[320px_minmax(0,1fr)]');
    expect(source).toContain('<QueueItemListRow');
    expect(source).toContain('item={selectedItem}');
  });

  it('shows the source conversation before the editable reply on one flat full-width surface', () => {
    expect(source).toContain('<QueueThreadContext');
    expect(source).toContain('threadId={item.threadId}');
    expect(source).toContain('<div className="w-full">');
    expect(source).not.toContain('mx-auto w-full max-w-4xl');
    expect(source).not.toContain('rounded-xl border border-zinc-200 shadow-sm');
    expect(source).not.toContain('xl:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]');
    expect(source).not.toContain('h-[260px] min-h-[260px]');
    const threadIndex = source.indexOf('<QueueThreadContext\n');
    const editorIndex = source.indexOf('<QueueBodyEditor\n');
    expect(threadIndex).toBeGreaterThan(0);
    expect(editorIndex).toBeGreaterThan(threadIndex);
  });

  it('keeps the queue navigable and sendable from the keyboard', () => {
    expect(source).toContain('moveDraftSelection');
    expect(source).toContain("keys: ['j']");
    expect(source).toContain("keys: ['k']");
    expect(source).toContain('data-queue-row');
    expect(source).toContain('CSS.escape(selectedItemId)');
  });

  it('makes Send the terminal primary action with the 15s cancel hint beside it', () => {
    expect(source).toContain("m['queue.item.sendHint']()");
    expect(source).toContain('text-muted-foreground hidden text-xs xl:inline');
    const cancelIndex = source.indexOf("m['queue.actions.reject']()");
    const sendIndex = source.indexOf("m['queue.actions.approve']()");
    expect(cancelIndex).toBeGreaterThan(0);
    expect(sendIndex).toBeGreaterThan(cancelIndex);
    expect(source).toContain("m['queue.item.undoCountdown']({ seconds: undoSeconds })");
  });

  it('searches saved drafts and the mailbox as well as Agent replies', () => {
    expect(source).toContain('trpc.drafts.list.queryOptions');
    expect(source).toContain('trpc.mail.listThreads.queryOptions');
    expect(source).toContain("folder: ''");
    expect(source).toContain('localPreview: true');
    expect(source).toContain('savedDraftSearchResults');
    expect(source).toContain('mailboxSearchResults');
    expect(source).toContain('agentDraftIds.has(row.id)');
    expect(source).toContain('<SavedDraftSearchRow');
    expect(source).toContain('<MailboxSearchResultRow');
  });

  it('flushes a dirty draft when switching the selected result', () => {
    expect(source).toContain('isDirtyRef.current && !savePromiseRef.current');
    expect(source).toContain('onSaveRef.current(currentDraftRef.current)');
  });

  it('purges a Gmail draft after the Agent outbox confirms it sent', () => {
    expect(source).toContain("item.status === 'sent'");
    expect(source).toContain('pruneSentDraftFromCache(');
    expect(source).toContain('publishDraftSent({');
    expect(source).toContain('reconciledSentOutboxIds');
  });
});
