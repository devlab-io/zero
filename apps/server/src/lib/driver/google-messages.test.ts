import type { GmailTransport } from './google-transport';
import type { IOutgoingMessage } from '../../types';
import { describe, expect, it, vi } from 'vitest';

// google-messages importe google-parse (→ ./utils → server-utils) + ./utils. On coupe les
// feuilles lourdes ; le VRAI pipeline messages s'exécute via le transport factice injecté.
vi.mock('../server-utils', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('hono/context-storage', () => ({ getContext: vi.fn(() => ({})) }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../sanitize-tip-tap-html', () => ({
  sanitizeTipTapHtml: vi.fn(async (html: string) => ({ html, inlineImages: [] })),
}));

const { GmailMessages } = await import('./google-messages');
const { makeFakeTransport, makeFakeGmail, data, gmailError } = await import(
  './__fixtures__/google-http-fake'
);

const asT = (t: unknown) => t as unknown as GmailTransport;

describe('GmailMessages.getAttachment', () => {
  it('récupère la PJ en retry idempotent et remappe l’alphabet base64url', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.attachments.get': () => data({ data: 'a-b_c' }) }),
    });
    const m = new GmailMessages(asT(t));
    await expect(m.getAttachment('msg1', 'att1')).resolves.toBe('a+b/c');
    expect(t.calls.executeRetryFlags).toEqual([true]); // lecture idempotente ⇒ retry
  });

  it('data absente → chaîne vide', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.attachments.get': () => data({}) }),
    });
    await expect(new GmailMessages(asT(t)).getAttachment('m', 'a')).resolves.toBe('');
  });

  it('erreur API → propagée', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.attachments.get': gmailError('403', 403) }),
    });
    await expect(new GmailMessages(asT(t)).getAttachment('m', 'a')).rejects.toThrow('403');
  });
});

describe('GmailMessages.getMessageAttachments', () => {
  it('liste les PJ (métadonnées + corps batché dans l’ordre)', async () => {
    const gmail = makeFakeGmail({
      'users.messages.get': () =>
        data({
          payload: {
            parts: [
              {
                filename: 'a.pdf',
                mimeType: 'application/pdf',
                body: { attachmentId: 'att-a', size: 11 },
                headers: [{ name: 'Content-Type', value: 'application/pdf' }],
              },
              {
                filename: 'b.png',
                mimeType: 'image/png',
                body: { attachmentId: 'att-b', size: 22 },
              },
              // part sans attachmentId → filtrée
              { filename: 'ignore.txt', mimeType: 'text/plain', body: {} },
            ],
          },
        }),
    });
    const refs: { messageId: string; attachmentId: string }[] = [];
    const t = makeFakeTransport({
      gmail,
      // `body` = fromBase64Url(datas[i]) : simple remap URL-safe -_ → +/ (PAS de décodage).
      batchAttachmentsGet: async (r) => {
        refs.push(...r);
        return ['UERG-REFU_QQ', 'UE5H_REFU-QQ'];
      },
    });
    const out = await new GmailMessages(asT(t)).getMessageAttachments('msg1');
    expect(refs).toEqual([
      { messageId: 'msg1', attachmentId: 'att-a' },
      { messageId: 'msg1', attachmentId: 'att-b' },
    ]);
    expect(out).toEqual([
      {
        filename: 'a.pdf',
        mimeType: 'application/pdf',
        size: 11,
        attachmentId: 'att-a',
        contentId: null,
        headers: [{ name: 'Content-Type', value: 'application/pdf' }],
        body: 'UERG+REFU/QQ', // -_ remappés en +/
      },
      {
        filename: 'b.png',
        mimeType: 'image/png',
        size: 22,
        attachmentId: 'att-b',
        contentId: null,
        headers: [],
        body: 'UE5H/REFU+QQ',
      },
    ]);
  });

  it('inlineOnly → uniquement les images CID inline, contentId nettoyé', async () => {
    const gmail = makeFakeGmail({
      'users.messages.get': () =>
        data({
          payload: {
            parts: [
              {
                filename: 'doc.pdf',
                mimeType: 'application/pdf',
                body: { attachmentId: 'att-doc', size: 10 },
              },
              {
                filename: 'logo.png',
                mimeType: 'image/png',
                body: { attachmentId: 'att-logo', size: 5 },
                headers: [
                  { name: 'Content-Disposition', value: 'inline' },
                  { name: 'Content-ID', value: '<logo@x>' },
                ],
              },
            ],
          },
        }),
    });
    const refs: { messageId: string; attachmentId: string }[] = [];
    const t = makeFakeTransport({
      gmail,
      batchAttachmentsGet: async (r) => {
        refs.push(...r);
        return ['SU1H'];
      },
    });
    const out = await new GmailMessages(asT(t)).getMessageAttachments('msg1', {
      inlineOnly: true,
    });
    expect(refs).toEqual([{ messageId: 'msg1', attachmentId: 'att-logo' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ attachmentId: 'att-logo', contentId: 'logo@x', body: 'SU1H' });
  });

  it('sans inlineOnly : PJ classiques + images inline (résolution CID du reader)', async () => {
    const gmail = makeFakeGmail({
      'users.messages.get': () =>
        data({
          payload: {
            parts: [
              {
                filename: 'doc.pdf',
                mimeType: 'application/pdf',
                body: { attachmentId: 'att-doc', size: 10 },
              },
              {
                filename: 'logo.png',
                mimeType: 'image/png',
                body: { attachmentId: 'att-logo', size: 5 },
                headers: [
                  { name: 'Content-Disposition', value: 'inline' },
                  { name: 'Content-ID', value: '<logo@x>' },
                ],
              },
            ],
          },
        }),
    });
    const t = makeFakeTransport({
      gmail,
      batchAttachmentsGet: async (r) => r.map(() => 'QQ'),
    });
    const out = await new GmailMessages(asT(t)).getMessageAttachments('msg1');
    expect(out.map((a) => [a.attachmentId, a.contentId])).toEqual([
      ['att-doc', null],
      ['att-logo', 'logo@x'],
    ]);
  });

  it('message sans parts → aucune PJ, batch appelé avec liste vide', async () => {
    let called: readonly unknown[] | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.get': () => data({ payload: {} }) }),
      batchAttachmentsGet: async (r) => {
        called = r;
        return [];
      },
    });
    await expect(new GmailMessages(asT(t)).getMessageAttachments('m')).resolves.toEqual([]);
    expect(called).toEqual([]);
  });
});

describe('GmailMessages.create / delete', () => {
  const outgoing: IOutgoingMessage = {
    to: [{ email: 'bob@example.com', name: 'Bob' }],
    subject: 'Hi',
    message: '<p>x</p>',
    attachments: [],
    headers: {},
    fromEmail: 'me@devlab.io',
    threadId: 'thread-9',
  };

  it('create sérialise via parseOutgoing puis envoie (raw + threadId)', async () => {
    let sentBody: gmail_v1Body | undefined;
    type gmail_v1Body = { requestBody?: { raw?: string; threadId?: string } };
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.messages.send': (p) => {
          sentBody = p as gmail_v1Body;
          return data({ id: 'sent-1', threadId: 'thread-9' });
        },
      }),
    });
    const res = await new GmailMessages(asT(t)).create(outgoing);
    expect(res).toEqual({ id: 'sent-1', threadId: 'thread-9' });
    expect(sentBody?.requestBody?.threadId).toBe('thread-9');
    expect(typeof sentBody?.requestBody?.raw).toBe('string');
    expect(sentBody?.requestBody?.raw?.length ?? 0).toBeGreaterThan(0);
  });

  it('delete renvoie la donnée de l’API', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.delete': () => data({ ok: true }) }),
    });
    await expect(new GmailMessages(asT(t)).delete('m9')).resolves.toEqual({ ok: true });
  });
});

describe('GmailMessages.getRawEmail', () => {
  it('décode le raw base64 en UTF-8', async () => {
    const rawB64 = Buffer.from('From: a@b.c\r\nSubject: Ping\r\n\r\nHello', 'utf-8').toString(
      'base64',
    );
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.get': () => data({ raw: rawB64 }) }),
    });
    const out = await new GmailMessages(asT(t)).getRawEmail('m1');
    expect(out).toContain('Subject: Ping');
    expect(out).toContain('Hello');
    expect(t.calls.executeRetryFlags).toEqual([true]);
  });

  it('raw absent → lève « No raw email data found »', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.messages.get': () => data({}) }),
    });
    await expect(new GmailMessages(asT(t)).getRawEmail('m1')).rejects.toThrow(
      'No raw email data found',
    );
  });
});
