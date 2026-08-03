import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(appRoot, relative), 'utf8');

describe('send feedback wiring', () => {
  it('uses a compact in-composer pending state instead of a blocking loading toast', () => {
    const composer = read('components/create/email-composer.tsx');
    const replyHost = read('components/mail/reply-composer.tsx');
    const createHost = read('components/create/create-email.tsx');

    expect(composer).toContain('data-testid="composer-send-pending"');
    expect(composer).toContain('role="status"');
    expect(replyHost).not.toContain('toast.loading');
    expect(createHost).not.toContain('toast.loading');
  });

  it('keeps the reply composer recoverable after collision or enqueue failure', () => {
    const composer = read('components/create/email-composer.tsx');
    const replyHost = read('components/mail/reply-composer.tsx');

    expect(composer).toContain('shouldFinalizeComposerSend(sendOutcome)');
    expect(replyHost.match(/return false;/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
