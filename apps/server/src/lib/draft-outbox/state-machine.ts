import { classifySendFailure, type SendFailureClass } from '../send-reservation';

export const draftOutboxStatuses = [
  'queued',
  'generating',
  'draft_ready',
  'approved',
  'sending',
  'sent',
  'cancelled',
  'failed',
  /**
   * L'appel d'envoi a été ÉMIS et son issue est INCONNUE : Gmail a pu l'accepter avant que
   * la connexion ne tombe, ou avant que l'écriture de `sent` n'échoue. Terminal et NON
   * rejouable — c'est toute sa raison d'être.
   *
   * Le défaut qu'il ferme : `sending` figurait dans `failFromStatuses`, donc une coupure
   * postérieure à l'acceptation devenait `failed` ; `retryDraftOutboxItem` ramenait
   * `failed` -> `queued` ; et le bouton de rejeu, câblé dans l'UI, renvoyait le mail. Le
   * doublon était présenté à l'utilisateur comme une réparation.
   *
   * Même sémantique que l'issue `unresolved` de la réservation d'envoi différé
   * (`send-reservation.ts`) : on préfère un blocage VISIBLE à un doublon silencieux.
   */
  'unresolved',
] as const;

export type DraftOutboxStatus = (typeof draftOutboxStatuses)[number];

export interface DraftOutboxItem {
  id: string;
  connectionId: string;
  threadId?: string | null;
  mission?: string | null;
  status: DraftOutboxStatus;
  gmailDraftId?: string | null;
  subject: string;
  body: string;
  idempotencyKey: string;
  scheduledSendAt?: Date | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DraftOutboxTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftOutboxTransitionError';
  }
}

const cancellableStatuses = new Set<DraftOutboxStatus>([
  'queued',
  'generating',
  'draft_ready',
  'approved',
]);

/**
 * `sending` en est VOLONTAIREMENT absent. Une fois l'appel au driver engagé, plus aucune
 * erreur ne peut être déclarée `failed` par la voie générique, parce que `failed` est
 * rejouable et qu'un rejeu après acceptation renvoie le mail. La seule sortie de `sending`
 * autre que `sent` passe désormais par {@link settleSendingDraftOutboxItem}, qui EXIGE un
 * classement de l'échec.
 */
const failFromStatuses = new Set<DraftOutboxStatus>([
  'queued',
  'generating',
  'draft_ready',
  'approved',
]);

const terminalStatuses = new Set<DraftOutboxStatus>(['sent', 'cancelled', 'unresolved']);

const withUpdate = (
  item: DraftOutboxItem,
  update: Partial<DraftOutboxItem>,
  now: Date = new Date(),
): DraftOutboxItem => ({
  ...item,
  ...update,
  updatedAt: now,
});

const rejectTerminal = (item: DraftOutboxItem) => {
  if (terminalStatuses.has(item.status)) {
    throw new DraftOutboxTransitionError(`Draft outbox item ${item.id} is terminal`);
  }
};

const requireStatus = (item: DraftOutboxItem, expected: DraftOutboxStatus, action: string) => {
  if (item.status !== expected) {
    throw new DraftOutboxTransitionError(
      `${action} requires status ${expected}; received ${item.status}`,
    );
  }
};

export const beginGeneratingDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'queued', 'beginGeneratingDraftOutboxItem');
  return withUpdate(item, { status: 'generating', error: null }, now);
};

export const markDraftOutboxItemReady = (
  item: DraftOutboxItem,
  draft: { gmailDraftId: string; subject?: string; body?: string },
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'generating', 'markDraftOutboxItemReady');
  if (!draft.gmailDraftId) {
    throw new DraftOutboxTransitionError('markDraftOutboxItemReady requires gmailDraftId');
  }

  return withUpdate(
    item,
    {
      status: 'draft_ready',
      gmailDraftId: draft.gmailDraftId,
      subject: draft.subject ?? item.subject,
      body: draft.body ?? item.body,
      scheduledSendAt: null,
      error: null,
    },
    now,
  );
};

export const approveDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
  countdownMs = 15_000,
): DraftOutboxItem => {
  requireStatus(item, 'draft_ready', 'approveDraftOutboxItem');
  if (!item.gmailDraftId) {
    throw new DraftOutboxTransitionError('approveDraftOutboxItem requires gmailDraftId');
  }

  return withUpdate(
    item,
    {
      status: 'approved',
      scheduledSendAt: new Date(now.getTime() + countdownMs),
      error: null,
    },
    now,
  );
};

export const cancelDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  if (!cancellableStatuses.has(item.status)) {
    throw new DraftOutboxTransitionError(
      `cancelDraftOutboxItem requires queued, generating, draft_ready, or approved; received ${item.status}`,
    );
  }

  return withUpdate(item, { status: 'cancelled', scheduledSendAt: null }, now);
};

export const retryDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'failed', 'retryDraftOutboxItem');
  return withUpdate(
    item,
    {
      status: 'queued',
      gmailDraftId: null,
      scheduledSendAt: null,
      error: null,
    },
    now,
  );
};

export const beginSendingDraftOutboxItem = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  rejectTerminal(item);
  requireStatus(item, 'approved', 'beginSendingDraftOutboxItem');
  if (!item.gmailDraftId) {
    throw new DraftOutboxTransitionError('beginSendingDraftOutboxItem requires gmailDraftId');
  }

  return withUpdate(item, { status: 'sending', error: null }, now);
};

export const markDraftOutboxItemSent = (
  item: DraftOutboxItem,
  now: Date = new Date(),
): DraftOutboxItem => {
  rejectTerminal(item);
  requireStatus(item, 'sending', 'markDraftOutboxItemSent');
  if (!item.gmailDraftId) {
    throw new DraftOutboxTransitionError('markDraftOutboxItemSent requires gmailDraftId');
  }

  return withUpdate(item, { status: 'sent', scheduledSendAt: null, error: null }, now);
};

export const failDraftOutboxItem = (
  item: DraftOutboxItem,
  error: string,
  now: Date = new Date(),
): DraftOutboxItem => {
  if (!failFromStatuses.has(item.status)) {
    throw new DraftOutboxTransitionError(
      `failDraftOutboxItem cannot fail item from ${item.status}`,
    );
  }

  return withUpdate(item, { status: 'failed', scheduledSendAt: null, error }, now);
};

/**
 * SEULE sortie de `sending` autre que `sent`. Elle exige de savoir ce que le fournisseur a
 * fait de la requête, et ne laisse pas ce jugement à l'appelant par défaut.
 *
 * - `not-accepted-retryable` / `not-accepted-permanent` : le refus est PROUVÉ, rien n'est
 *   parti — `failed`, donc rejouable comme avant.
 * - `ambiguous` : l'issue est inconnue — `unresolved`, terminal. C'est le cas d'une
 *   coupure de transport, d'un 5xx, ou d'un échec d'écriture APRÈS l'acceptation.
 *
 * `dispatched: false` est l'échappatoire de l'appelant qui SAIT que rien n'a été émis
 * (il n'avait pas encore atteint l'appel d'envoi) : même philosophie que
 * `SendNotDispatchedError` dans `send-reservation.ts` — seul celui qui voit où il en était
 * dans sa séquence peut l'affirmer.
 */
export const settleSendingDraftOutboxItem = (
  item: DraftOutboxItem,
  outcome: { error: string; failureClass: SendFailureClass },
  now: Date = new Date(),
): DraftOutboxItem => {
  requireStatus(item, 'sending', 'settleSendingDraftOutboxItem');

  return withUpdate(
    item,
    {
      status: outcome.failureClass === 'ambiguous' ? 'unresolved' : 'failed',
      scheduledSendAt: null,
      error: outcome.error,
    },
    now,
  );
};

/**
 * Classe une erreur d'envoi de brouillon. Appelée DANS le Durable Object, là où l'enveloppe
 * `StandardizedError` du driver est encore entière — contrairement au chemin d'envoi
 * différé, aucune frontière RPC ne s'interpose ici.
 *
 * `dispatched: false` court-circuite le classement : rien n'a été émis, donc rejouer est
 * sûr, quelle que soit la tête de l'erreur.
 */
export const classifyDraftOutboxSendFailure = (
  error: unknown,
  dispatched: boolean,
): SendFailureClass => (dispatched ? classifySendFailure(error) : 'not-accepted-retryable');

/**
 * Décision PURE prise quand un envoi de brouillon a échoué : que faire de l'item, au vu de
 * son état RELU en base et de ce qu'on sait de l'erreur.
 *
 * Isolée du stockage pour la même raison que `decideSendReservation` dans
 * `send-reservation.ts` : c'est la règle qui décide si l'utilisateur se verra proposer de
 * renvoyer un mail, elle doit être démontrable aux bornes sans monter une base.
 */
export type DraftOutboxSendSettlement =
  /** État déjà terminal : plus rien à écrire. */
  | { action: 'ignore' }
  /** L'item n'a pas atteint `sending` : voie générique, rejouable. */
  | { action: 'fail' }
  /** L'item est en `sending` : l'issue dépend du classement. */
  | { action: 'settle-sending'; failureClass: SendFailureClass };

export const decideDraftOutboxSendSettlement = (
  status: DraftOutboxStatus,
  error: unknown,
  dispatched: boolean,
): DraftOutboxSendSettlement => {
  if (terminalStatuses.has(status)) return { action: 'ignore' };
  if (status !== 'sending') return { action: 'fail' };
  return {
    action: 'settle-sending',
    failureClass: classifyDraftOutboxSendFailure(error, dispatched),
  };
};
