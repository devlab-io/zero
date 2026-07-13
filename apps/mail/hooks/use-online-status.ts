import { useSyncExternalStore } from 'react';

/**
 * Live connectivity signal (issue #34). Feeds the honest network states so an
 * offline read surfaces a stale/offline notice or an explicit error instead of a
 * lying "empty". Listeners are removed by the subscribe cleanup — no leak.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getSnapshot(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerSnapshot(): boolean {
  return true; // SSR assumes online; corrected on hydration.
}

export function useIsOffline(): boolean {
  return !useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
