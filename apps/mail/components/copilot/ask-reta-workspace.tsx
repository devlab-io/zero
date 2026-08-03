import { lazy, Suspense, useEffect, useRef } from 'react';
import { memoizedImport } from '@/lib/memoized-import';
import { LoaderCircle } from 'lucide-react';
import { m } from '@/paraglide/messages';

const loadAskRetaSurface = memoizedImport(() => import('./ask-reta-surface'));
const AskRetaSurfaceLazy = lazy(() => loadAskRetaSurface());

let askRetaWarmed = false;
export function preloadAskRetaSurface() {
  if (askRetaWarmed) return;
  askRetaWarmed = true;
  try {
    void loadAskRetaSurface().catch(() => {
      askRetaWarmed = false;
    });
  } catch {
    askRetaWarmed = false;
  }
}

function AskRetaLoadingFallback() {
  return (
    <div role="status" aria-live="polite" className="flex h-full items-center justify-center">
      <LoaderCircle aria-hidden="true" className="text-muted-foreground size-6 animate-spin" />
      <span className="sr-only">{m['common.askReta.thinking']()}</span>
    </div>
  );
}

/** Ask Reta content for the exclusive global workspace host. */
export function AskRetaWorkspace() {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <section
      ref={panelRef}
      role="complementary"
      aria-label={m['common.askReta.title']()}
      tabIndex={-1}
      className="bg-background dark:bg-panelDark flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
    >
      <span className="sr-only">{m['common.askReta.subtitle']()}</span>
      <Suspense fallback={<AskRetaLoadingFallback />}>
        <AskRetaSurfaceLazy />
      </Suspense>
    </section>
  );
}
