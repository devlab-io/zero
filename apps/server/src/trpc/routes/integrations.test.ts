import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Router integrations (P18) — vrais resolvers, façade DO mockée. Invariants :
 * confirmation littérale au schéma, clé d'idempotence exigée, mapping
 * d'erreurs fail-closed (PRECONDITION_FAILED pour la config manquante),
 * identifiant d'issue borné, événements sortants bornés, secret jamais rendu.
 */

const harness = vi.hoisted(() => ({
  db: {
    getTeamIntegrationOverview: vi.fn(),
    beginTeamLinearInstall: vi.fn(),
    completeTeamLinearInstall: vi.fn(),
    revokeTeamLinearInstall: vi.fn(),
    setTeamIntegrationMapping: vi.fn(),
    listTeamLinearTargets: vi.fn(),
    listTeamThreadIntegration: vi.fn(),
    previewTeamLinearIssue: vi.fn(),
    confirmTeamLinearIssue: vi.fn(),
    acceptTeamIssueLink: vi.fn(),
    unlinkTeamIssue: vi.fn(),
    addTeamExternalLink: vi.fn(),
    removeTeamExternalLink: vi.fn(),
    listTeamOutboundWebhooks: vi.fn(),
    createTeamOutboundWebhook: vi.fn(),
    setTeamOutboundWebhookActive: vi.fn(),
    listTeamOutboundDeliveries: vi.fn(),
    retryTeamDeadOutbound: vi.fn(),
    exportTeamActivity: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>,
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
vi.mock('../../lib/server-utils', () => ({ getZeroDB: vi.fn(async () => harness.db) }));

import { integrationsRouter } from './integrations';

const makeCtx = () => ({ sessionUser: { id: 'user-1' }, c: {} });
type Proc = { resolver: Function; inputSchema?: { parse: (v: unknown) => unknown } };
const call = (name: string, input?: unknown) => {
  const procedure = (integrationsRouter as unknown as Record<string, Proc>)[name];
  if (!procedure) throw new Error(`unknown procedure ${name}`);
  const parsed = procedure.inputSchema ? procedure.inputSchema.parse(input) : undefined;
  return procedure.resolver({ ctx: makeCtx(), input: parsed });
};

beforeEach(() => vi.clearAllMocks());

describe('integrations — preview/confirm d’issue (référence seule)', () => {
  const previewBase = {
    teamThreadId: 'tt-1',
    clientRequestKey: 'request1',
    linearTeamId: 'lt-1',
  };
  const confirmBase = {
    previewId: 'prev-1',
    clientRequestKey: 'request1',
    digest: 'a'.repeat(64),
  };

  it('previewIssue accepte titre/note bornés, délègue et renvoie le canonique serveur', async () => {
    harness.db.previewTeamLinearIssue.mockResolvedValue({
      previewId: 'prev-1',
      digest: 'a'.repeat(64),
      status: 'previewed',
    });
    await call('previewIssue', { ...previewBase, title: 'T', note: 'n' });
    expect(harness.db.previewTeamLinearIssue).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestKey: 'request1', title: 'T' }),
    );
    expect(() => call('previewIssue', { ...previewBase, clientRequestKey: 'x' })).toThrow();
    expect(() => call('previewIssue', { ...previewBase, note: 'n'.repeat(3000) })).toThrow();
  });

  it('confirmIssue n’accepte AUCUN contenu arbitraire : previewId + clé + digest hex64 seuls', async () => {
    harness.db.confirmTeamLinearIssue.mockResolvedValue({ issueIdentifier: 'ENG-1' });
    // Un title/description passés en plus sont STRIPPÉS par le schéma.
    await call('confirmIssue', { ...confirmBase, title: 'forgé', description: 'forgé' });
    const forwarded = harness.db.confirmTeamLinearIssue.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(forwarded).sort()).toEqual(['clientRequestKey', 'digest', 'previewId']);
    // Digest non-hex64 refusé au schéma ; booléen nu inexistant dans le contrat.
    expect(() => call('confirmIssue', { ...confirmBase, digest: 'zz' })).toThrow();
    expect(() => call('confirmIssue', { previewId: 'p', clientRequestKey: 'request1' })).toThrow();
  });

  it('mapping d’erreurs : in_flight/reconcile/idempotency → CONFLICT ; preview expiré/invalide → BAD_REQUEST', async () => {
    for (const [code, expected] of [
      ['issue_create_in_flight', 'CONFLICT'],
      ['needs_reconciliation', 'CONFLICT'],
      ['idempotency_conflict', 'CONFLICT'],
      ['preview_expired', 'BAD_REQUEST'],
      ['preview_invalid', 'BAD_REQUEST'],
      ['issue_create_failed', 'BAD_REQUEST'],
    ] as const) {
      harness.db.confirmTeamLinearIssue.mockRejectedValueOnce(new Error(code));
      await expect(call('confirmIssue', confirmBase)).rejects.toMatchObject({
        code: expected,
        message: code,
      });
    }
  });

  it('acceptIssueLink : identifiant STRICT (ABC-123) au schéma', async () => {
    harness.db.acceptTeamIssueLink.mockResolvedValue({ issueId: 'i' });
    await call('acceptIssueLink', { teamThreadId: 'tt-1', identifier: 'ENG-42' });
    for (const identifier of ['eng 42', 'ENG-', '-42', 'ENG-42; DROP', 'A'.repeat(20) + '-1']) {
      expect(() => call('acceptIssueLink', { teamThreadId: 'tt-1', identifier })).toThrow();
    }
  });
});

describe('integrations — config fail closed + webhooks sortants + export', () => {
  it('config manquante (vault/oauth/install) → PRECONDITION_FAILED avec le code exact', async () => {
    for (const code of [
      'integration_vault_unavailable',
      'integration_not_configured',
      'integration_not_installed',
      'integration_revoked',
    ]) {
      harness.db.beginTeamLinearInstall.mockRejectedValueOnce(new Error(code));
      await expect(call('beginInstall', { teamId: 'team-1' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: code,
      });
    }
    harness.db.setTeamIntegrationMapping.mockRejectedValueOnce(new Error('forbidden'));
    await expect(
      call('setMapping', { teamId: 'team-1', kind: 'team', retaValue: 'x', externalId: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('createOutboundWebhook : https + secret ≥16 + événements bornés au schéma', async () => {
    harness.db.createTeamOutboundWebhook.mockResolvedValue({ id: 'wh-1' });
    await call('createOutboundWebhook', {
      teamId: 'team-1',
      url: 'https://hooks.example.com/x',
      events: ['thread.status'],
      secret: 'a'.repeat(16),
    });
    expect(() =>
      call('createOutboundWebhook', {
        teamId: 'team-1',
        url: 'https://hooks.example.com/x',
        events: ['thread.status'],
        secret: 'court',
      }),
    ).toThrow();
    expect(() =>
      call('createOutboundWebhook', {
        teamId: 'team-1',
        url: 'https://hooks.example.com/x',
        events: ['email.body'],
        secret: 'a'.repeat(16),
      }),
    ).toThrow();
    expect(() =>
      call('createOutboundWebhook', {
        teamId: 'team-1',
        url: 'https://hooks.example.com/x',
        events: [],
        secret: 'a'.repeat(16),
      }),
    ).toThrow();
  });

  it('exportActivity : limite bornée à 200 au schéma, curseur transmis tel quel', async () => {
    harness.db.exportTeamActivity.mockResolvedValue({ entries: [], nextCursor: null });
    const cursor = '123|00000000-0000-4000-8000-000000000001';
    await call('exportActivity', { teamId: 'team-1', cursor, limit: 200 });
    expect(harness.db.exportTeamActivity).toHaveBeenCalledWith('team-1', {
      cursor,
      limit: 200,
    });
    expect(() => call('exportActivity', { teamId: 'team-1', limit: 201 })).toThrow();
    expect(() => call('exportActivity', { teamId: 'team-1', cursor: 'malformed' })).toThrow();
  });

  it('retryDeadOutbound + listOutboundDeliveries délèguent (owner-only côté store) ; reconnect confirmé transmis', async () => {
    harness.db.retryTeamDeadOutbound.mockResolvedValue({ revived: 2 });
    await call('retryDeadOutbound', { teamId: 'team-1', webhookId: 'wh-1' });
    expect(harness.db.retryTeamDeadOutbound).toHaveBeenCalledWith('team-1', 'wh-1');
    harness.db.listTeamOutboundDeliveries.mockResolvedValue([]);
    await call('listOutboundDeliveries', { teamId: 'team-1', webhookId: 'wh-1', status: 'dead' });
    expect(harness.db.listTeamOutboundDeliveries).toHaveBeenCalledWith('team-1', 'wh-1', {
      status: 'dead',
    });
    harness.db.beginTeamLinearInstall.mockResolvedValue({ authorizeUrl: 'https://linear.app/x' });
    await call('beginInstall', { teamId: 'team-1', reconnectConfirm: true });
    expect(harness.db.beginTeamLinearInstall).toHaveBeenCalledWith('team-1', true);
  });
});
