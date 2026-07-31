export type SendOutcome = { ok: true; result: unknown } | { ok: false; error: unknown };

/**
 * `mail.send` resolves with `{ success: false, error }` for enqueue failures
 * instead of throwing. Treating every resolved mutation as sent made those
 * losses silent, so both failure shapes are folded into one outcome. A
 * resolved `ok` now means the send is durably enqueued (send_job row + Queue
 * message) — the provider outcome is asynchronous and watched separately via
 * getSendStatus (hooks/use-send-status).
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
