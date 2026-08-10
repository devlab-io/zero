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
});
