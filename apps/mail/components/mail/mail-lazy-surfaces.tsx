import { memoizedImport } from '@/lib/memoized-import';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { ThreadEmptyState } from './thread-display.empty-state';

// #44 (gate A8): the two heavy, interaction-gated panels of the mail surface, extracted from
// mail.tsx (which keeps only the calls, staying under its LOC ratchet budget). Both are
// dynamic-imported and only rendered when their query/thread state is truthy (a thread is open /
// pricing is open). Network behaviour (no fetch until interaction) is verified separately.
const loadThreadDisplay = memoizedImport(() => import('@/components/mail/thread-display'));
const ThreadDisplay = lazy(() => loadThreadDisplay().then((m) => ({ default: m.ThreadDisplay })));

// CUA 2026-07-31 : le shell optimiste d'ouverture (selectThreadShellRow) vit DANS
// ce chunk lazy — au premier fil de la session, sans warm, l'écran n'a que le
// spinner du fallback pendant le téléchargement du reader. Réchauffé à l'idle
// depuis app-sidebar (même cadence que preloadComposeSurface). memoizedImport
// se réarme sur rejet : un échec réseau transitoire ne pin pas le warm.
export function preloadThreadReader() {
  void loadThreadDisplay();
}

const PricingDialog = lazy(() =>
  import('../ui/pricing-dialog').then((m) => ({ default: m.PricingDialog })),
);

// Neutral loading pane shown while the reader chunk resolves after a thread is opened.
function ThreadReaderFallback() {
  return (
    <div role="status" aria-live="polite" className="flex h-full items-center justify-center">
      <Loader2 aria-hidden="true" className="text-muted-foreground h-5 w-5 animate-spin" />
      <span className="sr-only">Loading thread</span>
    </div>
  );
}

// Stable, visible, accessible modal backdrop shown while the pricing dialog chunk resolves.
function PricingDialogFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Loading pricing"
        className="flex h-40 w-80 items-center justify-center rounded-lg border bg-white shadow-lg dark:border-none dark:bg-[#1C1C1C]"
      >
        <Loader2 aria-hidden="true" className="text-muted-foreground h-6 w-6 animate-spin" />
        <span className="sr-only">Loading pricing</span>
      </div>
    </div>
  );
}

// Thread reading pane. When no thread is selected: the eager ThreadEmptyState (desktop, emptyOnNull)
// or nothing (mobile). When a thread is open: the lazily-loaded reader behind an accessible fallback.
export function ThreadReaderSurface({
  threadId,
  emptyOnNull,
}: {
  threadId: string | null;
  emptyOnNull: boolean;
}) {
  if (!threadId) return emptyOnNull ? <ThreadEmptyState /> : null;
  return (
    <Suspense fallback={<ThreadReaderFallback />}>
      <ThreadDisplay />
    </Suspense>
  );
}

// Pricing dialog. Mounted (and its chunk fetched) only while the pricing query state is truthy.
export function PricingDialogSurface({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <Suspense fallback={<PricingDialogFallback />}>
      <PricingDialog />
    </Suspense>
  );
}
