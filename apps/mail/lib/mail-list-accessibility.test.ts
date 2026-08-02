import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(import.meta.dirname, '../components/mail/mail-list-thread.tsx'),
  'utf8',
);

describe('mail list row accessibility contract', () => {
  it('uses a native row button instead of a role=button wrapper with nested controls', () => {
    expect(source).not.toContain('role="button"');
    expect(source).toContain("aria-label={m['states.mailList.openThread']");
    expect(source).toContain('type="button"');
  });

  it('keeps nested quick actions as pointer-enabled siblings of the row button', () => {
    expect(source).toContain('pointer-events-none relative z-10');
    expect(source).toContain('pointer-events-auto flex h-full w-full');
  });
});
