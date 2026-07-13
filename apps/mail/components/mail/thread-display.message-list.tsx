import type { Attachment, ParsedMessage } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReplyCompose from './reply-composer';
import MailDisplay from './mail-display';
import { cn } from '@/lib/utils';

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
            className={cn('duration-200', index > 0 && 'border-border border-t')}
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
                <ReplyCompose messageId={message.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </ScrollArea>
);
