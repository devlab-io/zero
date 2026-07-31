/**
 * Ordonnanceur « après paint, puis idle » (r11).
 *
 * Le code TanStack (persistQueryClientRestore) AWAITE onSuccess avant son
 * finally setIsRestoring(false) : tout travail démarré dans onSuccess
 * concurrence la levée du restore et la première peinture. L'hydratation des
 * corps de mails (structured clone IDB de plusieurs Mo + hydrate) doit donc
 * démarrer strictement APRÈS : double requestAnimationFrame (le 1er court
 * avant la présentation du frame, le 2e garantit qu'un frame a été peint),
 * puis requestIdleCallback (avec timeout borné) ou repli setTimeout.
 *
 * Annulable : le handle retourné arrête chaque étage — un changement d'owner
 * (switch de compte) annule le travail planifié avant qu'il ne touche le
 * cache du nouveau compte (isolation P0).
 */

export type IdleCancel = () => void;

export function scheduleAfterPaintIdle(
  run: () => void,
  options?: { idleTimeoutMs?: number },
): IdleCancel {
  if (typeof window === 'undefined') return () => {};
  const idleTimeoutMs = options?.idleTimeoutMs ?? 1_500;

  let cancelled = false;
  let rafId: number | null = null;
  let idleId: number | null = null;
  let timerId: number | null = null;

  const startIdle = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(
        () => {
          if (!cancelled) run();
        },
        { timeout: idleTimeoutMs },
      );
    } else {
      timerId = window.setTimeout(() => {
        if (!cancelled) run();
      }, 200);
    }
  };

  if (typeof window.requestAnimationFrame === 'function') {
    rafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(() => startIdle());
    });
  } else {
    // Environnement sans rAF (tests, workers) : différer d'un macrotask.
    timerId = window.setTimeout(() => startIdle(), 0);
  }

  return () => {
    cancelled = true;
    if (rafId !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(rafId);
    }
    if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId);
    }
    if (timerId !== null) window.clearTimeout(timerId);
  };
}
