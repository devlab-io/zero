// lib/scheduled-send.ts — cycle de vie d'un envoi différé (undo-send, planification).
//
// Trois écritures KV portent un mail que l'utilisateur croit parti :
//   - `pending_emails_status`  : l'état (pending / sending / sent / cancelled / failed) ;
//   - `pending_emails_payload` : le CORPS du message ;
//   - `scheduled_emails`       : la planification long terme relue par le cron.
//
// Deux défauts établis vivaient dans l'écart entre ces trois clés et le consommateur
// `send-email-queue` de main.ts :
//
//  1. TTL désalignés. Le corps était écrit avec `expirationTtl: 60*60*24` alors que la
//     planification pouvait courir jusqu'à un an. Tout mail programmé à plus de ~24 h
//     perdait son contenu AVANT son échéance : le cron remettait en file
//     `{messageId, connectionId, sendAt}` — jamais le corps — et le consommateur ne
//     trouvait plus rien à envoyer. `scheduleTtlSeconds` donne désormais UNE durée de vie
//     à l'état, au corps et à la planification : celle de l'échéance + une marge.
//
//  2. Double envoi. Le consommateur envoyait puis supprimait les clés KV ; toute panne
//     APRÈS l'appel Gmail (suppression KV en échec, isolate tué) tombait dans le `catch`,
//     déclenchait `msg.retry()` et repartait pour un second envoi. L'API Gmail n'offre
//     aucune clé d'idempotence — `messages.send` avec un Message-ID identique produit
//     bel et bien deux mails —, donc la seule barrière possible est une RÉSERVATION
//     écrite avant l'appel : `sending`. Elle est testée en tête de handler comme
//     `cancelled` l'était déjà. Arbitrage assumé : pour un mail sortant, une issue
//     AMBIGUË (on ne sait pas si Gmail a accepté) ne se résout pas en renvoyant. Un
//     échec FRANC (l'appel a levé) repasse en `failed`, garde le corps, et rejoue.
//
// Fonctions pures + dépendances injectées : testable sans réseau, sans KV, sans isolate.

import { toAttachmentFiles, type AttachmentFile, type SerializedAttachment } from './attachments';
import type { IOutgoingMessage } from '../types';

/** Plafond d'`expirationTtl` accepté par KV (un an). */
export const MAX_KV_TTL_SECONDS = 31_556_952;
/** Plancher d'`expirationTtl` accepté par KV : en dessous, l'écriture est rejetée. */
export const MIN_KV_TTL_SECONDS = 60;
/** Marge après l'échéance : cron et queue peuvent livrer en retard. */
export const SEND_TTL_GRACE_SECONDS = 3600;
/** Au-delà, une queue Cloudflare ne peut plus porter le délai : planification long terme. */
export const MAX_QUEUE_DELAY_SECONDS = 43_200;
/** Durée de vie des marques terminales (`sent`, `failed`) : absorbe les redélivrances. */
export const TERMINAL_MARKER_TTL_SECONDS = 60 * 60 * 24;

export type ScheduledSendStatus = 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed';

/**
 * Un statut qui interdit d'envoyer (à nouveau). `cancelled` : l'utilisateur a repris la
 * main. `sending` : une tentative précédente a atteint le driver et son issue est inconnue.
 * `sent` : c'est parti. Les trois sortent du handler sans effet de bord.
 */
const NON_SENDABLE_STATUSES: ReadonlySet<string> = new Set<ScheduledSendStatus>([
  'cancelled',
  'sending',
  'sent',
]);

export function isNonSendableStatus(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && NON_SENDABLE_STATUSES.has(status);
}

/**
 * Durée de vie KV couvrant une échéance à `delaySeconds`, marge comprise, bornée par les
 * limites du service. Appliquée À L'IDENTIQUE à l'état, au corps et à la planification :
 * c'est l'alignement qui garantit que le corps est encore là quand l'échéance tombe.
 */
export function scheduleTtlSeconds(delaySeconds: number): number {
  const raw = Number.isFinite(delaySeconds) ? Math.ceil(delaySeconds) : 0;
  const withGrace = Math.max(0, raw) + SEND_TTL_GRACE_SECONDS;
  return Math.min(Math.max(withGrace, MIN_KV_TTL_SECONDS), MAX_KV_TTL_SECONDS);
}

/**
 * Durée de vie de la marque `cancelled`. Elle DOIT survivre à l'échéance : une marque
 * d'annulation expirée avant l'envoi laissait partir un mail que l'utilisateur avait
 * annulé. Quand la planification est connue on part de son échéance ; sinon on couvre le
 * délai de file maximal (12 h), seul horizon possible pour un envoi non long terme.
 */
export function cancelTtlSeconds(sendAt: number | undefined, now: number): number {
  if (typeof sendAt === 'number' && Number.isFinite(sendAt)) {
    return scheduleTtlSeconds((sendAt - now) / 1000);
  }
  return scheduleTtlSeconds(MAX_QUEUE_DELAY_SECONDS);
}

/** Sous-ensemble de `KVNamespace` réellement utilisé ici (injectable en test). */
export interface ScheduledSendStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export type StoredOutgoingMessage = Omit<IOutgoingMessage, 'attachments'> & {
  attachments?: (SerializedAttachment | AttachmentFile)[];
  draftId?: string;
};

/**
 * Rehydrate les pièces jointes sérialisées en KV (base64) en fichiers exploitables par le
 * driver, en préservant l'ordre. Une pièce déjà rehydratée (chemin « mail porté par le
 * message de queue ») est laissée telle quelle.
 */
export function normalizeStoredAttachments(payload: StoredOutgoingMessage): StoredOutgoingMessage {
  if (!Array.isArray(payload.attachments)) return payload;
  const source = payload.attachments;
  const ordered = source.map((att) =>
    'arrayBuffer' in att && typeof att.arrayBuffer === 'function'
      ? (att as AttachmentFile)
      : toAttachmentFiles([att as SerializedAttachment])[0],
  );
  return { ...payload, attachments: ordered };
}

export interface DeliverScheduledEmailInput {
  messageId: string;
  connectionId: string;
  /** Corps porté par le message de queue (chemin court) ; absent sur le chemin cron. */
  mail?: StoredOutgoingMessage;
}

export interface DeliverScheduledEmailDeps {
  statusKV: ScheduledSendStore;
  payloadKV: ScheduledSendStore;
  /** Effectue l'envoi réel (driver Gmail via le stub de l'agent). */
  send: (connectionId: string, payload: StoredOutgoingMessage) => Promise<void>;
  /** Redemande une livraison de ce message par la queue. */
  retry?: () => void;
  logger: {
    info: (message: unknown, ...rest: unknown[]) => void;
    error: (message: unknown, ...rest: unknown[]) => void;
  };
}

export type DeliverScheduledEmailOutcome =
  | { outcome: 'skipped'; status: string }
  | { outcome: 'sent' }
  | { outcome: 'missing-payload' }
  | { outcome: 'failed'; error: unknown };

/**
 * Livre un message de `send-email-queue`, exactement une fois au plus.
 *
 * Ordre imposé — chaque étape ferme une fenêtre de perte ou de duplication :
 *   1. lire l'état ; `cancelled` / `sending` / `sent` sortent sans effet de bord ;
 *   2. résoudre le corps ; son absence est un ÉCHEC EXPLICITE (`failed` + rejeu), plus un
 *      `return` muet qui acquittait la file après avoir répondu `{success: true}` au client ;
 *   3. RÉSERVER (`sending`) avant l'appel au driver, donc avant toute possibilité de rejeu ;
 *   4. envoyer ;
 *   5. marquer `sent` (au lieu de supprimer la clé : une clé absente redevenait envoyable)
 *      et libérer le corps.
 */
export async function deliverScheduledEmail(
  input: DeliverScheduledEmailInput,
  deps: DeliverScheduledEmailDeps,
): Promise<DeliverScheduledEmailOutcome> {
  const { messageId, connectionId } = input;
  const { statusKV, payloadKV, logger } = deps;

  const status = await statusKV.get(messageId);
  if (isNonSendableStatus(status)) {
    logger.info(`Email ${messageId} in status "${status}" – skipping send.`);
    return { outcome: 'skipped', status: status as string };
  }

  let payload = input.mail;
  if (!payload) {
    const stored = await payloadKV.get(messageId);
    if (!stored) {
      // Le client a reçu `{success: true, scheduled: true}`. Acquitter en silence ici
      // effaçait le mail sans laisser la moindre trace lisible.
      logger.error(`No payload found for scheduled email ${messageId}`);
      await statusKV.put(messageId, 'failed', { expirationTtl: TERMINAL_MARKER_TTL_SECONDS });
      deps.retry?.();
      return { outcome: 'missing-payload' };
    }
    payload = JSON.parse(stored) as StoredOutgoingMessage;
  }

  // Réservation AVANT l'appel réseau : si l'isolate meurt entre ici et la ligne d'envoi,
  // la redélivrance lit `sending` et n'envoie pas une seconde fois.
  await statusKV.put(messageId, 'sending', { expirationTtl: TERMINAL_MARKER_TTL_SECONDS });

  try {
    await deps.send(connectionId, normalizeStoredAttachments(payload));
  } catch (error) {
    // Échec FRANC : le driver a levé, rien n'est parti. On rend le message rejouable et on
    // garde le corps — le détruire ici perdait le mail de l'utilisateur.
    logger.error(`Failed to send scheduled email ${messageId}:`, error);
    await statusKV.put(messageId, 'failed', { expirationTtl: TERMINAL_MARKER_TTL_SECONDS });
    deps.retry?.();
    return { outcome: 'failed', error };
  }

  await statusKV.put(messageId, 'sent', { expirationTtl: TERMINAL_MARKER_TTL_SECONDS });
  await payloadKV.delete(messageId);
  logger.info(`Email ${messageId} sent successfully`);
  return { outcome: 'sent' };
}
