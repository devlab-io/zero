/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// lib/send-reservation.ts — décision pure derrière la RÉSERVATION D'ENVOI, et
// classification des issues d'envoi. Deux constats d'audit vivaient ici.
//
// (1) LA RÉSERVATION N'ÉTAIT PAS ATOMIQUE. `scheduled-send.ts` faisait
//     `statusKV.get(messageId)` puis, plus loin, `statusKV.put(messageId,'sending')`.
//     KV n'a PAS de compare-and-set et est éventuellement cohérent : deux livraisons
//     concurrentes du même messageId lisaient toutes deux `pending`, écrivaient toutes
//     deux `sending`, et envoyaient toutes deux le mail. Ce dépôt documente lui-même
//     cette impossibilité — voir l'en-tête de lib/history-lock.ts, écrit après le même
//     constat sur le verrou du webhook Gmail. La réservation vit désormais dans le
//     stockage SQL transactionnel du Durable Object ShardRegistry (une instance par
//     connexion), sur le patron `claimHistoryNotification` : lecture puis écriture
//     SANS await intercalé, plus un `ON CONFLICT ... WHERE` qui fait de l'écriture un
//     compare-and-set réel. Ce module ne porte que la décision, testable aux bornes.
//
// (2) DIFFÉRENCE CAPITALE AVEC history-lock.ts : AUCUNE PÉREMPTION. Une notification
//     d'historique laissée en `processing` est reprise après une heure, parce que
//     rejouer l'historique est sans conséquence. Une réservation d'ENVOI laissée en
//     `sending` n'est JAMAIS reprise : la reprendre reviendrait à renvoyer un mail dont
//     l'issue est inconnue. Le coût assumé est symétrique et il est le bon sens pour du
//     courrier sortant — on préfère un mail bloqué et VISIBLE (procédure de lecture
//     `mail.scheduledSendStatus`, capture Sentry) à un mail parti deux fois.

import { extractStatus, isNetworkError } from './driver/gmail-backoff';

/** Issue définitive attachée à une réservation réglée. */
export type SettledSendOutcome = 'sent' | 'failed' | 'unresolved';

export type SendReservationRecord =
  | { status: 'sending'; reservedAt: number }
  | { status: 'settled'; outcome: SettledSendOutcome; settledAt: number };

export type SendReservationDecision =
  | { action: 'reserve'; reason: 'first-arrival' | 'retry-after-proven-failure' }
  | { action: 'skip'; reason: 'in-flight' | 'already-sent' | 'unresolved-outcome' };

/**
 * Forme plate de `SendReservationDecision` pour traverser la frontière RPC d'un Durable
 * Object. Même raison que `HistoryLockRpcResult` : le typage des stubs enveloppe chaque
 * propriété d'un objet retourné dans son propre thenable, ce qui ne s'unifie pas avec une
 * union discriminée de deux formes distinctes (TS2769).
 */
export type SendReservationRpcResult = {
  action: SendReservationDecision['action'];
  reason: SendReservationDecision['reason'];
};

/**
 * Décide si cette livraison peut envoyer, au vu de la réservation déjà stockée pour ce
 * messageId (undefined si personne ne l'a jamais réservé).
 *
 * - aucune trace                      -> réserve (première arrivée) ;
 * - `sending`                         -> refuse : une tentative est partie et son issue est
 *                                        inconnue. Jamais de reprise, à aucun âge ;
 * - réglée `sent`                     -> refuse : c'est parti ;
 * - réglée `unresolved`               -> refuse : l'issue est AMBIGUË (transport coupé,
 *                                        timeout, 5xx). Gmail a pu accepter ;
 * - réglée `failed`                   -> réserve : la non-acceptation est PROUVÉE, rejouer
 *                                        ne peut pas produire de doublon.
 */
export function decideSendReservation(
  existing: SendReservationRecord | undefined,
): SendReservationDecision {
  if (!existing) {
    return { action: 'reserve', reason: 'first-arrival' };
  }

  if (existing.status === 'sending') {
    return { action: 'skip', reason: 'in-flight' };
  }

  switch (existing.outcome) {
    case 'sent':
      return { action: 'skip', reason: 'already-sent' };
    case 'unresolved':
      return { action: 'skip', reason: 'unresolved-outcome' };
    case 'failed':
      return { action: 'reserve', reason: 'retry-after-proven-failure' };
  }
}

// ---------------------------------------------------------------------------
// Classification de l'issue d'un envoi.
// ---------------------------------------------------------------------------

/**
 * Erreur levée AVANT toute émission réseau : donnée stockée irrécupérable (JSON corrompu,
 * pièce jointe non normalisable). Aucun octet n'est parti, et aucune tentative ultérieure
 * ne peut réussir sur la même donnée.
 */
export class ScheduledSendPayloadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ScheduledSendPayloadError';
  }
}

/**
 * Erreur signalant que l'envoi a échoué AVANT toute émission de requête vers le
 * fournisseur — résolution du stub d'agent impossible, driver absent. Seul l'APPELANT peut
 * l'affirmer, puisque lui seul sait où, dans sa propre séquence, la panne est survenue ;
 * `classifySendFailure`, qui ne voit que l'erreur, ne pourrait pas le déduire.
 *
 * Sans ce marqueur, une panne d'infrastructure transitoire (Durable Object momentanément
 * injoignable) était classée AMBIGUË et bloquait définitivement un mail que personne
 * n'avait jamais tenté d'envoyer.
 */
export class SendNotDispatchedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SendNotDispatchedError';
  }
}

export type SendFailureClass =
  /** Refus PROUVÉ et transitoire (quota) : rejouer est sûr et peut aboutir. */
  | 'not-accepted-retryable'
  /** Refus PROUVÉ et déterministe : rien n'est parti, mais rejouer ne peut pas aboutir. */
  | 'not-accepted-permanent'
  /** Issue INCONNUE : la requête a pu être reçue et traitée. Ne jamais rejouer. */
  | 'ambiguous';

/**
 * 4xx dont la sémantique PROUVE que la requête a été refusée sans être exécutée, et dont
 * la cause est transitoire : rejouer plus tard peut aboutir sans risque de doublon.
 * 408 = le serveur a renoncé à attendre la requête ; 429 = trop de requêtes, celle-ci
 * n'est pas honorée.
 */
const PROVEN_TRANSIENT_STATUSES = new Set([408, 429]);

/** Raisons 403 qui signalent un quota, pas un refus définitif. */
const QUOTA_REASONS = new Set([
  'userRateLimitExceeded',
  'rateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
  'limitExceeded',
]);

type GmailErrorShape = {
  errors?: { reason?: string }[];
  response?: { data?: { error?: { errors?: { reason?: string }[] } } };
};

function isQuota403(err: unknown): boolean {
  const e = (err ?? {}) as GmailErrorShape;
  const errors = e.errors ?? e.response?.data?.error?.errors ?? [];
  return errors.some((x) => QUOTA_REASONS.has(x.reason ?? ''));
}

/**
 * Classe une erreur d'envoi selon la SEULE question qui compte pour un mail sortant :
 * peut-on affirmer que Gmail ne l'a PAS accepté ?
 *
 * Le contresens corrigé ici : `lib/driver/gmail-backoff.ts` classe `fetch failed` et
 * `request timed out` comme TRANSITOIRES — à juste titre pour une lecture idempotente,
 * puisque le but y est de retenter un appel sans conséquence. `scheduled-send.ts`
 * réutilisait implicitement ce jugement pour un ENVOI et remettait le message en file : or
 * une socket coupée après l'émission de la requête ne dit rien de ce que Gmail a fait de
 * cette requête. Le commentaire « un échec FRANC (l'appel a levé) — rien n'est parti »
 * était faux, et le correctif « double envoi » se contredisait lui-même.
 *
 * Un statut serveur PROUVE que la requête a atteint Gmail et a reçu un verdict :
 *   - 4xx        -> refusée sans exécution (déterministe, sauf 408/429/403-quota) ;
 *   - 5xx        -> AMBIGU : Gmail a pu traiter l'envoi puis échouer à répondre.
 * L'absence de statut (panne de transport, timeout client) est ambiguë par construction.
 */
export function classifySendFailure(error: unknown): SendFailureClass {
  if (error instanceof ScheduledSendPayloadError) return 'not-accepted-permanent';
  // Rien n'a été émis, et la cause est typiquement transitoire : rejouer est sûr ET utile.
  if (error instanceof SendNotDispatchedError) return 'not-accepted-retryable';

  const status = extractStatus(error);

  if (status !== undefined) {
    if (PROVEN_TRANSIENT_STATUSES.has(status)) return 'not-accepted-retryable';
    if (status === 403 && isQuota403(error)) return 'not-accepted-retryable';
    if (status >= 400 && status < 500) return 'not-accepted-permanent';
    // 5xx : la requête a été reçue. Ce qu'elle a produit avant l'erreur est inconnu.
    return 'ambiguous';
  }

  // Panne de transport avérée, ou erreur non identifiable : dans les deux cas la
  // non-acceptation n'est pas démontrable.
  return 'ambiguous';
}

/**
 * Motif court et stable, inscrit dans la colonne `detail` de la réservation et journalisé.
 * C'est la « trace explicite » qu'exige une issue ambiguë : sans elle, un mail bloqué en
 * `unresolved` serait indiscernable d'un mail jamais tenté.
 */
export function describeSendFailure(error: unknown): string {
  if (error instanceof ScheduledSendPayloadError) return 'payload-unrecoverable';
  if (error instanceof SendNotDispatchedError) return 'not-dispatched';
  const status = extractStatus(error);
  if (status !== undefined) return `http-${status}`;
  if (isNetworkError(error)) return 'transport-failure';
  return 'unknown-error';
}

/** L'issue à inscrire dans la réservation pour une classe d'échec donnée. */
export function settledOutcomeFor(failureClass: SendFailureClass): SettledSendOutcome {
  return failureClass === 'ambiguous' ? 'unresolved' : 'failed';
}

/** Seule une non-acceptation PROUVÉE et transitoire justifie une redélivrance. */
export function shouldRetryAfter(failureClass: SendFailureClass): boolean {
  return failureClass === 'not-accepted-retryable';
}
