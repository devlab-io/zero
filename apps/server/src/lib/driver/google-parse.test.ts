import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { gmail_v1 } from '@googleapis/gmail';
import type { IOutgoingMessage } from '../../types';

// google-parse importe `./utils` (→ server-utils → cloudflare:workers) et
// `../sanitize-tip-tap-html` (react-email, lourd). On neutralise ces feuilles ; le reste
// (email-utils, mimetext, he) tourne en RÉEL — c'est le cœur du parsing produit.
vi.mock('../server-utils', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('hono/context-storage', () => ({ getContext: vi.fn(() => ({})) }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const sanitizeTipTapHtml = vi.fn(async (html: string) => ({ html, inlineImages: [] as unknown[] }));
vi.mock('../sanitize-tip-tap-html', () => ({ sanitizeTipTapHtml }));

const { parseMessage, findAttachments, parseOutgoing } = await import('./google-parse');

const decodeRaw = (raw: string) => Buffer.from(raw, 'base64').toString('utf-8');

beforeEach(() => {
  sanitizeTipTapHtml.mockClear();
  sanitizeTipTapHtml.mockImplementation(async (html: string) => ({ html, inlineImages: [] }));
});

describe('parseMessage — extraction des en-têtes (cas réel complet)', () => {
  const full: gmail_v1.Schema$Message = {
    id: 'm1',
    threadId: 't1',
    snippet: 'Bonjour &amp; bienvenue',
    labelIds: ['INBOX', 'UNREAD'],
    payload: {
      headers: [
        { name: 'Date', value: 'Mon, 01 Jul 2026 10:00:00 +0000' },
        { name: 'From', value: 'Alice <alice@example.com>' },
        { name: 'Subject', value: '"Rapport" trimestriel' },
        { name: 'References', value: '<ref1@x> <ref2@x>' },
        { name: 'In-Reply-To', value: '<parent@x>' },
        { name: 'Message-ID', value: '<msg1@x>' },
        { name: 'List-Unsubscribe', value: '<https://unsub.example>' },
        { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
        { name: 'Reply-To', value: 'reply@example.com' },
        { name: 'To', value: 'bob@example.com' },
        { name: 'To', value: 'carol@example.com' },
        { name: 'Cc', value: 'dan@example.com' },
      ],
    },
  };

  it('mappe date/subject/messageId/references/inReplyTo/reply-to/list-unsubscribe', () => {
    const r = parseMessage(full);
    expect(r.receivedOn).toBe('Mon, 01 Jul 2026 10:00:00 +0000');
    expect(r.subject).toBe('Rapport trimestriel'); // guillemets retirés + trim
    expect(r.messageId).toBe('<msg1@x>');
    expect(r.references).toBe('<ref1@x> <ref2@x>');
    expect(r.inReplyTo).toBe('<parent@x>');
    expect(r.replyTo).toBe('reply@example.com');
    expect(r.listUnsubscribe).toBe('<https://unsub.example>');
    expect(r.listUnsubscribePost).toBe('List-Unsubscribe=One-Click');
  });

  it('sender via parseFrom, destinataires multiples via parseAddressList, cc', () => {
    const r = parseMessage(full);
    expect(r.sender).toEqual({ name: 'Alice', email: 'alice@example.com' });
    // Adresses nues (sans display-name) → name '' (repli email-addresses).
    expect(r.to).toEqual([
      { name: '', email: 'bob@example.com' },
      { name: '', email: 'carol@example.com' },
    ]);
    expect(r.cc).toEqual([{ name: '', email: 'dan@example.com' }]);
  });

  it('title décode le snippet HTML, UNREAD + tags depuis labelIds', () => {
    const r = parseMessage(full);
    expect(r.title).toBe('Bonjour & bienvenue');
    expect(r.unread).toBe(true);
    expect(r.isDraft).toBe(false);
    expect(r.tags).toEqual([
      { id: 'INBOX', name: 'INBOX', type: 'user' },
      { id: 'UNREAD', name: 'UNREAD', type: 'user' },
    ]);
    expect(r.id).toBe('m1');
    expect(r.threadId).toBe('t1');
  });

  it('en-tête SimpleLogin prime sur From', () => {
    const r = parseMessage({
      ...full,
      payload: {
        headers: [
          { name: 'X-SimpleLogin-Original-From', value: 'origin@real.io' },
          { name: 'From', value: 'alias@simplelogin.io' },
        ],
      },
    });
    expect(r.sender).toEqual({ name: 'origin@real.io', email: 'origin@real.io' });
  });

  it('DRAFT dans labelIds → isDraft true', () => {
    expect(parseMessage({ ...full, labelIds: ['DRAFT'] }).isDraft).toBe(true);
  });

  it('TLS détecté via en-tête Received (STARTTLS)', () => {
    const r = parseMessage({
      ...full,
      payload: {
        headers: [
          { name: 'From', value: 'a@b.c' },
          { name: 'Received', value: 'from mx by mail with ESMTPS (version=TLS1_3 cipher=AEAD)' },
        ],
      },
    });
    expect(r.tls).toBe(true);
  });

  it('TLS détecté via en-tête TLS-Report même sans Received TLS', () => {
    const r = parseMessage({
      ...full,
      payload: { headers: [{ name: 'From', value: 'a@b.c' }, { name: 'TLS-Report', value: '1' }] },
    });
    expect(r.tls).toBe(true);
  });

  it('message vide → valeurs de repli (Failed / (no subject) / ERROR)', () => {
    const r = parseMessage({});
    expect(r.id).toBe('ERROR');
    expect(r.threadId).toBe('');
    expect(r.title).toBe('ERROR');
    expect(r.receivedOn).toBe('Failed');
    // parseFrom('Failed') → repli FALLBACK_SENDER de email-utils.
    expect(r.sender).toEqual({ name: '', email: 'no-sender@unknown' });
    expect(r.subject).toBe('(no subject)');
    expect(r.cc).toBeNull();
    expect(r.to).toEqual([]);
    expect(r.unread).toBe(false);
    expect(r.isDraft).toBe(false);
    expect(r.tags).toEqual([]);
    expect(r.tls).toBe(false);
  });

  it('Cc présent mais uniquement des espaces → liste vide (filtrée), pas null', () => {
    // ccHeaders.length > 0 (donc pas null), mais le filtre trim vide la liste → [].
    const r = parseMessage({
      payload: { headers: [{ name: 'From', value: 'a@b.c' }, { name: 'Cc', value: '   ' }] },
    });
    expect(r.cc).toEqual([]);
  });

  it('aucun en-tête Cc → null (distinction vide vs absent)', () => {
    const r = parseMessage({ payload: { headers: [{ name: 'From', value: 'a@b.c' }] } });
    expect(r.cc).toBeNull();
  });
});

describe('findAttachments — sélection récursive des pièces jointes', () => {
  it('inclut une PJ nommée non-inline, exclut une image inline avec Content-ID', () => {
    const parts: gmail_v1.Schema$MessagePart[] = [
      {
        filename: 'facture.pdf',
        mimeType: 'application/pdf',
        body: { attachmentId: 'att-pdf', size: 100 },
        headers: [{ name: 'Content-Disposition', value: 'attachment; filename="facture.pdf"' }],
      },
      {
        filename: 'logo.png',
        mimeType: 'image/png',
        body: { attachmentId: 'att-img', size: 10 },
        headers: [
          { name: 'Content-Disposition', value: 'inline' },
          { name: 'Content-ID', value: '<logo@x>' },
        ],
      },
    ];
    const out = findAttachments(parts);
    expect(out.map((p) => p.filename)).toEqual(['facture.pdf']);
  });

  it('inclut une PJ inline SANS Content-ID (téléchargeable)', () => {
    const out = findAttachments([
      {
        filename: 'inline-no-cid.png',
        mimeType: 'image/png',
        body: { attachmentId: 'a' },
        headers: [{ name: 'Content-Disposition', value: 'inline' }],
      },
    ]);
    expect(out.map((p) => p.filename)).toEqual(['inline-no-cid.png']);
  });

  it('descend dans les parts imbriquées', () => {
    const out = findAttachments([
      {
        mimeType: 'multipart/mixed',
        parts: [{ filename: 'nested.txt', mimeType: 'text/plain', body: { attachmentId: 'n' } }],
      },
    ]);
    expect(out.map((p) => p.filename)).toEqual(['nested.txt']);
  });

  it('inclut un message/rfc822 nommé (mail transféré)', () => {
    const out = findAttachments([
      {
        filename: 'forwarded.eml',
        mimeType: 'message/rfc822',
        body: { attachmentId: 'fwd' },
      },
    ]);
    expect(out.some((p) => p.filename === 'forwarded.eml')).toBe(true);
  });

  it('aucune PJ → tableau vide', () => {
    expect(findAttachments([{ mimeType: 'text/plain', body: { data: 'x' } }])).toEqual([]);
  });
});

describe('parseOutgoing — construction MIME (encodage réel)', () => {
  const config = { auth: { email: 'me@devlab.io', refreshToken: 'r' } } as never;
  const base = (over: Partial<IOutgoingMessage> = {}): IOutgoingMessage => ({
    to: [{ email: 'bob@example.com', name: 'Bob' }],
    subject: 'Hello',
    message: '<p>Body</p>',
    attachments: [],
    headers: {},
    fromEmail: 'me@devlab.io',
    ...over,
  });

  it('produit un raw base64 contenant sujet, destinataire et corps assaini', async () => {
    const { raw } = await parseOutgoing(base(), config);
    const mime = decodeRaw(raw);
    // mimetext encode le Subject en RFC 2047 (=?utf-8?B?<base64>?=) même en ASCII.
    expect(mime).toMatch(/Subject:/);
    expect(mime).toContain(Buffer.from('Hello', 'utf-8').toString('base64')); // SGVsbG8=
    expect(mime).toContain('bob@example.com');
    expect(mime).toContain('Body');
    expect(sanitizeTipTapHtml).toHaveBeenCalledWith('<p>Body</p>');
  });

  it('déduplique les destinataires To et extrait l’adresse entre chevrons', async () => {
    const { raw } = await parseOutgoing(
      base({
        to: [
          { email: 'dup@example.com', name: 'A' },
          { email: 'DUP@example.com', name: 'B' }, // même adresse (casse) → dédupliquée
          { email: 'Named <keep@example.com>', name: 'C' },
        ],
      }),
      config,
    );
    const mime = decodeRaw(raw);
    expect(mime).toContain('dup@example.com');
    expect(mime).toContain('keep@example.com'); // adresse extraite de "Named <...>"
    expect((mime.match(/dup@example.com/gi) || []).length).toBe(1);
  });

  it('rejette une liste To absente ou vide', async () => {
    await expect(parseOutgoing(base({ to: undefined as never }), config)).rejects.toThrow(
      'Recipient address required',
    );
    await expect(parseOutgoing(base({ to: [] }), config)).rejects.toThrow(
      'Recipient address required',
    );
  });

  it('rejette quand aucun destinataire valide (email absent)', async () => {
    await expect(
      parseOutgoing(base({ to: [{ email: '', name: 'X' }] as never }), config),
    ).rejects.toThrow('No valid recipients found in To field');
  });

  it('ajoute cc/bcc en excluant l’expéditeur, normalise l’en-tête References', async () => {
    const { raw } = await parseOutgoing(
      base({
        cc: [{ email: 'cc@example.com' }, { email: 'me@devlab.io' }],
        bcc: [{ email: 'bcc@example.com' }],
        headers: { References: 'ref1@x ref2@x', 'X-Custom': 'v' },
      }),
      config,
    );
    const mime = decodeRaw(raw);
    expect(mime).toContain('cc@example.com');
    expect(mime).toContain('<ref1@x> <ref2@x>'); // chevrons ajoutés
    expect(mime).toContain('X-Custom: v');
  });

  it('joint les pièces jointes (base64 direct et via arrayBuffer)', async () => {
    const { raw } = await parseOutgoing(
      base({
        attachments: [
          { name: 'a.txt', type: 'text/plain', size: 3, lastModified: 0, base64: Buffer.from('AAA').toString('base64') },
          {
            name: 'b.bin',
            type: 'application/octet-stream',
            size: 3,
            lastModified: 0,
            arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
          } as never,
        ],
      }),
      config,
    );
    const mime = decodeRaw(raw);
    expect(mime).toContain('a.txt');
    expect(mime).toContain('b.bin');
  });

  it('intègre les images inline renvoyées par le sanitizer', async () => {
    sanitizeTipTapHtml.mockResolvedValueOnce({
      html: '<p>voir <img src="cid:img1@0.email"></p>',
      inlineImages: [
        { cid: 'img1@0.email', data: Buffer.from('PNG').toString('base64'), mimeType: 'image/png' },
      ],
    });
    const { raw } = await parseOutgoing(base(), config);
    const mime = decodeRaw(raw);
    expect(mime).toContain('img1@0.email');
    expect(mime.toLowerCase()).toContain('inline');
  });

  it('concatène le message original en réponse', async () => {
    const { raw } = await parseOutgoing(
      base({ originalMessage: '<blockquote>ancien</blockquote>' }),
      config,
    );
    expect(decodeRaw(raw)).toContain('ancien');
  });
});
