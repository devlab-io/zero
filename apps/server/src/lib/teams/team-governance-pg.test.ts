import {
  addComment,
  editComment,
  heartbeatPresence,
  listTeamInvites,
  listTeamMembers,
  listTeamThreads,
  resolveAccess,
  setMemberRole,
  createInvite,
  setThreadStatus,
} from './team-store';
import {
  buildAuditExportPayload,
  exportTeamData,
  getRetentionPolicy,
  restoreTeamData,
  setRetentionPolicy,
  sweepTeamRetention,
} from './team-governance-store';
import { createReplyIntent, requestReview, type DraftReadEffects } from './team-drafts-store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DB } from '../../db';

/**
 * Tests COMPORTEMENTAUX P17 sur PostgreSQL RÉEL (base locale jetable migrée
 * 0047). Chaque test s'exécute dans une transaction ROLLBACK — zéro ligne
 * résiduelle. Si la base n'est pas joignable (CI), la suite se SKIP
 * explicitement — elle ne fait jamais semblant de passer.
 *
 * Couverture : ACL guest/auditor (accessPredicate + gardes stores),
 * setMemberRole (anti-escalade, dernier owner, désassignation), politique de
 * rétention + sweep audité, export d'audit (payload borné), export/
 * restauration de données round-trip.
 */

const PG_URL =
  process.env['RETA_P17_PG_URL'] ??
  'postgresql://postgres@127.0.0.1:5432/zero_reta_p14_verify_2366';

let pg: ReturnType<typeof createDb> | null = null;
let available = false;

beforeAll(async () => {
  try {
    pg = createDb(PG_URL);
    await pg.db.execute('select 1');
    const probe = await pg.db.execute(
      "select 1 from information_schema.tables where table_name = 'mail0_team_retention_policy'",
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

/**
 * Équipe complète : owner, admin, member, guest, auditor + un fil en
 * visibilité équipe (gvp-tt1) et un restreint (gvp-tt2, accès explicite au
 * guest seul).
 */
async function seed(tx: DB) {
  const sql = (query: string) => tx.execute(query);
  await sql(`insert into mail0_user (id, name, email, email_verified, created_at, updated_at) values
    ('gvp-owner','Owner','gvp-owner@example.test',true,now(),now()),
    ('gvp-admin','Admin','gvp-admin@example.test',true,now(),now()),
    ('gvp-member','Member','gvp-member@example.test',true,now(),now()),
    ('gvp-guest','Guest','gvp-guest@ext.test',true,now(),now()),
    ('gvp-auditor','Auditor','gvp-auditor@example.test',true,now(),now())`);
  await sql(`insert into mail0_connection (id,user_id,email,scope,expires_at,created_at,updated_at,provider_id) values
    ('gvp-connO','gvp-owner','gvp-owner@example.test','s',now()+interval '1 day',now(),now(),'google')`);
  await sql(
    `insert into mail0_team (id,name,created_by) values ('gvp-t1','Gouvernance','gvp-owner')`,
  );
  await sql(`insert into mail0_team_member (team_id,user_id,role) values
    ('gvp-t1','gvp-owner','owner'),
    ('gvp-t1','gvp-admin','admin'),
    ('gvp-t1','gvp-member','member'),
    ('gvp-t1','gvp-guest','guest'),
    ('gvp-t1','gvp-auditor','auditor')`);
  await sql(`insert into mail0_team_thread (id,team_id,thread_id,sharer_user_id,sharer_connection_id,sharer_email,provider_id,subject,visibility) values
    ('gvp-tt1','gvp-t1','gvp-th1','gvp-owner','gvp-connO','gvp-owner@example.test','google','Visible équipe','team'),
    ('gvp-tt2','gvp-t1','gvp-th2','gvp-owner','gvp-connO','gvp-owner@example.test','google','Restreint','restricted')`);
  await sql(`insert into mail0_team_thread_access (id,team_thread_id,user_id,source,granted_by) values
    ('gvp-acc1','gvp-tt2','gvp-guest','manual','gvp-owner')`);
}

describe('P17 comportemental — PostgreSQL réel (skippé si base absente)', () => {
  // --- A : ACL guest/auditor ---------------------------------------------------

  it('guest : ne voit PAS la visibilité équipe, voit son accès explicite ; auditor voit l’équipe', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // resolveAccess est LA porte ACL de toute lecture. Un MEMBRE sans accès
      // reçoit 'forbidden' (le fil existe pour lui), un étranger 'not_found'.
      await expect(resolveAccess(tx, 'gvp-guest', 'gvp-tt1')).rejects.toThrow('forbidden');
      await expect(resolveAccess(tx, 'gvp-guest', 'gvp-tt2')).resolves.toMatchObject({
        id: 'gvp-tt2',
      });
      await expect(resolveAccess(tx, 'gvp-auditor', 'gvp-tt1')).resolves.toMatchObject({
        id: 'gvp-tt1',
      });
      // Restreint : auditor n'est PAS superviseur (owner/admin seuls).
      await expect(resolveAccess(tx, 'gvp-auditor', 'gvp-tt2')).rejects.toThrow('forbidden');
      await expect(resolveAccess(tx, 'gvp-admin', 'gvp-tt2')).resolves.toMatchObject({
        id: 'gvp-tt2',
      });
      // La liste suit le même prédicat.
      const guestList = await listTeamThreads(tx, 'gvp-guest', 'gvp-t1', { cursor: null });
      expect(guestList.threads.map((t: { id: string }) => t.id)).toEqual(['gvp-tt2']);
    });
  });

  it("guest : aucun annuaire d'équipe ni email d'invitation en attente", async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await createInvite(tx, 'gvp-owner', 'gvp-t1', 'future@example.test', 'member');
      const members = await listTeamMembers(tx, 'gvp-guest', 'gvp-t1');
      expect(members.map((member) => member.userId)).toEqual(['gvp-guest']);
      await expect(listTeamInvites(tx, 'gvp-guest', 'gvp-t1')).rejects.toThrow('forbidden');
      await expect(listTeamInvites(tx, 'gvp-member', 'gvp-t1')).resolves.toHaveLength(1);
    });
  });

  it('écritures par rôle : guest commente sur son fil accordé mais ne clôt pas ; auditor ne commente jamais', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seedInline(tx);
      const comment = await addComment(tx, 'gvp-guest', 'gvp-tt2', 'question externe', [], null);
      expect(comment.id).toBeTruthy();
      await expect(setThreadStatus(tx, 'gvp-guest', 'gvp-tt2', 'closed')).rejects.toThrow(
        'forbidden',
      );
      await expect(
        addComment(tx, 'gvp-auditor', 'gvp-tt1', 'lecture seule', [], null),
      ).rejects.toThrow('forbidden');
      await expect(setThreadStatus(tx, 'gvp-auditor', 'gvp-tt1', 'closed')).rejects.toThrow(
        'forbidden',
      );
    });
    async function seedInline(tx: DB) {
      await seed(tx);
    }
  });

  it('mention par un guest sur un fil restreint : jamais un élargissement d’ACL', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // gvp-member n'a PAS accès au fil restreint : la mention du guest
      // devrait l'élargir — refusée (le guest n'a pas thread.write).
      await expect(
        addComment(tx, 'gvp-guest', 'gvp-tt2', 'regarde ça', ['gvp-member'], null),
      ).rejects.toThrow('mention_requires_access');
      const rows = (await tx.execute(
        `select 1 from mail0_team_thread_access where team_thread_id='gvp-tt2' and user_id='gvp-member'`,
      )) as unknown as unknown[];
      expect(rows).toHaveLength(0);
      // Mentionner quelqu'un qui a DÉJÀ accès (owner/admin superviseurs,
      // partageur) reste permis — aucune ligne d'ACL nouvelle.
      await expect(
        addComment(tx, 'gvp-guest', 'gvp-tt2', 'ping', ['gvp-admin'], null),
      ).resolves.toMatchObject({ id: expect.any(String) });
      // Un MEMBER avec thread.write élargit toujours par mention (fil où il a accès).
      await tx.execute(`insert into mail0_team_thread_access (id,team_thread_id,user_id,source,granted_by) values
        ('gvp-acc2','gvp-tt2','gvp-member','manual','gvp-owner')`);
      await expect(
        addComment(tx, 'gvp-member', 'gvp-tt2', 'j’ajoute l’auditeur', ['gvp-auditor'], null),
      ).resolves.toMatchObject({ id: expect.any(String) });
      const widened = (await tx.execute(
        `select source from mail0_team_thread_access where team_thread_id='gvp-tt2' and user_id='gvp-auditor'`,
      )) as unknown as Array<{ source: string }>;
      expect(widened).toEqual([{ source: 'mention' }]);
    });
  });

  it('auditor ne peut pas être reviewer de brouillon (draft.review refusé)', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const effects: DraftReadEffects = {
        getDraft: async () => ({ subject: 's', content: '<p>b</p>', to: ['x@y.z'] }),
      };
      await expect(
        requestReview(tx, effects, 'gvp-owner', {
          teamThreadId: 'gvp-tt1',
          draftId: 'd1',
          reviewerUserId: 'gvp-auditor',
        }),
      ).rejects.toThrow('not_reviewer');
      // Un guest AVEC accès explicite au fil peut relire.
      await expect(
        requestReview(tx, effects, 'gvp-owner', {
          teamThreadId: 'gvp-tt2',
          draftId: 'd2',
          reviewerUserId: 'gvp-guest',
        }),
      ).resolves.toMatchObject({ id: expect.any(String) });
    });
  });

  // --- A : setMemberRole ---------------------------------------------------------

  it('setMemberRole : anti-escalade admin, dernier owner protégé, member sans gestion', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // Un admin ne touche ni owner ni admin, et n'attribue jamais admin.
      await expect(setMemberRole(tx, 'gvp-admin', 'gvp-t1', 'gvp-owner', 'member')).rejects.toThrow(
        'forbidden',
      );
      await expect(setMemberRole(tx, 'gvp-admin', 'gvp-t1', 'gvp-member', 'admin')).rejects.toThrow(
        'forbidden',
      );
      // Un member n'a pas team.manage du tout.
      await expect(
        setMemberRole(tx, 'gvp-member', 'gvp-t1', 'gvp-guest', 'member'),
      ).rejects.toThrow('forbidden');
      // Dernier owner : jamais rétrogradé, même par lui-même.
      await expect(setMemberRole(tx, 'gvp-owner', 'gvp-t1', 'gvp-owner', 'admin')).rejects.toThrow(
        'last_owner',
      );
      // Un owner promeut un second owner, puis peut se rétrograder.
      await setMemberRole(tx, 'gvp-owner', 'gvp-t1', 'gvp-admin', 'owner');
      await expect(
        setMemberRole(tx, 'gvp-owner', 'gvp-t1', 'gvp-owner', 'admin'),
      ).resolves.toMatchObject({ role: 'admin' });
    });
  });

  it('rétrograder vers un rôle sans écriture DÉSASSIGNE les fils du membre', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await tx.execute(
        `update mail0_team_thread set assignee_user_id = 'gvp-member' where id = 'gvp-tt1'`,
      );
      await setMemberRole(tx, 'gvp-owner', 'gvp-t1', 'gvp-member', 'auditor');
      const rows = (await tx.execute(
        `select assignee_user_id from mail0_team_thread where id = 'gvp-tt1'`,
      )) as unknown as Array<{ assignee_user_id: string | null }>;
      expect(rows[0]!.assignee_user_id).toBeNull();
      // L'audit nomme le changement.
      const audits = (await tx.execute(
        `select action, metadata from mail0_team_audit_log where team_id='gvp-t1' and action='member.role_changed'`,
      )) as unknown as Array<{ action: string; metadata: { from: string; to: string } }>;
      expect(audits).toHaveLength(1);
      expect(audits[0]!.metadata).toMatchObject({ from: 'member', to: 'auditor' });
    });
  });

  it('rétrogradation auditor : coupe les mutations historiques et annule les reviews actives', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const comment = await addComment(
        tx,
        'gvp-member',
        'gvp-tt1',
        'avant rétrogradation',
        [],
        null,
      );
      await requestReview(
        tx,
        { getDraft: async () => ({ subject: 's', content: '<p>b</p>', to: ['x@y.z'] }) },
        'gvp-owner',
        { teamThreadId: 'gvp-tt1', draftId: 'd-role', reviewerUserId: 'gvp-member' },
      );

      const result = await setMemberRole(tx, 'gvp-owner', 'gvp-t1', 'gvp-member', 'auditor');
      expect(result.realtimeThreadIds).toEqual(expect.arrayContaining(['gvp-tt1', 'gvp-tt2']));
      const reviews = (await tx.execute(
        `select state from mail0_team_draft_review where draft_id='d-role'`,
      )) as unknown as Array<{ state: string }>;
      expect(reviews).toEqual([{ state: 'cancelled' }]);

      await expect(editComment(tx, 'gvp-member', comment.id, 'après')).rejects.toThrow('forbidden');
      await expect(heartbeatPresence(tx, 'gvp-member', 'gvp-tt1', true)).rejects.toThrow(
        'forbidden',
      );
      await expect(createReplyIntent(tx, 'gvp-member', 'gvp-tt1')).rejects.toThrow('forbidden');
    });
  });

  it('invitations : admin invite guest/auditor mais jamais owner/admin ; member invite member seul', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await expect(
        createInvite(tx, 'gvp-admin', 'gvp-t1', 'new-guest@ext.test', 'guest'),
      ).resolves.toMatchObject({ id: expect.any(String) });
      await expect(
        createInvite(tx, 'gvp-admin', 'gvp-t1', 'new-admin@example.test', 'admin'),
      ).rejects.toThrow('forbidden');
      await expect(
        createInvite(tx, 'gvp-member', 'gvp-t1', 'peer@example.test', 'member'),
      ).resolves.toMatchObject({ id: expect.any(String) });
      await expect(
        createInvite(tx, 'gvp-member', 'gvp-t1', 'esc@example.test', 'auditor'),
      ).rejects.toThrow('forbidden');
      await expect(
        createInvite(tx, 'gvp-guest', 'gvp-t1', 'other@ext.test', 'member'),
      ).rejects.toThrow('forbidden');
    });
  });

  // --- B : export d'audit ----------------------------------------------------------

  it('export d’audit : auditor autorisé, member refusé ; payload borné et audité', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await tx.execute(`insert into mail0_team_audit_log (id,team_id,actor_user_id,actor_kind,action,subject_type,subject_id,metadata,created_at) values
        ('gvp-a1','gvp-t1','gvp-owner','user','thread.shared','team_thread','gvp-tt1','{}',now()-interval '2 days'),
        ('gvp-a2','gvp-t1',null,'system','retention.swept','team','gvp-t1','{}',now()-interval '1 day')`);
      await expect(buildAuditExportPayload(tx, 'gvp-member', 'gvp-t1', {})).rejects.toThrow(
        'forbidden',
      );
      const payload = await buildAuditExportPayload(tx, 'gvp-auditor', 'gvp-t1', {});
      expect(payload.format).toBe('reta-team-audit-export');
      expect(payload.teamId).toBe('gvp-t1');
      expect(payload.truncated).toBe(false);
      // Chronologique ASC, acteurs système inclus (actorUserId null).
      const actions = payload.entries.map((entry) => entry.action);
      expect(actions).toContain('thread.shared');
      expect(actions).toContain('retention.swept');
      const systemEntry = payload.entries.find((entry) => entry.action === 'retention.swept');
      expect(systemEntry!.actorUserId).toBeNull();
      expect(systemEntry!.actorKind).toBe('system');
      // L'export lui-même est audité.
      const audits = (await tx.execute(
        `select 1 from mail0_team_audit_log where team_id='gvp-t1' and action='audit.exported' and actor_user_id='gvp-auditor'`,
      )) as unknown as unknown[];
      expect(audits).toHaveLength(1);
      // Fenêtre from/to respectée.
      const windowed = await buildAuditExportPayload(tx, 'gvp-auditor', 'gvp-t1', {
        to: new Date(Date.now() - 36 * 3_600_000),
      });
      expect(windowed.entries.map((entry) => entry.action)).toEqual(['thread.shared']);
    });
  });

  // --- C : rétention -----------------------------------------------------------------

  it('politique de rétention : bornes store + CHECK SQL, lecture auditor, écriture admin', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await expect(
        setRetentionPolicy(tx, 'gvp-owner', 'gvp-t1', {
          auditDays: 10, // < 30
          ruleRunDays: null,
          notificationDays: null,
        }),
      ).rejects.toThrow('invalid_retention');
      await expect(
        setRetentionPolicy(tx, 'gvp-member', 'gvp-t1', {
          auditDays: 90,
          ruleRunDays: null,
          notificationDays: null,
        }),
      ).rejects.toThrow('forbidden');
      // Un admin (team.manage) écrit la politique.
      await setRetentionPolicy(tx, 'gvp-admin', 'gvp-t1', {
        auditDays: 90,
        ruleRunDays: 30,
        notificationDays: 730,
      });
      const policy = await getRetentionPolicy(tx, 'gvp-auditor', 'gvp-t1');
      expect(policy).toMatchObject({ auditDays: 90, ruleRunDays: 30, notificationDays: 730 });
      // CHECK SQL en dernière ligne de défense.
      await expect(
        tx.execute(`update mail0_team_retention_policy set audit_days = 5 where team_id='gvp-t1'`),
      ).rejects.toThrow();
    });
  });

  it('sweep : purge bornée au-delà du cutoff, claims processing préservés, purge auditée, intents moissonnés', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await setRetentionPolicy(tx, 'gvp-owner', 'gvp-t1', {
        auditDays: 30,
        ruleRunDays: 30,
        notificationDays: 30,
      });
      // Vieilles lignes (40 j) + récentes (1 j) dans les trois familles.
      await tx.execute(`insert into mail0_team_audit_log (id,team_id,actor_user_id,actor_kind,action,subject_type,subject_id,metadata,created_at) values
        ('gvp-old-a','gvp-t1','gvp-owner','user','thread.shared','x','y','{}',now()-interval '40 days'),
        ('gvp-new-a','gvp-t1','gvp-owner','user','thread.shared','x','y','{}',now()-interval '1 day')`);
      await tx.execute(`insert into mail0_team_rule (id,team_id,name,enabled,connection_id,created_by,triggers,actions) values
        ('gvp-r1','gvp-t1','R',true,'gvp-connO','gvp-owner','{}','[]')`);
      await tx.execute(`insert into mail0_team_rule_run (id,rule_id,team_id,thread_id,outcome,actor_user_id,created_at) values
        ('gvp-run-old','gvp-r1','gvp-t1','th-old','applied','gvp-owner',now()-interval '40 days'),
        ('gvp-run-proc','gvp-r1','gvp-t1','th-proc','processing','gvp-owner',now()-interval '40 days'),
        ('gvp-run-new','gvp-r1','gvp-t1','th-new','applied','gvp-owner',now()-interval '1 day')`);
      await tx.execute(`insert into mail0_team_notification (id,user_id,team_id,kind,actor_user_id,created_at) values
        ('gvp-n-old','gvp-member','gvp-t1','comment','gvp-owner',now()-interval '40 days'),
        ('gvp-n-new','gvp-member','gvp-t1','comment','gvp-owner',now()-interval '1 day')`);
      await tx.execute(`insert into mail0_team_reply_intent (id,team_thread_id,user_id,provider_thread_id,baseline_at,expires_at) values
        ('gvp-i-old','gvp-tt1','gvp-owner','gvp-th1',now()-interval '10 days',now()-interval '9 days'),
        ('gvp-i-live','gvp-tt1','gvp-owner','gvp-th1',now(),now()+interval '1 day')`);

      const summary = await sweepTeamRetention(tx, new Date());
      expect(summary.teams).toBe(1);
      expect(summary.audit).toBe(1);
      expect(summary.ruleRuns).toBe(1);
      expect(summary.notifications).toBe(1);
      expect(summary.replyIntents).toBe(1);

      const remaining = async (query: string) =>
        ((await tx.execute(query)) as unknown as unknown[]).length;
      expect(await remaining(`select 1 from mail0_team_audit_log where id='gvp-old-a'`)).toBe(0);
      expect(await remaining(`select 1 from mail0_team_audit_log where id='gvp-new-a'`)).toBe(1);
      expect(await remaining(`select 1 from mail0_team_rule_run where id='gvp-run-old'`)).toBe(0);
      // Le claim 'processing' est un verrou vivant — JAMAIS purgé.
      expect(await remaining(`select 1 from mail0_team_rule_run where id='gvp-run-proc'`)).toBe(1);
      expect(await remaining(`select 1 from mail0_team_rule_run where id='gvp-run-new'`)).toBe(1);
      expect(await remaining(`select 1 from mail0_team_notification where id='gvp-n-old'`)).toBe(0);
      expect(await remaining(`select 1 from mail0_team_reply_intent where id='gvp-i-old'`)).toBe(0);
      expect(await remaining(`select 1 from mail0_team_reply_intent where id='gvp-i-live'`)).toBe(
        1,
      );
      // La purge est auditée (actor system, NULL).
      const swept = (await tx.execute(
        `select metadata from mail0_team_audit_log where team_id='gvp-t1' and action='retention.swept' and actor_kind='system' and actor_user_id is null`,
      )) as unknown as Array<{ metadata: { audit: number; ruleRuns: number } }>;
      expect(swept).toHaveLength(1);
      expect(swept[0]!.metadata).toMatchObject({ audit: 1, ruleRuns: 1, notifications: 1 });
      // Un second sweep ne re-purge rien (idempotent sur l'état atteint).
      const second = await sweepTeamRetention(tx, new Date());
      expect(second.teams).toBe(0);
      expect(second.replyIntents).toBe(0);
    });
  });

  it('sweep : plus de 200 politiques progressent sans famine grâce à last_swept_at', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await tx.execute(`insert into mail0_team (id,name,created_by)
        select 'gvp-fair-' || lpad(n::text, 3, '0'), 'Fair ' || n, 'gvp-owner'
        from generate_series(1, 201) n`);
      await tx.execute(`insert into mail0_team_retention_policy (team_id, audit_days)
        select 'gvp-fair-' || lpad(n::text, 3, '0'), 30 from generate_series(1, 201) n`);

      await sweepTeamRetention(tx, new Date('2026-08-03T00:00:00.000Z'));
      const first = (await tx.execute(
        `select count(*)::int as count from mail0_team_retention_policy
         where team_id like 'gvp-fair-%' and last_swept_at is not null`,
      )) as unknown as Array<{ count: number }>;
      expect(first[0]!.count).toBe(200);

      await sweepTeamRetention(tx, new Date('2026-08-03T00:01:00.000Z'));
      const second = (await tx.execute(
        `select count(*)::int as count from mail0_team_retention_policy
         where team_id like 'gvp-fair-%' and last_swept_at is not null`,
      )) as unknown as Array<{ count: number }>;
      expect(second[0]!.count).toBe(201);
    });
  });

  // --- E : export / restauration -------------------------------------------------------

  it('round-trip : export complet puis restauration dans une NOUVELLE équipe', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // Graphe complet : label, lien, commentaire+réaction, règle, politiques, absence.
      await tx.execute(`insert into mail0_team_label (id,team_id,name,color,created_by) values
        ('gvp-l1','gvp-t1','urgent','red','gvp-owner')`);
      await tx.execute(`insert into mail0_team_thread_label (team_thread_id,label_id) values
        ('gvp-tt1','gvp-l1')`);
      await tx.execute(
        `update mail0_team_thread set assignee_user_id='gvp-member' where id='gvp-tt1'`,
      );
      await tx.execute(`insert into mail0_team_thread_comment (id,team_thread_id,author_user_id,body,mentions) values
        ('gvp-c1','gvp-tt1','gvp-member','on répond ?','["gvp-owner"]')`);
      await tx.execute(`insert into mail0_team_comment_reaction (comment_id,user_id,emoji) values
        ('gvp-c1','gvp-owner','👍')`);
      await tx.execute(`insert into mail0_team_rule (id,team_id,name,enabled,connection_id,created_by,triggers,actions) values
        ('gvp-r1','gvp-t1','VIP',true,'gvp-connO','gvp-owner','{"domains":["ext.test"]}','[{"kind":"share","visibility":"team"}]')`);
      await tx.execute(`insert into mail0_team_sla_policy (team_id,first_response_minutes,time_zone) values
        ('gvp-t1',60,'Pacific/Tahiti')`);
      await setRetentionPolicy(tx, 'gvp-owner', 'gvp-t1', {
        auditDays: 180,
        ruleRunDays: null,
        notificationDays: null,
      });
      await tx.execute(`insert into mail0_team_member_absence (id,team_id,user_id,starts_at,ends_at,created_by) values
        ('gvp-ab1','gvp-t1','gvp-member',now()+interval '7 days',now()+interval '14 days','gvp-member')`);

      // data.export : member refusé, admin autorisé.
      await expect(exportTeamData(tx, 'gvp-member', 'gvp-t1')).rejects.toThrow('forbidden');
      const payload = await exportTeamData(tx, 'gvp-admin', 'gvp-t1');
      expect(payload.format).toBe('reta-team-export');
      expect(payload.members).toHaveLength(5);
      expect(payload.threads).toHaveLength(2);
      expect(payload.threads.find((t) => t.id === 'gvp-tt1')!.labelIds).toEqual(['gvp-l1']);
      expect(payload.threads.find((t) => t.id === 'gvp-tt2')!.accessUserIds).toEqual(['gvp-guest']);
      expect(payload.comments).toHaveLength(1);
      expect(payload.comments[0]!.reactions).toEqual([{ userId: 'gvp-owner', emoji: '👍' }]);
      expect(payload.rules).toHaveLength(1);
      expect(payload.rules[0]!.watchedEmail).toBe('gvp-owner@example.test');
      expect(payload.slaPolicy).toMatchObject({ timeZone: 'Pacific/Tahiti' });
      expect(payload.retentionPolicy).toMatchObject({ auditDays: 180 });
      expect(payload.absences).toHaveLength(1);
      expect(payload.truncated).toEqual([]);

      // Restauration par l'ADMIN encore autorisé sur la source (il devient
      // owner de la nouvelle équipe). Un fichier n'est jamais un bearer token.
      const report = await restoreTeamData(tx, 'gvp-admin', payload);
      expect(report.teamId).not.toBe('gvp-t1');
      expect(report.restored).toMatchObject({
        members: 5,
        labels: 1,
        threads: 2,
        comments: 1,
        reactions: 1,
        rules: 1,
        absences: 1,
        accessRows: 1,
      });
      expect(report.rulesRestoredDisabled).toBe(true);

      // Rôles : owner exporté → admin ; l'appelant → owner.
      const roles = (await tx.execute(
        `select user_id, role from mail0_team_member where team_id='${report.teamId}'`,
      )) as unknown as Array<{ user_id: string; role: string }>;
      const roleMap = new Map(roles.map((row) => [row.user_id, row.role]));
      expect(roleMap.get('gvp-admin')).toBe('owner');
      expect(roleMap.get('gvp-owner')).toBe('admin');
      expect(roleMap.get('gvp-member')).toBe('member');
      expect(roleMap.get('gvp-guest')).toBe('guest');
      expect(roleMap.get('gvp-auditor')).toBe('auditor');

      // Règle restaurée DÉSACTIVÉE, reliée à la vraie connexion.
      const rules = (await tx.execute(
        `select enabled, connection_id from mail0_team_rule where team_id='${report.teamId}'`,
      )) as unknown as Array<{ enabled: boolean; connection_id: string }>;
      expect(rules).toEqual([{ enabled: false, connection_id: 'gvp-connO' }]);

      // Le fil restauré reste lisible via l'ACL réelle (proxy du partageur).
      const restored = (await tx.execute(
        `select id, visibility from mail0_team_thread where team_id='${report.teamId}' and subject='Restreint'`,
      )) as unknown as Array<{ id: string; visibility: string }>;
      expect(restored[0]!.visibility).toBe('restricted');
      await expect(resolveAccess(tx, 'gvp-guest', restored[0]!.id)).resolves.toBeTruthy();
      // Membre (auditor) sans accès au restreint : forbidden, pas invisible.
      await expect(resolveAccess(tx, 'gvp-auditor', restored[0]!.id)).rejects.toThrow('forbidden');

      // Audit team.restored porte le digest source.
      const audits = (await tx.execute(
        `select metadata from mail0_team_audit_log where team_id='${report.teamId}' and action='team.restored'`,
      )) as unknown as Array<{ metadata: { sourceDigest: string; sourceTeamId: string } }>;
      expect(audits).toHaveLength(1);
      expect(audits[0]!.metadata.sourceTeamId).toBe('gvp-t1');
      expect(audits[0]!.metadata.sourceDigest).toBe(report.sourceDigest);
    });
  });

  it('restauration : exige data.export courant et refuse toute liaison boîte forgée', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const payload = await exportTeamData(tx, 'gvp-admin', 'gvp-t1');

      // Posséder le JSON ne confère aucun droit durable sur les connexions des
      // autres membres : un member sans data.export ne peut pas le rejouer.
      await expect(restoreTeamData(tx, 'gvp-member', payload)).rejects.toThrow('forbidden');

      const forged = {
        ...payload,
        threads: payload.threads.map((thread, index) =>
          index === 0 ? { ...thread, threadId: 'forged-provider-thread' } : thread,
        ),
      };
      const report = await restoreTeamData(tx, 'gvp-admin', forged);
      expect(report.restored.threads).toBe(payload.threads.length - 1);
      expect(report.skipped).toContainEqual({
        kind: 'thread',
        id: payload.threads[0]!.id,
        reason: 'source_thread_mismatch',
      });
    });
  });

  it('restauration : format inconnu refusé net', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      await expect(
        restoreTeamData(tx, 'gvp-owner', {
          format: 'quelque-chose',
        } as never),
      ).rejects.toThrow('restore_invalid');
    });
  });
});
