/**
 * Outbox des webhooks SORTANTS Reta (P18) — module bas niveau sans dépendance
 * aux stores (les deux stores l'importent, jamais l'inverse). L'enqueue est
 * transactionnel avec la mutation qui le déclenche ; la livraison (signée,
 * SSRF-gardée) est faite hors requête par `deliverDueOutbound`. Payload =
 * MÉTADONNÉES SEULES (ids, statut, horodatage) — jamais de corps email/PJ.
 */
import {
  OUTBOUND_BACKOFF_BASE_MS,
  OUTBOUND_DISABLE_THRESHOLD,
  OUTBOUND_MAX_ATTEMPTS,
  OUTBOUND_SENDING_LEASE_MS,
  type OutboundEventType,
  type SealedSecret,
} from './team-integrations-shared';
import { teamOutboundDelivery, teamOutboundWebhook } from '../../db/schema';
import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import type { DB } from '../../db';

type DbOrTx = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

export async function enqueueOutboundEvent(
  db: DbOrTx,
  input: { teamId: string; eventType: OutboundEventType; payload: Record<string, unknown> },
): Promise<{ enqueued: number }> {
  const hooks = await db
    .select({ id: teamOutboundWebhook.id, events: teamOutboundWebhook.events })
    .from(teamOutboundWebhook)
    .where(and(eq(teamOutboundWebhook.teamId, input.teamId), eq(teamOutboundWebhook.active, true)));
  const matching = hooks.filter((hook) => (hook.events ?? []).includes(input.eventType));
  if (matching.length === 0) return { enqueued: 0 };
  await db.insert(teamOutboundDelivery).values(
    matching.map((hook) => ({
      id: crypto.randomUUID(),
      webhookId: hook.id,
      eventType: input.eventType,
      payload: input.payload,
    })),
  );
  return { enqueued: matching.length };
}

export type OutboundDeliverEffect = (input: {
  url: string;
  secretEnvelope: SealedSecret | null;
  webhookId: string;
  teamId: string;
  deliveryId: string;
  eventType: string;
  body: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * REAPER des baux périmés : une livraison restée 'sending' au-delà du bail
 * (crash worker) redevient 'pending' — ou 'dead' si les tentatives sont
 * épuisées. L'attempt du crash a déjà été compté au claim.
 */
export async function reapStaleOutboundLeases(db: DB, nowMs: number): Promise<number> {
  const stale = await db
    .update(teamOutboundDelivery)
    .set({ status: 'pending', claimedAt: null })
    .where(
      and(
        eq(teamOutboundDelivery.status, 'sending'),
        lt(teamOutboundDelivery.claimedAt, new Date(nowMs - OUTBOUND_SENDING_LEASE_MS)),
        lt(teamOutboundDelivery.attempts, OUTBOUND_MAX_ATTEMPTS),
      ),
    )
    .returning({ id: teamOutboundDelivery.id });
  const dead = await db
    .update(teamOutboundDelivery)
    .set({ status: 'dead', lastError: 'lease_expired', claimedAt: null })
    .where(
      and(
        eq(teamOutboundDelivery.status, 'sending'),
        lt(teamOutboundDelivery.claimedAt, new Date(nowMs - OUTBOUND_SENDING_LEASE_MS)),
        gte(teamOutboundDelivery.attempts, OUTBOUND_MAX_ATTEMPTS),
      ),
    )
    .returning({ id: teamOutboundDelivery.id });
  return stale.length + dead.length;
}

/**
 * Livre les livraisons DUES avec claim CAS par ligne (pending → sending +
 * bail + attempts++) : deux crons concurrents ne livrent JAMAIS la même
 * livraison en parallèle. Les updates de COMPLÉTION sont eux aussi FENCÉS
 * (status='sending' + claimedAt exact) : un worker zombie qui termine après
 * l'expiration de son bail n'écrase jamais l'état repris par le reaper ou un
 * autre worker. Retry borné avec backoff puis 'dead' ; un webhook qui échoue
 * OUTBOUND_DISABLE_THRESHOLD fois d'affilée est auto-désactivé.
 *
 * CONTRAT : livraison AT-LEAST-ONCE — jamais exactly-once (un crash entre
 * l'envoi réseau et le marquage 'delivered' produit une re-livraison après
 * bail). Le deliveryId signé (X-Reta-Delivery) est STABLE à travers les
 * tentatives : le récepteur DOIT dédupliquer dessus. Le timeout d'envoi
 * (10 s côté runner) est très inférieur au bail OUTBOUND_SENDING_LEASE_MS
 * (5 min) — une tentative ne peut pas survivre à son propre bail.
 */
export async function deliverDueOutbound(
  db: DB,
  deliver: OutboundDeliverEffect,
  nowMs: number,
  limit = 20,
): Promise<{ delivered: number; failed: number; dead: number; skipped: number }> {
  await reapStaleOutboundLeases(db, nowMs);
  const due = await db
    .select({
      id: teamOutboundDelivery.id,
      webhookId: teamOutboundDelivery.webhookId,
      eventType: teamOutboundDelivery.eventType,
      payload: teamOutboundDelivery.payload,
      url: teamOutboundWebhook.url,
      secretEnvelope: teamOutboundWebhook.secretEnvelope,
      teamId: teamOutboundWebhook.teamId,
      active: teamOutboundWebhook.active,
    })
    .from(teamOutboundDelivery)
    .innerJoin(teamOutboundWebhook, eq(teamOutboundWebhook.id, teamOutboundDelivery.webhookId))
    .where(
      and(
        eq(teamOutboundDelivery.status, 'pending'),
        lte(teamOutboundDelivery.nextAttemptAt, new Date(nowMs)),
      ),
    )
    .orderBy(asc(teamOutboundDelivery.nextAttemptAt))
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  let dead = 0;
  let skipped = 0;
  for (const row of due) {
    if (!row.active) {
      // Abonnement désactivé entre-temps : la livraison meurt proprement.
      await db
        .update(teamOutboundDelivery)
        .set({ status: 'dead', lastError: 'webhook_disabled' })
        .where(
          and(eq(teamOutboundDelivery.id, row.id), eq(teamOutboundDelivery.status, 'pending')),
        );
      dead += 1;
      continue;
    }
    // CLAIM CAS : seul le worker qui gagne cette ligne livre. L'attempt est
    // compté AU CLAIM — un crash pendant l'envoi compte comme tentative.
    const claimedRows = await db
      .update(teamOutboundDelivery)
      .set({
        status: 'sending',
        claimedAt: new Date(nowMs),
        attempts: sql`${teamOutboundDelivery.attempts} + 1`,
      })
      .where(and(eq(teamOutboundDelivery.id, row.id), eq(teamOutboundDelivery.status, 'pending')))
      .returning({ attempts: teamOutboundDelivery.attempts });
    const claimed = claimedRows[0];
    if (!claimed) {
      skipped += 1;
      continue;
    }
    const body = JSON.stringify({
      event: row.eventType,
      deliveryId: row.id,
      payload: row.payload,
    });
    const result = await deliver({
      url: row.url,
      secretEnvelope: row.secretEnvelope ?? null,
      webhookId: row.webhookId,
      teamId: row.teamId,
      deliveryId: row.id,
      eventType: row.eventType,
      body,
    });
    // FENCE de complétion : uniquement si la ligne est ENCORE la nôtre
    // (sending + claimedAt exact) — un zombie post-bail n'écrase rien.
    const completionFence = and(
      eq(teamOutboundDelivery.id, row.id),
      eq(teamOutboundDelivery.status, 'sending'),
      eq(teamOutboundDelivery.claimedAt, new Date(nowMs)),
    );
    if (result.ok) {
      const marked = await db
        .update(teamOutboundDelivery)
        .set({
          status: 'delivered',
          deliveredAt: new Date(nowMs),
          claimedAt: null,
          lastError: null,
        })
        .where(completionFence)
        .returning({ id: teamOutboundDelivery.id });
      if (!marked[0]) {
        // Bail repris entre-temps : l'état actuel fait foi (at-least-once).
        skipped += 1;
        continue;
      }
      await db
        .update(teamOutboundWebhook)
        .set({ consecutiveFailures: 0 })
        .where(eq(teamOutboundWebhook.id, row.webhookId));
      delivered += 1;
      continue;
    }
    const exhausted = claimed.attempts >= OUTBOUND_MAX_ATTEMPTS;
    const failMarked = await db
      .update(teamOutboundDelivery)
      .set({
        status: exhausted ? 'dead' : 'pending',
        claimedAt: null,
        lastError: result.error,
        nextAttemptAt: new Date(nowMs + OUTBOUND_BACKOFF_BASE_MS * 2 ** (claimed.attempts - 1)),
      })
      .where(completionFence)
      .returning({ id: teamOutboundDelivery.id });
    if (!failMarked[0]) {
      skipped += 1;
      continue;
    }
    const bumped = await db
      .update(teamOutboundWebhook)
      .set({ consecutiveFailures: sql`${teamOutboundWebhook.consecutiveFailures} + 1` })
      .where(eq(teamOutboundWebhook.id, row.webhookId))
      .returning({ consecutiveFailures: teamOutboundWebhook.consecutiveFailures });
    // Auto-désactivation après un seuil raisonnable — visible, réactivable
    // par l'owner (qui remet le compteur à zéro).
    if ((bumped[0]?.consecutiveFailures ?? 0) >= OUTBOUND_DISABLE_THRESHOLD) {
      await db
        .update(teamOutboundWebhook)
        .set({ active: false, disabledAt: new Date(nowMs) })
        .where(eq(teamOutboundWebhook.id, row.webhookId));
    }
    if (exhausted) dead += 1;
    else failed += 1;
  }
  return { delivered, failed, dead, skipped };
}
