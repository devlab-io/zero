import { beforeEach, describe, expect, it, vi } from 'vitest';

// Proxy de lecture partagée (correction P0) : resolveAccess d'ABORD, puis —
// et seulement alors — lecture bornée via la connexion du partageur. Fakes
// déterministes : DO façade scriptée, getThread/getZeroAgent espionnés.

const harness = vi.hoisted(() => ({
  resolveTeamThreadAccess: vi.fn(),
  getThread: vi.fn(),
  getMessageAttachments: vi.fn(),
  getZeroAgent: vi.fn(),
  getZeroDB: vi.fn(),
}));

vi.mock('../server-utils', () => ({
  getZeroDB: harness.getZeroDB,
  getThread: harness.getThread,
  getZeroAgent: harness.getZeroAgent,
}));

vi.mock('hono/context-storage', () => ({
  getContext: () => ({ executionCtx: { waitUntil: () => {} } }),
}));

import {
  buildSharedQuote,
  buildTeamThreadMetadata,
  readSharedAttachment,
  readSharedThread,
  stripHtmlToText,
  toPublicShare,
} from './team-access';

const share = {
  id: 'tt-1',
  teamId: 'team-1',
  threadId: 'thread-9',
  sharerUserId: 'user-sharer',
  sharerConnectionId: 'conn-SHARER',
  sharerEmail: 'contact@devlab.io',
  providerId: 'google',
  visibility: 'team' as const,
  subject: 'Facture Socredo',
  preview: 'Bonjour…',
  participants: [{ email: 'client@ext.pf' }],
  messageCount: 3,
  latestReceivedOn: '2026-08-01T10:00:00Z',
  status: 'open' as const,
  assigneeUserId: null,
  lastActivityAt: new Date('2026-08-01T10:00:00Z'),
  createdAt: new Date('2026-07-30T10:00:00Z'),
};

const message = (id: string, body = '<p>Hello <b>world</b></p>') => ({
  id,
  title: 't',
  subject: 'Facture Socredo',
  tags: [],
  sender: { name: 'Client', email: 'client@ext.pf' },
  to: [{ email: 'contact@devlab.io' }],
  cc: null,
  bcc: null,
  tls: true,
  receivedOn: '2026-08-01T10:00:00Z',
  unread: false,
  body,
  processedHtml: body,
  blobUrl: '',
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.getZeroDB.mockResolvedValue({
    resolveTeamThreadAccess: harness.resolveTeamThreadAccess,
  });
  harness.resolveTeamThreadAccess.mockResolvedValue(share);
  harness.getThread.mockResolvedValue({
    result: {
      messages: [message('m1'), message('m2')],
      totalReplies: 2,
      hasUnread: false,
      labels: [],
    },
    shardId: 'shard-1',
  });
  harness.getZeroAgent.mockResolvedValue({
    stub: { getMessageAttachments: harness.getMessageAttachments },
  });
});

describe('readSharedThread — proxy borné cross-account', () => {
  it('lit le fil COMPLET via la connexion du partageur après resolveAccess, pour un équipier d’une AUTRE boîte', async () => {
    const out = await readSharedThread('user-OTHER-mailbox', 'tt-1');
    // ACL résolue pour le lecteur (son DO), lecture via la connexion du partageur.
    expect(harness.getZeroDB).toHaveBeenCalledWith('user-OTHER-mailbox');
    expect(harness.resolveTeamThreadAccess).toHaveBeenCalledWith('tt-1');
    expect(harness.getThread).toHaveBeenCalledWith('conn-SHARER', 'thread-9');
    expect(out.thread.messages).toHaveLength(2);
    // La projection publique n'expose JAMAIS sharerConnectionId.
    expect(JSON.stringify(out.share)).not.toContain('conn-SHARER');
  });

  it('révocation : resolveAccess rejette AVANT toute lecture boîte (aucun getThread)', async () => {
    harness.resolveTeamThreadAccess.mockRejectedValue(new Error('forbidden'));
    await expect(readSharedThread('user-revoked', 'tt-1')).rejects.toThrow('forbidden');
    expect(harness.getThread).not.toHaveBeenCalled();
  });

  it('fil départagé : not_found remonte tel quel, zéro accès boîte', async () => {
    harness.resolveTeamThreadAccess.mockRejectedValue(new Error('not_found'));
    await expect(readSharedThread('user-x', 'tt-gone')).rejects.toThrow('not_found');
    expect(harness.getThread).not.toHaveBeenCalled();
    expect(harness.getZeroAgent).not.toHaveBeenCalled();
  });
});

describe('readSharedAttachment — borné au fil partagé', () => {
  it('sert la PJ d’un message DU fil via la connexion du partageur', async () => {
    harness.getMessageAttachments.mockResolvedValue([
      {
        filename: 'facture.pdf',
        mimeType: 'application/pdf',
        size: 4,
        attachmentId: 'att-1',
        body: 'QUJDRA==',
      },
    ]);
    const out = await readSharedAttachment('user-OTHER-mailbox', 'tt-1', 'm2', 'att-1');
    expect(harness.getZeroAgent).toHaveBeenCalledWith('conn-SHARER', expect.anything());
    expect(out).toEqual({
      filename: 'facture.pdf',
      mimeType: 'application/pdf',
      size: 4,
      body: 'QUJDRA==',
    });
  });

  it('refuse un messageId qui n’appartient PAS au fil partagé (pas d’évasion vers le reste de la boîte)', async () => {
    await expect(
      readSharedAttachment('user-OTHER-mailbox', 'tt-1', 'm-du-reste-de-la-boite', 'att-1'),
    ).rejects.toThrow('message_not_in_thread');
    expect(harness.getZeroAgent).not.toHaveBeenCalled();
  });

  it('révocation : aucun octet de PJ ne part après refus ACL', async () => {
    harness.resolveTeamThreadAccess.mockRejectedValue(new Error('forbidden'));
    await expect(readSharedAttachment('user-revoked', 'tt-1', 'm1', 'att-1')).rejects.toThrow(
      'forbidden',
    );
    expect(harness.getThread).not.toHaveBeenCalled();
    expect(harness.getMessageAttachments).not.toHaveBeenCalled();
  });

  it('attachmentId inconnu sur un message valide → attachment_not_found', async () => {
    harness.getMessageAttachments.mockResolvedValue([]);
    await expect(readSharedAttachment('u', 'tt-1', 'm1', 'att-zzz')).rejects.toThrow(
      'attachment_not_found',
    );
  });
});

describe('buildSharedQuote — citation structurée capturée serveur', () => {
  it('construit la citation depuis le message du fil (même porte ACL), texte borné et détaggé', async () => {
    const quote = await buildSharedQuote('user-OTHER-mailbox', 'tt-1', 'm1');
    expect(quote).toMatchObject({
      messageId: 'm1',
      authorEmail: 'client@ext.pf',
      receivedOn: '2026-08-01T10:00:00Z',
      text: 'Hello world',
    });
  });

  it('rejette un message hors du fil', async () => {
    await expect(buildSharedQuote('u', 'tt-1', 'm-ailleurs')).rejects.toThrow(
      'message_not_in_thread',
    );
  });
});

describe('buildTeamThreadMetadata — capture serveur au partage', () => {
  it('capture sujet/preview/participants depuis la lecture serveur, jamais du client', () => {
    const meta = buildTeamThreadMetadata(
      { id: 'conn-1', email: 'thomas@devlab.io', providerId: 'google' },
      'thread-9',
      {
        messages: [message('m1'), message('m2', '<div>Dernier <i>message</i>  &amp; suite</div>')],
        latest: message('m2', '<div>Dernier <i>message</i>  &amp; suite</div>'),
        totalReplies: 2,
        hasUnread: false,
        labels: [],
      },
    );
    expect(meta.subject).toBe('Facture Socredo');
    expect(meta.preview).toBe('Dernier message & suite');
    expect(meta.sharerConnectionId).toBe('conn-1');
    expect(meta.messageCount).toBe(2);
    expect(meta.participants.map((p) => p.email)).toContain('client@ext.pf');
    expect(meta.participants.map((p) => p.email)).toContain('contact@devlab.io');
  });
});

describe('stripHtmlToText', () => {
  it('supprime balises/scripts/styles et normalise', () => {
    expect(
      stripHtmlToText('<style>.a{}</style><script>x()</script><p>Un &quot;test&quot;&nbsp;net</p>'),
    ).toBe('Un "test" net');
  });
});

describe('toPublicShare', () => {
  it('ne laisse jamais fuiter sharerConnectionId', () => {
    const pub = toPublicShare(share);
    expect(Object.keys(pub)).not.toContain('sharerConnectionId');
  });
});
