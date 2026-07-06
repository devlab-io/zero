import {
  APPROVABLE_STATUSES,
  CANCELABLE_STATUSES,
  OUTBOX_STATUSES,
  getReviewPendingCount,
  getUndoSecondsRemaining,
  groupOutboxItemsByStatus,
  type OutboxStatus,
} from '@/components/queue/queue-view-model';
import { CheckCircle2, ExternalLink, RefreshCcw, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShortcuts } from '@/lib/hotkeys/use-hotkey-utils';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import type { Shortcut } from '@/config/shortcuts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router';
import { useQueryState } from 'nuqs';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type QueueItem = {
  id: string;
  connectionId: string;
  threadId?: string | null;
  mission?: string | null;
  status: OutboxStatus;
  gmailDraftId?: string | null;
  subject: string;
  body: string;
  scheduledSendAt?: Date | string | null;
  error?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type StatusFilter = OutboxStatus | 'all';

const statusTone: Record<OutboxStatus, string> = {
  queued: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300',
  generating:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  draft_ready:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  approved:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  sending:
    'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300',
  sent: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300',
  cancelled:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  failed:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
};

const statusLabels = (): Record<OutboxStatus, string> => ({
  queued: m['queue.status.queued'](),
  generating: m['queue.status.generating'](),
  draft_ready: m['queue.status.draftReady'](),
  approved: m['queue.status.approved'](),
  sending: m['queue.status.sending'](),
  sent: m['queue.status.sent'](),
  cancelled: m['queue.status.cancelled'](),
  failed: m['queue.status.failed'](),
});

const statusDescriptions = (): Record<OutboxStatus, string> => ({
  queued: m['queue.statusDescription.queued'](),
  generating: m['queue.statusDescription.generating'](),
  draft_ready: m['queue.statusDescription.draftReady'](),
  approved: m['queue.statusDescription.approved'](),
  sending: m['queue.statusDescription.sending'](),
  sent: m['queue.statusDescription.sent'](),
  cancelled: m['queue.statusDescription.cancelled'](),
  failed: m['queue.statusDescription.failed'](),
});

const formatDate = (value?: Date | string | null) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const getPreview = (body: string) =>
  body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function QueueReview() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [, setDraftId] = useQueryState('draftId');
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const { enableScope, disableScope } = useHotkeysContext();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [undoDeadlines, setUndoDeadlines] = useState<Record<string, Date | string>>({});
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    enableScope('queue');
    return () => disableScope('queue');
  }, [disableScope, enableScope]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const outboxQuery = useQuery(trpc.outbox.list.queryOptions({}));
  const items = (outboxQuery.data ?? []) as QueueItem[];

  const grouped = useMemo(() => groupOutboxItemsByStatus(items), [items]);
  const pendingReviewCount = getReviewPendingCount(grouped);
  const labels = statusLabels();
  const descriptions = statusDescriptions();

  const visibleStatuses = statusFilter === 'all' ? OUTBOX_STATUSES : [statusFilter];
  const visibleItems = useMemo(
    () => visibleStatuses.flatMap((status) => grouped[status]),
    [grouped, visibleStatuses],
  );
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedItemId(null);
      return;
    }

    if (!visibleItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(visibleItems[0]?.id ?? null);
    }
  }, [selectedItemId, visibleItems]);

  const invalidateOutbox = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.outbox.list.queryKey() });
  };

  const approveMutation = useMutation({
    mutationFn: (input: { id: string }) => trpcClient.outbox.approve.mutate(input),
    onSuccess: async (item) => {
      if (item?.scheduledSendAt) {
        setUndoDeadlines((current) => ({ ...current, [item.id]: item.scheduledSendAt! }));
      }
      toast.success(m['queue.actions.approved']());
      await invalidateOutbox();
    },
    onError: () => {
      toast.error(m['queue.actions.failed']());
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (input: { id: string }) => trpcClient.outbox.cancel.mutate(input),
    onSuccess: async (item) => {
      setUndoDeadlines((current) => {
        const next = { ...current };
        if (item?.id) delete next[item.id];
        return next;
      });
      toast.success(m['queue.actions.rejected']());
      await invalidateOutbox();
    },
    onError: () => {
      toast.error(m['queue.actions.failed']());
    },
  });

  const retryMutation = useMutation({
    mutationFn: (input: { id: string }) => trpcClient.outbox.retry.mutate(input),
    onSuccess: async () => {
      toast.success(m['queue.actions.retried']());
      await invalidateOutbox();
    },
    onError: () => {
      toast.error(m['queue.actions.failed']());
    },
  });

  const approveItem = async (item: QueueItem | null) => {
    if (!item) {
      toast.info(m['queue.noSelection']());
      return;
    }
    if (!APPROVABLE_STATUSES.has(item.status)) {
      toast.info(m['queue.actions.cannotApprove']());
      return;
    }
    await approveMutation.mutateAsync({ id: item.id });
  };

  const cancelItem = async (item: QueueItem | null) => {
    if (!item) {
      toast.info(m['queue.noSelection']());
      return;
    }
    if (!CANCELABLE_STATUSES.has(item.status) && !undoDeadlines[item.id]) {
      toast.info(m['queue.actions.cannotReject']());
      return;
    }
    await cancelMutation.mutateAsync({ id: item.id });
  };

  const openItem = (item: QueueItem | null) => {
    if (!item) {
      toast.info(m['queue.noSelection']());
      return;
    }
    if (item.gmailDraftId) {
      setDraftId(item.gmailDraftId);
      setComposeOpen('true');
      return;
    }
    if (item.threadId) {
      navigate(`/mail/inbox?threadId=${encodeURIComponent(item.threadId)}`);
      return;
    }
    toast.info(m['queue.actions.cannotOpen']());
  };

  const retryItem = async (item: QueueItem) => {
    await retryMutation.mutateAsync({ id: item.id });
  };

  const queueShortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: ['d'],
        action: 'approveSelected',
        type: 'single',
        description: m['queue.keyboardApprove'](),
        scope: 'queue',
      },
      {
        keys: ['a'],
        action: 'approveSelected',
        type: 'single',
        description: m['queue.keyboardApprove'](),
        scope: 'queue',
      },
      {
        keys: ['r'],
        action: 'rejectSelected',
        type: 'single',
        description: m['queue.keyboardReject'](),
        scope: 'queue',
      },
      {
        keys: ['f'],
        action: 'openSelected',
        type: 'single',
        description: m['queue.keyboardOpen'](),
        scope: 'queue',
      },
      {
        keys: ['h'],
        action: 'openSelected',
        type: 'single',
        description: m['queue.keyboardOpen'](),
        scope: 'queue',
      },
    ],
    [],
  );

  const shortcutHandlers = useMemo(
    () => ({
      approveSelected: () => {
        void approveItem(selectedItem);
      },
      rejectSelected: () => {
        void cancelItem(selectedItem);
      },
      openSelected: () => openItem(selectedItem),
    }),
    [selectedItem, undoDeadlines],
  );

  useShortcuts(queueShortcuts, shortcutHandlers, { scope: 'queue', preventDefault: true });

  const isMutating = approveMutation.isPending || cancelMutation.isPending || retryMutation.isPending;

  return (
    <section className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[#FAFAFA] text-zinc-950 dark:bg-[#141414] dark:text-zinc-50">
      <header className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">{m['queue.title']()}</h1>
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300">
                {m['queue.pendingForReview']({ count: pendingReviewCount })}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
              {m['queue.subtitle']()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {m['queue.keyboardTitle']()}
            </span>
            <ShortcutHint keys="D/A" label={m['queue.keyboardApprove']()} />
            <ShortcutHint keys="R" label={m['queue.keyboardReject']()} />
            <ShortcutHint keys="F/H" label={m['queue.keyboardOpen']()} />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <StatusFilterButton
            active={statusFilter === 'all'}
            count={items.length}
            label={m['queue.filterAll']()}
            onClick={() => setStatusFilter('all')}
          />
          {OUTBOX_STATUSES.map((status) => (
            <StatusFilterButton
              key={status}
              active={statusFilter === status}
              count={grouped[status].length}
              label={labels[status]}
              onClick={() => setStatusFilter(status)}
            />
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
        {outboxQuery.isLoading ? (
          <StateMessage title={m['queue.loading']()} />
        ) : outboxQuery.error ? (
          <StateMessage
            title={m['queue.errorTitle']()}
            action={
              <Button variant="outline" size="sm" onClick={() => outboxQuery.refetch()}>
                <RefreshCcw className="h-4 w-4" />
                {m['queue.refresh']()}
              </Button>
            }
          />
        ) : visibleItems.length === 0 ? (
          <StateMessage
            title={m['queue.emptyTitle']()}
            description={m['queue.emptyDescription']()}
          />
        ) : (
          visibleStatuses.map((status) => {
            const statusItems = grouped[status];
            if (!statusItems.length) return null;

            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('border', statusTone[status])}>
                    {labels[status]}
                  </Badge>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {descriptions[status]}
                  </span>
                </div>
                <div className="grid gap-2">
                  {statusItems.map((item) => (
                    <QueueItemRow
                      key={item.id}
                      item={item}
                      displayStatus={undoDeadlines[item.id] ? 'approved' : item.status}
                      isSelected={item.id === selectedItemId}
                      isMutating={isMutating}
                      now={now}
                      undoDeadline={undoDeadlines[item.id]}
                      onApprove={() => approveItem(item)}
                      onCancel={() => cancelItem(item)}
                      onOpen={() => openItem(item)}
                      onRetry={() => retryItem(item)}
                      onSelect={() => setSelectedItemId(item.id)}
                      statusLabel={labels[undoDeadlines[item.id] ? 'approved' : item.status]}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function StatusFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900',
      )}
    >
      <span>{label}</span>
      <span className="rounded-full bg-current/10 px-1.5 text-xs">{count}</span>
    </button>
  );
}

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
      <kbd className="font-mono text-[11px] font-semibold">{keys}</kbd>
      <span>{label}</span>
    </span>
  );
}

function StateMessage({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-zinc-300 bg-white/70 px-4 text-center dark:border-zinc-800 dark:bg-zinc-950/60">
      <div>
        <p className="font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
        {description ? (
          <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function QueueItemRow({
  item,
  displayStatus,
  isSelected,
  isMutating,
  now,
  undoDeadline,
  onApprove,
  onCancel,
  onOpen,
  onRetry,
  onSelect,
  statusLabel,
}: {
  item: QueueItem;
  displayStatus: OutboxStatus;
  isSelected: boolean;
  isMutating: boolean;
  now: Date;
  undoDeadline?: Date | string;
  onApprove: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onRetry: () => void;
  onSelect: () => void;
  statusLabel: string;
}) {
  const countdownItem = {
    ...item,
    status: displayStatus,
    scheduledSendAt: undoDeadline ?? item.scheduledSendAt,
  };
  const undoSeconds = getUndoSecondsRemaining(countdownItem, now);
  const preview = getPreview(item.body);
  const createdAt = formatDate(item.createdAt);
  const updatedAt = formatDate(item.updatedAt);
  const scheduledAt = formatDate(undoDeadline ?? item.scheduledSendAt);
  const canApprove = APPROVABLE_STATUSES.has(item.status);
  const canCancel = CANCELABLE_STATUSES.has(item.status) || undoSeconds > 0;
  const canOpen = !!item.gmailDraftId || !!item.threadId;

  return (
    <article
      className={cn(
        'rounded-md border bg-white p-4 shadow-sm transition-colors dark:bg-zinc-950',
        isSelected
          ? 'border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100'
          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700',
      )}
      onFocus={onSelect}
      onMouseDown={onSelect}
      tabIndex={0}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('border', statusTone[displayStatus])}>
              {statusLabel}
            </Badge>
            {isSelected ? (
              <Badge variant="outline" className="border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                {m['queue.selected']()}
              </Badge>
            ) : null}
            {undoSeconds > 0 ? (
              <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-500/40 dark:text-blue-300">
                {m['queue.item.undoCountdown']({ seconds: undoSeconds })}
              </Badge>
            ) : null}
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {item.subject || m['queue.item.untitled']()}
            </h2>
            {preview ? (
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {preview}
              </p>
            ) : null}
          </div>

          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {item.threadId ? (
              <MetaItem label={m['queue.item.thread']()} value={item.threadId} />
            ) : null}
            {item.gmailDraftId ? (
              <MetaItem label={m['queue.item.draftId']()} value={item.gmailDraftId} />
            ) : null}
            {item.mission ? <MetaItem label={m['queue.item.mission']()} value={item.mission} /> : null}
            {createdAt ? <MetaItem label={m['queue.item.created']()} value={createdAt} /> : null}
            {updatedAt ? <MetaItem label={m['queue.item.updated']()} value={updatedAt} /> : null}
            {scheduledAt ? <MetaItem label={m['queue.item.scheduled']()} value={scheduledAt} /> : null}
          </dl>

          {item.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <span className="font-medium">{m['queue.item.error']()}:</span> {item.error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            disabled={!canApprove || isMutating}
          >
            <CheckCircle2 className="h-4 w-4" />
            {m['queue.actions.approve']()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={!canCancel || isMutating}
          >
            <XCircle className="h-4 w-4" />
            {m['queue.actions.reject']()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpen}
            disabled={!canOpen || isMutating}
          >
            <ExternalLink className="h-4 w-4" />
            {m['queue.actions.open']()}
          </Button>
          {item.status === 'failed' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isMutating}
            >
              <RotateCcw className="h-4 w-4" />
              {m['queue.actions.retry']()}
            </Button>
          ) : null}
          {undoSeconds > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onCancel}
              disabled={isMutating}
            >
              <Undo2 className="h-4 w-4" />
              {m['queue.actions.undo']()}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <dt className="shrink-0 font-medium text-zinc-600 dark:text-zinc-300">{label}:</dt>
      <dd className="max-w-[18rem] truncate">{value}</dd>
    </div>
  );
}
