import { beforeEach, describe, expect, it, vi } from 'vitest';

// Couture copilot.test.ts : on invoque les VRAIS resolvers du router teams
// avec un ctx fabriqué ; DO façade et lectures boîte remplacées par des fakes
// déterministes. Les invariants testés : capture serveur au partage, porte
// ACL sur toute lecture, mapping d'erreurs, email de SESSION pour les
// invitations, citations serveur.

const harness = vi.hoisted(() => ({
  db: {
    createTeam: vi.fn(),
    listMyTeams: vi.fn(),
    shareTeamThread: vi.fn(),
    resolveTeamThreadAccess: vi.fn(),
    addTeamThreadComment: vi.fn(),
    acceptTeamInvite: vi.fn(),
    createTeamInvite: vi.fn(),
    listMyCollabThreadSets: vi.fn(),
    setTeamThreadAssignee: vi.fn(),
    revokeTeamThreadAccess: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>,
  getThread: vi.fn(),
  getZeroAgent: vi.fn(),
}));

const procBuild = vi.hoisted(() => {
  const build = (partial: Record<string, unknown> = {}): any => ({
    use: () => build(partial),
    input: (inputSchema: unknown) => build({ ...partial, inputSchema }),
    query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
    mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
  });
  return build;
});

vi.mock('../trpc', () => ({
  router: (defs: unknown) => defs,
  privateProcedure: procBuild(),
  activeDriverProcedure: procBuild(),
}));

vi.mock('../../lib/server-utils', () => ({
  getZeroDB: vi.fn(async () => harness.db),
  getThread: harness.getThread,
  getZeroAgent: harness.getZeroAgent,
}));

vi.mock('hono/context-storage', () => ({
  getContext: () => ({ executionCtx: { waitUntil: () => {} } }),
}));

import { teamsRouter } from './teams';

const makeCtx = () => ({
  sessionUser: { id: 'user-1', name: 'Thomas', email: 'thomas@devlab.io' },
  activeConnection: { id: 'conn-active', email: 'Contact@Devlab.io', providerId: 'google' },
  c: {},
});

type Proc = { resolver: Function; inputSchema?: { parse: (v: unknown) => unknown } };
const call = (name: string, input?: unknown, ctx = makeCtx()) => {
  const procedure = (teamsRouter as unknown as Record<string, Proc>)[name];
  if (!procedure) throw new Error(`unknown procedure ${name}`);
  const parsed = procedure.inputSchema ? procedure.inputSchema.parse(input) : undefined;
  return procedure.resolver({ ctx, input: parsed });
};

const fakeMessage = (id: string) => ({
  id,
  title: 't',
  subject: 'Sujet serveur',
  tags: [],
  sender: { name: 'Client', email: 'client@ext.pf' },
  to: [{ email: 'contact@devlab.io' }],
  cc: null,
  bcc: null,
  tls: true,
  receivedOn: '2026-08-01T10:00:00Z',
  unread: false,
  body: '<p>Corps <b>serveur</b></p>',
  processedHtml: '',
  blobUrl: '',
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.getThread.mockResolvedValue({
    result: {
      messages: [fakeMessage('m1')],
      latest: fakeMessage('m1'),
      totalReplies: 1,
      hasUnread: false,
      labels: [],
    },
    shardId: 's1',
  });
  harness.db.resolveTeamThreadAccess.mockResolvedValue({
    id: 'tt-1',
    teamId: 'team-1',
    threadId: 'thread-9',
    sharerUserId: 'user-sharer',
    sharerConnectionId: 'conn-SHARER',
    sharerEmail: 'contact@devlab.io',
    providerId: 'google',
    visibility: 'restricted',
    subject: 'Sujet serveur',
    preview: '',
    participants: [],
    messageCount: 1,
    latestReceivedOn: null,
    status: 'open',
    assigneeUserId: null,
    lastActivityAt: new Date(),
    createdAt: new Date(),
  });
});

describe('teams.share — capture serveur', () => {
  it('capture les métadonnées via getThread(connexion ACTIVE) — le client ne nomme que le fil', async () => {
    harness.db.shareTeamThread.mockImplementation(async (_teamId, meta) => ({
      id: 'tt-1',
      teamId: 'team-1',
      threadId: meta.threadId,
      sharerUserId: 'user-1',
      sharerConnectionId: meta.sharerConnectionId,
      sharerEmail: meta.sharerEmail,
      providerId: meta.providerId,
      visibility: 'team',
      subject: meta.subject,
      preview: meta.preview,
      participants: meta.participants,
      messageCount: meta.messageCount,
      latestReceivedOn: meta.latestReceivedOn,
      status: 'open',
      assigneeUserId: null,
      lastActivityAt: new Date(),
      createdAt: new Date(),
    }));
    const out = await call('share', {
      teamId: 'team-1',
      threadId: 'thread-9',
      // Toute tentative d'injection client est ignorée par le schéma zod.
      subject: 'FORGÉ',
      preview: 'FORGÉ',
    });
    expect(harness.getThread).toHaveBeenCalledWith('conn-active', 'thread-9');
    const [, meta, options] = harness.db.shareTeamThread.mock.calls[0];
    expect(meta.subject).toBe('Sujet serveur');
    expect(meta.preview).toBe('Corps serveur');
    expect(meta.sharerConnectionId).toBe('conn-active');
    expect(meta.sharerEmail).toBe('Contact@Devlab.io');
    expect(options).toEqual({ visibility: 'team', accessUserIds: [] });
    // La réponse publique n'expose pas la connexion du partageur.
    expect(JSON.stringify(out.share)).not.toContain('conn-active');
  });

  it('transmet visibility restricted + ACL initiale', async () => {
    harness.db.shareTeamThread.mockResolvedValue({
      id: 'tt-1',
      teamId: 'team-1',
      threadId: 'thread-9',
      sharerUserId: 'user-1',
      sharerConnectionId: 'conn-active',
      sharerEmail: 'contact@devlab.io',
      providerId: 'google',
      visibility: 'restricted',
      subject: 's',
      preview: '',
      participants: [],
      messageCount: 1,
      latestReceivedOn: null,
      status: 'open',
      assigneeUserId: null,
      lastActivityAt: new Date(),
      createdAt: new Date(),
    });
    await call('share', {
      teamId: 'team-1',
      threadId: 'thread-9',
      visibility: 'restricted',
      accessUserIds: ['user-2'],
    });
    expect(harness.db.shareTeamThread.mock.calls[0][2]).toEqual({
      visibility: 'restricted',
      accessUserIds: ['user-2'],
    });
  });
});

describe('teams — mapping d’erreurs du store vers le fil TRPC', () => {
  it('forbidden (révocation) → FORBIDDEN', async () => {
    harness.db.resolveTeamThreadAccess.mockRejectedValue(new Error('forbidden'));
    await expect(call('getShare', { teamThreadId: 'tt-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('not_found → NOT_FOUND', async () => {
    harness.db.resolveTeamThreadAccess.mockRejectedValue(new Error('not_found'));
    await expect(call('getShare', { teamThreadId: 'tt-x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('assignee_no_access → BAD_REQUEST (assigner sans accès ACL est refusé)', async () => {
    harness.db.setTeamThreadAssignee.mockRejectedValue(new Error('assignee_no_access'));
    await expect(
      call('setAssignee', { teamThreadId: 'tt-1', assigneeUserId: 'user-3' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('une erreur inconnue remonte inchangée (pas de sur-mapping)', async () => {
    harness.db.revokeTeamThreadAccess.mockRejectedValue(new Error('boom'));
    await expect(call('revokeAccess', { teamThreadId: 'tt-1', userId: 'user-2' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('teams.readSharedThread / readSharedAttachment — porte ACL', () => {
  it('lit le fil complet cross-account via la connexion du partageur, après resolveAccess', async () => {
    const out = await call('readSharedThread', { teamThreadId: 'tt-1' });
    expect(harness.db.resolveTeamThreadAccess).toHaveBeenCalledWith('tt-1');
    expect(harness.getThread).toHaveBeenCalledWith('conn-SHARER', 'thread-9');
    expect(out.thread.messages).toHaveLength(1);
    expect(JSON.stringify(out.share)).not.toContain('conn-SHARER');
  });

  it('révocation : FORBIDDEN et AUCUNE lecture boîte', async () => {
    harness.db.resolveTeamThreadAccess.mockRejectedValue(new Error('forbidden'));
    await expect(call('readSharedThread', { teamThreadId: 'tt-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(harness.getThread).not.toHaveBeenCalled();
  });

  it('PJ hors du fil partagé → NOT_FOUND (message_not_in_thread)', async () => {
    await expect(
      call('readSharedAttachment', {
        teamThreadId: 'tt-1',
        messageId: 'm-hors-fil',
        attachmentId: 'att-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(harness.getZeroAgent).not.toHaveBeenCalled();
  });
});

describe('teams.addComment — citation serveur', () => {
  it('quoteMessageId → citation construite SERVEUR (texte du message), jamais du texte client', async () => {
    harness.db.addTeamThreadComment.mockResolvedValue({ id: 'c-1' });
    await call('addComment', {
      teamThreadId: 'tt-1',
      body: 'Regardez ça',
      quoteMessageId: 'm1',
      quote: { text: 'CITATION FORGÉE' },
    });
    const [, , , quote] = harness.db.addTeamThreadComment.mock.calls[0];
    expect(quote).toMatchObject({ messageId: 'm1', authorEmail: 'client@ext.pf' });
    expect(quote.text).toBe('Corps serveur');
  });

  it('quoteText → seul l’extrait présent dans le message devient citation', async () => {
    harness.db.addTeamThreadComment.mockResolvedValue({ id: 'c-selection' });
    await call('addComment', {
      teamThreadId: 'tt-1',
      body: 'Ce passage est important',
      quoteMessageId: 'm1',
      quoteText: 'Corps',
    });
    const [, , , quote] = harness.db.addTeamThreadComment.mock.calls[0];
    expect(quote.text).toBe('Corps');
  });

  it('sans quoteMessageId, aucune citation et aucune lecture boîte', async () => {
    harness.db.addTeamThreadComment.mockResolvedValue({ id: 'c-2' });
    await call('addComment', { teamThreadId: 'tt-1', body: 'Simple note' });
    expect(harness.db.addTeamThreadComment).toHaveBeenCalledWith('tt-1', 'Simple note', [], null);
    expect(harness.getThread).not.toHaveBeenCalled();
  });
});

describe('teams — invitations liées à la SESSION', () => {
  it("acceptInvite passe l'email de SESSION, pas un email client", async () => {
    harness.db.acceptTeamInvite.mockResolvedValue({ teamId: 'team-1' });
    await call('acceptInvite', { inviteId: 'inv-1', email: 'autre@devlab.io' });
    expect(harness.db.acceptTeamInvite).toHaveBeenCalledWith('inv-1', 'thomas@devlab.io');
  });

  it('invite normalise l’email en lowercase via le schéma', async () => {
    harness.db.createTeamInvite.mockResolvedValue({ id: 'inv-1' });
    await call('invite', { teamId: 'team-1', email: 'Shane@Devlab.IO' });
    expect(harness.db.createTeamInvite).toHaveBeenCalledWith('team-1', 'shane@devlab.io', 'member');
  });
});

describe('teams.myCollabThreadSets — opérateurs de recherche', () => {
  it('résout les sets sur l’email de la connexion ACTIVE', async () => {
    harness.db.listMyCollabThreadSets.mockResolvedValue({
      shared: ['t1'],
      assigned: [],
      commented: ['t1'],
      mentioned: [],
    });
    const out = await call('myCollabThreadSets', undefined);
    expect(harness.db.listMyCollabThreadSets).toHaveBeenCalledWith('Contact@Devlab.io');
    expect(out.shared).toEqual(['t1']);
  });
});

describe('teams.assignSharedBatch — assignation batch ACL-safe (P5)', () => {
  it("résout sur l'email de la connexion ACTIVE et rapporte chaque skip EXPLICITEMENT", async () => {
    harness.db.assignSharedThreadsBatch = vi.fn(async () => ({
      results: [
        { threadId: 't1', outcome: 'assigned', teamThreadId: 'tt-1' },
        { threadId: 't2', outcome: 'not_shared' },
        { threadId: 't3', outcome: 'assignee_no_access', teamThreadId: 'tt-3' },
      ],
    }));
    const out = await call('assignSharedBatch', {
      teamId: 'team-1',
      assigneeUserId: 'user-2',
      threadIds: ['t1', 't2', 't3'],
    });
    expect(harness.db.assignSharedThreadsBatch).toHaveBeenCalledWith({
      teamId: 'team-1',
      connectionEmail: 'Contact@Devlab.io',
      assigneeUserId: 'user-2',
      threadIds: ['t1', 't2', 't3'],
    });
    expect(out).toMatchObject({ assigned: 1, notShared: 1, skipped: 1 });
    expect(out.results).toHaveLength(3);
  });

  it('assigné non membre → BAD_REQUEST (aucune écriture partielle silencieuse)', async () => {
    harness.db.assignSharedThreadsBatch = vi.fn(async () => {
      throw new Error('assignee_not_member');
    });
    await expect(
      call('assignSharedBatch', { teamId: 'team-1', assigneeUserId: 'x', threadIds: ['t1'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('désassignation batch : assigneeUserId null accepté', async () => {
    harness.db.assignSharedThreadsBatch = vi.fn(async () => ({
      results: [{ threadId: 't1', outcome: 'assigned', teamThreadId: 'tt-1' }],
    }));
    const out = await call('assignSharedBatch', {
      teamId: 'team-1',
      assigneeUserId: null,
      threadIds: ['t1'],
    });
    expect(out.assigned).toBe(1);
  });
});
