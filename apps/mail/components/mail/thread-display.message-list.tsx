import type { QuotedMessageSelection, ThreadQuoteRequest } from '@/lib/thread-quote';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Attachment, ParsedMessage } from '@/types';
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
  /**
   * r15a : jalon `thread:content-painted` — transmis au SEUL dernier message
   * (le message actif, déplié par défaut) ; posé par MailContent après
   * injection réelle du corps traité + double rAF. La dédupe par fil vit dans
   * thread-display (markThreadStageOnce).
   */
  onContentPainted?: () => void;
  onQuoteSelection?: (selection: QuotedMessageSelection) => void;
  quoteRequest?: ThreadQuoteRequest | null;
  onQuoteInserted?: (id: string) => void;
}

export const MessageList = ({
  messages,
  isFullscreen,
  totalReplies,
  allThreadAttachments,
  mode,
  activeReplyId,
  isMobile,
  onContentPainted,
  onQuoteSelection,
  quoteRequest,
  onQuoteInserted,
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
              onContentPainted={isLastMessage ? onContentPainted : undefined}
              onQuoteSelection={onQuoteSelection}
            />
            {isReplyingToThisMessage && !isLastMessage && (
              <div className="px-4 py-2" id={`reply-composer-${message.id}`}>
                <Suspense fallback={null}>
                  <ReplyCompose
                    messageId={message.id}
                    quoteRequest={quoteRequest}
                    onQuoteInserted={onQuoteInserted}
                  />
                </Suspense>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </ScrollArea>
);
