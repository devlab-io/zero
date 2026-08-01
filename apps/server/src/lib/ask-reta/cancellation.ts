import { ASK_RETA_DEADLINE_MS } from './pipeline';

/**
 * Owned cancellation authority for one Ask Reta run (review 02-2).
 *
 * The 45s deadline is CANONICAL here: the same budget the pipeline races is
 * the one that aborts the controller, so when the pipeline rejects on
 * deadline the underlying dependency's signal fires too and the operation
 * actually settles — no orphan model call running to some later belt.
 * `dispose()` is idempotent and must run on EVERY exit path, including
 * failures before a Response exists (timer + request-signal listener leak
 * otherwise).
 */
export type AskRetaCancellation = {
  signal: AbortSignal;
  abort: () => void;
  dispose: () => void;
};

export function createAskRetaCancellation(params: {
  requestSignal?: AbortSignal;
  deadlineMs?: number;
}): AskRetaCancellation {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.deadlineMs ?? ASK_RETA_DEADLINE_MS);

  const requestSignal = params.requestSignal;
  const onRequestAbort = () => controller.abort();
  if (requestSignal) {
    if (requestSignal.aborted) controller.abort();
    else requestSignal.addEventListener('abort', onRequestAbort, { once: true });
  }

  let disposed = false;
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      requestSignal?.removeEventListener('abort', onRequestAbort);
    },
  };
}
