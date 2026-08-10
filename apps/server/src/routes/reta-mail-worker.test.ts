import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'reta-mail-worker.ts'),
  'utf8',
);

describe('RETA local worker surface', () => {
  it('exposes enrollment, claim, complete and fail without any send endpoint', () => {
    expect(source).toContain(".post('/enroll'");
    expect(source).toContain(".post('/jobs/claim-next'");
    expect(source).toContain(".post('/jobs/:id/complete'");
    expect(source).toContain(".post('/jobs/:id/fail'");
    expect(source).not.toMatch(/\.post\(['"][^'"]*send/i);
    expect(source).not.toContain('sendConfirmedDraft');
    expect(source).not.toContain('sendStoredDraft');
    expect(source).not.toContain('.sendDraft(');
  });

  it('requires a bearer-authenticated device for every work mutation', () => {
    expect(source.match(/const device = await authenticate\(c\);/g)).toHaveLength(4);
    expect(source).toContain("return c.json({ error: 'Unauthorized' }, 401)");
  });
});
