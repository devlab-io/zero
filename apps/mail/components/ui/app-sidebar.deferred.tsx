import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from '@/lib/constants';
import { useSidebar } from '@/components/context/sidebar-context';
import { scheduleAfterPaintIdle } from '@/lib/idle-scheduler';
import { lazy, Suspense, useEffect, useState } from 'react';
import { whenBootStage } from '@/lib/perf-stages';

/**
 * AppSidebar DIFFÉRÉE (r13, cold boot). Diagnostic CUA staging : le segment
 * dominant du reload est HTML→route-mounted (~1,2 s de bundle/hydratation) ;
 * la sidebar (16,5 KiB gz + nav-user/dropdowns/billing qu'elle entraîne)
 * n'est pas nécessaire pour peindre les 20 premières lignes. Elle sort du
 * graphe critique via un import dynamique déclenché APRÈS le premier frame
 * peint + idle (lib/idle-scheduler).
 *
 * Zéro flash de largeur : le placeholder lit le MÊME contexte léger
 * (sidebar-context, déjà critique via le layout routes) et occupe exactement
 * la largeur du rail réel — SIDEBAR_WIDTH étendu, SIDEBAR_WIDTH_ICON replié,
 * rien sur mobile (le vrai sidebar y est un overlay qui n'occupe pas le
 * layout). La liste, la barre de recherche et la navigation clavier vivent
 * hors sidebar et restent pleinement utilisables pendant la fenêtre.
 */

const LazyAppSidebar = lazy(() =>
  import('@/components/ui/app-sidebar').then((mod) => ({ default: mod.AppSidebar })),
);

// Une fois par chargement de document : après le premier swap, les montages
// suivants (navigations client) rendent la sidebar immédiatement.
let sidebarChunkRequested = false;

export function SidebarPlaceholder() {
  const { state, isMobile } = useSidebar();
  if (isMobile) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="app-sidebar-placeholder"
      className="bg-sidebar dark:bg-sidebar h-svh shrink-0 transition-[width] duration-200 ease-in-out"
      style={{ width: state === 'collapsed' ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH }}
    />
  );
}

export function DeferredAppSidebar() {
  const [ready, setReady] = useState(sidebarChunkRequested);

  useEffect(() => {
    if (sidebarChunkRequested) {
      setReady(true);
      return;
    }
    // Contre-revue r13 : NE PAS démarrer sur notre propre montage — le double
    // rAF garantirait seulement un frame du placeholder, et l'idle (~30 ms)
    // concurrencerait exactement la fenêtre data→paint de la liste (66-76 ms
    // mesurés). On attend le SIGNAL boot:list-painted (fallback borné : boîte
    // vide ou liste en erreur → la sidebar apparaît quand même), PUIS idle.
    let cancelIdle: (() => void) | null = null;
    const cancelWait = whenBootStage(
      'boot:list-painted',
      () => {
        cancelIdle = scheduleAfterPaintIdle(() => {
          sidebarChunkRequested = true;
          setReady(true);
        });
      },
      { fallbackMs: 2_500 },
    );
    return () => {
      cancelWait();
      cancelIdle?.();
    };
  }, []);

  if (!ready) return <SidebarPlaceholder />;
  return (
    <Suspense fallback={<SidebarPlaceholder />}>
      <LazyAppSidebar />
    </Suspense>
  );
}
