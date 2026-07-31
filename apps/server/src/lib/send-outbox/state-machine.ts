// Machine à états de l'outbox d'envoi (send_job). Les transitions réelles sont
// des UPDATE conditionnels (CAS sur le statut) dans ./index.ts ; ce module est
// la seule source des ensembles d'états autorisés et de la règle de bail, pour
// que serveur, consumer et tests partagent exactement la même sémantique.
//
// Cycle de vie :
//   queued ──(claim)──▶ sending ──(succès Gmail)──▶ sent        (terminal)
//     │                    │
//     │                    └──(échec Gmail)──▶ failed ──(retry)──▶ queued
//     └──(undo/cancel)──▶ cancelled                              (terminal)
//
// Garantie honnête : at-least-once. Un claim sur un `sending` au bail expiré
// (consumer mort en vol) peut ré-envoyer un mail que Gmail avait accepté après
// le crash — l'exactly-once fournisseur exigerait une réconciliation par
// Message-ID côté Gmail, hors de portée ici et documenté comme tel.

export const sendJobStatuses = ['queued', 'sending', 'sent', 'cancelled', 'failed'] as const;
export type SendJobStatus = (typeof sendJobStatuses)[number];

/** Statuts depuis lesquels un consumer peut réclamer l'envoi. */
export const CLAIMABLE_SEND_JOB_STATUSES: readonly SendJobStatus[] = ['queued', 'failed'];

/** Statuts depuis lesquels l'utilisateur peut annuler (undo / cancel). */
export const CANCELLABLE_SEND_JOB_STATUSES: readonly SendJobStatus[] = ['queued', 'failed'];

/** Statuts terminaux : plus aucune transition possible. */
export const TERMINAL_SEND_JOB_STATUSES: readonly SendJobStatus[] = ['sent', 'cancelled'];

/**
 * Bail d'un claim `sending` : au-delà, le worker qui détenait le job est
 * présumé mort et une relivraison Queue peut re-réclamer la ligne.
 */
export const SENDING_LEASE_MS = 5 * 60_000;

export const isTerminalSendJobStatus = (status: SendJobStatus): boolean =>
  TERMINAL_SEND_JOB_STATUSES.includes(status);

export const canCancelSendJob = (status: SendJobStatus): boolean =>
  CANCELLABLE_SEND_JOB_STATUSES.includes(status);

export const canRetrySendJob = (status: SendJobStatus): boolean => status === 'failed';

/**
 * Un job est réclamable si son statut l'autorise, ou s'il est `sending` avec un
 * bail expiré (updatedAt trop ancien — worker mort entre claim et issue).
 */
export const canClaimSendJob = (
  job: { status: SendJobStatus; updatedAt: Date },
  now: Date = new Date(),
  leaseMs: number = SENDING_LEASE_MS,
): boolean => {
  if (CLAIMABLE_SEND_JOB_STATUSES.includes(job.status)) return true;
  return job.status === 'sending' && now.getTime() - job.updatedAt.getTime() > leaseMs;
};
