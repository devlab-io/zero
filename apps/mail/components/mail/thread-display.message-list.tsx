import type { Attachment, ParsedMessage } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { lazy, Suspense } from 'react';
import MailDisplay from './mail-display';
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
          // CUA 2026-07-30 (obs 6) : le clic sur un fil coûtait ~426 ms de frame de
          // présentation (layout/paint, 1 ms de JS). content-visibility:auto laisse le
          // navigateur sauter layout+paint des messages hors viewport au premier rendu
          // du fil ; contain-intrinsic-size réserve une hauteur stable pour éviter les
          // sauts d'ancre de scroll. Les corps de mail sont sanitisés/isolés — pas de
          // descendant `position:fixed` à repositionner.
          <div
            key={message.id}
            className={cn(
              'duration-200 [contain-intrinsic-size:auto_500px] [content-visibility:auto]',
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
                <Suspense fallback={null}>
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
