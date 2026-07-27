import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IOutgoingMessage } from '../../types';
import type { gmail_v1 } from '@googleapis/gmail';

// google-parse importe `./utils` (→ server-utils → cloudflare:workers) et
// `../sanitize-tip-tap-html` (react-email, lourd). On neutralise ces feuilles ; le reste
// (email-utils, mimetext, he) tourne en RÉEL — c'est le cœur du parsing produit.
vi.mock('../server-utils', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('hono/context-storage', () => ({ getContext: vi.fn(() => ({})) }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
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
      payload: {
        headers: [
          { name: 'From', value: 'a@b.c' },
          { name: 'TLS-Report', value: '1' },
        ],
      },
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
      payload: {
        headers: [
          { name: 'From', value: 'a@b.c' },
          { name: 'Cc', value: '   ' },
        ],
      },
    });
    expect(r.cc).toEqual([]);
  });

  it('aucun en-tête Cc → null (distinction vide vs absent)', () => {
    const r = parseMessage({ payload: { headers: [{ name: 'From', value: 'a@b.c' }] } });
    expect(r.cc).toBeNull();
  });

  it('neutralise CR/LF dans messageId, references et inReplyTo dès l’extraction', () => {
    // Ces trois valeurs sont recopiées telles quelles dans les en-têtes d'une RÉPONSE par
    // components/mail/reply-composer.tsx : une rupture de ligne conservée ici devient une
    // injection d'en-tête MIME chez le destinataire suivant.
    const r = parseMessage({
      payload: {
        headers: [
          { name: 'From', value: 'a@b.c' },
          { name: 'Message-ID', value: '<m@x>\r\nBcc: attacker@evil.example' },
          { name: 'References', value: '<r1@x>\r\nBcc: attacker@evil.example' },
          { name: 'In-Reply-To', value: '<p@x>\nX-Injected: yes' },
        ],
      },
    });

    for (const value of [r.messageId, r.references, r.inReplyTo]) {
      expect(value).not.toMatch(/[\r\n]/);
    }
    expect(r.messageId).toBe('<m@x> Bcc: attacker@evil.example');
  });
});

// ---------------------------------------------------------------------------
// P12 — parseMessage levait un TypeError BRUT sur les formes hostiles.
//
// Provenance réelle de ces formes : le corps d'une réponse Gmail sort de `JSON.parse`
// (driver/gmail-batch.ts:106 — `body = JSON.parse(rawBody)`, typé `unknown` puis assigné
// par assertion), donc aucune garantie d'exécution sur la forme. Et google-threads.ts:161
// parse le fil ENTIER sous un `Promise.all` : une seule ligne hostile faisait rejeter tout
// le lot.
//
// Sonde /tmp comparant HEAD et le code corrigé sur 24 formes : 12 levaient AVANT, 0 APRÈS.
//   undefined ....................... TypeError: Cannot destructure property 'id' of 'undefined'
//   null ............................ TypeError: Cannot destructure property 'id' of 'object null'
//   headers = chaîne/objet/nombre ... TypeError: payload?.headers?.find is not a function
//   headers = [null] / [undefined] .. TypeError: Cannot read properties of null (reading 'name')
//   headers name non-string ......... TypeError: h.name?.toLowerCase is not a function
//   labelIds = chaîne/objet ......... TypeError: labelIds?.map is not a function
//   snippet non-string .............. TypeError: html.replace is not a function (he.decode)
// ---------------------------------------------------------------------------

describe('parseMessage — formes hostiles : message dégradé, jamais d’exception (P12)', () => {
  // Les replis attendus sont EXACTEMENT ceux du message vide déjà supporté (`parseMessage({})`).
  const attendreDegrade = (r: ReturnType<typeof parseMessage>) => {
    expect(r.id).toBe('ERROR');
    expect(r.threadId).toBe('');
    expect(r.title).toBe('ERROR');
    expect(r.receivedOn).toBe('Failed');
    expect(r.subject).toBe('(no subject)');
    expect(r.sender).toEqual({ name: '', email: 'no-sender@unknown' });
    expect(r.to).toEqual([]);
    expect(r.cc).toBeNull();
    expect(r.tags).toEqual([]);
    expect(r.unread).toBe(false);
    expect(r.isDraft).toBe(false);
    expect(r.tls).toBe(false);
  };

  it('entrée undefined → dégradé (la déstructuration levait avant toute garde)', () => {
    attendreDegrade(parseMessage(undefined as never));
  });

  it('entrée null → dégradé', () => {
    attendreDegrade(parseMessage(null as never));
  });

  it('entrée non-objet (chaîne, nombre) → dégradé', () => {
    attendreDegrade(parseMessage('coucou' as never));
    attendreDegrade(parseMessage(42 as never));
  });

  it('`headers` non tabulaire (chaîne, objet, nombre) → dégradé', () => {
    for (const headers of ['From: a@b.c', { From: 'a@b.c' }, 7]) {
      attendreDegrade(parseMessage({ payload: { headers } } as never));
    }
  });

  it('`payload` non-objet → dégradé', () => {
    attendreDegrade(parseMessage({ payload: 'oops' } as never));
  });

  it('`labelIds` non tabulaire (chaîne, objet) → dégradé, tags vides', () => {
    attendreDegrade(parseMessage({ labelIds: 'INBOX' } as never));
    attendreDegrade(parseMessage({ labelIds: { a: 1 } } as never));
  });

  it('`snippet` non-string → titre ERROR au lieu de faire lever he.decode', () => {
    expect(parseMessage({ snippet: 42 } as never).title).toBe('ERROR');
    expect(parseMessage({ snippet: { a: 1 } } as never).title).toBe('ERROR');
  });

  it('entrée d’en-tête nulle ou sans nom exploitable : écartée, les autres SONT extraites', () => {
    // Dégradation PARTIELLE : une entrée pourrie ne doit pas coûter les en-têtes valides.
    const r = parseMessage({
      id: 'm9',
      threadId: 't9',
      labelIds: ['UNREAD', null, 42, 'DRAFT'],
      payload: {
        headers: [
          null,
          undefined,
          'From: usurpateur@evil.example',
          { name: 42, value: 'x' },
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'Subject', value: 'Toujours lisible' },
          { name: 'To', value: 42 },
          { name: 'To', value: 'bob@example.com' },
        ],
      },
    } as never);

    expect(r.id).toBe('m9');
    expect(r.threadId).toBe('t9');
    expect(r.sender).toEqual({ name: 'Alice', email: 'alice@example.com' });
    expect(r.subject).toBe('Toujours lisible');
    expect(r.to).toEqual([{ name: '', email: 'bob@example.com' }]);
    expect(r.tags).toEqual([
      { id: 'UNREAD', name: 'UNREAD', type: 'user' },
      { id: 'DRAFT', name: 'DRAFT', type: 'user' },
    ]);
    expect(r.unread).toBe(true);
    expect(r.isDraft).toBe(true);
  });

  it('une ligne hostile n’emporte plus le LOT (forme google-threads.ts : Promise.all)', async () => {
    // Reproduit la boucle du produit : data.messages.map(parseMessage) sous Promise.all.
    const lot = [
      { id: 'ok-1', payload: { headers: [{ name: 'From', value: 'a@b.c' }] } },
      { payload: { headers: 'hostile' } },
      { id: 'ok-2', payload: { headers: [{ name: 'From', value: 'c@d.e' }] } },
    ];

    const parsed = await Promise.all(lot.map(async (m) => parseMessage(m as never)));

    expect(parsed.map((p) => p.id)).toEqual(['ok-1', 'ERROR', 'ok-2']);
    expect(parsed[0].sender.email).toBe('a@b.c');
    expect(parsed[2].sender.email).toBe('c@d.e');
  });

  it('en-tête SimpleLogin toujours honoré malgré des entrées pourries autour', () => {
    // getSimpleLoginSender (driver/utils.ts) déréférence `payload.headers` sans garde : il
    // reçoit désormais les en-têtes normalisés, donc ne peut plus lever non plus.
    const r = parseMessage({
      payload: {
        headers: [
          null,
          { name: 'X-SimpleLogin-Original-From', value: 'origin@real.io' },
          { name: 'From', value: 'alias@simplelogin.io' },
        ],
      },
    } as never);
    expect(r.sender).toEqual({ name: 'origin@real.io', email: 'origin@real.io' });
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
        headers: { References: 'ref1@x ref2@x', 'In-Reply-To': '<parent@x>' },
      }),
      config,
    );
    const mime = decodeRaw(raw);
    expect(mime).toContain('cc@example.com');
    expect(mime).toContain('<ref1@x> <ref2@x>'); // chevrons ajoutés
    expect(mime).toContain('In-Reply-To: <parent@x>');
  });

  it('n’écrit AUCUN en-tête hors allowlist (X-Custom passait auparavant)', async () => {
    const { raw } = await parseOutgoing(base({ headers: { 'X-Custom': 'v' } }), config);

    expect(decodeRaw(raw)).not.toContain('X-Custom');
  });

  it('ne laisse pas une valeur porteuse de CRLF créer une ligne d’en-tête', async () => {
    // mimetext 3.0.27 n'échappe rien : `setHeader('X', 'a\r\nBcc: ...')` place bien `Bcc:`
    // en tête de ligne dans le RAW (sonde). Le puits doit donc écarter la valeur entière.
    const { raw } = await parseOutgoing(
      base({
        headers: {
          'In-Reply-To': '<parent@x>\r\nBcc: attacker@evil.example\r\nX-Injected: yes',
        },
      }),
      config,
    );
    const mime = decodeRaw(raw);

    expect(mime).not.toContain('attacker@evil.example');
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).not.toContain('X-Injected');
  });

  it('ne laisse pas un NOM porteur de CRLF créer une ligne d’en-tête', async () => {
    const { raw } = await parseOutgoing(
      base({ headers: { 'In-Reply-To\r\nBcc: attacker@evil.example\r\nX-B': 'v' } }),
      config,
    );
    const mime = decodeRaw(raw);

    expect(mime).not.toContain('attacker@evil.example');
    expect(mime).not.toMatch(/^Bcc:/m);
  });

  it('joint les pièces jointes (base64 direct et via arrayBuffer)', async () => {
    const { raw } = await parseOutgoing(
      base({
        attachments: [
          {
            name: 'a.txt',
            type: 'text/plain',
            size: 3,
            lastModified: 0,
            base64: Buffer.from('AAA').toString('base64'),
          },
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

// ---------------------------------------------------------------------------
// P6 — entrées HOSTILES sur les deux fonctions qui n'avaient aucune garde.
//
// Les deux consomment du `JSON.parse` (driver/gmail-batch.ts) ou une valeur relue en KV
// (lib/scheduled-send.ts) : le type ne garantit rien à l'exécution. Formes mesurées avant
// correction : `findAttachments(null)` → « parts is not iterable » ; `findAttachments([null])`
// → TypeError sur `part.filename` ; `parseOutgoing(null)` → TypeError de déstructuration ;
// `parseOutgoing` sans `message` → « Cannot read properties of undefined (reading 'trim') ».
// ---------------------------------------------------------------------------

describe('findAttachments — entrées hostiles (P6)', () => {
  it('rend une liste vide au lieu de lever sur une entrée non itérable', () => {
    expect(findAttachments(null as never)).toEqual([]);
    expect(findAttachments(undefined as never)).toEqual([]);
    expect(findAttachments('INBOX' as never)).toEqual([]);
    expect(findAttachments({ length: 2 } as never)).toEqual([]);
  });

  it('écarte les entrées nulles et conserve les parties exploitables', () => {
    const parts = [
      null,
      undefined,
      'texte',
      { filename: 'facture.pdf', body: { attachmentId: 'a1' }, mimeType: 'application/pdf' },
    ] as unknown as gmail_v1.Schema$MessagePart[];

    const found = findAttachments(parts);
    expect(found).toHaveLength(1);
    expect(found[0].filename).toBe('facture.pdf');
  });

  it('survit à une branche `parts` hostile en profondeur', () => {
    const parts = [
      {
        mimeType: 'multipart/mixed',
        parts: [null, { filename: 'photo.png', body: { attachmentId: 'a2' } }],
      },
    ] as unknown as gmail_v1.Schema$MessagePart[];

    expect(findAttachments(parts).map((p) => p.filename)).toEqual(['photo.png']);
  });
});

describe('parseOutgoing — entrées hostiles (P6)', () => {
  const config = { auth: { email: 'thomas@devlab.io' } } as never;

  it('refuse un payload absent avec un message diagnosticable', async () => {
    await expect(parseOutgoing(null as never, config)).rejects.toThrow(
      'Outgoing message payload required',
    );
    await expect(parseOutgoing(undefined as never, config)).rejects.toThrow(
      'Outgoing message payload required',
    );
  });

  it('refuse un corps manquant AVANT toute construction MIME', async () => {
    const sansCorps = {
      to: [{ email: 'client@example.com' }],
      subject: 'Relance',
      attachments: [],
      headers: {},
    } as unknown as IOutgoingMessage;

    // Avant : « Cannot read properties of undefined (reading 'trim') », classée AMBIGUË en
    // aval, donc réservation `unresolved` (terminale) pour un mail jamais émis.
    await expect(parseOutgoing(sansCorps, config)).rejects.toThrow('Message body required');
    expect(sanitizeTipTapHtml).not.toHaveBeenCalled();
  });

  it('refuse un destinataire absent, comme avant', async () => {
    await expect(
      parseOutgoing(
        { to: [], subject: 's', message: 'm', attachments: [], headers: {} } as never,
        config,
      ),
    ).rejects.toThrow('Recipient address required');
  });
});
