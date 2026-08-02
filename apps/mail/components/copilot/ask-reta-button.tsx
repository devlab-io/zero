import { preloadAskRetaSurface } from './ask-reta-workspace';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { m } from '@/paraglide/messages';
import { Sparkles } from 'lucide-react';
import { useQueryState } from 'nuqs';

export { preloadAskRetaSurface } from './ask-reta-workspace';

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
    </>
  );
}
