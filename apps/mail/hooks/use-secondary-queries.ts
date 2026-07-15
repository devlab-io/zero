import { useEffect, useState } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Minimum grace period for the visible thread body, even when JS becomes idle immediately. */
const MINIMUM_DELAY_MS = 300;

/**
 * Devlab — false on mount, true once the browser reports idle time
 * (requestIdleCallback, capped by `timeoutMs`; setTimeout fallback without the API).
 * Secondary queries on thread open (message attachments, sender verification, AI
 * summary) gate their `enabled` on this so the critical path — mail.get +
 * processEmailContent, i.e. the visible body — never queues behind them:
 * httpBatchLink runs with maxItems:1, so every query is its own HTTP request and
 * they all compete for the same server-side thread context.
 */
export function useSecondaryQueriesEnabled(timeoutMs = 1500): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let idleHandle: number | undefined;
    const timer = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(() => setEnabled(true), {
          timeout: Math.max(0, timeoutMs - MINIMUM_DELAY_MS),
        });
      } else {
        setEnabled(true);
      }
    }, MINIMUM_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, [timeoutMs]);

  return enabled;
}
