import { Archive, Copy, Maximize2, Minimize2, X, Reply, MoreVertical } from 'lucide-react';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export const MailListSkeleton = () => (
  <div role="status" aria-live="polite" className="w-full" aria-label="Loading inbox">
    <span className="sr-only">Loading inbox</span>
    {Array.from({ length: 6 }, (_, index) => (
      <div
        key={index}
        className="flex min-h-24 items-center gap-3 border-b px-4 py-3 md:mx-1 md:rounded-lg md:border-b-0"
      >
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    ))}
  </div>
);

export const MailDisplaySkeleton = ({ isFullscreen }: { isFullscreen?: boolean }) => {
  return (
    <>
      <div
        className={cn(
          'relative flex-1 overflow-hidden p-4',
          isFullscreen && 'h-[calc(100dvh-4rem)]',
        )}
      >
        <div className="relative inset-0 h-full overflow-y-auto pb-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-6 w-6" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-4">
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[95%]" />
              </div>
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-[88%]" />
                <Skeleton className="h-4 w-[92%]" />
                <Skeleton className="h-4 w-[85%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Separator />
      <div
        className={cn(
          'relative flex-1 overflow-hidden p-4',
          isFullscreen && 'h-[calc(100dvh-4rem)]',
        )}
      >
        <div className="relative inset-0 h-full overflow-y-auto pb-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-6 w-6" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-4">
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[95%]" />
              </div>
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-[88%]" />
                <Skeleton className="h-4 w-[92%]" />
                <Skeleton className="h-4 w-[85%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Separator />
      <div
        className={cn(
          'relative flex-1 overflow-hidden p-4',
          isFullscreen && 'h-[calc(100dvh-4rem)]',
        )}
      >
        <div className="relative inset-0 h-full overflow-y-auto pb-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-6 w-6" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-4">
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[95%]" />
              </div>
              <div className="flex flex-col space-y-2">
                <Skeleton className="h-4 w-[88%]" />
                <Skeleton className="h-4 w-[92%]" />
                <Skeleton className="h-4 w-[85%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/** Stable reply surface used by both lazy boundaries, so opening reply never paints blank. */
export const ReplyComposerSkeleton = () => (
  <div
    role="status"
    aria-live="polite"
    className="bg-background flex min-h-[18rem] w-full flex-col overflow-hidden rounded-2xl border"
  >
    <span className="sr-only">Loading composer</span>
    <div className="space-y-3 border-b p-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-20" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
    <div className="flex-1 space-y-2 p-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
    <div className="flex min-h-16 items-center justify-between gap-3 border-t p-3">
      <Skeleton className="h-11 w-28" />
      <Skeleton className="h-5 w-36" />
    </div>
  </div>
);

export const MailHeaderSkeleton = ({ isFullscreen }: { isFullscreen?: boolean }) => {
  return (
    <div className="flex items-center border-b p-[7px]">
      <div className="flex flex-1 items-center gap-2">
        <Button variant="ghost" className="md:h-fit md:px-2" disabled={true}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
        <Skeleton className="w-[150px] max-w-[300px] flex-1 truncate text-sm font-medium" />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="md:h-fit md:px-2" disabled={true}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="sr-only">{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</span>
        </Button>

        <Button variant="ghost" className="md:h-fit md:px-2" disabled={true}>
          <Copy className="h-4 w-4" />
          <span className="sr-only">Copy email data</span>
        </Button>
        <Button variant="ghost" className="md:h-fit md:px-2" disabled={true}>
          <Archive className="h-4 w-4" />
          <span className="sr-only">Archive</span>
        </Button>

        <Button variant="ghost" className="md:h-fit md:px-2" disabled={true}>
          <Reply className="h-4 w-4" />
          <span className="sr-only">Reply</span>
        </Button>
        <Button variant="ghost" className="md:h-fit md:px-2" disabled={true}>
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">More</span>
        </Button>
      </div>
    </div>
  );
};
