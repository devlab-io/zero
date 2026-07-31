import { lazy, Suspense, useEffect, useSyncExternalStore, type ComponentProps } from 'react';
import type { ThreadContextMenu as ThreadContextMenuComponent } from './thread-context';
import { scheduleAfterPaintIdle } from '@/lib/idle-scheduler';
import { whenBootStage } from '@/lib/perf-stages';

/**
 * Menu contextuel de ligne DIFFÉRÉ (r13, cold boot). thread-context (648
 * lignes + radix context-menu, ~10,7 KiB gz) enveloppait CHAQUE ligne de la
 * liste — dans le graphe critique alors qu'il ne sert qu'au clic droit. Ici :
 * les lignes rendent leurs children TELS QUELS (zéro différence visuelle)
 * tant que le chunk n'est pas chargé ; un unique déclencheur module-scopé le
 * charge après premier paint + idle, puis toutes les lignes basculent via un
 * store partagé (pas un ordonnanceur par ligne). Un clic droit pendant la
 * fenêtre (~1 s) retombe sur le menu natif du navigateur — comportement
 * dégradé honnête, jamais cassé.
 */

type ThreadContextMenuProps = ComponentProps<typeof ThreadContextMenuComponent>;

const LazyThreadContextMenu = lazy(() =>
  import('./thread-context').then((mod) => ({ default: mod.ThreadContextMenu })),
);

let menuReady = false;
let loadScheduled = false;
const subscribers = new Set<() => void>();

const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};
const getSnapshot = () => menuReady;

function ensureMenuScheduled() {
  if (loadScheduled || typeof window === 'undefined') return;
  loadScheduled = true;
  // Contre-revue r13 : attendre le SIGNAL boot:list-painted (fallback borné
  // pour boîte vide/erreur), PUIS l'idle — jamais en concurrence avec la
  // fenêtre data→paint de la liste.
  whenBootStage(
    'boot:list-painted',
    () => {
      scheduleAfterPaintIdle(() => {
        void import('./thread-context')
          .then(() => {
            menuReady = true;
            for (const listener of subscribers) listener();
          })
          .catch(() => {
            // Échec réseau : réarmé au prochain montage (fenêtre dégradée = menu natif).
            loadScheduled = false;
          });
      });
    },
    { fallbackMs: 2_500 },
  );
}

export function DeferredThreadContextMenu(props: ThreadContextMenuProps) {
  const isReady = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => {
    ensureMenuScheduled();
  }, []);

  if (!isReady) return <>{props.children}</>;
  return (
    <Suspense fallback={<>{props.children}</>}>
      <LazyThreadContextMenu {...props} />
    </Suspense>
  );
}
