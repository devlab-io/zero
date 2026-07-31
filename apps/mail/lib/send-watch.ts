// Planification pure du suivi post-enqueue : mail.send répond dès l'enqueue
// durable (send_job + Queue), l'issue Gmail est asynchrone. Ces jalons disent
// quand interroger getSendStatus pour transformer un échec asynchrone en toast
// actionnable plutôt qu'en faux succès muet. Pur et séparé du hook pour être
// testable sans timers réels.

/** Jalons de sondage relatifs au moment où l'envoi est dû. */
export const SEND_WATCH_POLL_DELAYS_MS = [5_000, 12_000, 30_000, 60_000] as const;

/**
 * Au-delà de cette avance, l'envoi est un planifié long terme : son suivi
 * relève de l'UI de planification, pas d'un sondage post-composer.
 */
export const SEND_WATCH_MAX_LEAD_MS = 60_000;

/**
 * Renvoie les délais de sondage (ms depuis maintenant), ou null si l'envoi ne
 * doit pas être suivi. Un sendAt futur (fenêtre undo, petit schedule) décale
 * tous les jalons pour ne sonder qu'après l'échéance.
 */
export function planSendWatch(sendAt: number | undefined, now: number): number[] | null {
  const lead = sendAt ? sendAt - now : 0;
  if (lead > SEND_WATCH_MAX_LEAD_MS) return null;
  const offset = Math.max(0, lead);
  return SEND_WATCH_POLL_DELAYS_MS.map((delay) => delay + offset);
}

export type SendWatchStatus = 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'unknown';

/** Décision pure sur un statut observé : continuer, s'arrêter, ou alerter. */
export function sendWatchAction(status: SendWatchStatus): 'stop' | 'alert' | 'continue' {
  if (status === 'sent' || status === 'cancelled') return 'stop';
  if (status === 'failed') return 'alert';
  return 'continue';
}
