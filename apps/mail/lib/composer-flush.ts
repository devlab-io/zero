/**
 * Durability flush listeners for the composer (issue #34, check point 5 + soak).
 *
 * `pagehide` fires on tab close, reload and bfcache eviction; `visibilitychange`
 * (hidden) covers tab-switch / mobile backgrounding. Both are removed by the
 * returned cleanup — the add/remove pairing is balanced so the soak proves no
 * listener leak across mount/unmount cycles.
 *
 * The minimal structural interfaces let the real `window`/`document` AND a
 * counting fake (soak) satisfy the signature without `any`.
 */

export type FlushFn = () => void;

export interface FlushTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface VisibilityDoc extends FlushTarget {
  readonly visibilityState: string;
}

export function registerComposerFlush(win: FlushTarget, doc: VisibilityDoc, flush: FlushFn): () => void {
  const onPageHide = () => flush();
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') flush();
  };
  win.addEventListener('pagehide', onPageHide);
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    win.removeEventListener('pagehide', onPageHide);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
