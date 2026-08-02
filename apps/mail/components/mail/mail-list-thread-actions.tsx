import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Archive2, ExclamationCircle, Star2, Trash } from '../icons/icons';
import { type ThreadDestination } from '@/lib/thread-actions';
import { m } from '@/paraglide/messages';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface ThreadHoverActionsProps {
  index?: number;
  displayStarred: boolean;
  displayImportant: boolean;
  isFolderBin: boolean;
  onToggleStar: (e: React.MouseEvent) => void;
  onToggleImportant: (e: React.MouseEvent) => void;
  moveThreadTo: (destination: ThreadDestination) => void;
}

/**
 * The star / important / archive / bin quick-action bar that appears on row hover.
 * Pure presentational leaf extracted verbatim from the Thread row — no state, no
 * memo boundary (so it re-renders exactly when the row's content does).
 */
export function ThreadHoverActions({
  index,
  displayStarred,
  displayImportant,
  isFolderBin,
  onToggleStar,
  onToggleImportant,
  moveThreadTo,
}: ThreadHoverActionsProps) {
  return (
    <div
      className={cn(
        'dark:bg-panelDark z-25 pointer-events-none absolute right-2 flex -translate-y-1/2 items-center gap-1 rounded-xl border bg-white p-1 opacity-0 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100',
        index === 0 ? 'top-4' : 'top-[-1px]',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              displayStarred ? m['common.threadDisplay.unstar']() : m['common.threadDisplay.star']()
            }
            className="h-6 w-6 overflow-visible [&_svg]:size-3.5"
            onClick={onToggleStar}
          >
            <Star2
              className={cn(
                'h-4 w-4',
                displayStarred
                  ? 'fill-yellow-400 stroke-yellow-400'
                  : 'fill-transparent stroke-[#9D9D9D] dark:stroke-[#9D9D9D]',
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side={index === 0 ? 'bottom' : 'top'}
          className="mb-1 bg-white dark:bg-[#1A1A1A]"
        >
          {displayStarred ? m['common.threadDisplay.unstar']() : m['common.threadDisplay.star']()}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m['common.mail.toggleImportant']()}
            className={cn(
              'h-6 w-6 [&_svg]:size-3.5',
              displayImportant ? 'hover:bg-orange-200/70 dark:hover:bg-orange-800/40' : '',
            )}
            onClick={onToggleImportant}
          >
            <ExclamationCircle
              className={cn(displayImportant ? 'fill-orange-400' : 'fill-[#9D9D9D]')}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side={index === 0 ? 'bottom' : 'top'}
          className="dark:bg-panelDark mb-1 bg-white"
        >
          {m['common.mail.toggleImportant']()}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m['common.threadDisplay.archive']()}
            className="h-6 w-6 [&_svg]:size-3.5"
            onClick={(e) => {
              e.stopPropagation();
              moveThreadTo('archive');
            }}
          >
            <Archive2 className="fill-[#9D9D9D]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side={index === 0 ? 'bottom' : 'top'}
          className="dark:bg-panelDark mb-1 bg-white"
        >
          {m['common.threadDisplay.archive']()}
        </TooltipContent>
      </Tooltip>
      {!isFolderBin ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={m['common.actions.Bin']()}
              className="h-6 w-6 hover:bg-[#FDE4E9] dark:hover:bg-[#411D23] [&_svg]:size-3.5"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                moveThreadTo('bin');
              }}
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
      ) : null}
    </div>
  );
}
