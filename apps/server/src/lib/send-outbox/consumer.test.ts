import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { processSendEmailBatch, type SendEmailQueueMessage } from './consumer';
import type { SendJobRow } from './index';

// --- Fakes en mémoire : la sémantique CAS des ops DB est reproduite sur une Map
// (claim atomique par lecture/écriture synchrone — Postgres sérialise en vrai).

type JobSeed = Partial<SendJobRow> & { id: string };

const makeJob = (seed: JobSeed): SendJobRow =>
  ({
    connectionId: 'conn-1',
    clientSubmissionKey: `key-${seed.id}`,
    status: 'queued',
    payload: { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' },
    threadId: null,
    scheduledSendAt: null,
    enqueuedAt: null,
    attempts: 0,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...seed,
  }) as SendJobRow;

const jobs = new Map<string, SendJobRow>();

const ops = {
  claimSendJob: vi.fn(async (_db: unknown, input: { id: string }) => {
    const job = jobs.get(input.id);
    if (!job) return null;
    const staleLease = Date.now() - job.updatedAt.getTime() > 5 * 60_000;
    if (
      job.status !== 'queued' &&
      job.status !== 'failed' &&
      !(job.status === 'sending' && staleLease)
    ) {
      return null;
    }
    const claimed = {
      ...job,
      status: 'sending' as const,
      attempts: job.attempts + 1,
      updatedAt: new Date(),
    };
    jobs.set(input.id, claimed);
    return claimed;
  }),
  getSendJob: vi.fn(async (_db: unknown, id: string) => jobs.get(id) ?? null),
  markSendJobSent: vi.fn(async (_db: unknown, id: string) => {
    const job = jobs.get(id);
    if (!job || job.status !== 'sending') return null;
    const updated = { ...job, status: 'sent' as const, payload: null, updatedAt: new Date() };
    jobs.set(id, updated);
    return updated;
  }),
  markSendJobFailed: vi.fn(async (_db: unknown, id: string, error: string) => {
    const job = jobs.get(id);
    if (!job || job.status !== 'sending') return null;
    const updated = { ...job, status: 'failed' as const, error, updatedAt: new Date() };
    jobs.set(id, updated);
    return updated;
  }),
};

function makeKV() {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn(async (k: string) => map.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => void map.set(k, v)),
    delete: vi.fn(async (k: string) => void map.delete(k)),
  };
}

const stub = {
  sendDraft: vi.fn(async () => {}),
  create: vi.fn(async () => {}),
};
const getAgent = vi.fn(async () => ({ stub }));
const resyncThread = vi.fn(async () => {});

let statusKV: ReturnType<typeof makeKV>;
let payloadKV: ReturnType<typeof makeKV>;

const deps = () => ({
  db: {} as never,
  statusKV: statusKV as unknown as KVNamespace,
  payloadKV: payloadKV as unknown as KVNamespace,
  getAgent,
  resyncThread,
  waitUntil: (p: Promise<unknown>) => void p.catch(() => {}),
  ops,
});

const msg = (body: Record<string, unknown>): SendEmailQueueMessage & { ack: any; retry: any } => ({
  body: body as unknown as SendEmailQueueMessage['body'],
  ack: vi.fn(),
  retry: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  jobs.clear();
  statusKV = makeKV();
  payloadKV = makeKV();
});

describe('send-outbox consumer — chemin send_job', () => {
  it('claim → envoi → sent (payload nullifié) + resync du fil + ack', async () => {
    jobs.set('j1', makeJob({ id: 'j1', threadId: 'th-1' }));
    const message = msg({ messageId: 'j1', jobId: 'j1', connectionId: 'conn-1' });

    await processSendEmailBatch([message], deps());

    expect(stub.create).toHaveBeenCalledTimes(1);
    expect(jobs.get('j1')?.status).toBe('sent');
    expect(jobs.get('j1')?.payload).toBeNull();
    expect(resyncThread).toHaveBeenCalledWith('conn-1', 'th-1');
    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('payload avec draftId → sendDraft, pas create', async () => {
    jobs.set(
      'j2',
      makeJob({ id: 'j2', payload: { draftId: 'dr-1', to: [], subject: 'S', message: 'M' } }),
    );

    await processSendEmailBatch(
      [msg({ jobId: 'j2', messageId: 'j2', connectionId: 'conn-1' })],
      deps(),
    );

    expect(stub.sendDraft).toHaveBeenCalledWith('dr-1', expect.any(Object));
    expect(stub.create).not.toHaveBeenCalled();
    expect(jobs.get('j2')?.status).toBe('sent');
  });

  it('échec fournisseur → failed, payload CONSERVÉ, retry() appelé, pas ack', async () => {
    jobs.set('j3', makeJob({ id: 'j3' }));
    stub.create.mockRejectedValueOnce(new Error('gmail down'));
    const message = msg({ jobId: 'j3', messageId: 'j3', connectionId: 'conn-1' });

    await processSendEmailBatch([message], deps());

    const job = jobs.get('j3');
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('gmail down');
    expect(job?.payload).not.toBeNull();
    expect(message.retry).toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('échec sans retry() runtime → le batch relance l’erreur (retry Queue global)', async () => {
    jobs.set('j4', makeJob({ id: 'j4' }));
    stub.create.mockRejectedValueOnce(new Error('boom'));
    const bare: SendEmailQueueMessage = {
      body: { jobId: 'j4', messageId: 'j4', connectionId: 'conn-1' },
    };

    await expect(processSendEmailBatch([bare], deps())).rejects.toThrow('boom');
    expect(jobs.get('j4')?.status).toBe('failed');
  });

  it('job cancelled → skip sans envoi ; job sent (relivraison) → skip sans double envoi', async () => {
    jobs.set('j5', makeJob({ id: 'j5', status: 'cancelled' }));
    jobs.set('j6', makeJob({ id: 'j6', status: 'sent', payload: null }));
    const m5 = msg({ jobId: 'j5', messageId: 'j5', connectionId: 'conn-1' });
    const m6 = msg({ jobId: 'j6', messageId: 'j6', connectionId: 'conn-1' });

    await processSendEmailBatch([m5, m6], deps());

    expect(stub.create).not.toHaveBeenCalled();
    expect(stub.sendDraft).not.toHaveBeenCalled();
    expect(m5.ack).toHaveBeenCalled();
    expect(m6.ack).toHaveBeenCalled();
  });

  it('doublons du même job dans un batch → un seul envoi (le claim CAS déduplique)', async () => {
    jobs.set('j7', makeJob({ id: 'j7' }));
    const m1 = msg({ jobId: 'j7', messageId: 'j7', connectionId: 'conn-1' });
    const m2 = msg({ jobId: 'j7', messageId: 'j7', connectionId: 'conn-1' });

    await processSendEmailBatch([m1, m2], deps());

    expect(stub.create).toHaveBeenCalledTimes(1);
    expect(jobs.get('j7')?.status).toBe('sent');
    expect(m1.ack).toHaveBeenCalled();
    expect(m2.ack).toHaveBeenCalled();
  });

  it('job disparu → skip acquitté (pas de crash, pas de retry)', async () => {
    const message = msg({ jobId: 'ghost', messageId: 'ghost', connectionId: 'conn-1' });
    await processSendEmailBatch([message], deps());
    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('job claimé sans payload → failed visible, acquitté (retry inutile)', async () => {
    jobs.set('j8', makeJob({ id: 'j8', payload: null }));
    const message = msg({ jobId: 'j8', messageId: 'j8', connectionId: 'conn-1' });

    await processSendEmailBatch([message], deps());

    expect(jobs.get('j8')?.status).toBe('failed');
    expect(stub.create).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalled();
  });
});

describe('send-outbox consumer — chemin legacy KV', () => {
  it('succès → marqueur sent avec TTL puis payload supprimé', async () => {
    payloadKV.map.set(
      'm1',
      JSON.stringify({ to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' }),
    );
    const message = msg({ messageId: 'm1', connectionId: 'conn-1' });

    await processSendEmailBatch([message], deps());

    expect(stub.create).toHaveBeenCalledTimes(1);
    expect(statusKV.put).toHaveBeenCalledWith(
      'm1',
      'sent',
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
    expect(payloadKV.delete).toHaveBeenCalledWith('m1');
    expect(message.ack).toHaveBeenCalled();
  });

  it('échec → payload CONSERVÉ, statut failed, retry() (plus jamais de delete en catch)', async () => {
    payloadKV.map.set('m2', JSON.stringify({ to: [], subject: 'S', message: 'M' }));
    stub.create.mockRejectedValueOnce(new Error('gmail down'));
    const message = msg({ messageId: 'm2', connectionId: 'conn-1' });

    await processSendEmailBatch([message], deps());

    expect(payloadKV.delete).not.toHaveBeenCalled();
    expect(payloadKV.map.has('m2')).toBe(true);
    expect(statusKV.put).toHaveBeenCalledWith('m2', 'failed', expect.any(Object));
    expect(message.retry).toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('cancelled et sent (relivraison) → skip sans envoi', async () => {
    statusKV.map.set('m3', 'cancelled');
    statusKV.map.set('m4', 'sent');
    const m3 = msg({ messageId: 'm3', connectionId: 'conn-1' });
    const m4 = msg({ messageId: 'm4', connectionId: 'conn-1' });

    await processSendEmailBatch([m3, m4], deps());

    expect(stub.create).not.toHaveBeenCalled();
    expect(m3.ack).toHaveBeenCalled();
    expect(m4.ack).toHaveBeenCalled();
  });

  it('payload absent → skip acquitté', async () => {
    const message = msg({ messageId: 'm5', connectionId: 'conn-1' });
    await processSendEmailBatch([message], deps());
    expect(stub.create).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalled();
  });
});
