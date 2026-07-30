import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GmailTransport } from './google-transport';
import type { GmailMessages } from './google-messages';
import type { IOutgoingMessage } from '../../types';
import type { CreateDraftData } from '../schemas';

// google-drafts → google-parse (→ ./utils, sanitize), ./utils, google-threads (→ ../utils
// → ../env). On neutralise les feuilles lourdes ; le pipeline drafts tourne en réel.
vi.mock('../server-utils', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('hono/context-storage', () => ({ getContext: vi.fn(() => ({})) }));
vi.mock('../../env', () => ({ env: {} }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const sanitizeTipTapHtml = vi.fn(async (html: string) => ({ html, inlineImages: [] as unknown[] }));
vi.mock('../sanitize-tip-tap-html', () => ({ sanitizeTipTapHtml }));

const { GmailDrafts } = await import('./google-drafts');
const { makeFakeTransport, makeFakeGmail, data, gmailError } = await import(
  './__fixtures__/google-http-fake'
);

const asT = (t: unknown) => t as unknown as GmailTransport;
const noMessages = () =>
  ({ getAttachment: vi.fn(async () => 'ATTB64') }) as unknown as GmailMessages;
const b64url = (s: string) =>
  Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

beforeEach(() => {
  sanitizeTipTapHtml.mockClear();
  sanitizeTipTapHtml.mockImplementation(async (html: string) => ({ html, inlineImages: [] }));
});

const outgoing: IOutgoingMessage = {
  to: [{ email: 'bob@example.com', name: 'Bob' }],
  subject: 'Hi',
  message: '<p>x</p>',
  attachments: [],
  headers: {},
  fromEmail: 'me@devlab.io',
};

describe('GmailDrafts.sendDraft / deleteDraft', () => {
  it('sendDraft sérialise et envoie le brouillon avec son id', async () => {
    let sendParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.send': (p) => {
          sendParams = p;
          return data({ id: 'sent' });
        },
      }),
    });
    await new GmailDrafts(asT(t), noMessages()).sendDraft('d1', outgoing);
    const rb = sendParams?.requestBody as { id?: string; message?: { raw?: string; id?: string } };
    expect(rb?.id).toBe('d1');
    expect(rb?.message?.id).toBe('d1');
    expect(typeof rb?.message?.raw).toBe('string');
  });

  // CUA round 6 : deleteDraft rend les identifiants exacts + l'état du fil
  // post-suppression pour le nettoyage de la projection locale (ZeroDriver).
  it('deleteDraft — id de brouillon direct : supprime, relève le fil, aucun autre brouillon touché', async () => {
    let delParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.get': () => data({ id: 'd9', message: { id: 'm9', threadId: 't9' } }),
        'users.drafts.delete': (p) => {
          delParams = p;
          return data({});
        },
        'users.threads.get': () =>
          data({
            id: 't9',
            messages: [{ id: 'm-real', labelIds: ['INBOX'] }],
          }),
      }),
    });
    const outcome = await new GmailDrafts(asT(t), noMessages()).deleteDraft('d9');
    expect(delParams?.id).toBe('d9');
    expect(delParams?.quotaUser).toBe('user@devlab.io-test');
    expect(outcome).toEqual({
      messageId: 'm9',
      threadId: 't9',
      threadGone: false,
      hasOtherDrafts: false,
    });
  });

  it('deleteDraft — id de MESSAGE : remappe via drafts.list et supprime le BON brouillon', async () => {
    let delParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.get': gmailError('Requested entity was not found.', 404),
        'users.drafts.list': () =>
          data({
            drafts: [
              { id: 'r-1', message: { id: 'm-1', threadId: 't-1' } },
              { id: 'r-2', message: { id: 'm-2', threadId: 't-1' } },
            ],
          }),
        'users.drafts.delete': (p) => {
          delParams = p;
          return data({});
        },
        'users.threads.get': () =>
          data({
            id: 't-1',
            messages: [
              { id: 'm-2', labelIds: ['DRAFT'] },
              { id: 'm-real', labelIds: ['INBOX'] },
            ],
          }),
      }),
    });
    const outcome = await new GmailDrafts(asT(t), noMessages()).deleteDraft('m-1');
    expect(delParams?.id).toBe('r-1');
    // un autre brouillon (m-2) subsiste sur le fil → la projection ne doit pas
    // être dé-labellisée
    expect(outcome.hasOtherDrafts).toBe(true);
    expect(outcome.threadId).toBe('t-1');
  });

  it('deleteDraft — brouillon introuvable partout : succès idempotent, aucune suppression', async () => {
    let deleted = false;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.get': gmailError('not found', 404),
        'users.drafts.list': () => data({ drafts: [] }),
        'users.drafts.delete': () => {
          deleted = true;
          return data({});
        },
      }),
    });
    const outcome = await new GmailDrafts(asT(t), noMessages()).deleteDraft('fantome');
    expect(deleted).toBe(false);
    expect(outcome).toEqual({
      messageId: null,
      threadId: null,
      threadGone: false,
      hasOtherDrafts: false,
    });
  });

  it('deleteDraft — fil disparu après suppression (seul message) → threadGone', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.get': () => data({ id: 'd1', message: { id: 'm1', threadId: 't1' } }),
        'users.drafts.delete': () => data({}),
        'users.threads.get': gmailError('not found', 404),
      }),
    });
    const outcome = await new GmailDrafts(asT(t), noMessages()).deleteDraft('d1');
    expect(outcome.threadGone).toBe(true);
  });

  it('deleteDraft — une vraie erreur Gmail (500) remonte, pas de fallback silencieux', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.get': gmailError('backend error', 500),
      }),
    });
    await expect(new GmailDrafts(asT(t), noMessages()).deleteDraft('d1')).rejects.toThrow(
      'backend error',
    );
  });
});

describe('GmailDrafts.getDraft / parseDraft', () => {
  it('parse un brouillon complet (to/subject/content/cc/bcc/PJ)', async () => {
    const draft = {
      id: 'd1',
      message: {
        id: 'msg1',
        payload: {
          headers: [
            { name: 'To', value: 'bob@example.com, carol@example.com' },
            { name: 'Subject', value: 'Devis &amp; facture' },
            { name: 'Cc', value: 'cc@example.com' },
            { name: 'Bcc', value: 'bcc@example.com' },
          ],
          parts: [
            { mimeType: 'text/html', body: { data: b64url('<p>corps</p>') } },
            {
              filename: 'piece.pdf',
              mimeType: 'application/pdf',
              body: { attachmentId: 'att1', size: 12 },
              headers: [{ name: 'Content-Type', value: 'application/pdf' }],
            },
          ],
        },
      },
    };
    const messages = noMessages();
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.drafts.get': () => data(draft) }),
    });
    const out = await new GmailDrafts(asT(t), messages).getDraft('d1');
    expect(out.id).toBe('d1');
    expect(out.to).toEqual(['bob@example.com', 'carol@example.com']);
    expect(out.subject).toBe('Devis & facture'); // he.decode + trim
    expect(out.content).toBe('<p>corps</p>');
    expect(out.cc).toEqual(['cc@example.com']);
    expect(out.bcc).toEqual(['bcc@example.com']);
    expect(out.attachments).toEqual([
      {
        filename: 'piece.pdf',
        mimeType: 'application/pdf',
        size: 12,
        attachmentId: 'att1',
        headers: [{ name: 'Content-Type', value: 'application/pdf' }],
        body: 'ATTB64',
      },
    ]);
    expect(messages.getAttachment).toHaveBeenCalledWith('msg1', 'att1');
  });

  it('brouillon sans parts mais avec body.data → content décodé', async () => {
    const draft = {
      id: 'd2',
      message: { id: 'm', payload: { headers: [], body: { data: b64url('texte brut') } } },
    };
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.drafts.get': () => data(draft) }),
    });
    const out = await new GmailDrafts(asT(t), noMessages()).getDraft('d2');
    expect(out.content).toBe('texte brut');
    expect(out.to).toEqual([]);
  });

  it('res.data absent → « Draft not found »', async () => {
    const t = makeFakeTransport({ gmail: makeFakeGmail({ 'users.drafts.get': () => data(null) }) });
    await expect(new GmailDrafts(asT(t), noMessages()).getDraft('x')).rejects.toThrow(
      'Draft not found',
    );
  });

  it('brouillon sans message (parseDraft null) → « Failed to parse draft »', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.drafts.get': () => data({ id: 'd3' }) }),
    });
    await expect(new GmailDrafts(asT(t), noMessages()).getDraft('d3')).rejects.toThrow(
      'Failed to parse draft',
    );
  });

  it('PJ dont getAttachment échoue → exclue (null filtré)', async () => {
    const draft = {
      id: 'd4',
      message: {
        id: 'm',
        payload: {
          headers: [],
          parts: [{ filename: 'x.pdf', mimeType: 'application/pdf', body: { attachmentId: 'a' } }],
        },
      },
    };
    const messages = {
      getAttachment: vi.fn(async () => {
        throw new Error('boom');
      }),
    } as unknown as GmailMessages;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({ 'users.drafts.get': () => data(draft) }),
    });
    const out = await new GmailDrafts(asT(t), messages).getDraft('d4');
    expect(out.attachments).toEqual([]);
  });
});

describe('GmailDrafts.listDrafts', () => {
  it('récupère chaque brouillon, trie par date décroissante, remonte le pageToken', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.list': () =>
          data({
            drafts: [
              { id: 'old', message: { id: 'thr-old' } },
              { id: 'new', message: { id: 'thr-new' } },
            ],
            nextPageToken: 'PG',
          }),
        'users.drafts.get': (p) => {
          const date =
            p.id === 'new' ? 'Wed, 10 Jul 2026 10:00:00 +0000' : 'Mon, 01 Jul 2026 10:00:00 +0000';
          return data({
            message: {
              id: p.id,
              payload: {
                headers: [
                  { name: 'date', value: date },
                  { name: 'From', value: 'a@b.c' },
                ],
              },
            },
          });
        },
      }),
    });
    const out = await new GmailDrafts(asT(t), noMessages()).listDrafts({ maxResults: 20 });
    expect(out.threads.map((d) => d.id)).toEqual(['new', 'old']); // plus récent d'abord
    expect(out.threads[0].historyId).toBe('thr-new');
    expect(out.nextPageToken).toBe('PG');
  });

  it('brouillon sans id ou dont le get échoue → filtré (null)', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.list': () => data({ drafts: [{ id: 'ok' }, { message: {} }] }),
        'users.drafts.get': (p) => {
          if (p.id === 'ok')
            return data({
              message: { id: 'ok', payload: { headers: [{ name: 'From', value: 'a@b.c' }] } },
            });
          throw new Error('nope');
        },
      }),
    });
    const out = await new GmailDrafts(asT(t), noMessages()).listDrafts({});
    expect(out.threads.map((d) => d.id)).toEqual(['ok']);
  });
});

describe('GmailDrafts.createDraft', () => {
  const base = (over: Partial<CreateDraftData> = {}): CreateDraftData =>
    ({
      to: 'Bob <bob@example.com>, carol@example.com',
      subject: 'Sujet',
      message: '<p>hi</p>',
      ...over,
    }) as CreateDraftData;

  it('sans id → crée un brouillon (raw base64url, sans +/=)', async () => {
    let createParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.create': (p) => {
          createParams = p;
          return data({ id: 'created' });
        },
      }),
    });
    const res = await new GmailDrafts(asT(t), noMessages()).createDraft(
      base({ cc: 'cc@e.com', bcc: 'bcc@e.com' }),
    );
    expect(res).toEqual({ id: 'created' });
    const rb = createParams?.requestBody as { message?: { raw?: string } };
    expect(rb?.message?.raw).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe, sans +, / ni =
  });

  it('avec id → met à jour le brouillon existant', async () => {
    let updateParams: Record<string, unknown> | undefined;
    let createCalled = false;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.update': (p) => {
          updateParams = p;
          return data({ id: 'd-updated' });
        },
        'users.drafts.create': () => {
          createCalled = true;
          return data({ id: 'should-not-happen' });
        },
      }),
    });
    const res = await new GmailDrafts(asT(t), noMessages()).createDraft(base({ id: 'd-existing' }));
    expect(res).toEqual({ id: 'd-updated' });
    expect(updateParams?.id).toBe('d-existing');
    expect(createCalled).toBe(false);
  });

  it('intègre pièces jointes (base64 + arrayBuffer) et images inline', async () => {
    sanitizeTipTapHtml.mockResolvedValueOnce({
      html: '<p><img src="cid:i1@0.email"></p>',
      inlineImages: [
        { cid: 'i1@0.email', data: Buffer.from('IMG').toString('base64'), mimeType: 'image/png' },
      ],
    });
    let raw = '';
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.drafts.create': (p) => {
          raw = (p.requestBody as { message?: { raw?: string } }).message?.raw ?? '';
          return data({ id: 'c' });
        },
      }),
    });
    await new GmailDrafts(asT(t), noMessages()).createDraft(
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
    );
    // Décodage base64url → MIME lisible pour vérifier PJ + image inline.
    const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    expect(mime).toContain('a.txt');
    expect(mime).toContain('b.bin');
    expect(mime).toContain('i1@0.email');
  });
});
