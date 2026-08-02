/**
 * Runner PROD de l'outbox sortante (P18 hardening) — appelé par le handler
 * `scheduled` de main.ts. Ouvre Hyperdrive, moissonne les baux périmés,
 * claim CAS puis livre : le secret est descellé au DERNIER moment et meurt
 * dans la fermeture ; DoH + garde SSRF complète À CHAQUE tentative ;
 * signature HMAC timestamp+delivery ; redirections refusées. Aucune
 * exception ne remonte au cron (log + fin propre).
 */
import { deliverSigned, dohResolver } from '../integrations/outbound-security';
import { openIntegrationSecret } from '../integrations/vault';
import { deliverDueOutbound } from './team-outbound';
import type { ZeroEnv } from '../../env';
import { createDb } from '../../db';
import { logger } from '../logger';

export async function runOutboundDeliverySweep(env: ZeroEnv): Promise<void> {
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  const kekRing = {
    RETA_BYOK_KEK_V1: env.RETA_BYOK_KEK_V1,
    RETA_BYOK_KEK_V2: env.RETA_BYOK_KEK_V2,
    RETA_BYOK_KEK_ACTIVE: env.RETA_BYOK_KEK_ACTIVE,
  };
  const resolveIps = dohResolver(fetch);
  try {
    const summary = await deliverDueOutbound(
      db,
      async ({ url, secretEnvelope, webhookId, teamId, deliveryId, eventType, body }) => {
        if (!secretEnvelope) return { ok: false, error: 'secret_missing' };
        let secret: string;
        try {
          secret = await openIntegrationSecret(
            kekRing,
            { teamId, purpose: 'outbound:secret', recordId: webhookId },
            secretEnvelope,
          );
        } catch {
          return { ok: false, error: 'vault_unavailable' };
        }
        try {
          return await deliverSigned({
            fetchImpl: fetch,
            resolveIps,
            url,
            secret,
            deliveryId,
            eventType,
            body,
            nowMs: Date.now(),
            // 10 s ≪ bail 'sending' de 5 min : une tentative ne peut pas
            // survivre à son propre bail (fence de complétion garantie).
            timeoutMs: 10_000,
          });
        } finally {
          // Le secret en clair ne survit pas à la tentative.
          secret = '';
        }
      },
      Date.now(),
    );
    if (summary.delivered + summary.failed + summary.dead > 0) {
      logger.info('outbound webhook sweep', summary);
    }
  } catch (error) {
    logger.error('outbound webhook sweep failed', error);
  } finally {
    await conn.end({ timeout: 2 }).catch(() => {});
  }
}
