import {
  buildQueueThreadContext,
  type QueueThreadContextView,
} from '@/components/queue/queue-thread-context-model';
import {
  isSimpleQueueMessageHtml,
  queueMessageText,
} from '@/components/queue/queue-thread-message';
import { ChevronDown, ChevronRight, MailOpen, Paperclip, RefreshCcw, Sparkles } from 'lucide-react';
import { useActiveConnection } from '@/hooks/use-connections';
import { MailContent } from '@/components/mail/mail-content';
import { useMemo, useState, type ReactNode } from 'react';
import type { ParsedMessage } from '@zero/types';
import { Button } from '@/components/ui/button';
import { useThread } from '@/hooks/use-threads';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';

/**
 * Contexte source d'une réponse de la file : le fil auquel Reta répond,
 * rendu DANS le poste de travail — dernier message entrant mis en avant,
 * historique repliable dans la même vue. Lecture seule ; répondre se fait
 * dans l'éditeur adjacent, jamais ici.
 */

const formatDate = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
};

const htmlSnippet = (message: ParsedMessage) =>
  queueMessageText(message.decodedBody || message.processedHtml || message.body)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

export function QueueThreadContext({
  threadId,
  classificationReason,
  className,
}: {
  threadId?: string | null;
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
    <section aria-label={m['queue.context.title']()} className={cn('min-w-0', className)}>
      <div className="flex min-h-10 items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-muted-foreground truncate text-xs font-semibold uppercase tracking-wide">
            {m['queue.context.title']()}
          </h3>
        </div>
        {messageCount > 1 ? (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {m['queue.context.messageCount']({ count: messageCount })}
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        {reason ? (
          <p className="text-muted-foreground flex items-start gap-2 px-1 text-xs leading-5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="text-foreground font-medium">{m['queue.context.reason']()}</span> —{' '}
              {reason}
            </span>
          </p>
        ) : null}

        {!hasThread ? (
          <ContextNotice icon={<MailOpen className="h-5 w-5" />} title={m['queue.context.empty']()}>
            {m['queue.context.emptyDescription']()}
          </ContextNotice>
        ) : threadQuery.isLoading ? (
          <div aria-busy="true" className="space-y-2">
            <div className="h-16 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="h-40 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
          </div>
        ) : threadQuery.isError ? (
          <ContextNotice
            icon={<MailOpen className="h-5 w-5" />}
            title={m['queue.context.loadFailed']()}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => threadQuery.refetch()}
              >
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
          <>
            {context.earlier.length > 0 ? <EarlierMessages messages={context.earlier} /> : null}
            <LatestMessageCard message={context.latest} inbound={context.latestIsInbound} />
          </>
        )}
      </div>
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
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white/70 px-4 py-6 text-center dark:border-zinc-800 dark:bg-zinc-950/60">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="text-muted-foreground text-xs leading-5">{children}</p> : null}
      {action}
    </div>
  );
}

function LatestMessageCard({ message, inbound }: { message: ParsedMessage; inbound: boolean }) {
  const attachments = (message.attachments ?? []).filter((attachment) => attachment.filename);
  const html = message.decodedBody || message.processedHtml || message.body;
  const sender = message.sender.name || message.sender.email;

  return (
    <article className="bg-background overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
      <header className="flex items-start gap-3 px-4 pb-2.5 pt-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          {sender.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="truncate text-sm font-semibold">{sender}</p>
            {message.sender.name ? (
              <p className="text-muted-foreground hidden truncate text-xs sm:block">
                &lt;{message.sender.email}&gt;
              </p>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {message.subject || m['queue.context.title']()}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <time
            className="text-muted-foreground text-[11px] tabular-nums"
            dateTime={message.receivedOn}
          >
            {formatDate(message.receivedOn) ?? '—'}
          </time>
          <Badge
            variant="outline"
            className={cn(
              'h-5 px-1.5 text-[10px]',
              inbound
                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300'
                : 'text-muted-foreground',
            )}
          >
            {inbound ? m['queue.context.latestInbound']() : m['queue.context.latestFromYou']()}
          </Badge>
        </div>
      </header>
      <div className="px-4 pb-4 pt-1 sm:pl-16">
        {isSimpleQueueMessageHtml(html) ? (
          <div className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
            {queueMessageText(html)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <MailContent
              id={message.id}
              html={html}
              senderEmail={message.sender.email}
              senderName={message.sender.name}
            />
          </div>
        )}
      </div>
      {attachments.length > 0 ? (
        <footer className="text-muted-foreground flex flex-wrap items-center gap-1.5 border-t border-zinc-100 px-3 py-2 text-xs dark:border-zinc-900">
          <Paperclip className="h-3.5 w-3.5" />
          {attachments.map((attachment, index) => (
            <span
              key={`${attachment.attachmentId || attachment.filename}-${index}`}
              className="max-w-48 truncate rounded border px-1.5 py-0.5"
            >
              {attachment.filename}
            </span>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

function EarlierMessages({ messages }: { messages: ParsedMessage[] }) {
  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleMessage = (id: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open
          ? m['queue.context.hideHistory']()
          : m['queue.context.showHistory']({ count: messages.length })}
      </button>
      {open ? (
        <ol className="mt-2 space-y-1.5">
          {messages.map((message) => (
            <EarlierMessageRow
              key={message.id}
              message={message}
              expanded={expandedIds.has(message.id)}
              onToggle={() => toggleMessage(message.id)}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function EarlierMessageRow({
  message,
  expanded,
  onToggle,
}: {
  message: ParsedMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const html = message.decodedBody || message.processedHtml || message.body;

  return (
    <li className="bg-background overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
      >
        {expanded ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-semibold">
              {message.sender.name || message.sender.email}
            </span>
            <time
              className="text-muted-foreground shrink-0 text-[10px] tabular-nums"
              dateTime={message.receivedOn}
            >
              {formatDate(message.receivedOn) ?? '—'}
            </time>
          </span>
          {!expanded ? (
            <span className="text-muted-foreground mt-0.5 line-clamp-1 block text-xs">
              {htmlSnippet(message)}
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-900">
          {isSimpleQueueMessageHtml(html) ? (
            <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-200">
              {queueMessageText(html)}
            </div>
          ) : (
            <MailContent
              id={message.id}
              html={html}
              senderEmail={message.sender.email}
              senderName={message.sender.name}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}
