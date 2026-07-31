import type { GmailTransport } from './google-transport';
import type { GmailMessages } from './google-messages';
import type { GmailLabels } from './google-labels';
import type { gmail_v1 } from '@googleapis/gmail';
import { describe, expect, it, vi } from 'vitest';

// google-threads → ./utils (server-utils→cloudflare), ../utils (→ ../env), google-parse
// (→ sanitize). On neutralise les feuilles lourdes ; le pipeline threads tourne en réel.
vi.mock('../server-utils', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('hono/context-storage', () => ({ getContext: vi.fn(() => ({})) }));
vi.mock('../../env', () => ({ env: {} }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../sanitize-tip-tap-html', () => ({
  sanitizeTipTapHtml: vi.fn(async (html: string) => ({ html, inlineImages: [] })),
}));

const { GmailThreads, normalizeSearch } = await import('./google-threads');
const { makeFakeTransport, makeFakeGmail, data, gmailError } = await import(
  './__fixtures__/google-http-fake'
);

const asT = (t: unknown) => t as unknown as GmailTransport;
const b64url = (s: string) =>
  Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const noMessages = () => ({ getAttachment: vi.fn() }) as unknown as GmailMessages;
const noLabels = () =>
  ({ modifyThreadLabels: vi.fn(), modifyLabels: vi.fn() }) as unknown as GmailLabels;

describe('normalizeSearch — réécriture des requêtes par dossier', () => {
  it('inbox → requête inchangée', () => {
    expect(normalizeSearch('inbox', 'hello')).toEqual({ folder: 'inbox', q: 'hello' });
  });
  it('bin → in:trash, folder neutralisé', () => {
    const r = normalizeSearch('bin', 'facture');
    expect(r.folder).toBeUndefined();
    expect(r.q).toMatch(/^in:trash /);
  });
  it('archive → in:archive AND (...)', () => {
    expect(normalizeSearch('archive', 'x').q).toMatch(/^in:archive AND \(/);
  });
  it('draft → is:draft AND (...)', () => {
    expect(normalizeSearch('draft', 'x').q).toMatch(/^is:draft AND \(/);
  });
  it('snoozed → label:Snoozed AND (...)', () => {
    expect(normalizeSearch('snoozed', 'x').q).toMatch(/^label:Snoozed AND \(/);
  });
  it('dossier quelconque → in:<folder>, folder conservé', () => {
    const r = normalizeSearch('work', 'x');
    expect(r.folder).toBe('work');
    expect(r.q).toMatch(/^in:work /);
  });
});

describe('GmailThreads.list', () => {
  it('mappe les threads, filtre les id non-string, remonte nextPageToken', async () => {
    let listParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.list': (p) => {
          listParams = p;
          return data({
            threads: [
              { id: 'th1', historyId: '100' },
              { id: 'th2' },
              { historyId: '999' }, // id absent → filtré
            ],
            nextPageToken: 'NEXT',
          });
        },
      }),
    });
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).list({
      folder: 'inbox',
      query: 'facture',
      maxResults: 10,
    });
    expect(out.threads).toEqual([
      { id: 'th1', historyId: '100', $raw: { id: 'th1', historyId: '100' } },
      { id: 'th2', historyId: null, $raw: { id: 'th2' } },
    ]);
    expect(out.nextPageToken).toBe('NEXT');
    expect(listParams?.maxResults).toBe(10);
    expect(listParams?.q).toBe('facture'); // inbox → q inchangé
  });

  it('dossier non-inbox → labelIds vide envoyé à l’API', async () => {
    let listParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.list': (p) => {
          listParams = p;
          return data({ threads: [] });
        },
      }),
    });
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).list({
      folder: 'archive',
    });
    expect(listParams?.labelIds).toEqual([]);
    expect(out.nextPageToken).toBeNull();
  });
});

describe('GmailThreads.get / parseThread', () => {
  const messageWithAttachment: gmail_v1.Schema$Message = {
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'hi',
    payload: {
      body: { data: b64url('Hello world') },
      headers: [
        { name: 'From', value: 'alice@example.com' },
        { name: 'Subject', value: 'Sujet' },
      ],
      parts: [
        {
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          body: { attachmentId: 'att1', size: 42 },
          headers: [{ name: 'Content-Disposition', value: 'attachment' }],
        },
      ],
    },
  };
  const draftMessage: gmail_v1.Schema$Message = {
    id: 'm2',
    threadId: 't1',
    labelIds: ['DRAFT'],
    snippet: 'brouillon',
    payload: { headers: [{ name: 'From', value: 'me@devlab.io' }] },
  };

  it('parse un fil : unread, totalReplies (hors draft), latest, labels, PJ (corps vide)', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.get': () => data({ messages: [messageWithAttachment, draftMessage] }),
      }),
    });
    const res = await new GmailThreads(asT(t), noMessages(), noLabels()).get('t1');
    expect(res.messages).toHaveLength(2);
    expect(res.hasUnread).toBe(true);
    expect(res.totalReplies).toBe(1); // le DRAFT ne compte pas
    expect(res.latest?.id).toBe('m1'); // dernier message non-draft
    expect(res.labels).toEqual(
      expect.arrayContaining([
        { id: 'INBOX', name: 'INBOX' },
        { id: 'UNREAD', name: 'UNREAD' },
      ]),
    );
    const withAtt = res.messages.find((m) => m.id === 'm1')!;
    expect(withAtt.attachments).toEqual([
      {
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 42,
        attachmentId: 'att1',
        headers: [{ name: 'Content-Disposition', value: 'attachment' }],
        body: '', // métadonnée seule, corps à la demande
      },
    ]);
    expect(withAtt.decodedBody).toContain('Hello world');
  });

  it('chemin froid : AUCUN getAttachment malgré une image CID inline, ref cid: conservée', async () => {
    // Contrat r2 (Shortwave parity) : parseThread ne télécharge plus les images
    // inline au sync (l'ancienne boucle coûtait 4-7 s par thread image-lourd).
    // Le client les résout à la demande via getMessageAttachments(inlineOnly).
    const inlineMsg: gmail_v1.Schema$Message = {
      id: 'm9',
      threadId: 't9',
      labelIds: ['INBOX'],
      snippet: 's',
      payload: {
        body: { data: b64url('<p>voir cid:img1</p>') },
        headers: [{ name: 'From', value: 'a@b.c' }],
        parts: [
          {
            mimeType: 'image/png',
            body: { attachmentId: 'attImg' },
            headers: [
              { name: 'Content-Disposition', value: 'inline' },
              { name: 'Content-ID', value: '<img1>' },
            ],
          },
        ],
      },
    };
    const messages = { getAttachment: vi.fn(async () => 'IMGB64') } as unknown as GmailMessages;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.threads.get': () => data({ messages: [inlineMsg] }) }),
    });
    const res = await new GmailThreads(asT(t), messages, noLabels()).get('t9');
    expect(messages.getAttachment as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(res.messages[0].decodedBody).toContain('cid:img1');
    expect(res.messages[0].decodedBody).not.toContain('data:image/png');
  });

  it('fil sans messages → résultat vide', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.threads.get': () => data({}) }),
    });
    const res = await new GmailThreads(asT(t), noMessages(), noLabels()).get('empty');
    expect(res).toEqual({
      messages: [],
      latest: undefined,
      hasUnread: false,
      totalReplies: 0,
      labels: [],
    });
  });
});

describe('GmailThreads.getMany — batch + parse', () => {
  it('mappe threadId → fil parsé depuis batchThreadsGet', async () => {
    const raw = new Map<string, gmail_v1.Schema$Thread>([
      ['t1', { messages: [{ id: 'a', labelIds: ['UNREAD'], payload: { headers: [] } }] }],
      ['t2', { messages: [{ id: 'b', labelIds: [], payload: { headers: [] } }] }],
    ]);
    const t = makeFakeTransport({ batchThreadsGet: async () => raw });
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).getMany(['t1', 't2']);
    expect([...out.keys()].sort()).toEqual(['t1', 't2']);
    expect(out.get('t1')?.hasUnread).toBe(true);
    expect(out.get('t2')?.hasUnread).toBe(false);
  });

  it('id absent du batch → non inséré', async () => {
    const t = makeFakeTransport({ batchThreadsGet: async () => new Map() });
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).getMany(['x']);
    expect(out.size).toBe(0);
  });
});

describe('GmailThreads.markAsRead / markAsUnread', () => {
  it('markAsRead retire UNREAD des messages non lus des fils', async () => {
    const meta = new Map<string, gmail_v1.Schema$Thread>([
      [
        't1',
        {
          messages: [
            { id: 'a', labelIds: ['UNREAD'] },
            { id: 'b', labelIds: [] },
          ],
        },
      ],
    ]);
    const labels = noLabels();
    const t = makeFakeTransport({ batchThreadsGet: async () => meta });
    await new GmailThreads(asT(t), noMessages(), labels).markAsRead(['t1']);
    expect(labels.modifyThreadLabels).toHaveBeenCalledWith(['a'], { removeLabelIds: ['UNREAD'] });
  });

  it('markAsUnread ajoute UNREAD aux messages lus', async () => {
    const meta = new Map<string, gmail_v1.Schema$Thread>([
      [
        't1',
        {
          messages: [
            { id: 'a', labelIds: ['UNREAD'] },
            { id: 'b', labelIds: [] },
          ],
        },
      ],
    ]);
    const labels = noLabels();
    const t = makeFakeTransport({ batchThreadsGet: async () => meta });
    await new GmailThreads(asT(t), noMessages(), labels).markAsUnread(['t1']);
    expect(labels.modifyThreadLabels).toHaveBeenCalledWith(['b'], { addLabelIds: ['UNREAD'] });
  });
});

describe('GmailThreads.normalizeIds', () => {
  it('retire le préfixe thread: et laisse les autres intacts', async () => {
    const t = makeFakeTransport();
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).normalizeIds([
      'thread:abc',
      'def',
    ]);
    expect(out).toEqual({ threadIds: ['abc', 'def'] });
  });
});

describe('GmailThreads.deleteAllSpam', () => {
  it('parcourt les pages de spam et déplace vers TRASH', async () => {
    let call = 0;
    const labels = noLabels();
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.list': () => {
          call += 1;
          return call === 1
            ? data({ threads: [{ id: 's1' }, { id: 's2' }], nextPageToken: 'p2' })
            : data({ threads: [] });
        },
      }),
    });
    const res = await new GmailThreads(asT(t), noMessages(), labels).deleteAllSpam();
    expect(res).toEqual({ success: true, message: 'Deleted 2 spam emails', count: 2 });
    expect(labels.modifyLabels).toHaveBeenCalledWith(['s1', 's2'], {
      addLabels: ['TRASH'],
      removeLabels: ['SPAM', 'INBOX'],
    });
  });
});

describe('GmailThreads.listHistory', () => {
  it('renvoie l’historique et le prochain historyId', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.history.list': () => data({ history: [{ id: 'h1' }], historyId: '555' }),
      }),
    });
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).listHistory('100');
    expect(out).toEqual({ history: [{ id: 'h1' }], historyId: '555' });
  });

  it('sans historyId de réponse → conserve celui d’entrée', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.history.list': () => data({}) }),
    });
    const out = await new GmailThreads(asT(t), noMessages(), noLabels()).listHistory('100');
    expect(out).toEqual({ history: [], historyId: '100' });
  });

  it('erreur API propagée', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.history.list': gmailError('500', 500) }),
    });
    await expect(
      new GmailThreads(asT(t), noMessages(), noLabels()).listHistory('100'),
    ).rejects.toThrow('500');
  });
});
