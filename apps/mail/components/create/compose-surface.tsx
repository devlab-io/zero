import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// #44 (gate A8): the compose surface (CreateEmail, which statically pulled posthog-js + its shell)
// isolated in its own sibling so app-sidebar pulls ONLY these compose bits into the critical chunk —
// not the mail-page reader/pricing surfaces. CreateEmail is dynamic-imported and only rendered
// inside the compose DialogContent (Radix mounts it when the dialog opens), behind an accessible
// fallback. create-email itself is unchanged.
const CreateEmail = lazy(() =>
  import('./create-email').then((m) => ({ default: m.CreateEmail })),
);

// Full, stable, accessible fallback while the compose chunk resolves inside the full-screen compose
// DialogContent — a centred named spinner (not an empty layout).
function ComposeLoadingFallback() {
  return (
    <div role="status" aria-live="polite" className="flex h-full w-full items-center justify-center">
      <Loader2 aria-hidden="true" className="text-muted-foreground h-6 w-6 animate-spin" />
      <span className="sr-only">Loading composer</span>
    </div>
  );
}

export function ComposeSurface() {
  return (
    <Suspense fallback={<ComposeLoadingFallback />}>
      <CreateEmail />
    </Suspense>
  );
}
