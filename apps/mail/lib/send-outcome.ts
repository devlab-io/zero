export type SendOutcome = { ok: true; result: unknown } | { ok: false; error: unknown };

/**
 * `mail.send` resolves with `{ success: false, error }` for scheduling/queue
 * failures instead of throwing. Treating every resolved mutation as sent made
 * those losses silent, so both failure shapes are folded into one outcome.
 * This is deliberately not called an outbox: compose/reply still wait for the
 * server because no durable enqueue boundary exists for them yet.
 */
export function interpretSendOutcome(result: unknown): SendOutcome {
  if (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    (result as { success?: unknown }).success === false
  ) {
    const error = (result as { error?: unknown }).error;
    return { ok: false, error: typeof error === 'string' ? error : undefined };
  }
  return { ok: true, result };
}
