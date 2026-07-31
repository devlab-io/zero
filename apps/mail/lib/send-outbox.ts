export type SendOutcome = { ok: true; result: unknown } | { ok: false; error: unknown };

/**
 * `mail.send` resolves with `{ success: false, error }` for scheduling/queue
 * failures instead of throwing. Treating any resolved mutation as sent made
 * those losses silent; fold both failure shapes into one outcome the
 * background-send runner can surface and retry.
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
