import {
  APPROVABLE_STATUSES,
  CANCELABLE_STATUSES,
  QUEUE_DISPLAY_STATUSES,
  getReviewPendingCount,
  getUndoSecondsRemaining,
  groupOutboxItemsByStatus,
  type OutboxStatus,
} from '@/components/queue/queue-view-model';
import {
  draftSignature,
  isLegacyWorkerRuntimeError,
  normalizeEditableAddresses,
  parseEditableAddressList,
  type EditableQueueDraft,
} from '@/components/queue/queue-editor-model';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Laptop,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SendJobsSection } from '@/components/queue/send-jobs-section';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { defaultExtensions } from '@/components/create/extensions';
import { useShortcuts } from '@/lib/hotkeys/use-hotkey-utils';
import { EditorContent, useEditor } from '@tiptap/react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { Textarea } from '@/components/ui/textarea';
import type { Shortcut } from '@/config/shortcuts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  sourceAttachments: Array<{ filename: string; mimeType: string; size: number }>;
  classification: 'reply_needed' | 'no_reply_needed';
  classificationReason?: string | null;
  reviewState: 'pending' | 'revision_requested' | 'revising' | 'ready' | 'stale' | 'failed';
  contentRevision: number;
  contentDigest: string;
  scheduledSendAt?: Date | string | null;
  error?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type StatusFilter = OutboxStatus | 'all';

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
  no_reply_needed:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300',
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
  no_reply_needed: m['queue.status.noReplyNeeded'](),
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
  no_reply_needed: m['queue.statusDescription.noReplyNeeded'](),
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

export function QueueReview({ embedded = false }: { embedded?: boolean } = {}) {
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
  const [nextTriagePageToken, setNextTriagePageToken] = useState<string | null>(null);
  const [triageSummary, setTriageSummary] = useState<{
    scannedCount: number;
    replyNeededCount: number;
    noReplyNeededCount: number;
    excludedCount: number;
  } | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    enableScope('queue');
    return () => disableScope('queue');
  }, [disableScope, enableScope]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const outboxQuery = useQuery({
    ...trpc.outbox.list.queryOptions({}),
    refetchInterval: 3_000,
  });
  const workerDevicesQuery = useQuery({
    ...trpc.outbox.listWorkerDevices.queryOptions(),
    refetchInterval: 15_000,
  });
  const items = useMemo(() => (outboxQuery.data ?? []) as QueueItem[], [outboxQuery.data]);

  const prepareMutation = useMutation({
    mutationFn: (pageToken?: string) =>
      trpcClient.outbox.prepareQueue.mutate({
        lookbackDays: 30,
        maxResults: 30,
        ...(pageToken ? { pageToken } : {}),
      }),
    onSuccess: async (result) => {
      setTriageSummary(result);
      setNextTriagePageToken(result.nextPageToken || null);
      toast.success(
        m['queue.prepare.summary']({
          replyCount: result.replyNeededCount,
          noReplyCount: result.noReplyNeededCount,
          scannedCount: result.scannedCount,
          excludedCount: result.excludedCount,
        }),
      );
      await invalidateOutbox();
    },
    onError: () => toast.error(m['queue.prepare.failed']()),
  });

  const enrollmentMutation = useMutation({
    mutationFn: () => trpcClient.outbox.createWorkerEnrollment.mutate({ name: 'Mac de Thomas' }),
    onSuccess: async (result) => {
      setEnrollmentCode(result.code);
      toast.success(m['queue.worker.created']());
      await workerDevicesQuery.refetch();
    },
    onError: () => toast.error(m['queue.worker.failed']()),
  });

  const revokeDeviceMutation = useMutation({
    mutationFn: (id: string) => trpcClient.outbox.revokeWorkerDevice.mutate({ id }),
    onSuccess: async () => workerDevicesQuery.refetch(),
    onError: () => toast.error(m['queue.worker.failed']()),
  });

  const updateDraftMutation = useMutation({
    mutationFn: (input: {
      id: string;
      expectedContentDigest: string;
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      body: string;
    }) => trpcClient.outbox.updateDraft.mutate(input),
    onSuccess: async () => {
      toast.success(m['queue.item.saved']());
      await invalidateOutbox();
    },
    onError: () => toast.error(m['queue.item.saveFailed']()),
  });

  const revisionMutation = useMutation({
    mutationFn: (input: { id: string; instruction: string }) =>
      trpcClient.outbox.requestRevision.mutate(input),
    onSuccess: async () => {
      toast.success(m['queue.item.correctionQueued']());
      await invalidateOutbox();
    },
    onError: () => toast.error(m['queue.actions.failed']()),
  });

  const retryRevisionMutation = useMutation({
    mutationFn: (id: string) => trpcClient.outbox.retryRevision.mutate({ id }),
    onSuccess: async () => {
      toast.success(m['queue.actions.retried']());
      await invalidateOutbox();
    },
    onError: () => toast.error(m['queue.actions.failed']()),
  });

  const retryAllRevisionFailuresMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await trpcClient.outbox.retryRevision.mutate({ id });
      }
      return ids.length;
    },
    onSuccess: async (count) => {
      toast.success(m['queue.actions.retriedMany']({ count }));
      await invalidateOutbox();
    },
    onError: async () => {
      toast.error(m['queue.actions.failed']());
      await invalidateOutbox();
    },
  });

  const grouped = useMemo(() => groupOutboxItemsByStatus(items), [items]);
  const pendingReviewCount = getReviewPendingCount(grouped);
  const labels = statusLabels();
  const descriptions = statusDescriptions();
  const retryableRevisionItems = useMemo(
    () => items.filter((item) => item.reviewState === 'failed' && item.status !== 'draft_ready'),
    [items],
  );

  const visibleStatuses = useMemo(
    () => (statusFilter === 'all' ? QUEUE_DISPLAY_STATUSES : [statusFilter]),
    [statusFilter],
  );
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
    if (item.threadId) {
      navigate(`/mail/inbox?threadId=${encodeURIComponent(item.threadId)}`);
      return;
    }
    if (item.gmailDraftId) {
      setDraftId(item.gmailDraftId);
      setComposeOpen('true');
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

  const shortcutHandlers = {
    approveSelected: () => {
      void approveItem(selectedItem);
    },
    rejectSelected: () => {
      void cancelItem(selectedItem);
    },
    openSelected: () => openItem(selectedItem),
  };

  useShortcuts(queueShortcuts, shortcutHandlers, { scope: 'queue', preventDefault: true });

  const isActionMutating =
    approveMutation.isPending ||
    cancelMutation.isPending ||
    retryMutation.isPending ||
    revisionMutation.isPending ||
    retryRevisionMutation.isPending ||
    retryAllRevisionFailuresMutation.isPending;
  const workerDevice =
    workerDevicesQuery.data?.find((device) => device.enrolled && !device.revokedAt) ?? null;
  const workerLastSeen = workerDevice?.lastSeenAt ? new Date(workerDevice.lastSeenAt) : null;
  const workerOnline = Boolean(
    workerLastSeen && now.getTime() - workerLastSeen.getTime() < Math.max(45_000, 3 * 15_000),
  );

  return (
    <section
      className={cn(
        'bg-background text-foreground flex min-w-0 flex-1 flex-col overflow-hidden',
        embedded ? 'min-h-0' : 'h-screen',
      )}
    >
      <header className={cn('border-border/60 border-b px-4 sm:px-6', embedded ? 'py-3' : 'py-4')}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          {embedded ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
              >
                {m['queue.pendingForReview']({ count: pendingReviewCount })}
              </Badge>
              <p className="text-muted-foreground text-sm">{m['queue.subtitle']()}</p>
            </div>
          ) : (
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal">{m['queue.title']()}</h1>
                <Badge
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
                >
                  {m['queue.pendingForReview']({ count: pendingReviewCount })}
                </Badge>
              </div>
              <p className="text-muted-foreground max-w-3xl text-sm">{m['queue.subtitle']()}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => prepareMutation.mutate(undefined)}
              disabled={prepareMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {prepareMutation.isPending
                ? m['queue.prepare.loading']()
                : m['queue.prepare.button']()}
            </Button>
            {nextTriagePageToken ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => prepareMutation.mutate(nextTriagePageToken)}
                disabled={prepareMutation.isPending}
              >
                {m['queue.prepare.loadMore']()}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 lg:grid-cols-[1fr_auto] lg:items-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="min-w-0 space-y-1">
            <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 text-xs">
              <span>{m['queue.prepare.mailbox']()}</span>
              <span aria-hidden="true">·</span>
              <span>{m['queue.prepare.exclusionsShort']()}</span>
            </div>
            {triageSummary ? (
              <p className="text-foreground text-xs font-medium">
                {m['queue.prepare.summary']({
                  replyCount: triageSummary.replyNeededCount,
                  noReplyCount: triageSummary.noReplyNeededCount,
                  scannedCount: triageSummary.scannedCount,
                  excludedCount: triageSummary.excludedCount,
                })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={workerOnline ? statusTone.draft_ready : ''}>
              <Laptop className="mr-1 h-3.5 w-3.5" />
              {workerDevice
                ? workerOnline
                  ? m['queue.worker.online']()
                  : m['queue.worker.offline']()
                : m['queue.worker.never']()}
            </Badge>
            {workerLastSeen ? (
              <span className="text-muted-foreground text-xs">
                {m['queue.worker.lastSeen']({ date: formatDate(workerLastSeen) ?? '—' })}
              </span>
            ) : null}
            {!workerDevice ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => enrollmentMutation.mutate()}
                disabled={enrollmentMutation.isPending}
              >
                {m['queue.worker.configure']()}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => revokeDeviceMutation.mutate(workerDevice.id)}
                disabled={revokeDeviceMutation.isPending}
              >
                {m['queue.worker.revoke']()}
              </Button>
            )}
          </div>
        </div>
        {enrollmentCode ? (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p>{m['queue.worker.enrollment']()}</p>
            <code className="mt-2 block select-all overflow-x-auto rounded bg-white px-2 py-1 font-mono text-xs text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
              {enrollmentCode}
            </code>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <StatusFilterButton
            active={statusFilter === 'all'}
            count={items.length}
            label={m['queue.filterAll']()}
            onClick={() => setStatusFilter('all')}
          />
          {QUEUE_DISPLAY_STATUSES.filter((status) => grouped[status].length > 0).map((status) => (
            <StatusFilterButton
              key={status}
              active={statusFilter === status}
              count={grouped[status].length}
              label={labels[status]}
              onClick={() => setStatusFilter(status)}
            />
          ))}
          {retryableRevisionItems.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto shrink-0"
              onClick={() =>
                retryAllRevisionFailuresMutation.mutate(
                  retryableRevisionItems.map((item) => item.id),
                )
              }
              disabled={retryAllRevisionFailuresMutation.isPending || !workerOnline}
            >
              <RotateCcw className="h-4 w-4" />
              {retryAllRevisionFailuresMutation.isPending
                ? m['queue.actions.retrying']()
                : m['queue.actions.retryMany']({ count: retryableRevisionItems.length })}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-zinc-50/40 px-4 py-5 sm:px-6 dark:bg-zinc-950/30">
        {/* Envois send_job (queued/sending/failed) — file DISTINCTE du draft
            outbox IA ci-dessous, rendue indépendamment de ses états. */}
        <SendJobsSection />
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
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('border', statusTone[status])}>
                    {labels[status]}
                  </Badge>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {descriptions[status]}
                  </span>
                </div>
                <div className="grid gap-4">
                  {statusItems.map((item) => (
                    <QueueItemRow
                      key={`${item.id}:${item.contentRevision}`}
                      item={item}
                      displayStatus={undoDeadlines[item.id] ? 'approved' : status}
                      isSelected={item.id === selectedItemId}
                      isActionMutating={isActionMutating}
                      isSaving={
                        updateDraftMutation.isPending &&
                        updateDraftMutation.variables?.id === item.id
                      }
                      now={now}
                      undoDeadline={undoDeadlines[item.id]}
                      onApprove={() => approveItem(item)}
                      onCancel={() => cancelItem(item)}
                      onOpen={() => openItem(item)}
                      onRetry={() => retryItem(item)}
                      onSave={(draft) =>
                        updateDraftMutation.mutateAsync({
                          id: item.id,
                          expectedContentDigest: item.contentDigest,
                          ...draft,
                        })
                      }
                      onRequestRevision={(instruction) =>
                        revisionMutation.mutateAsync({ id: item.id, instruction })
                      }
                      onRetryRevision={() => retryRevisionMutation.mutateAsync(item.id)}
                      onSelect={() => setSelectedItemId(item.id)}
                      statusLabel={labels[undoDeadlines[item.id] ? 'approved' : status]}
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
      <span className="bg-current/10 rounded-full px-1.5 text-xs">{count}</span>
    </button>
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
  isActionMutating,
  isSaving,
  now,
  undoDeadline,
  onApprove,
  onCancel,
  onOpen,
  onRetry,
  onSave,
  onRequestRevision,
  onRetryRevision,
  onSelect,
  statusLabel,
}: {
  item: QueueItem;
  displayStatus: OutboxStatus;
  isSelected: boolean;
  isActionMutating: boolean;
  isSaving: boolean;
  now: Date;
  undoDeadline?: Date | string;
  onApprove: () => Promise<unknown> | void;
  onCancel: () => Promise<unknown> | void;
  onOpen: () => Promise<unknown> | void;
  onRetry: () => Promise<unknown> | void;
  onSave: (draft: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
  }) => Promise<unknown>;
  onRequestRevision: (instruction: string) => Promise<unknown>;
  onRetryRevision: () => Promise<unknown> | void;
  onSelect: () => void;
  statusLabel: string;
}) {
  const [to, setTo] = useState(normalizeEditableAddresses(item.to).join(', '));
  const [cc, setCc] = useState(normalizeEditableAddresses(item.cc).join(', '));
  const [bcc, setBcc] = useState(normalizeEditableAddresses(item.bcc).join(', '));
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [instruction, setInstruction] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const autosaveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<unknown> | null>(null);
  const onSaveRef = useRef(onSave);

  const canEdit = item.status === 'draft_ready' && item.reviewState !== 'revising';
  const correctionPending =
    item.reviewState === 'revision_requested' || item.reviewState === 'revising';
  const currentDraft = useMemo<EditableQueueDraft>(
    () => ({
      to: parseEditableAddressList(to),
      cc: parseEditableAddressList(cc),
      bcc: parseEditableAddressList(bcc),
      subject,
      body,
    }),
    [bcc, body, cc, subject, to],
  );
  const serverDraft = useMemo<EditableQueueDraft>(
    () => ({
      to: normalizeEditableAddresses(item.to),
      cc: normalizeEditableAddresses(item.cc),
      bcc: normalizeEditableAddresses(item.bcc),
      subject: item.subject,
      body: item.body,
    }),
    [item.bcc, item.body, item.cc, item.subject, item.to],
  );
  const currentSignature = draftSignature(currentDraft);
  const isDirty = currentSignature !== draftSignature(serverDraft);
  const currentDraftRef = useRef(currentDraft);
  const isDirtyRef = useRef(isDirty);
  onSaveRef.current = onSave;
  currentDraftRef.current = currentDraft;
  isDirtyRef.current = isDirty;

  const persistCurrentDraft = useCallback(async () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!isDirtyRef.current) return;
    if (savePromiseRef.current) return savePromiseRef.current;

    setSaveState('saving');
    const savePromise = onSaveRef.current(currentDraftRef.current);
    savePromiseRef.current = savePromise;
    try {
      await savePromise;
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      throw error;
    } finally {
      savePromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!canEdit || correctionPending || !isDirty) {
      if (!isDirty) {
        setSaveState((current) => (current === 'error' ? current : 'saved'));
      }
      return;
    }

    setSaveState('pending');
    autosaveTimerRef.current = window.setTimeout(() => {
      void persistCurrentDraft().catch(() => {});
    }, 850);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [canEdit, correctionPending, currentSignature, isDirty, persistCurrentDraft]);

  const requestRevision = async () => {
    if (!instruction.trim()) return;
    await persistCurrentDraft();
    await onRequestRevision(instruction.trim());
    setInstruction('');
  };
  const approve = async () => {
    await persistCurrentDraft();
    await onApprove();
  };
  const open = async () => {
    await persistCurrentDraft();
    await onOpen();
  };
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
  const canApprove = APPROVABLE_STATUSES.has(item.status) && item.reviewState === 'ready';
  const canCancel = CANCELABLE_STATUSES.has(item.status) || undoSeconds > 0;
  const canOpen = !!item.gmailDraftId || !!item.threadId;
  const canRetryRevision = item.reviewState === 'failed' && item.status !== 'failed';
  const runtimeWasUpdated = isLegacyWorkerRuntimeError(item.error);
  const errorMessage = runtimeWasUpdated ? m['queue.item.workerRuntimeRecovered']() : item.error;
  const saveLabel =
    isSaving || saveState === 'saving'
      ? m['queue.actions.saving']()
      : saveState === 'pending' || isDirty
        ? m['queue.item.autosavePending']()
        : saveState === 'error'
          ? m['queue.item.saveFailed']()
          : m['queue.item.autosaved']();

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-white shadow-sm transition-colors dark:bg-zinc-950',
        isSelected
          ? 'border-zinc-400 ring-1 ring-zinc-300 dark:border-zinc-600 dark:ring-zinc-700'
          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700',
      )}
      onFocus={onSelect}
      onMouseDown={onSelect}
      tabIndex={0}
    >
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between dark:border-zinc-800">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('border', statusTone[displayStatus])}>
            {statusLabel}
          </Badge>
          {item.status === 'draft_ready' ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                saveState === 'error' ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground',
              )}
            >
              {isSaving || saveState === 'saving' ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : saveState === 'error' ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {saveLabel}
            </span>
          ) : null}
          {undoSeconds > 0 ? (
            <Badge variant="outline" className={cn('border', statusTone[displayStatus])}>
              {m['queue.item.undoCountdown']({ seconds: undoSeconds })}
            </Badge>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {canOpen ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void open()}
              disabled={isActionMutating || isSaving}
            >
              <ExternalLink className="h-4 w-4" />
              {m['queue.actions.open']()}
            </Button>
          ) : null}
          {canRetryRevision ? (
            <Button
              type="button"
              size="sm"
              onClick={onRetryRevision}
              disabled={isActionMutating || isSaving}
            >
              <RotateCcw className="h-4 w-4" />
              {runtimeWasUpdated
                ? m['queue.actions.retryPreparation']()
                : m['queue.actions.retry']()}
            </Button>
          ) : null}
          {item.status === 'failed' ? (
            <Button
              type="button"
              size="sm"
              onClick={onRetry}
              disabled={isActionMutating || isSaving}
            >
              <RotateCcw className="h-4 w-4" />
              {m['queue.actions.retry']()}
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void approve()}
              disabled={isActionMutating || isSaving || correctionPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {m['queue.actions.approve']()}
            </Button>
          ) : null}
          {undoSeconds > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onCancel}
              disabled={isActionMutating}
            >
              <Undo2 className="h-4 w-4" />
              {m['queue.actions.undo']()}
            </Button>
          ) : null}
          {canCancel && undoSeconds === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={isActionMutating || isSaving}
            >
              <XCircle className="h-4 w-4" />
              {m['queue.actions.reject']()}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {item.status === 'draft_ready' ? (
          <div className="grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <QueueField label={m['queue.item.to']()}>
                <Input
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  disabled={!canEdit || isSaving}
                />
              </QueueField>
              <QueueField label={m['queue.item.cc']()}>
                <Input
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  disabled={!canEdit || isSaving}
                />
              </QueueField>
              <QueueField label={m['queue.item.bcc']()}>
                <Input
                  value={bcc}
                  onChange={(event) => setBcc(event.target.value)}
                  disabled={!canEdit || isSaving}
                />
              </QueueField>
            </div>
            <QueueField label={m['queue.item.subject']()}>
              <Input
                className="h-11 text-base font-medium"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={!canEdit || isSaving}
              />
            </QueueField>
            <QueueField label={m['queue.item.message']()}>
              <QueueBodyEditor
                key={item.contentRevision}
                initialValue={body}
                onChange={setBody}
                disabled={!canEdit || isSaving}
              />
            </QueueField>
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              {item.subject || m['queue.item.untitled']()}
            </h2>
            <p className="text-muted-foreground text-sm">
              {m['queue.item.to']()}: {normalizeEditableAddresses(item.to).join(', ') || '—'}
            </p>
            {preview ? (
              <p className="max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {preview}
              </p>
            ) : null}
          </div>
        )}

        {errorMessage ? (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
              runtimeWasUpdated
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
            )}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        ) : null}

        {item.sourceAttachments.length ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-medium">{m['queue.item.attachments']()}:</span>
            {item.sourceAttachments.map((attachment, index) => (
              <span
                key={`${attachment.filename}-${index}`}
                className="rounded border px-1.5 py-0.5"
              >
                {attachment.filename}
              </span>
            ))}
          </div>
        ) : null}

        {item.status === 'draft_ready' ? (
          <div className="grid gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end dark:border-violet-500/20 dark:bg-violet-500/10">
            <div className="grid gap-1.5">
              <Label htmlFor={`instruction-${item.id}`}>{m['queue.item.instruction']()}</Label>
              <Textarea
                id={`instruction-${item.id}`}
                className="min-h-20 bg-white dark:bg-zinc-950"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={m['queue.item.instructionPlaceholder']()}
                disabled={correctionPending || isActionMutating || isSaving}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void requestRevision()}
              disabled={!instruction.trim() || correctionPending || isActionMutating || isSaving}
            >
              <Sparkles className="h-4 w-4" />
              {m['queue.actions.correct']()}
            </Button>
            <span className="text-muted-foreground text-xs lg:col-span-2">
              {correctionPending
                ? m['queue.item.revisionRequested']()
                : item.reviewState === 'stale'
                  ? m['queue.item.revisionStale']()
                  : ''}
            </span>
          </div>
        ) : null}

        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {updatedAt ? (
            <span>
              {m['queue.item.updated']()}: {updatedAt}
            </span>
          ) : null}
          {createdAt ? (
            <span>
              {m['queue.item.created']()}: {createdAt}
            </span>
          ) : null}
          {scheduledAt ? (
            <span>
              {m['queue.item.scheduled']()}: {scheduledAt}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function QueueField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function QueueBodyEditor({
  initialValue,
  onChange,
  disabled,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const editor = useEditor({
    extensions: defaultExtensions,
    content: initialValue || '<p></p>',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert min-h-56 max-w-none px-4 py-3 leading-6 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = initialValue || '<p></p>';
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, false);
    }
  }, [editor, initialValue]);

  return (
    <div className="rounded-md border border-zinc-200 bg-white transition-shadow focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-within:border-zinc-600 dark:focus-within:ring-zinc-800">
      <EditorContent editor={editor} />
    </div>
  );
}
