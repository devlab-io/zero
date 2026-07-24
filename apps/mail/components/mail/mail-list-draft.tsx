import { useOptimisticThreadState } from '@/components/mail/optimistic-thread-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { type UseQueryResult } from '@tanstack/react-query';
import { cleanNameDisplay } from './mail-list-utils';
import type { ParsedDraft } from '@zero/types';
import { useDraft } from '@/hooks/use-drafts';
import { formatDate } from '@/lib/date-utils';
import { Skeleton } from '../ui/skeleton';
import { memo, useCallback } from 'react';
import { m } from '@/paraglide/messages';
import { Trash } from '../icons/icons';
import { Button } from '../ui/button';
import { useQueryState } from 'nuqs';
import { cn } from '@/lib/utils';

export const Draft = memo(({ message, index }: { message: { id: string }; index: number }) => {
  const draftQuery = useDraft(message.id) as UseQueryResult<ParsedDraft>;
  const draft = draftQuery.data;
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const [, setDraftId] = useQueryState('draftId');
  const { optimisticDeleteDraft } = useOptimisticActions();
  const optimisticState = useOptimisticThreadState(message.id);

  const handleMailClick = useCallback(() => {
    setComposeOpen('true');
    setDraftId(message.id);
    return;
  }, [message.id]);

  const handleDeleteDraft = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      optimisticDeleteDraft(message.id);
    },
    [message.id, optimisticDeleteDraft],
  );

  if (optimisticState.shouldHide) {
    return null;
  }

  if (!draft) {
    return (
      <div className="select-none py-1">
        <div
          key={message.id}
          className={cn(
            'group relative mx-[8px] flex cursor-pointer flex-col items-start overflow-clip rounded-[10px] border-transparent py-3 text-left text-sm',
          )}
        >
          <div
            className={cn(
              'bg-primary absolute inset-y-0 left-0 w-1 -translate-x-2 transition-transform ease-out',
            )}
          />
          <div className="flex w-full items-center justify-between gap-4 px-4">
            <div className="flex w-full justify-between">
              <div className="w-full">
                <div className="flex w-full flex-row items-center justify-between">
                  <div className="flex flex-row items-center gap-[4px]">
                    <Skeleton className="bg-muted h-4 w-32 rounded" />
                  </div>
                </div>
                <div className="flex justify-between">
                  <Skeleton className="bg-muted mt-1 h-4 w-48 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="select-none py-1" onClick={handleMailClick}>
      <div
        key={message.id}
        className={cn(
          'hover:bg-offsetLight dark:hover:bg-primary/5 group relative mx-[8px] flex cursor-pointer flex-col items-start overflow-visible rounded-[10px] border-transparent py-3 text-left text-sm hover:opacity-100',
        )}
      >
        <div
          className={cn(
            'dark:bg-panelDark shadow-xs absolute right-2 z-20 flex -translate-y-1/2 items-center gap-1 rounded-xl border bg-white p-1 opacity-0 group-hover:opacity-100',
            index === 0 ? 'top-4' : 'top-[-1px]',
          )}
          aria-busy={optimisticState.isRemoving}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-[#FDE4E9] dark:hover:bg-[#411D23] [&_svg]:size-3.5"
                aria-label="Delete draft"
                disabled={optimisticState.isRemoving}
                onClick={handleDeleteDraft}
              >
                <Trash className="fill-[#F43F5E]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side={index === 0 ? 'bottom' : 'top'}
              className="dark:bg-panelDark mb-1 bg-white"
            >
              {m['common.actions.Bin']()}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex w-full items-center justify-between gap-4 px-4">
          <div className="flex w-full justify-between">
            <div className="w-full">
              <div className="flex w-full flex-row items-center justify-between">
                <div className="flex flex-row items-center gap-[4px]">
                  <span
                    className={cn(
                      'font-medium',
                      'text-md flex items-baseline gap-1 group-hover:opacity-100',
                    )}
                  >
                    <span className={cn('max-w-[25ch] truncate text-sm')}>
                      {cleanNameDisplay(draft?.to?.[0] || 'No Recipient') || ''}
                    </span>
                  </span>
                </div>
                {draft.rawMessage?.internalDate && (
                  <p
                    className={cn(
                      'text-muted-foreground text-nowrap text-xs font-normal opacity-70 transition-opacity group-hover:opacity-100 dark:text-[#8C8C8C]',
                    )}
                  >
                    {formatDate(Number(draft.rawMessage?.internalDate))}
                  </p>
                )}
              </div>
              <div className="flex justify-between">
                <p
                  className={cn(
                    'mt-1 line-clamp-1 max-w-[50ch] text-sm text-[#8C8C8C] md:max-w-[30ch]',
                  )}
                >
                  {draft?.subject}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

Draft.displayName = 'Draft';
