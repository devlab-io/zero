import {
  cancelReview,
  claimTeamReply,
  consumeIntentOverride,
  createReplyIntent,
  findOwnReplyClaim,
  getReviewForThread,
  getValidReplyIntent,
  markIntentCollision,
  requestReview,
  resolveTeamReplyClaim,
  sendCollisionPreflight,
  setReviewDecision,
  suggestEdit,
  type DraftReadEffects,
} from './team-drafts-store';
import { computeDraftDigest, normalizeDraftSnapshot } from './team-drafts-shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DB } from '../../db';

/**
 * Tests COMPORTEMENTAUX P15 sur PostgreSQL RÉEL (base locale jetable déjà
 * migrée 0045). Chaque test s'exécute dans une transaction ROLLBACK — zéro
 * ligne résiduelle. Les effets de lecture de brouillon sont MOCKÉS (aucun
 * Gmail réel). Si la base n'est pas joignable (CI), la suite se SKIP
 * explicitement — elle ne fait jamais semblant de passer.
 */

const PG_URL =
  process.env['RETA_P15_PG_URL'] ??
  'postgresql://postgres@127.0.0.1:5432/zero_reta_p14_verify_2366';

let pg: ReturnType<typeof createDb> | null = null;
let available = false;

beforeAll(async () => {
  try {
    pg = createDb(PG_URL);
    await pg.db.execute('select 1');
    const probe = await pg.db.execute(
      "select 1 from information_schema.tables where table_name = 'mail0_team_draft_review'",
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

/** Exécute `fn` dans une transaction TOUJOURS annulée. */
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

const DRAFT_V1 = { subject: 'Re: devis', content: '<p>version un</p>', to: ['client@ext.pf'] };
const DRAFT_V2 = { subject: 'Re: devis', content: '<p>version deux</p>', to: ['client@ext.pf'] };

const effectsFor = (drafts: Record<string, typeof DRAFT_V1 | null>): DraftReadEffects => ({
  getDraft: async (_connectionId, draftId) => drafts[draftId] ?? null,
});

async function seed(tx: DB, options?: { restricted?: boolean }) {
  const sql = (query: string) => tx.execute(query);
  await sql(`insert into mail0_user (id, name, email, email_verified, created_at, updated_at) values
    ('vxp-owner','Owner','vxp-owner@example.test',true,now(),now()),
    ('vxp-rev','Reviewer','vxp-rev@example.test',true,now(),now()),
    ('vxp-other','Other','vxp-other@example.test',true,now(),now()),
    ('vxp-out','Outsider','vxp-out@example.test',true,now(),now())`);
  await sql(`insert into mail0_connection (id,user_id,email,scope,expires_at,created_at,updated_at,provider_id)
    values ('vxp-connA','vxp-owner','vxp-owner@example.test','s',now()+interval '1 day',now(),now(),'google')`);
  await sql(`insert into mail0_team (id,name,created_by) values ('vxp-t1','T','vxp-owner')`);
  await sql(`insert into mail0_team_member (team_id,user_id,role) values
    ('vxp-t1','vxp-owner','member'),('vxp-t1','vxp-rev','member'),('vxp-t1','vxp-other','member')`);
  await sql(
    `insert into mail0_team_thread (id,team_id,thread_id,sharer_user_id,sharer_connection_id,sharer_email,provider_id,subject,visibility)
     values ('vxp-tt1','vxp-t1','vxp-th1','vxp-owner','vxp-connA','vxp-owner@example.test','google','Sujet','${options?.restricted ? 'restricted' : 'team'}')`,
  );
  if (options?.restricted) {
    // Seul le reviewer reçoit l'accès explicite ; 'vxp-other' n'a RIEN.
    await sql(`insert into mail0_team_thread_access (id,team_thread_id,user_id,source,granted_by)
      values ('vxp-acc1','vxp-tt1','vxp-rev','share','vxp-owner')`);
  }
}

/** Horloge du SERVEUR PG (les colonnes `timestamp` sans tz suivent sa zone). */
async function pgNowMs(tx: DB): Promise<number> {
  const rows = (await tx.execute(
    'select extract(epoch from now()) * 1000 as ms',
  )) as unknown as Array<{ ms: string | number }>;
  return Math.floor(Number(rows[0]!.ms));
}

describe('P15 comportemental — PostgreSQL réel (skippé si base absente)', () => {
  it('lifecycle complet : request → suggest → changes → approve, revision monotone', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const effects = effectsFor({ 'draft-1': DRAFT_V1 });
      const digest = await computeDraftDigest(normalizeDraftSnapshot(DRAFT_V1));

      const { id } = await requestReview(tx, effects, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        draftId: 'draft-1',
        reviewerUserId: 'vxp-rev',
      });
      let review = await getReviewForThread(tx, 'vxp-rev', 'vxp-tt1');
      expect(review).toMatchObject({ id, state: 'requested', revision: 1 });

      await suggestEdit(tx, effects, 'vxp-rev', id, {
        bodyText: 'meilleure formulation',
        baseDigest: digest,
      });
      await setReviewDecision(tx, effects, 'vxp-rev', id, {
        decision: 'changes_requested',
        baseDigest: digest,
      });
      await setReviewDecision(tx, effects, 'vxp-rev', id, {
        decision: 'approved',
        baseDigest: digest,
      });
      review = await getReviewForThread(tx, 'vxp-owner', 'vxp-tt1');
      expect(review).toMatchObject({ state: 'approved', revision: 3 });
      expect(review!.suggestions).toHaveLength(1);
      // draftId ne traverse JAMAIS.
      expect('draftId' in review!).toBe(false);
    });
  });

  it('ACL : non-sharer, self-review, reviewer sans accès restricted, non-membre — tous refusés', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx, { restricted: true });
      const effects = effectsFor({ 'draft-1': DRAFT_V1 });
      await expect(
        requestReview(tx, effects, 'vxp-rev', {
          teamThreadId: 'vxp-tt1',
          draftId: 'draft-1',
          reviewerUserId: 'vxp-owner',
        }),
      ).rejects.toThrow('not_draft_owner');
      await expect(
        requestReview(tx, effects, 'vxp-owner', {
          teamThreadId: 'vxp-tt1',
          draftId: 'draft-1',
          reviewerUserId: 'vxp-owner',
        }),
      ).rejects.toThrow('not_reviewer');
      // 'vxp-other' est membre mais SANS accès au fil restricted.
      await expect(
        requestReview(tx, effects, 'vxp-owner', {
          teamThreadId: 'vxp-tt1',
          draftId: 'draft-1',
          reviewerUserId: 'vxp-other',
        }),
      ).rejects.toThrow('assignee_no_access');
      // Un non-membre ne voit même pas le fil.
      await expect(getReviewForThread(tx, 'vxp-out', 'vxp-tt1')).rejects.toThrow('not_found');
    });
  });

  it('révocation du reviewer : ses actions de review sont coupées (ACL relue à CHAQUE appel)', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx, { restricted: true });
      const effects = effectsFor({ 'draft-1': DRAFT_V1 });
      const digest = await computeDraftDigest(normalizeDraftSnapshot(DRAFT_V1));
      const { id } = await requestReview(tx, effects, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        draftId: 'draft-1',
        reviewerUserId: 'vxp-rev',
      });
      await tx.execute(
        `update mail0_team_thread_access set revoked_at = now(), revoked_by = 'vxp-owner' where id = 'vxp-acc1'`,
      );
      // Le refus exact (not_found vs forbidden) dépend du chemin resolveAccess ;
      // l'invariant testé est LE REFUS après révocation.
      await expect(
        suggestEdit(tx, effects, 'vxp-rev', id, { bodyText: 'x', baseDigest: digest }),
      ).rejects.toThrow(/not_found|forbidden/);
    });
  });

  it('digest STALE : le brouillon a changé → suggestion et décision refusées ; une review active par (fil, brouillon)', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const digestV1 = await computeDraftDigest(normalizeDraftSnapshot(DRAFT_V1));
      const effects = effectsFor({ 'draft-1': DRAFT_V2 }); // le brouillon RÉEL a bougé
      const requestEffects = effectsFor({ 'draft-1': DRAFT_V1 });
      const { id } = await requestReview(tx, requestEffects, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        draftId: 'draft-1',
        reviewerUserId: 'vxp-rev',
      });
      await expect(
        suggestEdit(tx, effects, 'vxp-rev', id, { bodyText: 'x', baseDigest: digestV1 }),
      ).rejects.toThrow('draft_stale');
      await expect(
        setReviewDecision(tx, effects, 'vxp-rev', id, {
          decision: 'approved',
          baseDigest: digestV1,
        }),
      ).rejects.toThrow('draft_stale');
      // Unicité ACTIVE : une deuxième demande sur le même brouillon est refusée…
      await expect(
        requestReview(tx, requestEffects, 'vxp-owner', {
          teamThreadId: 'vxp-tt1',
          draftId: 'draft-1',
          reviewerUserId: 'vxp-rev',
        }),
      ).rejects.toThrow('review_exists');
      // …mais possible après annulation (état terminal).
      await cancelReview(tx, 'vxp-owner', id);
      await expect(
        requestReview(tx, requestEffects, 'vxp-owner', {
          teamThreadId: 'vxp-tt1',
          draftId: 'draft-1',
          reviewerUserId: 'vxp-rev',
        }),
      ).resolves.toMatchObject({ id: expect.any(String) });
    });
  });

  it('claim atomique : double frappe idempotente, DEUX clés refusées, autre acteur refusé, re-claim après accepted', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const first = await claimTeamReply(tx, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        clientSubmissionKey: 'key-1',
      });
      expect(first.reused).toBe(false);
      // Retry réseau MÊME acteur MÊME clé : idempotent.
      const retry = await claimTeamReply(tx, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        clientSubmissionKey: 'key-1',
      });
      expect(retry).toEqual({ id: first.id, reused: true });
      // MÊME acteur AUTRE clé (double soumission distincte) : refusé.
      await expect(
        claimTeamReply(tx, 'vxp-owner', { teamThreadId: 'vxp-tt1', clientSubmissionKey: 'key-2' }),
      ).rejects.toThrow('reply_claimed');
      // AUTRE acteur : refusé.
      await expect(
        claimTeamReply(tx, 'vxp-rev', { teamThreadId: 'vxp-tt1', clientSubmissionKey: 'key-3' }),
      ).rejects.toThrow('reply_claimed');
      // Résolu 'accepted' → un NOUVEL envoi (override humain) re-claime.
      await resolveTeamReplyClaim(tx, first.id, 'accepted');
      await expect(
        claimTeamReply(tx, 'vxp-rev', { teamThreadId: 'vxp-tt1', clientSubmissionKey: 'key-4' }),
      ).resolves.toMatchObject({ reused: false });
      // findOwnReplyClaim : le claim accepté reste visible pour SA clé
      // (bypass idempotent côté mail.send) — jamais pour une autre clé ni
      // pour un claim relâché.
      await expect(findOwnReplyClaim(tx, 'vxp-owner', 'vxp-tt1', 'key-1')).resolves.toMatchObject({
        id: first.id,
        outcome: 'accepted',
      });
      await expect(findOwnReplyClaim(tx, 'vxp-owner', 'vxp-tt1', 'key-9')).resolves.toBeNull();
      const fresh = await findOwnReplyClaim(tx, 'vxp-rev', 'vxp-tt1', 'key-4');
      await resolveTeamReplyClaim(tx, fresh!.id, 'released');
      await expect(findOwnReplyClaim(tx, 'vxp-rev', 'vxp-tt1', 'key-4')).resolves.toBeNull();
    });
  });

  it('preflight : claim ACCEPTÉ d’un coéquipier depuis la baseline → collision honnêtement nommée', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // Baseline calée sur l'horloge PG : la base locale jetable n'est pas
      // forcément en UTC (en prod, Hyperdrive/PG sont en UTC — les colonnes
      // `timestamp` sans tz et les paramètres Date y sont cohérents).
      const baseline = (await pgNowMs(tx)) - 60_000;
      const claim = await claimTeamReply(tx, 'vxp-rev', {
        teamThreadId: 'vxp-tt1',
        clientSubmissionKey: 'key-r',
      });
      await resolveTeamReplyClaim(tx, claim.id, 'accepted');
      const { reasons } = await sendCollisionPreflight(tx, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        baselineMs: baseline,
        threadMessages: [
          // Réponse ENTRANTE d'un membre après la baseline.
          { senderEmail: 'vxp-rev@example.test', receivedOnMs: baseline + 5_000 },
        ],
        myEmails: ['vxp-owner@example.test'],
      });
      const types = reasons.map((reason) => reason.type).sort();
      expect(types).toEqual(['inbound_member_reply', 'reta_reply_accepted']);
      // Jamais un type « sent » mensonger.
      expect(types).not.toContain('reta_reply_sent');
      expect(types).not.toContain('reta_reply_enqueued');
    });
  });

  it('reply intent : baseline SERVEUR ; user/fil/provider mismatch et expiration → reply_intent_invalid', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // Un non-membre ne peut même pas créer l'intent (refus ACL exact selon
      // le chemin : not_a_member ici — l'invariant testé est LE REFUS).
      await expect(createReplyIntent(tx, 'vxp-out', 'vxp-tt1')).rejects.toThrow(
        /not_found|not_a_member|forbidden/,
      );
      const before = Date.now();
      const intent = await createReplyIntent(tx, 'vxp-rev', 'vxp-tt1');
      const after = Date.now();
      // Baseline émise par le SERVEUR à la création — aucun champ client.
      const valid = await getValidReplyIntent(tx, 'vxp-rev', {
        intentId: intent.id,
        teamThreadId: 'vxp-tt1',
        providerThreadId: 'vxp-th1',
      });
      expect(valid.baselineAtMs).toBeGreaterThanOrEqual(before - 1_000);
      expect(valid.baselineAtMs).toBeLessThanOrEqual(after + 1_000);
      // Mauvais propriétaire.
      await expect(
        getValidReplyIntent(tx, 'vxp-owner', {
          intentId: intent.id,
          teamThreadId: 'vxp-tt1',
          providerThreadId: 'vxp-th1',
        }),
      ).rejects.toThrow('reply_intent_invalid');
      // Mauvais fil d'équipe.
      await expect(
        getValidReplyIntent(tx, 'vxp-rev', {
          intentId: intent.id,
          teamThreadId: 'vxp-tt-autre',
          providerThreadId: 'vxp-th1',
        }),
      ).rejects.toThrow('reply_intent_invalid');
      // Mauvais fil provider.
      await expect(
        getValidReplyIntent(tx, 'vxp-rev', {
          intentId: intent.id,
          teamThreadId: 'vxp-tt1',
          providerThreadId: 'vxp-th-autre',
        }),
      ).rejects.toThrow('reply_intent_invalid');
      // Intent inexistant.
      await expect(
        getValidReplyIntent(tx, 'vxp-rev', {
          intentId: crypto.randomUUID(),
          teamThreadId: 'vxp-tt1',
          providerThreadId: 'vxp-th1',
        }),
      ).rejects.toThrow('reply_intent_invalid');
      // Expiré.
      await tx.execute(
        `update mail0_team_reply_intent set expires_at = now() - interval '1 minute' where id = '${intent.id}'`,
      );
      await expect(
        getValidReplyIntent(tx, 'vxp-rev', {
          intentId: intent.id,
          teamThreadId: 'vxp-tt1',
          providerThreadId: 'vxp-th1',
        }),
      ).rejects.toThrow('reply_intent_invalid');
    });
  });

  it('override ONE-SHOT armé serveur : refusé sans collision préalable, consommé une seule fois', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      const intent = await createReplyIntent(tx, 'vxp-rev', 'vxp-tt1');
      // Aucune collision serveur détectée : l'override est REFUSÉ — un client
      // qui envoie overrideCollision=true d'emblée ne contourne rien.
      await expect(consumeIntentOverride(tx, intent.id)).rejects.toThrow('override_not_armed');
      // Une collision serveur ARME l'override…
      await markIntentCollision(tx, intent.id);
      await expect(consumeIntentOverride(tx, intent.id)).resolves.toBeUndefined();
      // …UNE seule fois : la deuxième consommation est refusée.
      await expect(consumeIntentOverride(tx, intent.id)).rejects.toThrow('override_not_armed');
      // Même une nouvelle collision ne ré-arme pas un intent déjà consommé.
      await markIntentCollision(tx, intent.id);
      await expect(consumeIntentOverride(tx, intent.id)).rejects.toThrow('override_not_armed');
    });
  });

  it('claim + reviewId : cross-thread → not_found, non-partie → forbidden, AUCUN claim créé', async (ctx) => {
    if (!available) return ctx.skip();
    await inRollback(async (tx) => {
      await seed(tx);
      // Deuxième fil partagé dans la même équipe.
      await tx.execute(
        `insert into mail0_team_thread (id,team_id,thread_id,sharer_user_id,sharer_connection_id,sharer_email,provider_id,subject,visibility)
         values ('vxp-tt2','vxp-t1','vxp-th2','vxp-owner','vxp-connA','vxp-owner@example.test','google','Sujet 2','team')`,
      );
      const effects = effectsFor({ 'draft-1': DRAFT_V1 });
      const { id: reviewId } = await requestReview(tx, effects, 'vxp-owner', {
        teamThreadId: 'vxp-tt1',
        draftId: 'draft-1',
        reviewerUserId: 'vxp-rev',
      });
      // La review appartient à tt1 : la brandir sur tt2 est refusé AVANT claim.
      await expect(
        claimTeamReply(tx, 'vxp-owner', {
          teamThreadId: 'vxp-tt2',
          clientSubmissionKey: 'key-x',
          reviewId,
        }),
      ).rejects.toThrow('not_found');
      // Membre avec accès au fil mais NI owner NI reviewer de la review.
      await expect(
        claimTeamReply(tx, 'vxp-other', {
          teamThreadId: 'vxp-tt1',
          clientSubmissionKey: 'key-y',
          reviewId,
        }),
      ).rejects.toThrow('forbidden');
      // Aucun refus n'a laissé de claim ni de job derrière lui.
      const rows = (await tx.execute(
        `select count(*)::int as n from mail0_team_reply_claim`,
      )) as unknown as Array<{ n: number }>;
      expect(Number(rows[0]!.n)).toBe(0);
      // Une partie légitime (le reviewer) claime normalement avec la review.
      await expect(
        claimTeamReply(tx, 'vxp-rev', {
          teamThreadId: 'vxp-tt1',
          clientSubmissionKey: 'key-z',
          reviewId,
        }),
      ).resolves.toMatchObject({ reused: false });
    });
  });
});
