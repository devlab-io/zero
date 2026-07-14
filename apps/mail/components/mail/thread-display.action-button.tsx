import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Thread action button, extracted verbatim from thread-display.tsx.

export function ThreadActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            variant="ghost"
            className={cn('h-11 w-11 md:h-10 md:w-10 md:px-2', className)}
          >
            <Icon className="dark:fill-iconDark fill-iconLight" />
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        {/* <TooltipContent>{label}</TooltipContent> */}
      </Tooltip>
    </TooltipProvider>
  );
}
