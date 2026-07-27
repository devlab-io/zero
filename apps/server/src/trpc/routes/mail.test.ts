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
    put: vi.fn(
      async (k: string, v: string, _options?: { expirationTtl?: number }) => void map.set(k, v),
    ),
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

// Registre de connexion (Durable Object) : c'est desormais LUI qui decide si une
// annulation d'envoi differe est encore possible, et non plus la seule marque KV. Le fake
// est pilotable pour pouvoir exercer les deux verdicts, accepte et refuse.
const registryStub = {
  cancelScheduledSend: vi.fn(async () => ({ cancelled: true, reason: 'cancelled' })),
};
const SHARD_REGISTRY = {
  idFromName: vi.fn((name: string) => ({ name })),
  get: vi.fn(() => registryStub),
};
const fakeEnv = { ...KV, send_email_queue, SHARD_REGISTRY };
vi.mock('../../env', () => ({ env: fakeEnv }));

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
    expect(stub.getMessageAttachments).toHaveBeenCalledWith('m9');
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

describe('mail router — send (immédiat / planifié / erreurs)', () => {
  const base = { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M' };

  it('immédiat (undoSend off) → stub.create, reSync si threadId', async () => {
    const r = await call('send', { ...base, threadId: 'th-9' });
    expect(stub.create).toHaveBeenCalled();
    expect(reSyncThread).toHaveBeenCalledWith('conn-1', 'th-9');
    expect(r).toEqual({ success: true });
  });

  it('draftId → stub.sendDraft', async () => {
    await call('send', { ...base, draftId: 'dr-1' });
    expect(stub.sendDraft).toHaveBeenCalledWith('dr-1', expect.any(Object));
    expect(stub.create).not.toHaveBeenCalled();
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

  it('undoSend on → mise en file (queued) + KV pending/payload', async () => {
    findUserSettings.mockResolvedValueOnce({ settings: { undoSendEnabled: true } });
    const r = await call('send', base);
    expect(KV.pending_emails_status.put).toHaveBeenCalled();
    expect(KV.pending_emails_payload.put).toHaveBeenCalled();
    expect(send_email_queue.send).toHaveBeenCalled();
    expect(r).toMatchObject({ success: true, queued: true });
  });

  it('scheduleAt long-terme (>12h) → scheduledKV + scheduled:true', async () => {
    const far = new Date(Date.now() + 13 * 3600 * 1000).toISOString();
    const r = await call('send', { ...base, scheduleAt: far });
    expect(KV.scheduled_emails.put).toHaveBeenCalled();
    expect(r).toMatchObject({ success: true, scheduled: true });
  });

  // P1 — perte de donnees garantie. Le corps etait ecrit avec `expirationTtl: 60*60*24`
  // alors que la planification courait jusqu'a un an : tout mail programme au-dela de
  // ~24 h perdait son contenu AVANT son echeance, et le cron ne remet en file que
  // `{messageId, connectionId, sendAt}`. Les trois clefs partagent desormais UNE duree
  // de vie, calee sur l'echeance.
  it('planification a 7 jours → statut, corps et planification portent le MEME TTL, > 24 h', async () => {
    const sevenDays = 7 * 24 * 3600;
    const far = new Date(Date.now() + sevenDays * 1000).toISOString();
    await call('send', { ...base, scheduleAt: far });

    const ttlOf = (kv: ReturnType<typeof makeKV>) =>
      (kv.put.mock.calls.at(-1)?.[2] as { expirationTtl?: number } | undefined)?.expirationTtl;

    const statusTtl = ttlOf(KV.pending_emails_status);
    const payloadTtl = ttlOf(KV.pending_emails_payload);
    const scheduleTtl = ttlOf(KV.scheduled_emails);

    expect(payloadTtl).toBe(statusTtl);
    expect(payloadTtl).toBe(scheduleTtl);
    expect(payloadTtl).toBeGreaterThan(sevenDays);
    expect(payloadTtl).toBeGreaterThan(60 * 60 * 24);
  });

  // `headers` était un `z.record(z.string())` nu : le client posait n'importe quel en-tête,
  // avec n'importe quelle valeur, et lib/driver/google-parse.ts le reversait dans
  // `msg.setHeader` — que mimetext n'échappe pas. La frontière REFUSE désormais l'appel.
  it('refuse une valeur d’en-tête porteuse de CRLF (injection MIME)', async () => {
    await expect(
      call('send', {
        ...base,
        headers: { 'In-Reply-To': '<p@x>\r\nBcc: attacker@evil.example' },
      }),
    ).rejects.toThrow();
  });

  it('refuse un nom d’en-tête porteur de CRLF', async () => {
    await expect(
      call('send', { ...base, headers: { 'X\r\nBcc: attacker@evil.example': 'v' } }),
    ).rejects.toThrow();
  });

  it('refuse un en-tête hors allowlist', async () => {
    await expect(
      call('send', { ...base, headers: { Bcc: 'attacker@evil.example' } }),
    ).rejects.toThrow();
  });

  it('accepte les trois en-têtes réellement produits par le composeur de réponse', async () => {
    const r = await call('send', {
      ...base,
      headers: { 'In-Reply-To': '<p@x>', References: '<r1@x> <r2@x>', 'Thread-Id': 'th-9' },
    });
    expect(r).toEqual({ success: true });
  });
});

describe('mail router — unsend (ownership)', () => {
  beforeEach(() => {
    registryStub.cancelScheduledSend.mockResolvedValue({ cancelled: true, reason: 'cancelled' });
  });

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

  // Miroir du meme defaut de TTL : la marque `cancelled` vivait 1 h. Sur un mail planifie
  // a plusieurs jours elle expirait avant l'echeance, le consommateur ne la voyait plus,
  // et un mail annule par l'utilisateur partait quand meme.
  it('la marque `cancelled` survit a l’echeance planifiee', async () => {
    const sendAt = Date.now() + 5 * 24 * 3600 * 1000;
    KV.scheduled_emails.map.set('mid-far', JSON.stringify({ connectionId: 'conn-1', sendAt }));
    await call('unsend', { messageId: 'mid-far' });

    const ttl = (
      KV.pending_emails_status.put.mock.calls.at(-1)?.[2] as { expirationTtl?: number } | undefined
    )?.expirationTtl;
    expect(ttl).toBeGreaterThan(5 * 24 * 3600);
    expect(ttl).toBeGreaterThan(60 * 60);
  });

  it('sans planification connue, la marque couvre le delai de file maximal (12 h)', async () => {
    KV.pending_emails_payload.map.set('mid-q', JSON.stringify({ connectionId: 'conn-1' }));
    await call('unsend', { messageId: 'mid-q' });

    const ttl = (
      KV.pending_emails_status.put.mock.calls.at(-1)?.[2] as { expirationTtl?: number } | undefined
    )?.expirationTtl;
    expect(ttl).toBeGreaterThan(12 * 3600);
  });

  // -------------------------------------------------------------------------
  // L'annulation passe par la BARRIERE FORTE (constat 4).
  //
  // Elle ne vivait que dans KV, alors que `scheduled-send.ts` documente lui-meme ce
  // controle comme un pre-filtre non garant : KV est eventuellement coherent et sans
  // compare-and-set. La garantie appartient a la reservation SQL du Durable Object, la
  // meme qui decide deja si l'envoi part.
  // -------------------------------------------------------------------------

  it('l’annulation est posee dans le REGISTRE, pas seulement dans KV', async () => {
    KV.scheduled_emails.map.set('mid-do', JSON.stringify({ connectionId: 'conn-1' }));
    const r = await call('unsend', { messageId: 'mid-do' });

    expect(r).toEqual({ success: true });
    expect(registryStub.cancelScheduledSend).toHaveBeenCalledWith('mid-do', expect.any(Number));
    // Et sur le registre de SA connexion, pas un autre.
    expect(SHARD_REGISTRY.idFromName).toHaveBeenCalledWith('connection:conn-1:registry');
  });

  it('un envoi DEJA EN VOL fait echouer l’annulation au lieu de la simuler', async () => {
    registryStub.cancelScheduledSend.mockResolvedValue({ cancelled: false, reason: 'in-flight' });
    KV.scheduled_emails.map.set('mid-late', JSON.stringify({ connectionId: 'conn-1' }));
    KV.pending_emails_payload.map.set('mid-late', JSON.stringify({ connectionId: 'conn-1' }));
    KV.pending_emails_payload.delete.mockClear();

    const r = await call('unsend', { messageId: 'mid-late' });

    expect(r).toMatchObject({ success: false });
    expect(String(r.error)).toContain('Too late');
    // Le defaut exact qu'on ferme : le corps du mail etait efface et l'utilisateur croyait
    // avoir annule un envoi qui partait quand meme.
    expect(KV.pending_emails_payload.delete).not.toHaveBeenCalled();
  });

  it('un envoi DEJA REGLE fait echouer l’annulation', async () => {
    registryStub.cancelScheduledSend.mockResolvedValue({
      cancelled: false,
      reason: 'already-settled',
    });
    KV.scheduled_emails.map.set('mid-done', JSON.stringify({ connectionId: 'conn-1' }));

    const r = await call('unsend', { messageId: 'mid-done' });
    expect(r).toMatchObject({ success: false });
    expect(String(r.error)).toContain('already completed');
  });

  it('le controle de propriete precede toujours l’ecriture dans le registre', async () => {
    registryStub.cancelScheduledSend.mockClear();
    KV.scheduled_emails.map.set('mid-thief', JSON.stringify({ connectionId: 'other' }));

    const r = await call('unsend', { messageId: 'mid-thief' });
    expect(r).toMatchObject({ success: false });
    expect(registryStub.cancelScheduledSend).not.toHaveBeenCalled();
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
