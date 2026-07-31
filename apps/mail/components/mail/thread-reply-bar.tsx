import { Forward, Reply, ReplyAll } from '../icons/icons';
import { cn } from '@/lib/utils';

export type ThreadReplyMode = 'reply' | 'replyAll' | 'forward';

type ThreadReplyBarProps = {
  labels: Record<ThreadReplyMode, string>;
  onSelect: (mode: ThreadReplyMode) => void;
  onIntent?: () => void;
};

const shortcutByMode: Record<ThreadReplyMode, string> = {
  reply: 'r',
  replyAll: 'a',
  forward: 'f',
};

export function ThreadReplyBar({ labels, onSelect, onIntent }: ThreadReplyBarProps) {
  const actions = [
    { mode: 'replyAll' as const, Icon: ReplyAll, primary: true },
    { mode: 'reply' as const, Icon: Reply, primary: false },
    { mode: 'forward' as const, Icon: Forward, primary: false },
  ];

  return (
    <div
      data-testid="thread-reply-bar"
      data-always-visible="true"
      className="border-border bg-panelLight/95 dark:bg-panelDark/95 z-20 shrink-0 border-t px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl md:px-4 dark:shadow-[0_-8px_24px_rgba(0,0,0,0.22)]"
      onMouseEnter={onIntent}
      onFocus={onIntent}
    >
      <div className="flex items-center gap-2">
        {actions.map(({ mode, Icon, primary }) => (
          <button
            key={mode}
            type="button"
            aria-label={labels[mode]}
            onClick={() => onSelect(mode)}
            className={cn(
              'inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-[#313131] dark:text-white dark:hover:bg-[#404040]',
              primary && 'min-w-0 flex-1 justify-start px-4',
            )}
          >
            <Icon className="fill-muted-foreground h-4 w-4 shrink-0 dark:fill-[#9B9B9B]" />
            <span className={cn(!primary && 'hidden sm:inline')}>{labels[mode]}</span>
            <kbd className="bg-muted/70 ml-auto hidden h-6 min-w-6 items-center justify-center rounded-md px-1.5 font-mono text-xs font-normal md:inline-flex">
              {shortcutByMode[mode]}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
