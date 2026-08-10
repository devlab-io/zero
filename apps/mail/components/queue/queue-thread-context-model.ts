import type { ParsedMessage } from '@zero/types';

export type QueueThreadContextView = {
  /** Dernier message entrant du fil — celui auquel la réponse est destinée. */
  latest: ParsedMessage | null;
  /** Messages antérieurs à ce message entrant, repliés par défaut. */
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
  const own = normalizeEmail(ownEmail);

  if (!conversation.length) {
    return { latest: null, earlier: [], latestIsInbound: false };
  }

  if (own) {
    const latestInboundIndex = conversation.findLastIndex(
      (message) => normalizeEmail(message.sender.email) !== own,
    );

    if (latestInboundIndex >= 0) {
      return {
        latest: conversation[latestInboundIndex] ?? null,
        earlier: conversation.slice(0, latestInboundIndex),
        latestIsInbound: true,
      };
    }
  }

  const latest = conversation.at(-1) ?? null;
  return {
    latest,
    earlier: conversation.slice(0, -1),
    latestIsInbound: Boolean(latest && !own),
  };
};
