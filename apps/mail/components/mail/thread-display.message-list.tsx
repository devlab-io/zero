import { ScrollArea } from '@/components/ui/scroll-area';
import type { Attachment, ParsedMessage } from '@/types';
import { ReplyComposerSkeleton } from './mail-skeleton';
import MailDisplay from './mail-display';
import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';

// #44 (gate A8): the reply composer statically pulls posthog-js (+ its own shell) into the
// critical inbox chunk. It only renders when the user is actively replying, so load it lazily;
// it resolves on reply-open via the Suspense boundary below. Its embedded editor was already
// lazy, so this adds only the composer shell to that same on-open resolution. The composer's
// own behaviour is unchanged.
const ReplyCompose = lazy(() => import('./reply-composer'));

// Thread message list, extracted verbatim from thread-display.tsx (behaviour unchanged).

interface MessageListProps {
  messages: ParsedMessage[];
  isFullscreen: boolean;
  totalReplies?: number;
  allThreadAttachments?: Attachment[];
  mode?: string;
  activeReplyId?: string;
  isMobile: boolean;
}

export const MessageList = ({
  messages,
  isFullscreen,
  totalReplies,
  allThreadAttachments,
  mode,
  activeReplyId,
  isMobile,
}: MessageListProps) => (
  <ScrollArea className={cn('flex-1', isMobile ? 'h-[calc(100%-1px)]' : 'h-full')} type="auto">
    <div className="pb-4">
      {(messages || []).map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const isReplyingToThisMessage = mode && activeReplyId === message.id;

        return (
          <div
            key={message.id}
            className={cn(
              'duration-200 motion-reduce:transition-none',
              index > 0 && 'border-border border-t',
            )}
          >
            <MailDisplay
              emailData={message}
              isFullscreen={isFullscreen}
              isMuted={false}
              isLoading={false}
              index={index}
              totalEmails={totalReplies}
              threadAttachments={index === 0 ? allThreadAttachments : undefined}
            />
            {isReplyingToThisMessage && !isLastMessage && (
              <div className="px-4 py-2" id={`reply-composer-${message.id}`}>
                <Suspense fallback={<ReplyComposerSkeleton />}>
                  <ReplyCompose messageId={message.id} />
                </Suspense>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </ScrollArea>
);
