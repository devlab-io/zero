import type { ParsedMessage } from '@zero/types';

export type QueueThreadContextView = {
  /** Dernier message réel du fil (brouillons exclus) — mis en avant dans le panneau. */
  latest: ParsedMessage | null;
  /** Messages antérieurs, ordre chronologique, repliés par défaut. */
  earlier: ParsedMessage[];
  /**
   * Vrai si le dernier message ne vient pas de la boîte de l'utilisateur.
   * Sans email de référence, on suppose entrant : la file ne contient que des
   * fils en attente de réponse et le libellé « reçu » reste le cas honnête.
   */
  latestIsInbound: boolean;
};

const normalizeEmail = (value?: string | null) => (value ?? '').trim().toLowerCase();

export const buildQueueThreadContext = (
  messages: readonly ParsedMessage[] | undefined,
  ownEmail?: string | null,
): QueueThreadContextView => {
  const conversation = (messages ?? []).filter((message) => !message.isDraft);
  const latest = conversation.at(-1) ?? null;
  const earlier = conversation.slice(0, -1);
  const own = normalizeEmail(ownEmail);
  const latestIsInbound = Boolean(latest && (!own || normalizeEmail(latest.sender.email) !== own));

  return { latest, earlier, latestIsInbound };
};
