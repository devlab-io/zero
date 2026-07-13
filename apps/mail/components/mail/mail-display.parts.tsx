import { Markdown } from '@react-email/components';
import { ChevronDown } from '../icons/icons';
import { TextShimmer } from '../ui/text-shimmer';
import { useSummary } from '@/hooks/use-summary';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Small presentational parts (AI summary card, action button), extracted
// verbatim from mail-display.tsx (behaviour unchanged).

export const AiSummary = () => {
  const [threadId] = useQueryState('threadId');
  const { data: summary, isLoading } = useSummary(threadId ?? null);
  const [showSummary, setShowSummary] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSummary(!showSummary);
  };

  if (isLoading) return null;
  if (!summary?.data.short?.length) return null;

  return (
    <div
      className="mt-2 max-w-3xl rounded-xl border border-[#8B5CF6] bg-white px-4 py-2 dark:bg-[#252525]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex cursor-pointer items-center" onClick={handleToggle}>
        <TextShimmer className="text-xs font-medium text-[#929292]">Summary</TextShimmer>

        {!isLoading && (
          <ChevronDown
            className={`ml-1 h-2.5 w-2.5 fill-[#929292] transition-transform ${showSummary ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      {showSummary && (
        <Markdown markdownContainerStyles={{ fontSize: 15 }}>{summary?.data.short || ''}</Markdown>
      )}
    </div>
  );
};

export type ActionButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  text: string;
  shortcut?: string;
};

export const ActionButton = ({ onClick, icon, text, shortcut }: ActionButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md border bg-white px-1.5 dark:border-none dark:bg-[#313131] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#3d3d3d] transition-colors"
    >
      {icon}
      <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
        <div className="justify-start text-sm leading-none text-black dark:text-white">{text}</div>
      </div>
      {shortcut && (
        <kbd
          className={cn(
            'border-muted-foreground/10 bg-accent h-6 rounded-[6px] border px-1.5 font-mono text-xs leading-6',
            '-me-1 ms-auto hidden max-h-full items-center md:inline-flex',
          )}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
};
