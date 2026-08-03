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
    createTeamRule: vi.fn(),
    updateTeamRule: vi.fn(),
    getTeamOpsOverview: vi.fn(),
    setTeamSlaPolicy: vi.fn(),
    declareTeamAbsence: vi.fn(),
    requestTeamDraftReview: vi.fn(),
    suggestTeamDraftEdit: vi.fn(),
    setTeamDraftReviewDecision: vi.fn(),
    createTeamReplyIntent: vi.fn(),
    listTeamRules: vi.fn(),
    previewTeamRule: vi.fn(),
    undoTeamRuleRun: vi.fn(),
    setTeamRuleEnabled: vi.fn(),
    // P17 — rôles + gouvernance
    setTeamMemberRole: vi.fn(),
    buildTeamAuditExport: vi.fn(),
    getTeamRetentionPolicy: vi.fn(),
    setTeamRetentionPolicy: vi.fn(),
    exportTeamData: vi.fn(),
    restoreTeamData: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>,
  getThread: vi.fn(),
  getZeroAgent: vi.fn(),
  getThreadsFromDB: vi.fn(),
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
  getThreadsFromDB: harness.getThreadsFromDB,
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

describe('teams — règles d’équipe (P14)', () => {
  it('createRule capture la connexion ACTIVE comme boîte surveillée (jamais fournie par le client)', async () => {
    harness.db.createTeamRule.mockResolvedValue({ id: 'rule-1' });
    await call('createRule', {
      teamId: 'team-1',
      name: 'Partage clients',
      triggers: { domains: ['Pacific-Freight.PF'] },
      actions: [{ kind: 'share', visibility: 'team' }],
      confirmAclExpansion: true,
    });
    expect(harness.db.createTeamRule).toHaveBeenCalledWith(
      'team-1',
      { id: 'conn-active', email: 'Contact@Devlab.io' },
      expect.objectContaining({ name: 'Partage clients', confirmAclExpansion: true }),
    );
  });

  it('le schéma refuse une action share restricted (élargissement ACL par moteur interdit)', () => {
    // Le parse zod refuse SYNCHRONEMENT — avant tout resolver.
    expect(() =>
      call('createRule', {
        teamId: 'team-1',
        name: 'x',
        triggers: { domains: ['a.pf'] },
        actions: [{ kind: 'share', visibility: 'restricted' }],
      }),
    ).toThrow(/team/);
    expect(harness.db.createTeamRule).not.toHaveBeenCalled();
  });

  it('mapping des codes de validation des règles → BAD_REQUEST', async () => {
    for (const code of ['no_trigger', 'no_action', 'invalid_hours', 'run_not_undoable']) {
      harness.db.setTeamRuleEnabled.mockRejectedValueOnce(new Error(code));
      await expect(
        call('setRuleEnabled', { ruleId: 'rule-1', enabled: true }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
  });

  it('refuse create/update d’une règle share sans confirmAclExpansion frais (garde SERVEUR)', async () => {
    await expect(
      call('createRule', {
        teamId: 'team-1',
        name: 'Partage clients',
        triggers: { domains: ['a.pf'] },
        actions: [{ kind: 'share', visibility: 'team' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'acl_confirmation_required' });
    await expect(
      call('createRule', {
        teamId: 'team-1',
        name: 'x',
        triggers: { domains: ['a.pf'] },
        actions: [{ kind: 'share', visibility: 'team' }],
        confirmAclExpansion: false,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(harness.db.createTeamRule).not.toHaveBeenCalled();

    await expect(
      call('updateRule', {
        ruleId: 'rule-1',
        actions: [{ kind: 'share', visibility: 'team' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'acl_confirmation_required' });
    expect(harness.db.updateTeamRule).not.toHaveBeenCalled();
  });

  it('une règle sans share ne demande aucune confirmation', async () => {
    harness.db.createTeamRule.mockResolvedValue({ id: 'rule-2' });
    await call('createRule', {
      teamId: 'team-1',
      name: 'Assignation seule',
      triggers: { domains: ['a.pf'] },
      actions: [{ kind: 'assign', userId: 'user-2' }],
    });
    expect(harness.db.createTeamRule).toHaveBeenCalled();
  });

  it('ré-enable d’une règle share sans confirmation → BAD_REQUEST (garde STORE via DO)', async () => {
    harness.db.setTeamRuleEnabled.mockRejectedValueOnce(new Error('acl_confirmation_required'));
    await expect(
      call('setRuleEnabled', { ruleId: 'rule-share', enabled: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'acl_confirmation_required' });
    // La confirmation traverse la façade DO jusqu'au store.
    harness.db.setTeamRuleEnabled.mockResolvedValueOnce(undefined);
    await call('setRuleEnabled', {
      ruleId: 'rule-share',
      enabled: true,
      confirmAclExpansion: true,
    });
    expect(harness.db.setTeamRuleEnabled).toHaveBeenLastCalledWith('rule-share', true, true);
  });

  it('previewRule lit les fils COMPLETS via getThread (connexion active) et n’exécute AUCUNE action', async () => {
    harness.getThreadsFromDB.mockResolvedValue({
      threads: [
        { id: 'th-1', subject: 'Sujet', sender: { email: 'client@ext.pf' } },
        { id: 'th-broken', subject: 'Cassé', sender: { email: 'x@y.z' } },
      ],
      nextPageToken: '',
    });
    harness.getThread.mockImplementation(async (_connectionId: string, threadId: string) => {
      if (threadId === 'th-broken') throw new Error('read failed');
      return {
        result: {
          messages: [fakeMessage('m1')],
          latest: {
            ...fakeMessage('m1'),
            to: [{ email: 'Omar@Devlab.io' }],
            cc: [{ email: 'sales@devlab.io' }],
            decodedBody: '<p>please confirm the freight surcharge</p>',
            tags: [{ id: 'Label_1', name: 'Clients' }],
          },
          totalReplies: 1,
          hasUnread: false,
          labels: [],
        },
        shardId: 's1',
      };
    });
    harness.db.previewTeamRule.mockResolvedValue([]);
    await call('previewRule', {
      teamId: 'team-1',
      triggers: { recipients: ['omar@devlab.io'], keywords: ['surcharge'] },
    });
    expect(harness.getThreadsFromDB).toHaveBeenCalledWith('conn-active', {
      folder: 'inbox',
      maxResults: 10,
    });
    expect(harness.getThread).toHaveBeenCalledWith('conn-active', 'th-1');
    const candidates = harness.db.previewTeamRule.mock.calls[0]?.[2];
    // Fil lisible : métadonnées COMPLÈTES — destinataires réels de To/Cc et
    // corps (le keyword n'existe QUE dans le body, pas le sujet).
    expect(candidates[0]).toMatchObject({
      threadId: 'th-1',
      meta: expect.objectContaining({
        recipients: ['omar@devlab.io', 'sales@devlab.io'],
        bodyText: expect.stringContaining('surcharge'),
      }),
    });
    expect(candidates[0].meta.subject).toBe('Sujet serveur');
    // Fil illisible : meta null → « non évalué », jamais un non-match.
    expect(candidates[1]).toMatchObject({ threadId: 'th-broken', meta: null });
    // Dry-run strict : aucune écriture (partage, assignation…) n'est touchée.
    expect(harness.db.shareTeamThread).not.toHaveBeenCalled();
    expect(harness.db.setTeamThreadAssignee).not.toHaveBeenCalled();
  });

  it('undoRuleRun délègue au store (owner vérifié en SQL) et mappe not_found', async () => {
    harness.db.undoTeamRuleRun.mockRejectedValueOnce(new Error('not_found'));
    await expect(call('undoRuleRun', { runId: 'run-404' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('teams — relecture de brouillon (P15)', () => {
  it('requestDraftReview délègue SANS connectionId client (résolu serveur)', async () => {
    harness.db.requestTeamDraftReview.mockResolvedValue({ id: 'rev-1' });
    await call('requestDraftReview', {
      teamThreadId: 'tt-1',
      draftId: 'draft-9',
      reviewerUserId: 'user-2',
    });
    expect(harness.db.requestTeamDraftReview).toHaveBeenCalledWith({
      teamThreadId: 'tt-1',
      draftId: 'draft-9',
      reviewerUserId: 'user-2',
    });
  });

  it('un digest périmé (draft_stale) → BAD_REQUEST ; non-reviewer → FORBIDDEN ; non-owner → FORBIDDEN', async () => {
    harness.db.suggestTeamDraftEdit.mockRejectedValueOnce(new Error('draft_stale'));
    await expect(
      call('suggestDraftEdit', {
        reviewId: 'rev-1',
        bodyText: 'texte',
        baseDigest: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'draft_stale' });
    harness.db.setTeamDraftReviewDecision.mockRejectedValueOnce(new Error('not_reviewer'));
    await expect(
      call('draftReviewDecision', {
        reviewId: 'rev-1',
        decision: 'approved',
        baseDigest: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    harness.db.requestTeamDraftReview.mockRejectedValueOnce(new Error('not_draft_owner'));
    await expect(
      call('requestDraftReview', {
        teamThreadId: 'tt-1',
        draftId: 'd',
        reviewerUserId: 'u2',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('createReplyIntent délègue sous ACL et renvoie la baseline SERVEUR ; refus ACL mappé', async () => {
    harness.db.createTeamReplyIntent.mockResolvedValue({
      id: 'intent-1',
      baselineAt: '2026-08-02T10:00:00.000Z',
      expiresAt: '2026-08-03T10:00:00.000Z',
    });
    const created = await call('createReplyIntent', { teamThreadId: 'tt-1' });
    expect(harness.db.createTeamReplyIntent).toHaveBeenCalledWith('tt-1');
    expect(created).toEqual({
      id: 'intent-1',
      baselineAt: '2026-08-02T10:00:00.000Z',
      expiresAt: '2026-08-03T10:00:00.000Z',
    });
    harness.db.createTeamReplyIntent.mockRejectedValueOnce(new Error('not_a_member'));
    await expect(call('createReplyIntent', { teamThreadId: 'tt-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('teams — SLA + opérations (P16)', () => {
  it('opsOverview défaut 30 jours, refuse au-delà de 90 (schéma)', async () => {
    harness.db.getTeamOpsOverview.mockResolvedValue({ counts: {} });
    await call('opsOverview', { teamId: 'team-1' });
    expect(harness.db.getTeamOpsOverview).toHaveBeenCalledWith('team-1', { windowDays: 30 });
    expect(() => call('opsOverview', { teamId: 'team-1', windowDays: 91 })).toThrow();
  });

  it('setSlaPolicy valide les heures au schéma et mappe forbidden (owner-write)', async () => {
    expect(() =>
      call('setSlaPolicy', {
        teamId: 'team-1',
        firstResponseMinutes: 60,
        resolutionMinutes: null,
        timeZone: 'Pacific/Tahiti',
        businessHours: { days: [], start: '08:00', end: '17:00' },
      }),
    ).toThrow(); // days vide refusé au schéma
    harness.db.setTeamSlaPolicy.mockRejectedValueOnce(new Error('forbidden'));
    await expect(
      call('setSlaPolicy', {
        teamId: 'team-1',
        firstResponseMinutes: 60,
        resolutionMinutes: null,
        timeZone: 'Pacific/Tahiti',
        businessHours: { days: [1, 2], start: '08:00', end: '17:00' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('declareAbsence parse les dates ISO et délègue (self-or-owner vérifié store)', async () => {
    harness.db.declareTeamAbsence.mockResolvedValue({ id: 'abs-1' });
    await call('declareAbsence', {
      teamId: 'team-1',
      targetUserId: 'user-1',
      startsAt: '2026-08-10T00:00:00.000Z',
      endsAt: '2026-08-12T00:00:00.000Z',
    });
    expect(harness.db.declareTeamAbsence).toHaveBeenCalledWith('team-1', {
      targetUserId: 'user-1',
      startsAt: new Date('2026-08-10T00:00:00.000Z'),
      endsAt: new Date('2026-08-12T00:00:00.000Z'),
      note: undefined,
    });
  });
});

describe('teams — rôles + gouvernance (P17)', () => {
  it('setMemberRole : schéma des cinq rôles, délégation, mapping last_owner', async () => {
    harness.db.setTeamMemberRole.mockResolvedValue({ role: 'auditor' });
    await call('setMemberRole', { teamId: 'team-1', userId: 'user-2', role: 'auditor' });
    expect(harness.db.setTeamMemberRole).toHaveBeenCalledWith('team-1', 'user-2', 'auditor');
    expect(() =>
      call('setMemberRole', { teamId: 'team-1', userId: 'user-2', role: 'root' }),
    ).toThrow(); // rôle inconnu refusé au schéma
    harness.db.setTeamMemberRole.mockRejectedValueOnce(new Error('last_owner'));
    await expect(
      call('setMemberRole', { teamId: 'team-1', userId: 'user-2', role: 'member' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('invite accepte les cinq rôles au schéma (anti-escalade côté store)', async () => {
    harness.db.createTeamInvite.mockResolvedValue({ id: 'inv-1' });
    await call('invite', { teamId: 'team-1', email: 'g@ext.pf', role: 'guest' });
    expect(harness.db.createTeamInvite).toHaveBeenCalledWith('team-1', 'g@ext.pf', 'guest');
    harness.db.createTeamInvite.mockRejectedValueOnce(new Error('forbidden'));
    await expect(
      call('invite', { teamId: 'team-1', email: 'a@devlab.io', role: 'admin' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('exportAudit : sans ring KEK, FAIL CLOSED (PRECONDITION_FAILED), jamais un doc non signé', async () => {
    harness.db.buildTeamAuditExport.mockResolvedValue({
      format: 'reta-team-audit-export',
      version: 1,
      teamId: 'team-1',
      teamName: 'T',
      requestedByUserId: 'user-1',
      range: { from: null, to: null },
      generatedAt: '2026-08-03T00:00:00.000Z',
      entryCount: 0,
      truncated: false,
      entries: [],
    });
    // ctx.c.env vide = pas de ring.
    const ctx = { ...makeCtx(), c: { env: {} } };
    await expect(call('exportAudit', { teamId: 'team-1' }, ctx)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('exportAudit : avec ring, document signé retourné et vérifiable par verifyAuditExport', async () => {
    const kek = Buffer.from(new Uint8Array(32).fill(3)).toString('base64url');
    const env = { RETA_BYOK_KEK_V1: kek, RETA_BYOK_KEK_ACTIVE: 'v1' };
    harness.db.buildTeamAuditExport.mockResolvedValue({
      format: 'reta-team-audit-export',
      version: 1,
      teamId: 'team-1',
      teamName: 'T',
      requestedByUserId: 'user-1',
      range: { from: '2026-08-01T00:00:00.000Z', to: null },
      generatedAt: '2026-08-03T00:00:00.000Z',
      entryCount: 1,
      truncated: false,
      entries: [
        {
          id: 'a1',
          action: 'thread.shared',
          subjectType: 'team_thread',
          subjectId: 'tt-1',
          metadata: {},
          createdAt: '2026-08-02T00:00:00.000Z',
          actorUserId: 'user-1',
          actorKind: 'user',
          actorName: 'Thomas',
        },
      ],
    });
    const ctx = { ...makeCtx(), c: { env } };
    const doc = await call(
      'exportAudit',
      { teamId: 'team-1', from: '2026-08-01T00:00:00.000Z' },
      ctx,
    );
    expect(harness.db.buildTeamAuditExport).toHaveBeenCalledWith('team-1', {
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: undefined,
    });
    expect(doc.signature).toMatchObject({ algorithm: 'HMAC-SHA256', kekVersion: 'v1' });

    const { verdict } = await call('verifyAuditExport', { doc }, ctx);
    expect(verdict).toEqual({ valid: true, kekVersion: 'v1' });
    // Document altéré → invalide.
    const tampered = { ...doc, payload: { ...doc.payload, teamName: 'X' } };
    const bad = await call('verifyAuditExport', { doc: tampered }, ctx);
    expect(bad.verdict).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('setRetentionPolicy : bornes 30..730 au schéma, délégation store', async () => {
    harness.db.setTeamRetentionPolicy.mockResolvedValue(undefined);
    await call('setRetentionPolicy', {
      teamId: 'team-1',
      auditDays: 180,
      ruleRunDays: null,
      notificationDays: 30,
    });
    expect(harness.db.setTeamRetentionPolicy).toHaveBeenCalledWith('team-1', {
      auditDays: 180,
      ruleRunDays: null,
      notificationDays: 30,
    });
    expect(() =>
      call('setRetentionPolicy', {
        teamId: 'team-1',
        auditDays: 10,
        ruleRunDays: null,
        notificationDays: null,
      }),
    ).toThrow(); // sous la borne
  });

  it('restoreData : document conforme délégué, format inconnu refusé au schéma', async () => {
    harness.db.restoreTeamData.mockResolvedValue({ teamId: 'new-1', skipped: [] });
    const payload = {
      format: 'reta-team-export',
      version: 1,
      exportedAt: '2026-08-01T00:00:00.000Z',
      team: {
        id: 'old',
        name: 'T',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      members: [],
      labels: [],
      threads: [],
      comments: [],
      rules: [],
      slaPolicy: null,
      retentionPolicy: null,
      absences: [],
      truncated: [],
      excluded: [],
    };
    await call('restoreData', { payload });
    expect(harness.db.restoreTeamData).toHaveBeenCalledWith(payload);
    expect(() => call('restoreData', { payload: { ...payload, format: 'autre' } })).toThrow();
    expect(() => call('restoreData', { payload: { ...payload, version: 2 } })).toThrow();
  });
});
