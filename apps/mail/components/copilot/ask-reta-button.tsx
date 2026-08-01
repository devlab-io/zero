import { lazy, Suspense, useEffect, useRef } from 'react';
import { LoaderCircle, Sparkles, X } from 'lucide-react';
import { memoizedImport } from '@/lib/memoized-import';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { m } from '@/paraglide/messages';
import { createPortal } from 'react-dom';
import { useQueryState } from 'nuqs';

// Ask Reta entry (spec docs/spec/mail-copilot.md, slice 1 — géométrie P8).
// nuqs-backed lazy surface warmed on intent — the copilot chunk never enters
// the critical sidebar bundle (gate A8 posture).
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

/**
 * P8 : le panneau Ask Reta est un VRAI panneau latéral NON-MODAL et
 * persistant — pas un Dialog. L'app reste interactive pendant qu'il est
 * ouvert : naviguer entre fils/dossiers/brouillons met à jour EN DIRECT le
 * contexte du panneau (la surface lit threadId/draftId/replyId via l'URL et
 * borne déjà chaque lecture par l'ACL serveur). La surface interne est
 * INCHANGÉE : purge par scope, cache de conversations, citations et
 * propositions gardent leur sémantique — seule la géométrie change.
 * Escape ferme quand le focus est DANS le panneau (non-modal : pas de vol
 * d'Escape global, pas de focus trap).
 */
function AskRetaSidePanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={m['common.askReta.title']()}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="bg-background dark:bg-panelDark motion-safe:animate-in motion-safe:slide-in-from-right-4 fixed inset-0 z-40 flex flex-col overflow-hidden border-l border-[#E7E7E7] shadow-xl outline-none motion-safe:duration-200 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[430px] sm:max-w-[95vw] dark:border-[#252525]"
    >
      <div className="flex items-center justify-between border-b border-[#E7E7E7] px-3 py-2 dark:border-[#252525]">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-sm font-medium">{m['common.askReta.title']()}</span>
          <span className="sr-only">{m['common.askReta.subtitle']()}</span>
        </div>
        <button
          type="button"
          aria-label={m['common.actions.close']()}
          onClick={onClose}
          className="hover:bg-muted-foreground/10 flex h-7 w-7 items-center justify-center rounded-md transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<AskRetaLoadingFallback />}>
          <AskRetaSurfaceLazy />
        </Suspense>
      </div>
    </aside>,
    document.body,
  );
}

export function AskRetaButton() {
  const { state } = useSidebar();
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useQueryState('isAskRetaOpen');

  return (
    <>
      <button
        type="button"
        aria-expanded={!!panelOpen}
        onPointerEnter={preloadAskRetaSurface}
        onFocus={preloadAskRetaSurface}
        onClick={() => setPanelOpen(panelOpen ? null : 'true')}
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

      {!!panelOpen && <AskRetaSidePanel onClose={() => setPanelOpen(null)} />}
    </>
  );
}
