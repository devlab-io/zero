import {
  buildQueueThreadContext,
  type QueueThreadContextView,
} from '@/components/queue/queue-thread-context-model';
import { MailOpen, Paperclip, RefreshCcw, Sparkles } from 'lucide-react';
import { useActiveConnection } from '@/hooks/use-connections';
import { MailContent } from '@/components/mail/mail-content';
import { useMemo, useState, type ReactNode } from 'react';
import type { ParsedMessage } from '@zero/types';
import { Button } from '@/components/ui/button';
import { useThread } from '@/hooks/use-threads';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';

/**
 * Fil source de la réponse Reta. Il reprend la structure de lecture de la
 * boîte mail : lignes plates, messages précédents repliés et dernier message
 * ouvert en pleine largeur. La rédaction reste le dernier élément du fil.
 */

const formatDate = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
};

const personLabel = (person: { name?: string; email: string }) => person.name || person.email;

const recipientLabel = (message: ParsedMessage) => {
  const recipients = [...message.to, ...(message.cc ?? [])].map(personLabel);
  if (!recipients.length) return '—';
  if (recipients.length <= 3) return recipients.join(', ');
  return `${recipients.slice(0, 3).join(', ')} +${recipients.length - 3}`;
};

export function QueueThreadContext({
  threadId,
  subject,
  classificationReason,
  className,
}: {
  threadId?: string | null;
  subject?: string | null;
  classificationReason?: string | null;
  className?: string;
}) {
  // Sans threadId, useThread retomberait sur le ?threadId= de l'URL et
  // afficherait un fil sans rapport : on désactive la requête et on ignore
  // toute donnée en cache dans ce cas.
  const hasThread = Boolean(threadId);
  const threadQuery = useThread(threadId ?? null, { enabled: hasThread });
  const { data: activeConnection } = useActiveConnection();
  const context = useMemo<QueueThreadContextView>(
    () =>
      buildQueueThreadContext(
        hasThread ? threadQuery.data?.messages : undefined,
        activeConnection?.email,
      ),
    [activeConnection?.email, hasThread, threadQuery.data?.messages],
  );
  const messageCount = context.earlier.length + (context.latest ? 1 : 0);
  const reason = classificationReason?.trim() || null;

  return (
    <section
      aria-label={m['queue.context.title']()}
      className={cn('border-border/70 min-w-0 border-b', className)}
    >
      <div className="border-border/70 border-b px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-base font-semibold sm:text-lg">
            {subject || context.latest?.subject || m['queue.item.untitled']()}
          </h2>
          {messageCount > 1 ? (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              [{messageCount}]
            </span>
          ) : null}
        </div>
        {reason ? (
          <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-xs leading-5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{reason}</span>
          </p>
        ) : null}
      </div>

      {!hasThread ? (
        <ContextNotice icon={<MailOpen className="h-5 w-5" />} title={m['queue.context.empty']()}>
          {m['queue.context.emptyDescription']()}
        </ContextNotice>
      ) : threadQuery.isLoading ? (
        <div aria-busy="true" className="divide-border/70 divide-y">
          <div className="h-16 animate-pulse bg-zinc-200/60 dark:bg-zinc-800/60" />
          <div className="h-48 animate-pulse bg-zinc-100/70 dark:bg-zinc-900/70" />
        </div>
      ) : threadQuery.isError ? (
        <ContextNotice
          icon={<MailOpen className="h-5 w-5" />}
          title={m['queue.context.loadFailed']()}
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => threadQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />
              {m['queue.refresh']()}
            </Button>
          }
        />
      ) : !context.latest ? (
        <ContextNotice icon={<MailOpen className="h-5 w-5" />} title={m['queue.context.empty']()}>
          {m['queue.context.emptyDescription']()}
        </ContextNotice>
      ) : (
        <ol className="divide-border/70 divide-y">
          {context.earlier.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
          <ThreadMessage message={context.latest} defaultExpanded />
        </ol>
      )}
    </section>
  );
}

function ContextNotice({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="text-muted-foreground text-xs leading-5">{children}</p> : null}
      {action}
    </div>
  );
}

function ThreadMessage({
  message,
  defaultExpanded = false,
}: {
  message: ParsedMessage;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const attachments = (message.attachments ?? []).filter((attachment) => attachment.filename);
  const html = message.decodedBody || message.processedHtml || message.body;
  const sender = personLabel(message.sender);

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="hover:bg-muted/35 focus-visible:bg-muted/35 flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left transition-colors focus-visible:outline-none sm:px-5"
      >
        <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {sender.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{sender}</span>
            <span className="text-muted-foreground shrink-0 text-[11px] underline underline-offset-2">
              {m['common.mailDisplay.details']()}
            </span>
          </span>
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {m['common.mailDisplay.to']()}: {recipientLabel(message)}
          </span>
        </span>
        <time
          className="text-muted-foreground shrink-0 text-right text-[11px] tabular-nums"
          dateTime={message.receivedOn}
        >
          {formatDate(message.receivedOn) ?? '—'}
        </time>
      </button>

      {expanded ? (
        <div className="border-border/50 border-t">
          <MailContent
            id={message.id}
            html={html}
            senderEmail={message.sender.email}
            senderName={message.sender.name}
          />
          {attachments.length > 0 ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 px-4 pb-4 pt-3 text-xs sm:px-5">
              <Paperclip className="h-3.5 w-3.5" />
              {attachments.map((attachment, index) => (
                <span
                  key={`${attachment.attachmentId || attachment.filename}-${index}`}
                  className="max-w-56 truncate rounded-md border px-2 py-1"
                >
                  {attachment.filename}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
