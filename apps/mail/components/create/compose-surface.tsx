import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { loadGitHubEmojis } from '@/lib/emoji-data';
import { memoizedImport } from '@/lib/memoized-import';

// #44 (gate A8): the compose surface (CreateEmail, which statically pulled posthog-js + its shell)
// isolated in its own sibling so app-sidebar pulls ONLY these compose bits into the critical chunk —
// not the mail-page reader/pricing surfaces. CreateEmail is dynamic-imported and only rendered
// inside the compose DialogContent (Radix mounts it when the dialog opens), behind an accessible
// fallback. create-email itself is unchanged.
// Single dynamic-import invocation shared by React.lazy and preloadComposeSurface — the
// memoized promise means the chunk is requested once whichever caller fires first, and
// concurrent first-time imports (which race test-time mock interception) cannot happen.
// The memoizer resets on rejection, so a transient warm failure never pins a dead promise
// onto a later lazy render (revue Codex 2026-07-30).
const loadCreateEmail = memoizedImport(() => import('./create-email'));
const CreateEmail = lazy(() => loadCreateEmail().then((m) => ({ default: m.CreateEmail })));

// CUA 2026-07-30: the `c` hotkey opens compose with no hover intent, so the cold chunk
// waterfall (create-email → email-composer + emoji JSON, two sequential lazy layers) showed
// a 0.84 s spinner. Warming is runtime-only prefetch — the static graph and gate A8 chunk
// isolation are unchanged; callers fire it on idle or at keydown, never via static import.
let composeWarmed = false;
export function preloadComposeSurface() {
  if (composeWarmed) return;
  composeWarmed = true;
  // Best-effort warm: it must never break its caller (the `c` open path). A failed fetch
  // rejects the promise; some environments (vitest module runner) can even throw the
  // dynamic import synchronously — both are swallowed and the warm re-armed for retry.
  try {
    void Promise.all([loadCreateEmail(), import('./email-composer'), loadGitHubEmojis()]).catch(
      () => {
        composeWarmed = false;
      },
    );
  } catch {
    composeWarmed = false;
  }
}

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
