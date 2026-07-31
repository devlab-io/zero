import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- Couture : on teste les VRAIS corps de resolver de mail.ts sans le middleware tRPC
// (trpc.ts tire cloudflare:workers + redis + ratelimit). `../trpc` est remplacé par un
// builder fluide fidèle qui CAPTURE input/output/resolver ; on invoque ensuite le resolver
// avec un ctx fabriqué. Les dépendances réseau/DB (env, server-utils, hono context) sont
// des fakes en mémoire → déterministe, zéro réseau. -----------------------------------

const procBuild = (partial: Record<string, unknown> = {}): any => ({
  input: (inputSchema: unknown) => procBuild({ ...partial, inputSchema }),
  output: (outputSchema: unknown) => procBuild({ ...partial, outputSchema }),
  query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
  mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
});

vi.mock('../trpc', () => ({
  router: (defs: unknown) => defs,
  activeDriverProcedure: procBuild(),
  privateProcedure: procBuild(),
}));

// KV en mémoire
function makeKV() {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn(async (k: string) => map.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => void map.set(k, v)),
    delete: vi.fn(async (k: string) => void map.delete(k)),
  };
}

const KV = {
  snoozed_emails: makeKV(),
  gmail_processing_threads: makeKV(),
  pending_emails_status: makeKV(),
  pending_emails_payload: makeKV(),
  scheduled_emails: makeKV(),
};
const send_email_queue = { send: vi.fn(async () => {}) };
const fakeEnv = {
  ...KV,
  send_email_queue,
  HYPERDRIVE: { connectionString: 'postgres://fake' },
};
vi.mock('../../env', () => ({ env: fakeEnv }));

// --- Outbox d'envoi (send_job) : fake en mémoire reproduisant la sémantique
// CAS des opérations Postgres (dédup par clé, transitions conditionnelles). ---
const sendJobs = new Map<string, any>();
const sendOutbox = {
  sendJobStatuses: ['queued', 'sending', 'sent', 'cancelled', 'failed'] as const,
  createSendJob: vi.fn(async (_db: unknown, input: any) => {
    for (const job of sendJobs.values()) {
      if (
        job.connectionId === input.connectionId &&
        job.clientSubmissionKey === input.clientSubmissionKey
      ) {
        return { job, deduped: true };
      }
    }
    const job = {
      id: `job-${sendJobs.size + 1}`,
      connectionId: input.connectionId,
      clientSubmissionKey: input.clientSubmissionKey,
      status: 'queued',
      payload: input.payload,
      threadId: input.threadId ?? null,
      scheduledSendAt: input.scheduledSendAt ?? null,
      enqueuedAt: null,
      attempts: 0,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sendJobs.set(job.id, job);
    return { job, deduped: false };
  }),
  markSendJobEnqueued: vi.fn(async (_db: unknown, id: string) => {
    const job = sendJobs.get(id);
    if (job) job.enqueuedAt = new Date();
  }),
  cancelSendJob: vi.fn(async (_db: unknown, input: { id: string; connectionId: string }) => {
    const job = sendJobs.get(input.id);
    if (!job || job.connectionId !== input.connectionId) return null;
    if (job.status !== 'queued' && job.status !== 'failed') return null;
    job.status = 'cancelled';
    return job;
  }),
  retrySendJob: vi.fn(async (_db: unknown, input: { id: string; connectionId: string }) => {
    const job = sendJobs.get(input.id);
    if (!job || job.connectionId !== input.connectionId || job.status !== 'failed') return null;
    job.status = 'queued';
    job.error = null;
    return job;
  }),
  getSendJobForConnection: vi.fn(
    async (_db: unknown, input: { id: string; connectionId: string }) => {
      const job = sendJobs.get(input.id);
      return job && job.connectionId === input.connectionId ? job : null;
    },
  ),
  // Scope utilisateur : dans les tests, tout job appartient à user-1.
  getSendJobForUser: vi.fn(async (_db: unknown, input: { id: string; userId: string }) => {
    if (input.userId !== 'user-1') return null;
    return sendJobs.get(input.id) ?? null;
  }),
  listSendJobsForUser: vi.fn(async () => [] as any[]),
};
vi.mock('../../lib/send-outbox', () => sendOutbox);
vi.mock('../../db', () => ({
  createDb: () => ({ db: {}, conn: { end: async () => {} } }),
}));

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../lib/utils', () => ({
  defaultPageSize: 20,
  FOLDERS: {
    SPAM: 'spam',
    INBOX: 'inbox',
    ARCHIVE: 'archive',
    BIN: 'bin',
    DRAFT: 'draft',
    SENT: 'sent',
    SNOOZED: 'snoozed',
  },
}));
vi.mock('@zero/types', () => ({ ThreadsResponseSchema: {} }));
vi.mock('../../lib/driver/types', () => ({ IGetThreadResponseSchema: {} }));
vi.mock('../../services/writing-style-service', () => ({
  updateWritingStyleMatrix: vi.fn(async () => {}),
}));
const processEmailHtml = vi.fn(() => ({ processedHtml: '<p>ok</p>', hasBlockedImages: false }));
vi.mock('../../lib/email-processor', () => ({ processEmailHtml }));
const verify = vi.fn(async () => ({ isVerified: true }));
vi.mock('../../lib/email-verification', () => ({ verify }));

// --- server-utils fakes ---
const stub = {
  suggestRecipients: vi.fn(async () => [{ email: 'a@b.co' }]),
  listDrafts: vi.fn(async () => ({ threads: [{ id: 'd1' }] })),
  rawListThreads: vi.fn(async () => ({ threads: [{ id: 'r1', historyId: '1' }] })),
  normalizeIds: vi.fn(async (ids: string[]) => ({ threadIds: ids })),
  getEmailAliases: vi.fn(async () => [{ email: 'me@x.co', primary: true }]),
  getMessageAttachments: vi.fn(async () => [{ filename: 'f', attachmentId: 'a' }]),
  getRawEmail: vi.fn(async () => 'RAW'),
  sendDraft: vi.fn(async () => {}),
  create: vi.fn(async () => {}),
  reloadFolder: vi.fn(async () => {}),
  forceReSync: vi.fn(async () => {}),
};
const exec = vi.fn();
const getZeroAgent = vi.fn(async (): Promise<any> => ({ stub, exec }));
const getThread = vi.fn(async (): Promise<any> => ({ result: { messages: [] as any[] } }));
const getThreadsFromDB = vi.fn(async (): Promise<any> => ({ threads: [] as any[] }));
const modifyThreadLabelsInDB = vi.fn(async (): Promise<any> => ({ ok: true }));
const deleteAllSpam = vi.fn(async (): Promise<any> => ({ deletedCount: 3 }));
const reSyncThread = vi.fn(async () => {});
const forceReSync = vi.fn(async (): Promise<any> => ({ resynced: true }));
const findUserSettings = vi.fn(
  async (): Promise<any> => ({ settings: { undoSendEnabled: false } }),
);
const getZeroDB = vi.fn(async (): Promise<any> => ({ findUserSettings }));

vi.mock('../../lib/server-utils', () => ({
  getZeroAgent,
  getZeroDB,
  getThread,
  getThreadsFromDB,
  modifyThreadLabelsInDB,
  deleteAllSpam,
  reSyncThread,
  forceReSync,
}));
vi.mock('hono/context-storage', () => ({
  getContext: () => ({ executionCtx: { waitUntil: (p: Promise<unknown>) => p } }),
}));

const { mailRouter } = (await import('./mail')) as { mailRouter: Record<string, any> };

function makeCtx(over: Record<string, unknown> = {}) {
  return {
    activeConnection: { id: 'conn-1', providerId: 'google' },
    sessionUser: { id: 'user-1', name: 'U', email: 'u@x.co' },
    c: { executionCtx: { waitUntil: vi.fn((p: Promise<unknown>) => p) } },
    ...over,
  };
}

async function call(name: string, rawInput?: unknown, ctx = makeCtx()) {
  const proc = mailRouter[name];
  const input = proc.inputSchema ? (proc.inputSchema as any).parse(rawInput ?? {}) : rawInput;
  return proc.resolver({ ctx, input });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const kv of Object.values(KV)) kv.map.clear();
  sendJobs.clear();
  findUserSettings.mockResolvedValue({ settings: { undoSendEnabled: false } });
  getThreadsFromDB.mockResolvedValue({ threads: [] });
  getThread.mockResolvedValue({ result: { messages: [] } });
  stub.normalizeIds.mockImplementation(async (ids: string[]) => ({ threadIds: ids }));
});

describe('mail router — lectures simples', () => {
  it('suggestRecipients délègue au stub', async () => {
    const r = await call('suggestRecipients', { query: 'jo', limit: 5 });
    expect(stub.suggestRecipients).toHaveBeenCalledWith('jo', 5);
    expect(r).toEqual([{ email: 'a@b.co' }]);
  });

  it('forceSync délègue à forceReSync', async () => {
    const r = await call('forceSync');
    expect(forceReSync).toHaveBeenCalledWith('conn-1');
    expect(r).toEqual({ resynced: true });
  });

  it('get renvoie result.result de getThread', async () => {
    getThread.mockResolvedValueOnce({ result: { messages: [{ id: 'm1' }] } });
    const r = await call('get', { id: 'th-1' });
    expect(getThread).toHaveBeenCalledWith('conn-1', 'th-1');
    expect(r).toEqual({ messages: [{ id: 'm1' }] });
  });

  it('openThread renvoie le fil et les HTML traites dans le meme aller-retour', async () => {
    getThread.mockResolvedValueOnce({
      result: {
        messages: [
          { id: 'm1', decodedBody: '<p>one</p>', isDraft: false },
          { id: 'draft', decodedBody: '<p>draft</p>', isDraft: true },
          { id: 'm2', decodedBody: '<p>two</p>', isDraft: false },
        ],
      },
    });

    const r = await call('openThread', {
      id: 'th-1',
      shouldLoadImages: false,
      theme: 'dark',
    });

    expect(getThread).toHaveBeenCalledWith('conn-1', 'th-1');
    expect(processEmailHtml).toHaveBeenCalledTimes(2);
    expect(processEmailHtml).toHaveBeenCalledWith({
      html: '<p>one</p>',
      shouldLoadImages: false,
      theme: 'dark',
    });
    expect(r.thread.messages).toHaveLength(3);
    expect(r.rendered).toEqual({
      m1: { html: '<p>ok</p>', hasBlockedImages: false },
      m2: { html: '<p>ok</p>', hasBlockedImages: false },
    });
  });

  it('openThread borne le pretraitement et isole un HTML invalide', async () => {
    getThread.mockResolvedValueOnce({
      result: {
        messages: Array.from({ length: 10 }, (_, index) => ({
          id: `m${index}`,
          decodedBody: `<p>${index}</p>`,
          isDraft: false,
        })),
      },
    });
    processEmailHtml.mockImplementationOnce(() => {
      throw new Error('invalid html');
    });

    const r = await call('openThread', { id: 'th-1' });

    expect(processEmailHtml).toHaveBeenCalledTimes(8);
    expect(processEmailHtml).not.toHaveBeenCalledWith(
      expect.objectContaining({ html: '<p>0</p>' }),
    );
    expect(processEmailHtml).not.toHaveBeenCalledWith(
      expect.objectContaining({ html: '<p>1</p>' }),
    );
    expect(Object.keys(r.rendered)).toHaveLength(7);
    expect(r.thread.messages).toHaveLength(10);
  });

  it('getEmailAliases / getMessageAttachments / getRawEmail délèguent', async () => {
    expect(await call('getEmailAliases')).toEqual([{ email: 'me@x.co', primary: true }]);
    await call('getMessageAttachments', { messageId: 'm9' });
    expect(stub.getMessageAttachments).toHaveBeenCalledWith('m9', { inlineOnly: undefined });
    expect(await call('getRawEmail', { id: 'x' })).toBe('RAW');
    expect(stub.getRawEmail).toHaveBeenCalledWith('x');
  });
});

describe('mail router — listThreads (branchement dossiers)', () => {
  it('DRAFT → listDrafts', async () => {
    const r = await call('listThreads', { folder: 'draft', q: '', maxResults: 10, cursor: '' });
    expect(stub.listDrafts).toHaveBeenCalled();
    expect(r).toEqual({ threads: [{ id: 'd1' }] });
    expect(getThreadsFromDB).not.toHaveBeenCalled();
  });

  it('avec q → rawListThreads (recherche)', async () => {
    const r = await call('listThreads', { folder: 'inbox', q: 'facture' });
    expect(stub.rawListThreads).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'facture', folder: 'inbox' }),
    );
    expect(r.threads[0].id).toBe('r1');
    expect(getThreadsFromDB).not.toHaveBeenCalled();
  });

  it('q + localPreview → projection DO (getThreadsFromDB avec q), jamais Gmail', async () => {
    getThreadsFromDB.mockResolvedValueOnce({ threads: [{ id: 'p1' }], nextPageToken: null });
    const r = await call('listThreads', {
      folder: 'inbox',
      q: '"Banque de Tahiti"',
      localPreview: true,
    });
    expect(getThreadsFromDB).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({ folder: 'inbox', q: 'Banque de Tahiti' }),
    );
    expect(stub.rawListThreads).not.toHaveBeenCalled();
    expect(r.threads[0].id).toBe('p1');
  });

  it('q à opérateurs + localPreview → page vide, aucun appel réseau', async () => {
    const r = await call('listThreads', {
      folder: 'inbox',
      q: 'is:unread banque',
      localPreview: true,
    });
    expect(r).toEqual({ threads: [], nextPageToken: '' });
    expect(getThreadsFromDB).not.toHaveBeenCalled();
    expect(stub.rawListThreads).not.toHaveBeenCalled();
  });

  it('q à jokers LIKE (`%`/`_`) + localPreview → servi par la projection (motif échappé par search-fold)', async () => {
    getThreadsFromDB.mockResolvedValue({ threads: [], nextPageToken: '' });
    for (const q of ['remise 50%', 'rapport_final']) {
      await call('listThreads', { folder: 'inbox', q, localPreview: true });
      expect(getThreadsFromDB).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ folder: 'inbox', q }),
      );
    }
    expect(stub.rawListThreads).not.toHaveBeenCalled();
  });

  it('localPreview sans q → chemin dossier normal (projection sans filtre texte)', async () => {
    getThreadsFromDB.mockResolvedValueOnce({ threads: [{ id: 't1' }] });
    await call('listThreads', { folder: 'inbox', q: '', localPreview: true });
    expect(getThreadsFromDB).toHaveBeenCalledWith(
      'conn-1',
      expect.not.objectContaining({ q: expect.any(String) }),
    );
  });

  it('inbox vide sans q → planifie une resync (cooldown KV posé)', async () => {
    getThreadsFromDB.mockResolvedValueOnce({ threads: [] });
    await call('listThreads', { folder: 'inbox', q: '' });
    expect(KV.gmail_processing_threads.put).toHaveBeenCalledWith(
      'resync_cooldown_conn-1',
      expect.any(String),
      expect.objectContaining({ expirationTtl: 60 }),
    );
  });

  it('SNOOZED → filtre les fils expirés (unsnooze), garde les futurs/sans-clé', async () => {
    getThreadsFromDB.mockResolvedValueOnce({
      threads: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    });
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    KV.snoozed_emails.map.set('t1__conn-1', past); // expiré → retiré
    KV.snoozed_emails.map.set('t2__conn-1', future); // futur → gardé
    // t3 : pas de clé → gardé
    const r = await call('listThreads', { folder: 'snoozed', q: '' });
    expect(r.threads.map((t: any) => t.id).sort()).toEqual(['t2', 't3']);
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 't1', ['INBOX'], ['SNOOZED']);
    expect(KV.snoozed_emails.delete).toHaveBeenCalledWith('t1__conn-1');
  });
});

describe('mail router — mutations d’étiquettes', () => {
  it.each([
    ['markAsRead', [], ['UNREAD']],
    ['markAsUnread', ['UNREAD'], []],
    ['markAsImportant', ['IMPORTANT'], []],
    ['bulkStar', ['STARRED'], []],
    ['bulkUnstar', [], ['STARRED']],
    ['bulkMarkImportant', ['IMPORTANT'], []],
    ['bulkUnmarkImportant', [], ['IMPORTANT']],
    ['bulkDelete', ['TRASH'], []],
    ['bulkArchive', [], ['INBOX']],
    ['bulkMute', ['MUTE'], []],
  ])('%s applique add=%o remove=%o par fil', async (name, add, remove) => {
    await call(name, { ids: ['a', 'b'] });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 'a', add, remove);
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 'b', add, remove);
  });

  it('modifyLabels : succès quand normalizeIds renvoie des ids', async () => {
    const r = await call('modifyLabels', {
      threadId: ['a'],
      addLabels: ['L'],
      removeLabels: [],
    });
    expect(r).toEqual({ success: true });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 'a', ['L'], []);
  });

  it('modifyLabels : échec quand aucun id normalisé', async () => {
    stub.normalizeIds.mockResolvedValueOnce({ threadIds: [] });
    const r = await call('modifyLabels', { threadId: [], addLabels: [], removeLabels: [] });
    expect(r).toEqual({ success: false, error: 'No label changes specified' });
  });
});

describe('mail router — toggleStar / toggleImportant (agrégation d’état)', () => {
  it('toggleStar : aucun id → échec', async () => {
    stub.normalizeIds.mockResolvedValueOnce({ threadIds: [] });
    expect(await call('toggleStar', { ids: [] })).toEqual({
      success: false,
      error: 'No thread IDs provided',
    });
  });

  it('toggleStar : fil déjà étoilé → retire STARRED', async () => {
    getThread.mockResolvedValue({
      result: { messages: [{ tags: [{ name: 'STARRED' }] }] },
    });
    const r = await call('toggleStar', { ids: ['t1'] });
    expect(r).toEqual({ success: true });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 't1', [], ['STARRED']);
  });

  it('toggleStar : fil non étoilé → ajoute STARRED', async () => {
    getThread.mockResolvedValue({ result: { messages: [{ tags: [] }] } });
    const r = await call('toggleStar', { ids: ['t1'] });
    expect(r).toEqual({ success: true });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 't1', ['STARRED'], []);
  });

  it('toggleImportant : fil non important → ajoute IMPORTANT', async () => {
    getThread.mockResolvedValue({ result: { messages: [{ tags: [] }] } });
    const r = await call('toggleImportant', { ids: ['t1'] });
    expect(r).toEqual({ success: true });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 't1', ['IMPORTANT'], []);
  });
});

describe('mail router — deleteAllSpam', () => {
  it('succès → count', async () => {
    const r = await call('deleteAllSpam');
    expect(r).toEqual({ success: true, message: expect.stringContaining('3'), count: 3 });
  });
  it('erreur → success:false', async () => {
    deleteAllSpam.mockRejectedValueOnce(new Error('kv down'));
    const r = await call('deleteAllSpam');
    expect(r.success).toBe(false);
    expect(r.count).toBe(0);
  });
});

describe('mail router — send (enqueue durable, jamais Gmail dans la requête)', () => {
  const base = { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' };

  it('immédiat (undoSend off) → send_job + Queue délai 0, aucun appel fournisseur', async () => {
    const r = await call('send', { ...base, threadId: 'th-9', clientSendId: 'submit-11111111' });
    expect(sendOutbox.createSendJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        connectionId: 'conn-1',
        clientSubmissionKey: 'submit-11111111',
        threadId: 'th-9',
        payload: expect.objectContaining({ subject: 'S', connectionId: 'conn-1' }),
      }),
    );
    expect(send_email_queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', connectionId: 'conn-1' }),
      { delaySeconds: 0 },
    );
    expect(stub.create).not.toHaveBeenCalled();
    expect(stub.sendDraft).not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: true, queued: true, messageId: 'job-1' });
  });

  it('draftId → conservé dans le payload du job (le consumer fera sendDraft)', async () => {
    await call('send', { ...base, draftId: 'dr-1' });
    expect(sendOutbox.createSendJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: expect.objectContaining({ draftId: 'dr-1' }) }),
    );
    expect(stub.sendDraft).not.toHaveBeenCalled();
    expect(stub.create).not.toHaveBeenCalled();
  });

  it('idempotence : même clientSendId, job déjà enqueued → un seul enqueue, duplicate:true', async () => {
    const first = await call('send', { ...base, clientSendId: 'submit-22222222' });
    expect(sendJobs.get('job-1')?.enqueuedAt).toBeInstanceOf(Date);
    const second = await call('send', { ...base, clientSendId: 'submit-22222222' });
    expect(first).toMatchObject({ success: true, queued: true, messageId: 'job-1' });
    expect(second).toMatchObject({
      success: true,
      queued: true,
      messageId: 'job-1',
      duplicate: true,
    });
    expect(send_email_queue.send).toHaveBeenCalledTimes(1);
    expect(sendJobs.size).toBe(1);
  });

  it('dedupe sent/sending → duplicate success sans republication', async () => {
    await call('send', { ...base, clientSendId: 'submit-aaaaaaaa' });
    send_email_queue.send.mockClear();
    for (const status of ['sending', 'sent'] as const) {
      sendJobs.get('job-1').status = status;
      const r = await call('send', { ...base, clientSendId: 'submit-aaaaaaaa' });
      expect(r).toMatchObject({ success: true, queued: true, duplicate: true });
    }
    expect(send_email_queue.send).not.toHaveBeenCalled();
  });

  it('dedupe cancelled → échec explicite, jamais un succès aveugle', async () => {
    await call('send', { ...base, clientSendId: 'submit-bbbbbbbb' });
    sendJobs.get('job-1').status = 'cancelled';
    const r = await call('send', { ...base, clientSendId: 'submit-bbbbbbbb' });
    expect(r).toEqual({ success: false, error: 'Send was cancelled' });
  });

  it('dedupe failed → échec avec l’erreur du job, qui reste failed et rejouable', async () => {
    await call('send', { ...base, clientSendId: 'submit-cccccccc' });
    sendJobs.get('job-1').status = 'failed';
    sendJobs.get('job-1').error = 'gmail down';
    send_email_queue.send.mockClear();
    const r = await call('send', { ...base, clientSendId: 'submit-cccccccc' });
    expect(r).toEqual({ success: false, error: 'gmail down' });
    expect(sendJobs.get('job-1')?.status).toBe('failed');
    expect(send_email_queue.send).not.toHaveBeenCalled();
    // Toujours rejouable via retrySend.
    const retried = await call('retrySend', { messageId: 'job-1' });
    expect(retried).toMatchObject({ success: true, queued: true });
  });

  it('scheduleAt invalide → erreur', async () => {
    const r = await call('send', { ...base, scheduleAt: 'not-a-date' });
    expect(r).toEqual({ success: false, error: 'Invalid schedule date format' });
  });

  it('scheduleAt passé → erreur', async () => {
    const past = new Date(Date.now() - 100000).toISOString();
    const r = await call('send', { ...base, scheduleAt: past });
    expect(r).toEqual({ success: false, error: 'Schedule time must be in the future' });
  });

  it('undoSend on → queued avec délai ≈15 s (fenêtre d’annulation via la Queue)', async () => {
    findUserSettings.mockResolvedValueOnce({ settings: { undoSendEnabled: true } });
    const r = await call('send', base);
    expect(send_email_queue.send).toHaveBeenCalledTimes(1);
    const [, opts] = send_email_queue.send.mock.calls[0] as unknown as [
      unknown,
      { delaySeconds: number },
    ];
    expect(opts.delaySeconds).toBeGreaterThanOrEqual(14);
    expect(opts.delaySeconds).toBeLessThanOrEqual(15);
    expect(r).toMatchObject({ success: true, queued: true });
  });

  it('scheduleAt long-terme (>12h) → job planifié en DB, pas d’enqueue (sweep cron)', async () => {
    const far = new Date(Date.now() + 13 * 3600 * 1000).toISOString();
    const r = await call('send', { ...base, scheduleAt: far });
    expect(send_email_queue.send).not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: true, scheduled: true, messageId: 'job-1' });
    expect(sendJobs.get('job-1')?.scheduledSendAt).toBeInstanceOf(Date);
  });

  it('échec d’enqueue Queue → job CONSERVÉ (queued, enqueuedAt null) + success:false', async () => {
    send_email_queue.send.mockRejectedValueOnce(new Error('queue down'));
    const r = await call('send', { ...base, clientSendId: 'submit-33333333' });
    expect(r).toEqual({ success: false, error: 'Failed to enqueue email send' });
    // Jamais de suppression : la ligne DB reste l'autorité durable.
    expect(sendJobs.size).toBe(1);
    expect(sendJobs.get('job-1')).toMatchObject({ status: 'queued', enqueuedAt: null });
    // Le retry HTTP même clé republie CE MÊME job dans la Queue.
    const retry = await call('send', { ...base, clientSendId: 'submit-33333333' });
    expect(retry).toMatchObject({
      success: true,
      queued: true,
      messageId: 'job-1',
      duplicate: true,
    });
    expect(send_email_queue.send).toHaveBeenCalledTimes(2);
    expect(sendJobs.get('job-1')?.enqueuedAt).toBeInstanceOf(Date);
    expect(sendJobs.size).toBe(1);
  });

  it('échec d’enqueue répété sur le retry dedupe → job toujours intact, success:false', async () => {
    send_email_queue.send.mockRejectedValueOnce(new Error('queue down'));
    await call('send', { ...base, clientSendId: 'submit-dddddddd' });
    send_email_queue.send.mockRejectedValueOnce(new Error('queue still down'));
    const retry = await call('send', { ...base, clientSendId: 'submit-dddddddd' });
    expect(retry).toEqual({ success: false, error: 'Failed to enqueue email send' });
    expect(sendJobs.get('job-1')).toMatchObject({ status: 'queued', enqueuedAt: null });
  });

  it('plus aucune écriture writing-style/IA sur le hot path d’envoi', async () => {
    const { updateWritingStyleMatrix } = await import('../../services/writing-style-service');
    await call('send', base);
    expect(updateWritingStyleMatrix).not.toHaveBeenCalled();
  });
});

describe('mail router — getSendStatus / retrySend', () => {
  const base = { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' };

  it('getSendStatus renvoie le statut du job de la connexion, unknown sinon', async () => {
    await call('send', { ...base, clientSendId: 'submit-44444444' });
    const r = await call('getSendStatus', { messageId: 'job-1' });
    expect(r).toMatchObject({ status: 'queued' });
    const missing = await call('getSendStatus', { messageId: 'nope' });
    expect(missing).toMatchObject({ status: 'unknown' });
  });

  it('retrySend sur un job failed → requeue + ré-enqueue Queue', async () => {
    await call('send', { ...base, clientSendId: 'submit-55555555' });
    sendJobs.get('job-1').status = 'failed';
    send_email_queue.send.mockClear();
    const r = await call('retrySend', { messageId: 'job-1' });
    expect(r).toMatchObject({ success: true, queued: true, messageId: 'job-1' });
    expect(sendJobs.get('job-1')?.status).toBe('queued');
    expect(send_email_queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1' }),
      { delaySeconds: 0 },
    );
  });

  it('retrySend : job déjà sent → no-op sûr ; cancelled → refus ; inconnu → erreur', async () => {
    await call('send', { ...base, clientSendId: 'submit-66666666' });
    sendJobs.get('job-1').status = 'sent';
    expect(await call('retrySend', { messageId: 'job-1' })).toMatchObject({ success: true });
    sendJobs.get('job-1').status = 'cancelled';
    expect(await call('retrySend', { messageId: 'job-1' })).toMatchObject({ success: false });
    expect(await call('retrySend', { messageId: 'ghost' })).toMatchObject({
      success: false,
      error: 'Send job not found',
    });
  });

  it('retrySend après changement de compte actif → scope utilisateur, envoi via la connexion du job', async () => {
    await call('send', { ...base, clientSendId: 'submit-eeeeeeee' });
    sendJobs.get('job-1').status = 'failed';
    send_email_queue.send.mockClear();
    // Compte actif différent (conn-2), même utilisateur : le retry doit passer
    // et republier avec la connexion PROPRIÉTAIRE du job (conn-1).
    const otherConnectionCtx = makeCtx({
      activeConnection: { id: 'conn-2', providerId: 'google' },
    });
    const r = await call('retrySend', { messageId: 'job-1' }, otherConnectionCtx);
    expect(r).toMatchObject({ success: true, queued: true, messageId: 'job-1' });
    expect(sendJobs.get('job-1')?.status).toBe('queued');
    expect(send_email_queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', connectionId: 'conn-1' }),
      { delaySeconds: 0 },
    );
  });
});

describe('mail router — unsend (send_job autoritatif)', () => {
  const base = { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' };

  it('job queued → annulation CAS, aucun toucher KV', async () => {
    findUserSettings.mockResolvedValueOnce({ settings: { undoSendEnabled: true } });
    await call('send', { ...base, clientSendId: 'submit-77777777' });
    const r = await call('unsend', { messageId: 'job-1' });
    expect(r).toEqual({ success: true });
    expect(sendJobs.get('job-1')?.status).toBe('cancelled');
    expect(KV.pending_emails_status.put).not.toHaveBeenCalled();
  });

  it('job déjà sending/sent → trop tard, refus explicite', async () => {
    await call('send', { ...base, clientSendId: 'submit-88888888' });
    sendJobs.get('job-1').status = 'sending';
    const r = await call('unsend', { messageId: 'job-1' });
    expect(r).toMatchObject({ success: false });
    expect(String(r.error)).toContain('Too late');
  });

  it('job d’une autre connexion → invisible, retombe sur le chemin legacy', async () => {
    await call('send', { ...base, clientSendId: 'submit-99999999' });
    sendJobs.get('job-1').connectionId = 'other-conn';
    const r = await call('unsend', { messageId: 'job-1' });
    // Pas de fuite : le job des autres n'est ni annulé ni révélé.
    expect(sendJobs.get('job-1')?.status).toBe('queued');
    expect(r).toEqual({ success: true }); // legacy no-op (marqueur cancelled KV)
  });
});

describe('mail router — unsend (repli legacy KV)', () => {
  it('rejette l’annulation d’un email planifié d’un autre propriétaire', async () => {
    KV.scheduled_emails.map.set('mid', JSON.stringify({ connectionId: 'other' }));
    const r = await call('unsend', { messageId: 'mid' });
    expect(r).toMatchObject({ success: false });
    expect(String(r.error)).toContain('Unauthorized');
  });

  it('succès → status cancelled + nettoyage KV', async () => {
    KV.scheduled_emails.map.set('mid', JSON.stringify({ connectionId: 'conn-1' }));
    KV.pending_emails_payload.map.set('mid', JSON.stringify({ connectionId: 'conn-1' }));
    const r = await call('unsend', { messageId: 'mid' });
    expect(r).toEqual({ success: true });
    expect(KV.pending_emails_status.put).toHaveBeenCalledWith(
      'mid',
      'cancelled',
      expect.any(Object),
    );
    expect(KV.pending_emails_payload.delete).toHaveBeenCalledWith('mid');
    expect(KV.scheduled_emails.delete).toHaveBeenCalledWith('mid');
  });
});

describe('mail router — delete / snooze', () => {
  it('delete → exec DELETE + reloadFolder(bin)', async () => {
    const r = await call('delete', { id: 'th-1' });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM threads'), 'th-1');
    expect(stub.reloadFolder).toHaveBeenCalledWith('bin');
    expect(r).toBe(true);
  });

  it('snoozeThreads : ids vides → échec', async () => {
    expect(await call('snoozeThreads', { ids: [], wakeAt: new Date().toISOString() })).toEqual({
      success: false,
      error: 'No thread IDs provided',
    });
  });

  it('snoozeThreads : wakeAt passé → échec', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(await call('snoozeThreads', { ids: ['a'], wakeAt: past })).toEqual({
      success: false,
      error: 'Snooze time must be in the future',
    });
  });

  it('snoozeThreads : futur → modif + KV put', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const r = await call('snoozeThreads', { ids: ['a'], wakeAt: future });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 'a', ['SNOOZED'], ['INBOX']);
    expect(KV.snoozed_emails.put).toHaveBeenCalled();
    expect(r).toEqual({ success: true });
  });

  it('unsnoozeThreads : vide → échec ; peuplé → modif + delete KV', async () => {
    expect(await call('unsnoozeThreads', { ids: [] })).toEqual({
      success: false,
      error: 'No thread IDs',
    });
    const r = await call('unsnoozeThreads', { ids: ['a'] });
    expect(modifyThreadLabelsInDB).toHaveBeenCalledWith('conn-1', 'a', ['INBOX'], ['SNOOZED']);
    expect(KV.snoozed_emails.delete).toHaveBeenCalledWith('a__conn-1');
    expect(r).toEqual({ success: true });
  });
});

describe('mail router — traitement de contenu', () => {
  it('processEmailContent → délègue à processEmailHtml', async () => {
    const r = await call('processEmailContent', {
      html: '<b>x</b>',
      shouldLoadImages: false,
      theme: 'light',
    });
    expect(processEmailHtml).toHaveBeenCalledWith({
      html: '<b>x</b>',
      shouldLoadImages: false,
      theme: 'light',
    });
    expect(r).toEqual({ processedHtml: '<p>ok</p>', hasBlockedImages: false });
  });

  it('processEmailContent → TRPCError si le processeur jette', async () => {
    processEmailHtml.mockImplementationOnce(() => {
      throw new Error('bad html');
    });
    await expect(
      call('processEmailContent', { html: 'x', shouldLoadImages: true, theme: 'dark' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('verifyEmail → import dynamique + verify', async () => {
    const r = await call('verifyEmail', { id: 'th-1' });
    expect(verify).toHaveBeenCalledWith('RAW');
    expect(r).toEqual({ isVerified: true });
  });

  it('verifyEmail → {isVerified:false} en cas d’erreur', async () => {
    stub.getRawEmail.mockRejectedValueOnce(new Error('nope'));
    const r = await call('verifyEmail', { id: 'th-1' });
    expect(r).toEqual({ isVerified: false });
  });
});
