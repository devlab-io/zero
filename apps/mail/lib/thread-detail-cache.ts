type CachedThreadMessage = {
  isDraft?: boolean;
  decodedBody?: string;
};

type CachedThreadDetail = {
  messages?: CachedThreadMessage[];
};

/**
 * Rich list projections intentionally omit decodedBody. They must never be
 * accepted as a complete mail.get cache entry for the active reader.
 */
export function hasCompleteThreadBodies(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const messages = (data as CachedThreadDetail).messages;
  if (!Array.isArray(messages) || messages.length === 0) return false;

  const receivedMessages = messages.filter((message) => !message.isDraft);
  if (receivedMessages.length === 0) return true;

  return receivedMessages.every((message) =>
    Object.prototype.hasOwnProperty.call(message, 'decodedBody'),
  );
}
