/**
 * Webhook Linear ENTRANT (P18 durci) — route Hono montée AVANT tout parsing :
 * 1) octets BRUTS ; 2) HMAC-SHA256 timing-safe (Linear-Signature) — secret
 *    absent → 503 FAIL CLOSED ; 3) corps authentifié parsé + horodatage corps
 *    ±60 s ET en-tête Linear-Timestamp présent/cohérent ; 4) Linear-Delivery
 *    UUID STRICT ; 5) claim + traitement + processed dans UNE TRANSACTION :
 *    un échec ANNULE le claim (Linear retente), le replay ne répond 200 que
 *    si la ligne est réellement processed — aucun événement perdu.
 * Réponses laconiques — aucun détail exploitable.
 */
import {
  claimWebhookDelivery,
  isWebhookDeliveryProcessed,
  markWebhookDeliveryProcessed,
  processLinearEvent,
} from '../lib/teams/team-integrations-store';
import { verifyLinearWebhook } from '../lib/integrations/linear-webhook';
import type { HonoContext } from '../ctx';
import { createDb, type DB } from '../db';
import { logger } from '../lib/logger';
import { env } from '../env';
import { Hono } from 'hono';

const DELIVERY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADER_BODY_SKEW_MS = 60_000;

export const integrationsLinearRouter = new Hono<HonoContext>().post(
  '/linear/webhook',
  async (c) => {
    const secret = env.LINEAR_WEBHOOK_SECRET;
    if (!secret) {
      // Secret non configuré : on REFUSE tout — jamais un traitement non signé.
      return c.json({ error: 'unavailable' }, 503);
    }
    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    const verification = await verifyLinearWebhook({
      rawBody,
      signatureHeader: c.req.header('linear-signature'),
      secret,
      nowMs: Date.now(),
    });
    if (!verification.ok) {
      const status = verification.reason === 'bad_signature' ? 401 : 400;
      return c.json({ error: verification.reason }, status);
    }
    // En-tête Linear-Timestamp : présent, numérique (ms), cohérent avec le
    // webhookTimestamp du corps authentifié.
    const headerTimestamp = Number(c.req.header('linear-timestamp'));
    const bodyTimestamp = Number(verification.payload['webhookTimestamp']);
    if (
      !Number.isFinite(headerTimestamp) ||
      Math.abs(headerTimestamp - bodyTimestamp) > HEADER_BODY_SKEW_MS
    ) {
      return c.json({ error: 'bad_timestamp_header' }, 400);
    }
    const deliveryId = (c.req.header('linear-delivery') ?? '').trim();
    if (!DELIVERY_UUID.test(deliveryId)) return c.json({ error: 'bad_delivery_id' }, 400);

    const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
    try {
      const eventType = String(verification.payload['type'] ?? '');
      // UNE transaction : claim + mutations + processed. Un échec ANNULE tout
      // (claim compris) — le retry Linear retraitera réellement.
      const result = await db.transaction(async (tx) => {
        const claimed = await claimWebhookDelivery(tx as unknown as DB, deliveryId, eventType);
        if (!claimed) return { replay: true as const };
        const outcome = await processLinearEvent(tx as unknown as DB, verification.payload);
        await markWebhookDeliveryProcessed(tx as unknown as DB, deliveryId, outcome);
        return { replay: false as const, outcome };
      });
      if (result.replay) {
        // Rejeu : 200 idempotent UNIQUEMENT si la livraison a été traitée ;
        // sinon (traitement concurrent en cours) → 409, Linear retentera.
        const processed = await isWebhookDeliveryProcessed(db, deliveryId);
        if (processed) return c.json({ ok: true, replay: true }, 200);
        return c.json({ error: 'in_flight' }, 409);
      }
      return c.json({ ok: true }, 200);
    } catch (error) {
      logger.error('linear webhook processing failed', { deliveryId, error });
      // Rollback complet : le claim n'existe plus, Linear retentera.
      return c.json({ error: 'processing_failed' }, 500);
    } finally {
      c.executionCtx.waitUntil(conn.end({ timeout: 2 }).catch(() => {}));
    }
  },
);
