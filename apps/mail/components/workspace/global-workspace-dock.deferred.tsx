import { lazy, Suspense, useEffect, useState } from 'react';

const LazyGlobalWorkspaceDock = lazy(() =>
  import('./global-workspace-dock').then((module) => ({ default: module.GlobalWorkspaceDock })),
);

/** Keep Calendar/day-picker and team activity out of the mailbox cold path. */
export function DeferredGlobalWorkspaceDock() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const load = () => setReady(true);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(load, { timeout: 1_500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 800);
    return () => window.clearTimeout(id);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <LazyGlobalWorkspaceDock />
    </Suspense>
  );
}
