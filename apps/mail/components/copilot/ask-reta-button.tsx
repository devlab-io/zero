import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { memoizedImport } from '@/lib/memoized-import';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { m } from '@/paraglide/messages';
import { lazy, Suspense } from 'react';
import { useQueryState } from 'nuqs';

// Ask Reta entry (spec docs/spec/mail-copilot.md, slice 1). Mirrors the
// ComposeButton pattern: nuqs-backed dialog + lazy surface warmed on intent —
// the copilot chunk never enters the critical sidebar bundle (gate A8 posture).
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
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full items-center justify-center"
    >
      <LoaderCircle aria-hidden="true" className="text-muted-foreground h-6 w-6 animate-spin" />
      <span className="sr-only">{m['common.askReta.thinking']()}</span>
    </div>
  );
}

export function AskRetaButton() {
  const { state } = useSidebar();
  const isMobile = useIsMobile();
  const [dialogOpen, setDialogOpen] = useQueryState('isAskRetaOpen');

  return (
    <Dialog open={!!dialogOpen} onOpenChange={(open) => setDialogOpen(open ? 'true' : null)}>
      <DialogTrigger asChild>
        <button
          type="button"
          onPointerEnter={preloadAskRetaSurface}
          onFocus={preloadAskRetaSurface}
          className="hover:bg-muted-foreground/10 bg-background relative inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1 self-stretch overflow-hidden rounded-lg border border-gray-200 transition-colors dark:border-none dark:bg-[#313131]"
        >
          {state === 'collapsed' && !isMobile ? (
            <Sparkles className="h-4 w-4" aria-label={m['common.askReta.open']()} />
          ) : (
            <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <div className="justify-start text-sm leading-none">{m['common.askReta.open']()}</div>
            </div>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="flex h-[85dvh] w-[95vw] max-w-2xl flex-col overflow-hidden border p-0 shadow-lg sm:h-[80vh] sm:w-full">
        {/* Non-empty a11y title/description, visually hidden (the panel renders its own header). */}
        <DialogTitle className="sr-only">{m['common.askReta.title']()}</DialogTitle>
        <DialogDescription className="sr-only">{m['common.askReta.subtitle']()}</DialogDescription>
        <Suspense fallback={<AskRetaLoadingFallback />}>
          <AskRetaSurfaceLazy />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
