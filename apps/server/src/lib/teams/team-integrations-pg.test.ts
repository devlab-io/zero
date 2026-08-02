import {
  acceptIssueLink,
  addExternalLink,
  beginLinearInstall,
  claimWebhookDelivery,
  confirmIssue,
  createOutboundWebhook,
  exportTeamActivity,
  getIntegrationOverview,
  listOutboundWebhooks,
  listThreadIntegration,
  previewIssue,
  processLinearEvent,
  retryDeadOutbound,
  revokeLinearInstall,
  setMapping,
  takeInstallByOauthState,
  unlinkIssue,
} from './team-integrations-store';
import { deliverDueOutbound, enqueueOutboundEvent, reapStaleOutboundLeases } from './team-outbound';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LinearApiError } from '../integrations/linear-client';
import type { SealedSecret } from './team-integrations-shared';
import { listTeamAudit, setThreadStatus } from './team-store';
import { createDb, type DB } from '../../db';

/**
 * Tests COMPORTEMENTAUX P18 durci sur PostgreSQL RÉEL (base jetable, 0046
 * corrigée : FK audit SET NULL + CHECKs, state OAuth hashé/expirable,
 * preview/confirm, leases). Transactions ROLLBACK — zéro ligne résiduelle.
 * Le client Linear est un FAKE injecté : AUCUNE mutation réseau.
 */

const PG_URL =
  process.env['RETA_P15_PG_URL'] ??
  'postgresql://postgres@127.0.0.1:5432/zero_reta_p14_verify_2366';

let pg: ReturnType<typeof createDb> | null = null;
let available = false;

beforeAll(async () => {
  try {
    pg = createDb(PG_URL);
    const probe = await pg.db.execute(
      "select 1 from information_schema.columns where table_name = 'mail0_team_issue_create_request' and column_name = 'preview_digest'",
    );
    available = (probe as unknown as unknown[]).length > 0;
  } catch {
    available = false;
  }
});
afterAll(async () => {
  await pg?.conn.end({ timeout: 2 }).catch(() => {});
});

class Rollback extends Error {}
async function inRollback(fn: (tx: DB) => Promise<void>) {
  try {
    await pg!.db.transaction(async (tx) => {
      await fn(tx as unknown as DB);
      throw new Rollback('rollback');
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

const SEALED: SealedSecret = {
  ciphertext: 'ct',
  iv: 'iv',
  wrappedDek: 'wd',
  wrapIv: 'wi',
  kekVersion: 'v1',
};

const publicResolver = async () => ['93.184.216.34'];

async function seed(tx: DB) {
  const sql = (query: string) => tx.execute(query);
  await sql(`insert into mail0_user (id, name, email, email_verified, created_at, updated_at) values
    ('vgi-owner','Owner','vgi-owner@example.test',true,now(),now()),
    ('vgi-member','Member','vgi-member@example.test',true,now(),now()),
    ('vgi-out','Outsider','vgi-out@example.test',true,now(),now())`);
  await sql(`insert into mail0_connection (id,user_id,email,scope,expires_at,created_at,updated_at,provider_id)
    values ('vgi-connA','vgi-owner','vgi-owner@example.test','s',now()+interval '1 day',now(),now(),'google')`);
  await sql(`insert into mail0_team (id,name,created_by) values ('vgi-t1','T','vgi-owner')`);
  await sql(`insert into mail0_team_member (team_id,user_id,role) values
    ('vgi-t1','vgi-owner','owner'),('vgi-t1','vgi-member','member')`);
  await sql(
    `insert into mail0_team_thread (id,team_id,thread_id,sharer_user_id,sharer_connection_id,sharer_email,provider_id,subject,visibility)
     values ('vgi-tt1','vgi-t1','vgi-th1','vgi-owner','vgi-connA','vgi-owner@example.test','google','Panne serveur','team')`,
  );
}

async function seedActiveInstall(tx: DB, workspaceId = 'ws-1') {
  await tx.execute(
    `insert into mail0_team_integration_install
     (id,team_id,provider,status,workspace_id,workspace_name,scopes,access_token_envelope,installed_by)
     values ('vgi-inst1','vgi-t1','linear','active','${workspaceId}','WS','["read","issues:create"]'::jsonb,
       '${JSON.stringify(SEALED)}'::jsonb,'vgi-owner')`,
  );
  return 'vgi-inst1';
}

const fakeLinear = (
  overrides: Partial<Record<'issueCreate' | 'findIssueByIdentifier', any>> = {},
) => {
  const client = {
    issueCreate: vi.fn(async () => ({
      id: 'lin-issue-1',
      identifier: 'ENG-42',
      url: 'https://linear.app/x/issue/ENG-42',
    })),
    findIssueByIdentifier: vi.fn(async (identifier: string) =>
      identifier === 'ENG-7'
        ? { id: 'lin-issue-7', identifier: 'ENG-7', url: 'https://linear.app/x/issue/ENG-7' }
        : null,
    ),
    listTeams: vi.fn(async () => []),
    listWorkflowStates: vi.fn(async () => []),
    listUsers: vi.fn(async () => []),
    organization: vi.fn(async () => ({ id: 'ws-1', name: 'WS' })),
    ...overrides,
  };
  return { client, getClient: vi.fn(async () => client) };
};

const APP = { appOrigin: 'https://app.example.test' };

async function previewAndConfirm(
  tx: DB,
  getClient: any,
  userId: string,
  key: string,
  extra: Record<string, unknown> = {},
) {
  const preview = await previewIssue(
    tx,
    userId,
    { teamThreadId: 'vgi-tt1', clientRequestKey: key, linearTeamId: 'lt-1', ...extra },
    APP,
  );
  if (preview.status !== 'previewed') throw new Error('unexpected preview status');
  return await confirmIssue(tx, getClient, userId, {
    previewId: preview.previewId,
    clientRequestKey: key,
    digest: preview.digest,
  });
}

describe('P18 durci — PostgreSQL réel (skippé si base absente)', () => {
  it('AUDIT : la suppression d’un compte CONSERVE l’audit (SET NULL) ; CHECKs kind + non-humain sans acteur', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await tx.execute(
        `insert into mail0_team_audit_log (id, team_id, actor_user_id, action, subject_type, subject_id)
         values ('vgi-a1','vgi-t1','vgi-member','x.did','team','vgi-t1')`,
      );
      // Suppression du compte acteur : l'audit SURVIT, acteur NULL.
      await tx.execute(`delete from mail0_user where id = 'vgi-member'`);
      const rows = (await tx.execute(
        `select actor_user_id, actor_kind from mail0_team_audit_log where id='vgi-a1'`,
      )) as unknown as Array<{ actor_user_id: string | null; actor_kind: string }>;
      expect(rows[0]).toMatchObject({ actor_user_id: null, actor_kind: 'user' });
      // CHECK : kind hors liste refusé (savepoint : la tx externe survit).
      await expect(
        (tx as unknown as DB).transaction(async (inner) =>
          inner.execute(
            `insert into mail0_team_audit_log (id, team_id, actor_user_id, actor_kind, action, subject_type, subject_id)
             values ('vgi-a2','vgi-t1',NULL,'robot','x','y','z')`,
          ),
        ),
      ).rejects.toThrow();
      // CHECK : system/integration avec un acteur humain refusé.
      await expect(
        (tx as unknown as DB).transaction(async (inner) =>
          inner.execute(
            `insert into mail0_team_audit_log (id, team_id, actor_user_id, actor_kind, action, subject_type, subject_id)
             values ('vgi-a3','vgi-t1','vgi-owner','system','x','y','z')`,
          ),
        ),
      ).rejects.toThrow();
      // Aucun des deux inserts fautifs n'a laissé de ligne.
      const forbiddenRows = (await tx.execute(
        `select count(*)::int as n from mail0_team_audit_log where id in ('vgi-a2','vgi-a3')`,
      )) as unknown as Array<{ n: number }>;
      expect(Number(forbiddenRows[0]!.n)).toBe(0);
    });
  });

  it('OAUTH : state hashé ONE-SHOT atomique + expiration ; relance sur install ACTIVE exige confirmation', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const future = new Date(Date.now() + 600_000);
      await beginLinearInstall(tx, 'vgi-owner', 'vgi-t1', {
        stateHash: 'hash-1',
        stateExpiresAt: future,
        pkceVerifierEnvelope: SEALED,
      });
      // Un AUTRE utilisateur présente le state : rien consommé, rien invalidé
      // — le flux de l'owner reste intact.
      expect(await takeInstallByOauthState(tx, 'hash-1', 'vgi-member')).toBeNull();
      expect(await takeInstallByOauthState(tx, 'hash-1', 'vgi-out')).toBeNull();
      // Consommation atomique par l'OWNER DU FLUX : première fois la ligne,
      // replay (concurrence même owner) null.
      const taken = await takeInstallByOauthState(tx, 'hash-1', 'vgi-owner');
      expect(taken?.teamId).toBe('vgi-t1');
      expect(taken?.oauthState).toBeNull();
      expect(await takeInstallByOauthState(tx, 'hash-1', 'vgi-owner')).toBeNull();
      // State EXPIRÉ : jamais consommable, même par l'owner du flux.
      await beginLinearInstall(tx, 'vgi-owner', 'vgi-t1', {
        stateHash: 'hash-2',
        stateExpiresAt: new Date(Date.now() - 1_000),
        pkceVerifierEnvelope: SEALED,
      });
      expect(await takeInstallByOauthState(tx, 'hash-2', 'vgi-owner')).toBeNull();
      // Install ACTIVE : relance sans confirmation explicite refusée.
      await tx.execute(
        `update mail0_team_integration_install set status='active' where team_id='vgi-t1'`,
      );
      await expect(
        beginLinearInstall(tx, 'vgi-owner', 'vgi-t1', {
          stateHash: 'hash-3',
          stateExpiresAt: future,
          pkceVerifierEnvelope: SEALED,
        }),
      ).rejects.toThrow('confirmation_required');
      await expect(
        beginLinearInstall(tx, 'vgi-owner', 'vgi-t1', {
          stateHash: 'hash-3',
          stateExpiresAt: future,
          pkceVerifierEnvelope: SEALED,
          reconnectConfirm: true,
        }),
      ).resolves.toMatchObject({ installId: expect.any(String) });
    });
  });

  it('PREVIEW serveur : titre/backlink CANONIQUES, digest+expiry posés ; confirm par référence seule, retry idempotent', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await seedActiveInstall(tx);
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: 'lt-1',
      });
      const { client, getClient } = fakeLinear();
      const preview = await previewIssue(
        tx,
        'vgi-member',
        {
          teamThreadId: 'vgi-tt1',
          clientRequestKey: 'req-key-0001',
          linearTeamId: 'lt-1',
          note: '  Le   client signale ',
        },
        APP,
      );
      if (preview.status !== 'previewed') throw new Error('expected previewed');
      // Canonique SERVEUR : titre = sujet capturé, backlink construit serveur.
      expect(preview.title).toBe('Panne serveur');
      expect(preview.backlinkUrl).toBe('https://app.example.test/team?team=vgi-t1&thread=vgi-tt1');
      expect(preview.description).toContain('> Le client signale');
      expect(preview.description).toContain(
        '[Reta thread](https://app.example.test/team?team=vgi-t1&thread=vgi-tt1)',
      );
      expect(preview.digest).toMatch(/^[0-9a-f]{64}$/);
      // Rien n'est parti vers Linear à l'aperçu.
      expect(client.issueCreate).not.toHaveBeenCalled();

      const created = await confirmIssue(tx, getClient, 'vgi-member', {
        previewId: preview.previewId,
        clientRequestKey: 'req-key-0001',
        digest: preview.digest,
      });
      expect(created).toMatchObject({ issueIdentifier: 'ENG-42', duplicate: false });
      // L'appel Linear porte le CANONIQUE serveur, pas un contenu client.
      expect(client.issueCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Panne serveur' }),
      );
      // Double confirm : idempotent, AUCUNE seconde issue.
      const retry = await confirmIssue(tx, getClient, 'vgi-member', {
        previewId: preview.previewId,
        clientRequestKey: 'req-key-0001',
        digest: preview.digest,
      });
      expect(retry).toMatchObject({ issueIdentifier: 'ENG-42', duplicate: true });
      expect(client.issueCreate).toHaveBeenCalledTimes(1);
      const view = await listThreadIntegration(tx, 'vgi-member', 'vgi-tt1');
      expect(view.issueLinks).toHaveLength(1);
    });
  });

  it('TAMPER : digest altéré, clé étrangère, autre user, aperçu expiré, mapping retiré — tous REFUSÉS sans appel Linear', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await seedActiveInstall(tx);
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: 'lt-1',
      });
      const { client, getClient } = fakeLinear();
      const preview = await previewIssue(
        tx,
        'vgi-member',
        { teamThreadId: 'vgi-tt1', clientRequestKey: 'req-key-0002', linearTeamId: 'lt-1' },
        APP,
      );
      if (preview.status !== 'previewed') throw new Error('expected previewed');
      const tamperedDigest = preview.digest.replace(/^./, preview.digest[0] === 'a' ? 'b' : 'a');
      await expect(
        confirmIssue(tx, getClient, 'vgi-member', {
          previewId: preview.previewId,
          clientRequestKey: 'req-key-0002',
          digest: tamperedDigest,
        }),
      ).rejects.toThrow('preview_invalid');
      await expect(
        confirmIssue(tx, getClient, 'vgi-member', {
          previewId: preview.previewId,
          clientRequestKey: 'req-key-AUTRE',
          digest: preview.digest,
        }),
      ).rejects.toThrow('preview_invalid');
      await expect(
        confirmIssue(tx, getClient, 'vgi-owner', {
          previewId: preview.previewId,
          clientRequestKey: 'req-key-0002',
          digest: preview.digest,
        }),
      ).rejects.toThrow('forbidden');
      // Mapping RETIRÉ entre preview et confirm → refus.
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: '',
      });
      await expect(
        confirmIssue(tx, getClient, 'vgi-member', {
          previewId: preview.previewId,
          clientRequestKey: 'req-key-0002',
          digest: preview.digest,
        }),
      ).rejects.toThrow('mapping_missing');
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: 'lt-1',
      });
      // Aperçu EXPIRÉ → refus.
      await tx.execute(
        `update mail0_team_issue_create_request set preview_expires_at = now() - interval '1 minute'
         where client_request_key = 'req-key-0002'`,
      );
      await expect(
        confirmIssue(tx, getClient, 'vgi-member', {
          previewId: preview.previewId,
          clientRequestKey: 'req-key-0002',
          digest: preview.digest,
        }),
      ).rejects.toThrow('preview_expired');
      expect(client.issueCreate).not.toHaveBeenCalled();
    });
  });

  it('IDEMPOTENCE stricte : même clé pour un autre fil/acteur = idempotency_conflict sans fuite', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await seedActiveInstall(tx);
      await tx.execute(
        `insert into mail0_team_thread (id,team_id,thread_id,sharer_user_id,sharer_connection_id,sharer_email,provider_id,subject,visibility)
         values ('vgi-tt2','vgi-t1','vgi-th2','vgi-owner','vgi-connA','vgi-owner@example.test','google','Sujet 2','team')`,
      );
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: 'lt-1',
      });
      await previewIssue(
        tx,
        'vgi-member',
        { teamThreadId: 'vgi-tt1', clientRequestKey: 'req-key-0003', linearTeamId: 'lt-1' },
        APP,
      );
      // Même clé, AUTRE fil → conflit.
      await expect(
        previewIssue(
          tx,
          'vgi-member',
          { teamThreadId: 'vgi-tt2', clientRequestKey: 'req-key-0003', linearTeamId: 'lt-1' },
          APP,
        ),
      ).rejects.toThrow('idempotency_conflict');
      // Même clé, AUTRE acteur → conflit.
      await expect(
        previewIssue(
          tx,
          'vgi-owner',
          { teamThreadId: 'vgi-tt1', clientRequestKey: 'req-key-0003', linearTeamId: 'lt-1' },
          APP,
        ),
      ).rejects.toThrow('idempotency_conflict');
    });
  });

  it('RECONCILE : issue réseau inconnue → needs_reconciliation, JAMAIS rejoué ; échec PROUVÉ → failed rejouable ; bail pending expiré → reconcile', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await seedActiveInstall(tx);
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: 'lt-1',
      });

      // 1) Issue INCONNUE (réseau/5xx) → needs_reconciliation, retry refusé.
      const unknown = fakeLinear({
        issueCreate: vi.fn(async () => {
          throw new LinearApiError('linear_api_failed:network', 'unknown');
        }),
      });
      const previewA = await previewIssue(
        tx,
        'vgi-owner',
        { teamThreadId: 'vgi-tt1', clientRequestKey: 'req-key-0004', linearTeamId: 'lt-1' },
        APP,
      );
      if (previewA.status !== 'previewed') throw new Error('expected previewed');
      await expect(
        confirmIssue(tx, unknown.getClient, 'vgi-owner', {
          previewId: previewA.previewId,
          clientRequestKey: 'req-key-0004',
          digest: previewA.digest,
        }),
      ).rejects.toThrow('needs_reconciliation');
      const ok = fakeLinear();
      await expect(
        confirmIssue(tx, ok.getClient, 'vgi-owner', {
          previewId: previewA.previewId,
          clientRequestKey: 'req-key-0004',
          digest: previewA.digest,
        }),
      ).rejects.toThrow('needs_reconciliation');
      expect(ok.client.issueCreate).not.toHaveBeenCalled();
      // Relien MANUEL : recherche exacte + Accept fonctionne toujours.
      await expect(
        acceptIssueLink(tx, ok.getClient, 'vgi-owner', {
          teamThreadId: 'vgi-tt1',
          identifier: 'ENG-7',
        }),
      ).resolves.toMatchObject({ issueIdentifier: 'ENG-7' });

      // 1bis) 200 + errors GraphQL = AMBIGU (effet partiel possible) → reconcile.
      const graphqlAmbiguous = fakeLinear({
        issueCreate: vi.fn(async () => {
          throw new LinearApiError('linear_api_failed:graphql', 'unknown');
        }),
      });
      const previewG = await previewIssue(
        tx,
        'vgi-owner',
        { teamThreadId: 'vgi-tt1', clientRequestKey: 'req-key-000g', linearTeamId: 'lt-1' },
        APP,
      );
      if (previewG.status !== 'previewed') throw new Error('expected previewed');
      await expect(
        confirmIssue(tx, graphqlAmbiguous.getClient, 'vgi-owner', {
          previewId: previewG.previewId,
          clientRequestKey: 'req-key-000g',
          digest: previewG.digest,
        }),
      ).rejects.toThrow('needs_reconciliation');

      // 2) Échec PROUVÉ (success:false explicite) → failed, re-preview + confirm passent.
      const proven = fakeLinear({
        issueCreate: vi.fn(async () => {
          throw new LinearApiError('linear_api_failed:issue_create', 'proven_failed');
        }),
      });
      const previewB = await previewIssue(
        tx,
        'vgi-owner',
        { teamThreadId: 'vgi-tt1', clientRequestKey: 'req-key-0005', linearTeamId: 'lt-1' },
        APP,
      );
      if (previewB.status !== 'previewed') throw new Error('expected previewed');
      await expect(
        confirmIssue(tx, proven.getClient, 'vgi-owner', {
          previewId: previewB.previewId,
          clientRequestKey: 'req-key-0005',
          digest: previewB.digest,
        }),
      ).rejects.toThrow('issue_create_failed');
      const retried = await confirmIssue(tx, ok.getClient, 'vgi-owner', {
        previewId: previewB.previewId,
        clientRequestKey: 'req-key-0005',
        digest: previewB.digest,
      });
      expect(retried).toMatchObject({ duplicate: false });

      // 3) 'pending' avec bail EXPIRÉ (crash) → reconcile, jamais de rejeu.
      await tx.execute(
        `insert into mail0_team_issue_create_request
         (id, install_id, team_thread_id, requested_by, client_request_key, title, linear_team_id, status, preview_digest, preview_expires_at, lease_expires_at)
         values ('vgi-crash','vgi-inst1','vgi-tt1','vgi-owner','req-key-0006','T','lt-1','pending', repeat('a',64), now() + interval '10 minutes', now() - interval '1 minute')`,
      );
      await expect(
        confirmIssue(tx, ok.getClient, 'vgi-owner', {
          previewId: 'vgi-crash',
          clientRequestKey: 'req-key-0006',
          digest: 'a'.repeat(64),
        }),
      ).rejects.toThrow('needs_reconciliation');
      const crashRows = (await tx.execute(
        `select status from mail0_team_issue_create_request where id='vgi-crash'`,
      )) as unknown as Array<{ status: string }>;
      expect(crashRows[0]!.status).toBe('needs_reconciliation');
    });
  });

  it('WEBHOOK entrant : un traitement en ÉCHEC annule le claim (transaction) — l’événement n’est pas perdu ; sync via mappings audité integration', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await seedActiveInstall(tx, 'ws-1');
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'team',
        retaValue: 'lt-1',
        externalId: 'lt-1',
      });
      await setMapping(tx, 'vgi-owner', 'vgi-t1', {
        kind: 'status',
        retaValue: 'closed',
        externalId: 'state-done',
      });
      const { getClient } = fakeLinear();
      await previewAndConfirm(tx, getClient, 'vgi-owner', 'req-key-0007');

      // Simulation du contrat route : claim + process dans une SAVEPOINT-tx ;
      // l'échec du process ANNULE le claim → un retry re-traite réellement.
      class Boom extends Error {}
      await expect(
        (tx as unknown as DB).transaction(async (inner) => {
          const claimed = await claimWebhookDelivery(inner as unknown as DB, 'del-tx-1', 'Issue');
          expect(claimed).toBe(true);
          throw new Boom('process failed');
        }),
      ).rejects.toThrow(Boom);
      // Le claim a été annulé : la livraison est RE-claimable (pas perdue).
      expect(await claimWebhookDelivery(tx, 'del-tx-1', 'Issue')).toBe(true);
      expect(await claimWebhookDelivery(tx, 'del-tx-1', 'Issue')).toBe(false);

      const outcome = await processLinearEvent(tx, {
        type: 'Issue',
        action: 'update',
        organizationId: 'ws-1',
        data: { id: 'lin-issue-1', state: { id: 'state-done' } },
      });
      expect(outcome).toBe('synced');
      const audit = await listTeamAudit(tx, 'vgi-owner', 'vgi-t1');
      expect(audit.find((entry) => entry.action === 'integration.issue_synced')).toMatchObject({
        actorKind: 'integration',
        actorUserId: null,
      });

      // OAuthApp revoked (payload officiel) : tokens effacés, audit système.
      const revoked = await processLinearEvent(tx, {
        type: 'OAuthApp',
        action: 'revoked',
        organizationId: 'ws-1',
        createdAt: new Date().toISOString(),
        webhookTimestamp: Date.now(),
        oauthClientId: 'client-1',
      });
      expect(revoked).toBe('oauth_revoked');
      const installs = (await tx.execute(
        `select status, access_token_envelope from mail0_team_integration_install where id='vgi-inst1'`,
      )) as unknown as Array<{ status: string; access_token_envelope: unknown }>;
      expect(installs[0]).toMatchObject({ status: 'revoked', access_token_envelope: null });
    });
  });

  it('OUTBOX : claim CAS (deux workers, une livraison), bail sending moissonné, retry borné puis dead, auto-désactivation, retry manuel owner', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await createOutboundWebhook(
        tx,
        'vgi-owner',
        'vgi-t1',
        {
          id: 'vgi-wh1',
          url: 'https://hooks.example.com/reta',
          events: ['thread.status'],
          secretEnvelope: SEALED,
        },
        publicResolver,
      );
      // Garde SSRF COMPLÈTE dès l'enregistrement (résolution DNS injectée).
      await expect(
        createOutboundWebhook(
          tx,
          'vgi-owner',
          'vgi-t1',
          {
            id: 'vgi-wh2',
            url: 'https://internal.example.com/reta',
            events: ['thread.status'],
            secretEnvelope: SEALED,
          },
          async () => ['10.0.0.8'],
        ),
      ).rejects.toThrow('invalid_url');

      await setThreadStatus(tx, 'vgi-owner', 'vgi-tt1', 'closed');
      const nowMs = Date.now() + 1_000;

      // Deux « workers » : le second voit la ligne déjà claimée (sending) et
      // la SKIP — une seule livraison réseau.
      const slowDeliver = vi.fn(async () => ({ ok: true as const }));
      const firstRun = await deliverDueOutbound(tx, slowDeliver, nowMs);
      expect(firstRun.delivered).toBe(1);
      const secondRun = await deliverDueOutbound(tx, slowDeliver, nowMs);
      expect(secondRun.delivered + secondRun.failed + secondRun.dead).toBe(0);
      expect(slowDeliver).toHaveBeenCalledTimes(1);

      // Crash pendant l'envoi : ligne 'sending' avec bail périmé → reaper la
      // rend pending (l'attempt du crash est déjà compté).
      await enqueueOutboundEvent(tx, {
        teamId: 'vgi-t1',
        eventType: 'thread.status',
        payload: { teamThreadId: 'vgi-tt1' },
      });
      await tx.execute(
        `update mail0_team_outbound_delivery set status='sending', claimed_at = now() - interval '10 minutes', attempts = 1
         where status='pending'`,
      );
      const reaped = await reapStaleOutboundLeases(tx, nowMs);
      expect(reaped).toBe(1);
      const revived = (await tx.execute(
        `select status, attempts from mail0_team_outbound_delivery where status='pending'`,
      )) as unknown as Array<{ status: string; attempts: number }>;
      expect(revived[0]).toMatchObject({ status: 'pending', attempts: 1 });

      // Échecs répétés → dead (attempts comptés AU claim) + compteur webhook.
      const failing = vi.fn(async () => ({ ok: false as const, error: 'http_500' }));
      let clockMs = nowMs;
      for (let round = 0; round < 6; round += 1) {
        await deliverDueOutbound(tx, failing, clockMs);
        clockMs += 3 * 3_600_000 * 2 ** round;
      }
      const deadRows = (await tx.execute(
        `select status, attempts from mail0_team_outbound_delivery where status='dead' and last_error='http_500'`,
      )) as unknown as Array<{ status: string; attempts: number }>;
      expect(deadRows).toHaveLength(1);
      expect(deadRows[0]!.attempts).toBe(5);

      // Retry MANUEL owner : dead → pending ; membre refusé.
      await expect(retryDeadOutbound(tx, 'vgi-member', 'vgi-t1', 'vgi-wh1')).rejects.toThrow(
        'forbidden',
      );
      const retried = await retryDeadOutbound(tx, 'vgi-owner', 'vgi-t1', 'vgi-wh1');
      expect(retried.revived).toBe(1);

      // Auto-désactivation après seuil d'échecs consécutifs.
      await tx.execute(
        `update mail0_team_outbound_webhook set consecutive_failures = 19 where id='vgi-wh1'`,
      );
      await deliverDueOutbound(tx, failing, clockMs + 3_600_000);
      const hooks = (await tx.execute(
        `select active from mail0_team_outbound_webhook where id='vgi-wh1'`,
      )) as unknown as Array<{ active: boolean }>;
      expect(hooks[0]!.active).toBe(false);
    });
  });

  it('ROTATION concurrente : le perdant du CAS n’écrase JAMAIS les tokens frais et relit ceux du gagnant', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const { sealIntegrationSecret, openIntegrationSecret } = await import(
        '../integrations/vault'
      );
      const { refreshInstallTokens } = await import('../integrations/linear-runtime');
      const KEK = Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i)).toString('base64url');
      const ring = { RETA_BYOK_KEK_V1: KEK };
      const accessScope = { teamId: 'vgi-t1', purpose: 'linear:access', recordId: 'vgi-inst1' };
      const refreshScope = { teamId: 'vgi-t1', purpose: 'linear:refresh', recordId: 'vgi-inst1' };
      const accessOld = await sealIntegrationSecret(ring, accessScope, 'access-old');
      const refreshOld = await sealIntegrationSecret(ring, refreshScope, 'refresh-old');
      await tx.execute(
        `insert into mail0_team_integration_install
         (id,team_id,provider,status,workspace_id,scopes,access_token_envelope,refresh_token_envelope,access_token_expires_at,installed_by)
         values ('vgi-inst1','vgi-t1','linear','active','ws-1','["read","issues:create"]'::jsonb,
           '${JSON.stringify(accessOld)}'::jsonb,'${JSON.stringify(refreshOld)}'::jsonb, now() - interval '1 hour','vgi-owner')`,
      );
      const { teamIntegrationInstall } = await import('../../db/schema');
      const staleRows = await tx.select().from(teamIntegrationInstall);
      const staleRow = staleRows[0]!;
      // Un refresh CONCURRENT gagne pendant que le perdant tient un snapshot périmé.
      const accessWinner = await sealIntegrationSecret(ring, accessScope, 'access-winner');
      await tx.execute(
        `update mail0_team_integration_install set access_token_envelope = '${JSON.stringify(accessWinner)}'::jsonb where id='vgi-inst1'`,
      );
      const loserFetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-loser',
              refresh_token: 'rt-loser',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
      );
      const config = {
        kekRing: ring,
        clientId: 'c',
        clientSecret: 's',
        fetchImpl: loserFetch as unknown as typeof fetch,
      };
      const token = await refreshInstallTokens(tx, config, staleRow);
      // Le perdant REND le token du gagnant — jamais le sien.
      expect(token).toBe('access-winner');
      const afterRows = await tx.select().from(teamIntegrationInstall);
      const persisted = await openIntegrationSecret(
        ring,
        accessScope,
        afterRows[0]!.accessTokenEnvelope!,
      );
      expect(persisted).toBe('access-winner');
      // Chemin nominal (snapshot FRAIS) : le CAS passe et écrit.
      const token2 = await refreshInstallTokens(tx, config, afterRows[0]!);
      expect(token2).toBe('access-loser');
      const finalRows = await tx.select().from(teamIntegrationInstall);
      expect(
        await openIntegrationSecret(ring, accessScope, finalRows[0]!.accessTokenEnvelope!),
      ).toBe('access-loser');
    });
  });

  it('OUTBOX zombie : un worker dont le bail a été repris ne marque JAMAIS delivered — fence status+claimedAt', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await createOutboundWebhook(
        tx,
        'vgi-owner',
        'vgi-t1',
        {
          id: 'vgi-whz',
          url: 'https://hooks.example.com/reta',
          events: ['thread.status'],
          secretEnvelope: SEALED,
        },
        publicResolver,
      );
      await enqueueOutboundEvent(tx, {
        teamId: 'vgi-t1',
        eventType: 'thread.status',
        payload: { teamThreadId: 'vgi-tt1' },
      });
      // Pendant la livraison, le bail est REPRIS (reaper → pending) : la
      // complétion du zombie doit tomber dans le vide.
      const zombieDeliver = vi.fn(async () => {
        await tx.execute(
          `update mail0_team_outbound_delivery set status='pending', claimed_at=null where webhook_id='vgi-whz'`,
        );
        return { ok: true as const };
      });
      const summary = await deliverDueOutbound(tx, zombieDeliver, Date.now() + 1_000);
      expect(summary.delivered).toBe(0);
      expect(summary.skipped).toBe(1);
      const rows = (await tx.execute(
        `select status, delivered_at from mail0_team_outbound_delivery where webhook_id='vgi-whz'`,
      )) as unknown as Array<{ status: string; delivered_at: string | null }>;
      // L'état repris fait foi : jamais un faux 'delivered'.
      expect(rows[0]).toMatchObject({ status: 'pending', delivered_at: null });
    });
  });

  it('ACL/config inchangés : owner-only, overview membre sans secret, non-membre refusé, liens externes https, export owner paginé', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await seedActiveInstall(tx);
      await expect(
        setMapping(tx, 'vgi-member', 'vgi-t1', {
          kind: 'team',
          retaValue: 'lt-1',
          externalId: 'lt-1',
        }),
      ).rejects.toThrow('forbidden');
      await expect(revokeLinearInstall(tx, 'vgi-member', 'vgi-t1')).rejects.toThrow('forbidden');
      const overview = await getIntegrationOverview(tx, 'vgi-member', 'vgi-t1', {
        vaultConfigured: true,
        oauthConfigured: true,
      });
      expect(JSON.stringify(overview)).not.toContain('ciphertext');
      await expect(
        getIntegrationOverview(tx, 'vgi-out', 'vgi-t1', {
          vaultConfigured: true,
          oauthConfigured: true,
        }),
      ).rejects.toThrow('not_a_member');
      await expect(
        addExternalLink(tx, 'vgi-member', 'vgi-tt1', {
          kind: 'crm',
          label: 'A',
          url: 'http://x.co',
        }),
      ).rejects.toThrow('invalid_url');
      const { id } = await addExternalLink(tx, 'vgi-member', 'vgi-tt1', {
        kind: 'crm',
        label: 'Attio',
        url: 'https://app.attio.com/deal/1',
      });
      expect(id).toBeTruthy();
      // Unlink d'issue audité (flux inchangé).
      const { getClient } = fakeLinear();
      await acceptIssueLink(tx, getClient, 'vgi-member', {
        teamThreadId: 'vgi-tt1',
        identifier: 'ENG-7',
      });
      const view = await listThreadIntegration(tx, 'vgi-member', 'vgi-tt1');
      await unlinkIssue(tx, 'vgi-member', view.issueLinks[0]!.id);
      await expect(exportTeamActivity(tx, 'vgi-member', 'vgi-t1', {})).rejects.toThrow('forbidden');
      const page = await exportTeamActivity(tx, 'vgi-owner', 'vgi-t1', { limit: 1 });
      expect(page.entries).toHaveLength(1);
      // Révocation locale : audit avec remoteRevoke explicite.
      await revokeLinearInstall(tx, 'vgi-owner', 'vgi-t1', { remote: 'failed' });
      const audit = await listTeamAudit(tx, 'vgi-owner', 'vgi-t1');
      const revoked = audit.find((entry) => entry.action === 'integration.revoked');
      expect(revoked?.metadata).toMatchObject({ remoteRevoke: 'failed' });
      const secretScan = await listOutboundWebhooks(tx, 'vgi-owner', 'vgi-t1');
      expect(JSON.stringify(secretScan)).not.toContain('wrappedDek');
    });
  });
});
