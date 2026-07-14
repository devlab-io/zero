import { useAISidebar } from '@/components/ui/use-ai-sidebar';
import { EmptyStateIcon } from '../icons/empty-state-svg';
import { useIsMobile } from '@/hooks/use-mobile';
import { Mail, Sparkles } from '../icons/icons';
import { useQueryState } from 'nuqs';
import { cn } from '@/lib/utils';

// #44 (gate A8): the inbox "no thread selected" empty state, extracted so it renders EAGERLY
// while the heavy thread reader (ThreadDisplay + MailDisplay/message-list/reply-composer/…) is
// loaded lazily only when a thread is opened (threadId set) — see mail.tsx. The wrapper and the
// content mirror the previous no-selection branch of thread-display.tsx (isFullscreen was a
// const false there, so it is dropped here).
export function ThreadEmptyState() {
  const isMobile = useIsMobile();
  const { toggleOpen: toggleAISidebar } = useAISidebar();
  const [, setIsComposeOpen] = useQueryState('isComposeOpen');

  return (
    <div className={cn('flex flex-col', isMobile ? 'h-full' : 'h-[calc(100dvh-19px)] rounded-xl')}>
      <div
        className={cn(
          'bg-panelLight dark:bg-panelDark relative flex h-full flex-col overflow-hidden rounded-xl duration-300',
          !isMobile && 'rounded-r-lg',
        )}
      >
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <EmptyStateIcon width={200} height={200} />
            <div className="mt-4">
              <p className="text-lg">It&apos;s empty here</p>
              <p className="text-md text-muted-foreground dark:text-white/50">
                Choose an email to view details
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 xl:grid-cols-2">
                <button
                  onClick={toggleAISidebar}
                  className="inline-flex h-7 cursor-pointer items-center justify-center gap-0.5 overflow-hidden rounded-lg border bg-white px-2 transition-colors hover:bg-gray-100 dark:border-none dark:bg-[#313131] dark:hover:bg-[#404040]"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5 fill-[#959595]" />
                  <div className="flex items-center justify-center gap-2.5 px-0.5">
                    <div className="text-base-gray-950 justify-start text-sm leading-none">
                      Zero chat
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setIsComposeOpen('true')}
                  className="inline-flex h-7 cursor-pointer items-center justify-center gap-0.5 overflow-hidden rounded-lg border bg-white px-2 transition-colors hover:bg-gray-100 dark:border-none dark:bg-[#313131] dark:hover:bg-[#404040]"
                >
                  <Mail className="mr-1 h-3.5 w-3.5 fill-[#959595]" />
                  <div className="flex items-center justify-center gap-2.5 px-0.5">
                    <div className="dark:text-base-gray-950 justify-start text-sm leading-none">
                      Send email
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
