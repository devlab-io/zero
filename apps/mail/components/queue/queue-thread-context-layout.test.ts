import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'queue-thread-context.tsx'), 'utf8');

describe('queue thread layout', () => {
  it('renders a flat full-width thread instead of inset message cards', () => {
    expect(source).toContain('<ol className="divide-border/70 divide-y">');
    expect(source).toContain('<ThreadMessage message={context.latest} defaultExpanded />');
    expect(source).toContain('<MailContent');
    expect(source).not.toContain('LatestMessageCard');
    expect(source).not.toContain('rounded-xl');
    expect(source).not.toContain('shadow-sm');
    expect(source).not.toContain('max-w-4xl');
  });

  it('keeps every previous message directly accessible as a collapsed row', () => {
    expect(source).toContain('context.earlier.map((message) =>');
    expect(source).toContain('aria-expanded={expanded}');
    expect(source).not.toContain('showHistory');
    expect(source).not.toContain('hideHistory');
  });
});
