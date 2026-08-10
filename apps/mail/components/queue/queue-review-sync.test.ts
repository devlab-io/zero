import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'queue-review.tsx'), 'utf8');

describe('queue draft editor synchronization', () => {
  it('does not replace unsaved edits on every polling response', () => {
    expect(source).toContain('key={`${item.id}:${item.contentRevision}`}');
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
});
