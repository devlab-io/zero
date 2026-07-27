// lib/scheduled-send.ts — cycle de vie d'un envoi différé (undo-send, planification).
//
// Trois écritures KV portent un mail que l'utilisateur croit parti :
//   - `pending_emails_status`  : l'état LISIBLE (pending / sending / sent / cancelled /
//                                failed / unresolved), lu par `mail.scheduledSendStatus` ;
//   - `pending_emails_payload` : le CORPS du message ;
//   - `scheduled_emails`       : la planification long terme relue par le cron.
//
// TTL désalignés (défaut fermé antérieurement). Le corps était écrit avec
// `expirationTtl: 60*60*24` alors que la planification pouvait courir jusqu'à un an : tout
// mail programmé à plus de ~24 h perdait son contenu AVANT son échéance. `scheduleTtlSeconds`
// donne UNE durée de vie à l'état, au corps et à la planification.
//
// EXCLUSION MUTUELLE — le défaut central, réfuté puis refait. La version précédente
// « réservait » l'envoi en écrivant `sending` dans KV après y avoir lu l'état. KV est
// éventuellement cohérent et n'offre AUCUN compare-and-set : deux livraisons concurrentes
// du même messageId lisaient toutes deux `pending` et envoyaient toutes deux le mail. Ce
// dépôt documente lui-même cette impossibilité (lib/history-lock.ts, en-tête). La
// réservation vit désormais dans le stockage SQL transactionnel du Durable Object
// ShardRegistry — voir lib/send-reservation.ts et routes/agent/shard-registry.ts. Les
// écritures KV d'état ne sont plus qu'une SURFACE DE LECTURE : elles ne gardent rien.
//
// REJEU — le second défaut, qui contredisait le premier. Le `catch` remettait `failed` et
// rejouait sur TOUTE erreur, sous le commentaire « un échec FRANC (l'appel a levé) — rien
// n'est parti ». C'est faux : une socket coupée ou un timeout après émission ne dit rien de
// ce que Gmail a fait de la requête, et `lib/driver/gmail-backoff.ts` classe précisément ces
// cas comme transitoires. Le mail repartait donc une seconde fois. Ne sont désormais rejouées
// que les erreurs qui PROUVENT la non-acceptation et sont transitoires (`classifySendFailure`).
//
// RÉCONCILIATION GMAIL — évaluée et ÉCARTÉE. On pourrait, sur issue ambiguë, chercher le
// message dans SENT avant de décider, et rejouer seulement s'il n'y est pas. Trois
// obstacles la rendent aujourd'hui plus dangereuse que le blocage :
//   1. il n'y a aucune clé de corrélation. `agent.stub.create` ne pose pas de `Message-ID`
//      côté client : c'est Gmail qui le génère. On ne peut donc pas interroger
//      `users.messages.list?q=rfc822msgid:…`, la seule recherche EXACTE de l'API ;
//   2. la recherche par destinataire + objet + fenêtre est heuristique. Deux envois
//      légitimement identiques (relance, envoi à soi-même) sont indiscernables ;
//   3. surtout, l'index de recherche Gmail est ASYNCHRONE et n'offre aucune garantie de
//      lecture-après-écriture. Un message accepté il y a deux secondes peut ne pas
//      apparaître. Un faux négatif ici, c'est exactement le double envoi qu'on ferme.
// Elle redeviendra sûre le jour où le driver émettra un `Message-ID` déterministe dérivé
// du `messageId` de la planification : la recherche exacte devient alors possible, et
// Gmail conserve un Message-ID fourni dans le MIME brut. C'est la condition à remplir
// avant de rouvrir ce chemin.
//
// PERTE SILENCIEUSE. Une écriture KV en échec sur le chemin de sortie faisait sortir
// l'exception de la fonction, l'état restait `sending`, et toute redélivrance répondait
// `skipped` : le mail disparaissait sans trace lisible. Toutes les écritures postérieures à
// l'appel au driver sont désormais gardées, et l'issue authentique est inscrite dans la
// réservation (SQL, transactionnelle) AVANT la surface KV.
//
// Fonctions pures + dépendances injectées : testable sans réseau, sans KV, sans isolate.

import {
  classifySendFailure,
  describeSendFailure,
  ScheduledSendPayloadError,
  settledOutcomeFor,
  shouldRetryAfter,
  toScheduledSendAttempt,
  type ScheduledSendAttemptRpcResult,
  type SendReservationRpcResult,
  type SettledSendOutcome,
} from './send-reservation';
import { toAttachmentFiles, type AttachmentFile, type SerializedAttachment } from './attachments';
import type { MailManager } from './driver/types';
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

/**
 * Échéance maximale acceptée pour un envoi programmé. Au-delà, `scheduleTtlSeconds`
 * plafonne à `MAX_KV_TTL_SECONDS` et le CORPS expire avant l'échéance : le cron remet en
 * file `{messageId, connectionId, sendAt}` — jamais le corps — et le mail disparaît sans
 * que personne ne l'apprenne. La borne retire la marge du plafond KV, faute de quoi le cas
 * limite « exactement un an » retombe dans le même trou.
 */
export const MAX_SCHEDULE_AHEAD_SECONDS = MAX_KV_TTL_SECONDS - SEND_TTL_GRACE_SECONDS;

export type ScheduledSendStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed'
  | 'unresolved';

/**
 * Un statut qui interdit d'envoyer (à nouveau). `cancelled` : l'utilisateur a repris la
 * main. `sending` : une tentative précédente a atteint le driver et son issue est inconnue.
 * `sent` : c'est parti. `unresolved` : l'envoi s'est terminé sur une issue AMBIGUË, Gmail a
 * pu accepter. Les quatre sortent du handler sans effet de bord.
 *
 * Ce contrôle KV n'est plus qu'un pré-filtre bon marché : la garantie est portée par la
 * réservation SQL du Durable Object, seule à être atomique.
 */
const NON_SENDABLE_STATUSES: ReadonlySet<string> = new Set<ScheduledSendStatus>([
  'cancelled',
  'sending',
  'sent',
  'unresolved',
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
    att !== null &&
    typeof att === 'object' &&
    'arrayBuffer' in att &&
    typeof att.arrayBuffer === 'function'
      ? (att as AttachmentFile)
      : toAttachmentFiles([att as SerializedAttachment])[0],
  );
  return { ...payload, attachments: ordered };
}

/**
 * Décode et normalise un corps stocké. Toute donnée irrécupérable (JSON corrompu,
 * `attachments: [null]`, `attachments: [{}]`) devient une `ScheduledSendPayloadError` :
 * l'ancien code laissait `JSON.parse` lever HORS de tout try, et `main.ts` livrait le lot
 * avec `Promise.all` — un seul payload corrompu faisait donc rejouer le LOT ENTIER de
 * `send-email-queue` à chaque tentative, jusqu'à épuisement des cinq essais, sans
 * dead-letter queue. La boucle d'échec était déterministe.
 */
export function parseStoredPayload(raw: string): StoredOutgoingMessage {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new ScheduledSendPayloadError('stored payload is not valid JSON', { cause: error });
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new ScheduledSendPayloadError('stored payload is not an object');
  }
  try {
    return normalizeStoredAttachments(decoded as StoredOutgoingMessage);
  } catch (error) {
    throw new ScheduledSendPayloadError('stored attachments cannot be rehydrated', {
      cause: error,
    });
  }
}

/** Le strict nécessaire du driver pour émettre un envoi différé. */
export type ScheduledSendDriver = Pick<MailManager, 'create' | 'sendDraft'>;

/**
 * Émet l'envoi et CLASSE son issue là où l'erreur est encore entière.
 *
 * Appelée depuis `ZeroDriver.sendScheduled`, c'est-à-dire DANS le Durable Object. Le
 * classement ne peut pas se faire chez l'appelant : une erreur jetée à travers la frontière
 * RPC d'un DO y arrive en `Error` nu — mesuré sur workerd, propriétés propres
 * `['stack','message','remote']`, ni `code`, ni `status`, ni `cause`. Seule une valeur de
 * retour traverse fidèlement, d'où le verdict rendu plutôt que jeté.
 */
export async function attemptScheduledSend(
  driver: ScheduledSendDriver | null,
  payload: StoredOutgoingMessage,
): Promise<ScheduledSendAttemptRpcResult> {
  if (!driver) {
    // Rien n'a été émis : l'instance n'a pas encore de driver. Panne d'infrastructure
    // transitoire, pas un refus du fournisseur — donc rejouable, jamais ambiguë.
    return {
      ok: false,
      failureClass: 'not-accepted-retryable',
      detail: 'not-dispatched',
      message: 'No driver available',
    };
  }
  try {
    if (payload.draftId) {
      const { draftId, ...rest } = payload;
      await driver.sendDraft(draftId, rest as IOutgoingMessage);
    } else {
      await driver.create(payload as IOutgoingMessage);
    }
    return { ok: true, failureClass: null, detail: null, message: null };
  } catch (error) {
    return toScheduledSendAttempt(error);
  }
}

export interface DeliverScheduledEmailInput {
  messageId: string;
  connectionId: string;
  /** Corps porté par le message de queue (chemin court) ; absent sur le chemin cron. */
  mail?: StoredOutgoingMessage;
}

/**
 * Le verrou d'envoi. Implémenté par le Durable Object ShardRegistry de la connexion : c'est
 * la SEULE barrière qui tienne face à deux livraisons concurrentes. Non optionnel — le
 * rendre facultatif rendrait la garantie silencieusement révocable par un appelant.
 */
export interface SendReservationGate {
  reserve(messageId: string, now: number): Promise<SendReservationRpcResult>;
  settle(
    messageId: string,
    outcome: SettledSendOutcome,
    now: number,
    detail?: string,
  ): Promise<void>;
}

export interface DeliverScheduledEmailDeps {
  statusKV: ScheduledSendStore;
  payloadKV: ScheduledSendStore;
  /** Réservation atomique (Durable Object). */
  reservation: SendReservationGate;
  /** Effectue l'envoi réel (driver Gmail via le stub de l'agent). */
  send: (connectionId: string, payload: StoredOutgoingMessage) => Promise<void>;
  /** Redemande une livraison de ce message par la queue. */
  retry?: () => void;
  /** Remontée d'exception (Sentry). Les issues muettes sont ce qui rendait tout invisible. */
  capture?: (
    error: unknown,
    context: { transaction: string; extra?: Record<string, unknown> },
  ) => void;
  now?: () => number;
  logger: {
    info: (message: unknown, ...rest: unknown[]) => void;
    error: (message: unknown, ...rest: unknown[]) => void;
  };
}

export type DeliverScheduledEmailOutcome =
  | { outcome: 'skipped'; status: string }
  | { outcome: 'sent' }
  | { outcome: 'missing-payload' }
  /** Donnée stockée irrécupérable : échec DÉFINITIF, jamais rejoué. */
  | { outcome: 'invalid-payload'; error: unknown }
  /** Non-acceptation PROUVÉE. `retried` dit si une redélivrance a été demandée. */
  | { outcome: 'failed'; error: unknown; retried: boolean }
  /** Issue AMBIGUË : le mail est peut-être parti. Jamais rejoué, toujours signalé. */
  | { outcome: 'unresolved'; error: unknown };

/**
 * Livre un message de `send-email-queue`, exactement une fois au plus.
 *
 * Ordre imposé — chaque étape ferme une fenêtre de perte ou de duplication :
 *   1. pré-filtre KV : `cancelled` / `sending` / `sent` / `unresolved` sortent sans effet ;
 *   2. résoudre et DÉCODER le corps, dans le chemin gardé ; son absence est un échec
 *      explicite rejouable (KV est éventuellement cohérent, le corps peut apparaître),
 *      une donnée corrompue est un échec DÉFINITIF (rejouer ne peut rien changer) ;
 *   3. RÉSERVER dans le Durable Object — atomique, avant tout appel réseau ;
 *   4. envoyer ;
 *   5. régler la réservation, PUIS mettre à jour la surface KV lisible, chaque écriture
 *      gardée : aucune ne doit pouvoir faire disparaître le mail en levant.
 */
export async function deliverScheduledEmail(
  input: DeliverScheduledEmailInput,
  deps: DeliverScheduledEmailDeps,
): Promise<DeliverScheduledEmailOutcome> {
  const { messageId, connectionId } = input;
  const { statusKV, payloadKV, logger } = deps;
  const now = deps.now ?? Date.now;

  const capture = (error: unknown, extra?: Record<string, unknown>) => {
    try {
      deps.capture?.(error, {
        transaction: 'scheduled-send',
        extra: { messageId, connectionId, ...extra },
      });
    } catch (captureError) {
      logger.error(`Failed to capture scheduled-send exception for ${messageId}:`, captureError);
    }
  };

  /** Écriture d'agrément : elle informe, elle ne garde rien. Elle ne doit jamais lever. */
  const writeStatus = async (status: ScheduledSendStatus) => {
    try {
      await statusKV.put(messageId, status, { expirationTtl: TERMINAL_MARKER_TTL_SECONDS });
    } catch (error) {
      // C'était la perte définitive : l'exception sortait de la fonction, l'état restait
      // `sending`, et toute redélivrance répondait `skipped`. L'issue authentique est déjà
      // dans la réservation SQL ; ici on ne perd qu'un affichage, et on le signale.
      logger.error(`Failed to write status "${status}" for scheduled email ${messageId}:`, error);
      capture(error, { phase: 'status-write', status });
    }
  };

  const settle = async (outcome: SettledSendOutcome, detail: string) => {
    try {
      await deps.reservation.settle(messageId, outcome, now(), detail);
    } catch (error) {
      // La réservation reste `sending` : plus aucune livraison ne pourra envoyer ce
      // message. C'est le sens sûr de l'échec (jamais de doublon), mais il est muet par
      // construction — donc il doit être capturé.
      logger.error(`Failed to settle send reservation for ${messageId}:`, error);
      capture(error, { phase: 'reservation-settle', settleOutcome: outcome, detail });
    }
  };

  const status = await statusKV.get(messageId);
  if (isNonSendableStatus(status)) {
    logger.info(`Email ${messageId} in status "${status}" – skipping send.`);
    return { outcome: 'skipped', status: status as string };
  }

  let payload: StoredOutgoingMessage;
  if (input.mail) {
    try {
      payload = normalizeStoredAttachments(input.mail);
    } catch (error) {
      const wrapped = new ScheduledSendPayloadError('queued attachments cannot be rehydrated', {
        cause: error,
      });
      logger.error(`Unrecoverable queued payload for scheduled email ${messageId}:`, error);
      await writeStatus('failed');
      capture(wrapped, { phase: 'payload-decode', source: 'queue' });
      return { outcome: 'invalid-payload', error: wrapped };
    }
  } else {
    const stored = await payloadKV.get(messageId);
    if (!stored) {
      // Le client a reçu `{success: true, scheduled: true}`. Acquitter en silence ici
      // effaçait le mail sans laisser la moindre trace lisible. Rejoué : KV est
      // éventuellement cohérent, une écriture récente peut n'être pas encore visible.
      logger.error(`No payload found for scheduled email ${messageId}`);
      await writeStatus('failed');
      capture(new Error(`No payload found for scheduled email ${messageId}`), {
        phase: 'payload-lookup',
      });
      deps.retry?.();
      return { outcome: 'missing-payload' };
    }
    try {
      payload = parseStoredPayload(stored);
    } catch (error) {
      // Échec DÉFINITIF : sans dead-letter queue, rejouer une donnée irrécupérable ne
      // produit qu'une boucle d'échec déterministe sur cinq tentatives.
      logger.error(`Unrecoverable stored payload for scheduled email ${messageId}:`, error);
      await writeStatus('failed');
      capture(error, { phase: 'payload-decode', source: 'kv' });
      return { outcome: 'invalid-payload', error };
    }
  }

  // Réservation ATOMIQUE avant l'appel réseau. Contrairement à l'ancienne paire
  // `get`/`put` sur KV, deux livraisons concurrentes ne peuvent pas la franchir ensemble.
  const reservation = await deps.reservation.reserve(messageId, now());
  if (reservation.action === 'skip') {
    logger.info(`Email ${messageId} not reserved (${reservation.reason}) – skipping send.`);
    return { outcome: 'skipped', status: reservation.reason };
  }

  await writeStatus('sending');

  try {
    await deps.send(connectionId, payload);
  } catch (error) {
    const failureClass = classifySendFailure(error);
    const detail = describeSendFailure(error);
    const settled = settledOutcomeFor(failureClass);

    if (settled === 'unresolved') {
      // Ni « envoyé » ni « échoué » : la requête a pu être reçue et honorée. Rejouer ici
      // était le double envoi. On ferme, on trace, on signale — et le corps est conservé
      // pour que l'utilisateur puisse décider.
      logger.error(
        `Ambiguous outcome sending scheduled email ${messageId} (${detail}) – not replayed:`,
        error,
      );
      await settle(settled, detail);
      await writeStatus('unresolved');
      capture(error, { phase: 'send', failureClass, detail });
      return { outcome: 'unresolved', error };
    }

    logger.error(`Failed to send scheduled email ${messageId} (${detail}):`, error);
    await settle(settled, detail);
    await writeStatus('failed');
    capture(error, { phase: 'send', failureClass, detail });

    // Un 4xx déterministe prouve lui aussi la non-acceptation, mais le rejouer ne peut
    // qu'échouer à l'identique : sans dead-letter queue, ce serait cinq tentatives brûlées
    // pour rien. Seul le refus PROUVÉ et transitoire (quota, 408) est redemandé.
    const retried = shouldRetryAfter(failureClass);
    if (retried) deps.retry?.();
    return { outcome: 'failed', error, retried };
  }

  await settle('sent', 'ok');
  await writeStatus('sent');
  try {
    await payloadKV.delete(messageId);
  } catch (error) {
    logger.error(`Failed to release payload for scheduled email ${messageId}:`, error);
    capture(error, { phase: 'payload-release' });
  }
  logger.info(`Email ${messageId} sent successfully`);
  return { outcome: 'sent' };
}
