import { ChevronsLeft, ChevronsRight, LoaderCircle, Sparkles } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { memoizedImport } from '@/lib/memoized-import';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { createPortal } from 'react-dom';
import { useQueryState } from 'nuqs';

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

/**
 * Global, non-modal AI workspace. On desktop the authenticated shell reserves
 * its width, so the mailbox remains visible and interactive beside the chat.
 */
export function AskRetaWorkspace() {
  const [panelOpen, setPanelOpen] = useQueryState('isAskRetaOpen');
  const reopenRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (panelOpen) root.dataset.askRetaOpen = 'true';
    else delete root.dataset.askRetaOpen;
    return () => {
      delete root.dataset.askRetaOpen;
    };
  }, [panelOpen]);

  useEffect(() => {
    if (panelOpen) panelRef.current?.focus();
  }, [panelOpen]);

  const close = () => {
    setPanelOpen(null);
    requestAnimationFrame(() => reopenRef.current?.focus());
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {!panelOpen && (
        <Button
          ref={reopenRef}
          type="button"
          variant="outline"
          size="icon"
          className="bg-background/95 fixed right-3 top-3 z-40 hidden size-10 rounded-xl shadow-lg backdrop-blur-md sm:inline-flex"
          aria-label={m['common.askReta.reopen']()}
          title={m['common.askReta.reopen']()}
          onPointerEnter={preloadAskRetaSurface}
          onFocus={preloadAskRetaSurface}
          onClick={() => setPanelOpen('true')}
        >
          <ChevronsLeft className="size-4" />
        </Button>
      )}

      {!!panelOpen && (
        <aside
          ref={panelRef}
          role="complementary"
          aria-label={m['common.askReta.title']()}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          className="bg-background dark:bg-panelDark motion-safe:animate-in motion-safe:slide-in-from-right-4 fixed inset-0 z-40 flex flex-col overflow-hidden border-l shadow-xl outline-none motion-safe:duration-200 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[430px] sm:max-w-[95vw]"
        >
          <header className="border-border/70 flex h-12 shrink-0 items-center justify-between border-b px-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate text-sm font-medium">{m['common.askReta.title']()}</span>
              <span className="sr-only">{m['common.askReta.subtitle']()}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={m['common.askReta.collapse']()}
              title={m['common.askReta.collapse']()}
              onClick={close}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1">
            <Suspense fallback={<AskRetaLoadingFallback />}>
              <AskRetaSurfaceLazy />
            </Suspense>
          </div>
        </aside>
      )}
    </>,
    document.body,
  );
}
