// View-model pur de la section « Email sends » de la page Queue : les envois
// send_job (mail.listSendJobs) sont une file distincte du draft outbox IA —
// jamais mélangés. Séparé du composant pour être testé sans rendu.

export const SEND_JOB_STATUSES = ['queued', 'sending', 'sent', 'cancelled', 'failed'] as const;
export type SendJobStatus = (typeof SEND_JOB_STATUSES)[number];

export type SendJobListItem = {
  id: string;
  status: SendJobStatus;
  error: string | null;
  subject: string | null;
  to: string[];
  sendAt: number | null;
  createdAt: number;
};

/** Statuts affichés dans la section : le vécu utile, pas l'historique. */
export const VISIBLE_SEND_JOB_STATUSES: readonly SendJobStatus[] = ['failed', 'sending', 'queued'];

/** Seul un envoi en échec se relance manuellement (payload conservé côté serveur). */
export const canRetrySendJobItem = (status: SendJobStatus): boolean => status === 'failed';

const statusRank: Record<SendJobStatus, number> = {
  failed: 0,
  sending: 1,
  queued: 2,
  sent: 3,
  cancelled: 4,
};

/**
 * Ordre d'affichage : les échecs d'abord (actionnables), puis en cours, puis
 * en file ; à statut égal, le plus récent d'abord. Les statuts hors champ
 * (sent/cancelled) sont écartés.
 */
export const sortSendJobsForDisplay = (items: readonly SendJobListItem[]): SendJobListItem[] =>
  items
    .filter((item) => VISIBLE_SEND_JOB_STATUSES.includes(item.status))
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.createdAt - a.createdAt);

/** "a@x.co, b@y.co +2" — borne l'affichage des destinataires sans les perdre. */
export const formatSendJobRecipients = (to: readonly string[], max = 3): string => {
  if (!to.length) return '';
  const shown = to.slice(0, max).join(', ');
  const rest = to.length - max;
  return rest > 0 ? `${shown} +${rest}` : shown;
};
