import {
  APPROVABLE_STATUSES,
  CANCELABLE_STATUSES,
  OUTBOX_STATUSES,
  getReviewPendingCount,
  getUndoSecondsRemaining,
  groupOutboxItemsByStatus,
  type OutboxStatus,
} from '@/components/queue/queue-view-model';
import {
  buildQueueItemAccessibleName,
  clearQueueItemPending,
  setQueueItemPending,
} from './queue-review.logic';
import { CheckCircle2, ExternalLink, RefreshCcw, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveQueueSelectionId } from '@/lib/hotkeys/queue-navigation';
import { QUEUE_HANDLED_ACTIONS } from '@/lib/hotkeys/handler-manifest';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { enhancedKeyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from '@/lib/hotkeys/use-hotkey-utils';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
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
type QueuePendingAction = 'approve' | 'cancel' | 'retry';

const statusTone: Record<OutboxStatus, string> = {
  queued:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300',
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
  const [pendingItems, setPendingItems] = useState<Record<string, QueuePendingAction>>({});
  const pendingItemIdsRef = useRef(new Set<string>());
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

  const runItemAction = async (
    itemId: string,
    action: QueuePendingAction,
    mutation: () => Promise<unknown>,
  ) => {
    if (pendingItemIdsRef.current.has(itemId)) return;
    pendingItemIdsRef.current.add(itemId);
    setPendingItems((current) => setQueueItemPending(current, itemId, action));
    try {
      await mutation();
    } catch {
      // The mutation's onError owns the user-facing message.
    } finally {
      pendingItemIdsRef.current.delete(itemId);
      setPendingItems((current) => clearQueueItemPending(current, itemId));
    }
  };

  const approveMutation = useMutation({
    mutationFn: (input: { id: string }) => trpcClient.outbox.approve.mutate(input),
    onSuccess: async (item) => {
      if (item?.scheduledSendAt) {
        const scheduledSendAt = item.scheduledSendAt;
        setUndoDeadlines((current) => ({ ...current, [item.id]: scheduledSendAt }));
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
    await runItemAction(item.id, 'approve', () => approveMutation.mutateAsync({ id: item.id }));
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
    await runItemAction(item.id, 'cancel', () => cancelMutation.mutateAsync({ id: item.id }));
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
    await runItemAction(item.id, 'retry', () => retryMutation.mutateAsync({ id: item.id }));
  };

  const queueShortcuts = enhancedKeyboardShortcuts.filter((shortcut) => shortcut.scope === 'queue');

  const focusQueueItem = useCallback((itemId: string | null) => {
    if (!itemId) return;
    requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('[data-queue-item-id]')).find(
        (element) => element.dataset.queueItemId === itemId,
      );
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    });
  }, []);

  const moveSelection = useCallback(
    (direction: 'next' | 'previous') => {
      const nextId = resolveQueueSelectionId(visibleItems, selectedItemId, direction);
      setSelectedItemId(nextId);
      focusQueueItem(nextId);
    },
    [focusQueueItem, selectedItemId, visibleItems],
  );

  const shortcutHandlers: Record<(typeof QUEUE_HANDLED_ACTIONS)[number], () => void> =
    useMemo(() => {
      const isOnRowAction = () =>
        document.activeElement instanceof HTMLElement &&
        !!document.activeElement.closest('button, a, summary, [role="button"]');

      return {
        focusNext: () => {
          if (!isOnRowAction()) moveSelection('next');
        },
        focusPrevious: () => {
          if (!isOnRowAction()) moveSelection('previous');
        },
        approveSelected: () => {
          void approveItem(selectedItem);
        },
        rejectSelected: () => {
          void cancelItem(selectedItem);
        },
        openSelected: () => {
          if (!isOnRowAction()) openItem(selectedItem);
        },
      };
    }, [moveSelection, selectedItem, undoDeadlines]);

  useShortcuts(queueShortcuts, shortcutHandlers, { scope: 'queue', preventDefault: true });

  return (
    <section className="bg-background text-foreground flex h-[100dvh] min-w-0 flex-1 flex-col overflow-x-hidden">
      <header className="border-b border-zinc-200/80 px-4 py-4 sm:px-6 dark:border-zinc-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">{m['queue.title']()}</h1>
              <Badge
                variant="outline"
                className="border-emerald-300 tabular-nums text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
              >
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
            <ShortcutHint keys="J/K · ↑/↓" label={m['queue.keyboardMove']()} />
            <ShortcutHint keys="↵/Space" label={m['queue.keyboardActivate']()} />
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
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-10"
                onClick={() => outboxQuery.refetch()}
              >
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
                      pendingAction={pendingItems[item.id]}
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
      {selectedItem ? (
        <QueueMobileActions
          item={selectedItem}
          pendingAction={pendingItems[selectedItem.id]}
          undoAvailable={!!undoDeadlines[selectedItem.id]}
          onApprove={() => void approveItem(selectedItem)}
          onCancel={() => void cancelItem(selectedItem)}
          onOpen={() => openItem(selectedItem)}
          onRetry={() => void retryItem(selectedItem)}
        />
      ) : null}
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
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition-colors sm:h-10',
        active
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900',
      )}
    >
      <span>{label}</span>
      <span className="bg-current/10 rounded-full px-1.5 text-xs tabular-nums">{count}</span>
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
  pendingAction,
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
  pendingAction?: QueuePendingAction;
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
      data-queue-item-id={item.id}
      aria-label={buildQueueItemAccessibleName({
        subject: item.subject,
        fallbackSubject: m['queue.item.untitled'](),
        status: statusLabel,
      })}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'bg-background min-w-0 rounded-lg border p-4 shadow-sm transition-colors',
        isSelected
          ? 'border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100'
          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700',
      )}
      onFocus={onSelect}
      onMouseDown={onSelect}
      tabIndex={isSelected ? 0 : -1}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('border', statusTone[displayStatus])}>
              {statusLabel}
            </Badge>
            {isSelected ? (
              <Badge
                variant="outline"
                className="border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                {m['queue.selected']()}
              </Badge>
            ) : null}
            {undoSeconds > 0 ? (
              <Badge
                variant="outline"
                className="border-blue-300 tabular-nums text-blue-700 dark:border-blue-500/40 dark:text-blue-300"
              >
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

          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {item.mission ? (
              <MetaItem label={m['queue.item.mission']()} value={item.mission} />
            ) : null}
            {createdAt ? <MetaItem label={m['queue.item.created']()} value={createdAt} /> : null}
            {updatedAt ? <MetaItem label={m['queue.item.updated']()} value={updatedAt} /> : null}
            {scheduledAt ? (
              <MetaItem label={m['queue.item.scheduled']()} value={scheduledAt} />
            ) : null}
          </dl>

          {item.threadId || item.gmailDraftId ? (
            <details className="text-muted-foreground min-w-0 text-xs">
              <summary className="text-foreground focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center rounded-md pr-2 font-medium focus-visible:outline-none focus-visible:ring-2 sm:min-h-10">
                {m['queue.item.details']()}
              </summary>
              <dl className="bg-muted/50 mt-1 grid min-w-0 gap-1 rounded-md p-2 font-mono">
                {item.threadId ? (
                  <MetaItem label={m['queue.item.thread']()} value={item.threadId} />
                ) : null}
                {item.gmailDraftId ? (
                  <MetaItem label={m['queue.item.draftId']()} value={item.gmailDraftId} />
                ) : null}
              </dl>
            </details>
          ) : null}

          {item.error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <span className="font-medium">{m['queue.item.error']()}:</span> {item.error}
            </p>
          ) : null}
        </div>

        <div className="hidden shrink-0 flex-wrap gap-2 sm:flex lg:justify-end">
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            className="min-h-10"
            isLoading={pendingAction === 'approve'}
            loadingText={m['queue.actions.approving']()}
            disabled={!canApprove || !!pendingAction}
          >
            <CheckCircle2 className="h-4 w-4" />
            {m['queue.actions.approve']()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="min-h-10"
            isLoading={pendingAction === 'cancel'}
            loadingText={m['queue.actions.rejecting']()}
            disabled={!canCancel || !!pendingAction}
          >
            <XCircle className="h-4 w-4" />
            {m['queue.actions.reject']()}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpen}
            className="min-h-10"
            disabled={!canOpen || !!pendingAction}
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
              className="min-h-10"
              isLoading={pendingAction === 'retry'}
              loadingText={m['queue.actions.retrying']()}
              disabled={!!pendingAction}
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
              className="min-h-10"
              isLoading={pendingAction === 'cancel'}
              loadingText={m['queue.actions.undoing']()}
              disabled={!!pendingAction}
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

function QueueMobileActions({
  item,
  pendingAction,
  undoAvailable,
  onApprove,
  onCancel,
  onOpen,
  onRetry,
}: {
  item: QueueItem;
  pendingAction?: QueuePendingAction;
  undoAvailable: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const canApprove = APPROVABLE_STATUSES.has(item.status);
  const canCancel = CANCELABLE_STATUSES.has(item.status) || undoAvailable;
  const canOpen = !!item.gmailDraftId || !!item.threadId;

  return (
    <div className="bg-background/95 sticky bottom-0 z-30 min-w-0 border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
      <p className="text-muted-foreground mb-2 truncate text-xs font-medium">
        {item.subject || m['queue.item.untitled']()}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11 shrink-0"
          onClick={onApprove}
          isLoading={pendingAction === 'approve'}
          loadingText={m['queue.actions.approving']()}
          disabled={!canApprove || !!pendingAction}
        >
          <CheckCircle2 className="h-4 w-4" />
          {m['queue.actions.approve']()}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0"
          onClick={onCancel}
          isLoading={pendingAction === 'cancel'}
          loadingText={m['queue.actions.rejecting']()}
          disabled={!canCancel || !!pendingAction}
        >
          {undoAvailable ? <Undo2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {undoAvailable ? m['queue.actions.undo']() : m['queue.actions.reject']()}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0"
          onClick={onOpen}
          disabled={!canOpen || !!pendingAction}
        >
          <ExternalLink className="h-4 w-4" />
          {m['queue.actions.open']()}
        </Button>
        {item.status === 'failed' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={onRetry}
            isLoading={pendingAction === 'retry'}
            loadingText={m['queue.actions.retrying']()}
            disabled={!!pendingAction}
          >
            <RotateCcw className="h-4 w-4" />
            {m['queue.actions.retry']()}
          </Button>
        ) : null}
      </div>
    </div>
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
