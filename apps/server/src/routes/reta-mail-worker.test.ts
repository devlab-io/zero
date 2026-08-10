import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'reta-mail-worker.ts'),
  'utf8',
);
const workerSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/reta-mail-worker.mjs'),
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

  it('reads the owning shard and refuses to compose without message content', () => {
    expect(source).toContain('await getThread(item.connectionId, item.threadId)');
    expect(source).not.toContain('await agent.getThread(item.threadId)');
    expect(source).toContain("claimed.job.kind === 'compose' && !context.some");
    expect(source).toContain('Aucun brouillon n’a été créé.');
  });

  it('checks the complete Codex runtime before reserving a job', () => {
    const runtimeCheck = workerSource.indexOf('await ensureCodexRuntime();');
    const jobClaim = workerSource.indexOf("await workerFetch('/jobs/claim-next'");

    expect(runtimeCheck).toBeGreaterThan(-1);
    expect(jobClaim).toBeGreaterThan(runtimeCheck);
    expect(workerSource).toContain('PATH: CODEX_RUNTIME_PATH');
    expect(workerSource).toContain('Aucun brouillon n’a été réservé.');
  });
});
