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
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Laptop,
  LoaderCircle,
  Mail,
  Paperclip,
  RefreshCcw,
  RotateCcw,
  Search,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react';
import {
  draftSignature,
  isLegacyWorkerRuntimeError,
  normalizeEditableAddresses,
  parseEditableAddressList,
  type EditableQueueDraft,
} from '@/components/queue/queue-editor-model';
import {
  mailboxSearchRow,
  matchesQueueSearch,
  type MailboxSearchRow,
} from '@/components/queue/queue-search-model';
import {
  draftListRow,
  moveDraftSelection,
  type DraftListRow,
} from '@/components/drafts/draft-workspace-model';
import { pruneSentDraftFromCache, publishDraftSent } from '@/lib/draft-send-reconciliation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueueThreadContext } from '@/components/queue/queue-thread-context';
import { SendJobsSection } from '@/components/queue/send-jobs-section';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { defaultExtensions } from '@/components/create/extensions';
import { useShortcuts } from '@/lib/hotkeys/use-hotkey-utils';
import { useActiveConnection } from '@/hooks/use-connections';
import { EditorContent, useEditor } from '@tiptap/react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { Textarea } from '@/components/ui/textarea';
import type { Shortcut } from '@/config/shortcuts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router';
import { cn, FOLDERS } from '@/lib/utils';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
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

// Pastille compacte par statut : la liste reste lisible sans répéter un badge
// plein sur chaque ligne (le badge n'apparaît que hors draft_ready).
const statusDotTone: Record<OutboxStatus, string> = {
  queued: 'bg-sky-500',
  generating: 'bg-amber-500',
  draft_ready: 'bg-emerald-500',
  approved: 'bg-blue-500',
  sending: 'bg-cyan-500',
  sent: 'bg-zinc-400',
  cancelled: 'bg-rose-500',
  no_reply_needed: 'bg-violet-500',
  failed: 'bg-red-500',
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
  const { data: activeConnection } = useActiveConnection();
  const navigate = useNavigate();
  const [, setDraftId] = useQueryState('draftId');
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const { enableScope, disableScope } = useHotkeysContext();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedDraftSearch, setSavedDraftSearch] = useState('');
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

  useEffect(() => {
    const timer = window.setTimeout(() => setSavedDraftSearch(searchQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const outboxQuery = useQuery({
    ...trpc.outbox.list.queryOptions({}),
    refetchInterval: 3_000,
  });
  const workerDevicesQuery = useQuery({
    ...trpc.outbox.listWorkerDevices.queryOptions(),
    refetchInterval: 15_000,
  });
  const items = useMemo(() => (outboxQuery.data ?? []) as QueueItem[], [outboxQuery.data]);
  const reconciledSentOutboxIds = useRef(new Set<string>());

  useEffect(() => {
    const newlySent = items.filter(
      (item) =>
        item.status === 'sent' &&
        Boolean(item.gmailDraftId) &&
        item.connectionId === activeConnection?.id &&
        !reconciledSentOutboxIds.current.has(item.id),
    );
    if (!newlySent.length) return;

    for (const item of newlySent) {
      reconciledSentOutboxIds.current.add(item.id);
      const draftId = item.gmailDraftId!;
      pruneSentDraftFromCache(
        queryClient,
        trpc.mail.listThreads.infiniteQueryKey({ folder: FOLDERS.DRAFT }),
        draftId,
      );
      queryClient.removeQueries({ queryKey: trpc.drafts.get.queryKey({ id: draftId }) });
      publishDraftSent({
        type: 'draft-sent',
        connectionId: item.connectionId,
        draftId,
      });
    }

    void queryClient.invalidateQueries({
      queryKey: trpc.mail.listThreads.infiniteQueryKey({ folder: FOLDERS.DRAFT }),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.mail.mailboxOverview.queryKey() });
  }, [activeConnection?.id, items, queryClient, trpc]);
  const savedDraftSearchQuery = useQuery({
    ...trpc.drafts.list.queryOptions({
      q: savedDraftSearch,
      maxResults: 25,
    }),
    enabled: savedDraftSearch.length >= 2,
  });
  const mailboxSearchQuery = useQuery({
    ...trpc.mail.listThreads.queryOptions({
      q: savedDraftSearch,
      folder: '',
      cursor: '',
      maxResults: 25,
      localPreview: true,
    }),
    enabled: savedDraftSearch.length >= 2,
  });

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
    onSuccess: async () => invalidateOutbox(),
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
  const retryableRevisionItems = useMemo(
    () => items.filter((item) => item.reviewState === 'failed' && item.status !== 'draft_ready'),
    [items],
  );

  const visibleStatuses = useMemo(
    () => (statusFilter === 'all' ? QUEUE_DISPLAY_STATUSES : [statusFilter]),
    [statusFilter],
  );
  const statusItems = useMemo(
    () => visibleStatuses.flatMap((status) => grouped[status]),
    [grouped, visibleStatuses],
  );
  const visibleItems = useMemo(
    () => statusItems.filter((item) => matchesQueueSearch(item, searchQuery)),
    [searchQuery, statusItems],
  );
  const savedDraftSearchResults = useMemo(() => {
    if (savedDraftSearch.length < 2) return [];
    const agentDraftIds = new Set(
      items.flatMap((item) => (item.gmailDraftId ? [item.gmailDraftId] : [])),
    );
    return (savedDraftSearchQuery.data?.threads ?? [])
      .map(draftListRow)
      .filter((row) => !agentDraftIds.has(row.id));
  }, [items, savedDraftSearch, savedDraftSearchQuery.data]);
  const mailboxSearchResults = useMemo(() => {
    if (savedDraftSearch.length < 2) return [];
    const queuedThreadIds = new Set(
      items.flatMap((item) => (item.threadId ? [item.threadId] : [])),
    );
    return (mailboxSearchQuery.data?.threads ?? [])
      .map(mailboxSearchRow)
      .filter((row) => !queuedThreadIds.has(row.id));
  }, [items, mailboxSearchQuery.data, savedDraftSearch]);
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? null;
  const hasSearch = searchQuery.trim().length > 0;
  const isExternalSearchLoading = savedDraftSearchQuery.isFetching || mailboxSearchQuery.isFetching;
  const resultCount =
    visibleItems.length + savedDraftSearchResults.length + mailboxSearchResults.length;

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedItemId(null);
      return;
    }

    if (!visibleItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(visibleItems[0]?.id ?? null);
    }
  }, [selectedItemId, visibleItems]);

  useEffect(() => {
    if (!selectedItemId) return;
    document.querySelector(`[data-queue-row="${CSS.escape(selectedItemId)}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedItemId]);

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
        keys: ['j'],
        action: 'selectNext',
        type: 'single',
        description: m['queue.keyboardNavigate'](),
        scope: 'queue',
      },
      {
        keys: ['k'],
        action: 'selectPrevious',
        type: 'single',
        description: m['queue.keyboardNavigate'](),
        scope: 'queue',
      },
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

  const moveSelection = (direction: -1 | 1) => {
    setSelectedItemId((current) =>
      moveDraftSelection(
        visibleItems.map((item) => item.id),
        current,
        direction,
      ),
    );
  };

  const shortcutHandlers = {
    selectNext: () => moveSelection(1),
    selectPrevious: () => moveSelection(-1),
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
        {!embedded ? (
          <div className="min-w-0 space-y-1.5 pb-3">
            <h1 className="text-2xl font-semibold tracking-normal">{m['queue.title']()}</h1>
            <p className="text-muted-foreground max-w-3xl text-sm">{m['queue.subtitle']()}</p>
          </div>
        ) : null}

        {/* Barre outils unique : compteur à relire, recherche globale, scan et
            worker Codex tiennent sur une ligne — le reste du header respire. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Badge
            variant="outline"
            className="h-10 shrink-0 self-start rounded-md border-emerald-300 px-3 text-sm text-emerald-700 lg:self-auto dark:border-emerald-500/40 dark:text-emerald-300"
          >
            {m['queue.pendingForReview']({ count: pendingReviewCount })}
          </Badge>
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={m['queue.search.placeholder']()}
              aria-label={m['queue.search.label']()}
              className="h-10 bg-white pl-9 pr-9 dark:bg-zinc-950"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={m['queue.search.clear']()}
                className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2"
              >
                <XCircle className="h-4 w-4" />
              </button>
            ) : null}
          </div>

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
            <div className="flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <Badge
                variant="outline"
                className={workerOnline ? statusTone.draft_ready : ''}
                title={
                  workerLastSeen
                    ? m['queue.worker.lastSeen']({ date: formatDate(workerLastSeen) ?? '—' })
                    : undefined
                }
              >
                <Laptop className="mr-1 h-3.5 w-3.5" />
                {workerDevice
                  ? workerOnline
                    ? m['queue.worker.online']()
                    : m['queue.worker.offline']()
                  : m['queue.worker.never']()}
              </Badge>
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
        </div>
        <div className="text-muted-foreground mt-1.5 hidden min-w-0 flex-wrap items-center gap-2 text-xs md:flex">
          <span>{m['queue.prepare.mailbox']()}</span>
          <span aria-hidden="true">·</span>
          <span>{m['queue.prepare.exclusionsShort']()}</span>
          {triageSummary ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-foreground font-medium">
                {m['queue.prepare.summary']({
                  replyCount: triageSummary.replyNeededCount,
                  noReplyCount: triageSummary.noReplyNeededCount,
                  scannedCount: triageSummary.scannedCount,
                  excludedCount: triageSummary.excludedCount,
                })}
              </span>
            </>
          ) : null}
        </div>
        {enrollmentCode ? (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p>{m['queue.worker.enrollment']()}</p>
            <code className="mt-2 block select-all overflow-x-auto rounded bg-white px-2 py-1 font-mono text-xs text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
              {enrollmentCode}
            </code>
          </div>
        ) : null}

        <div className="mt-1.5 flex items-center gap-2 overflow-x-auto pb-1">
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
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="text-muted-foreground hidden items-center gap-2 text-xs xl:flex">
              <QueueShortcutHint keys="J / K" label={m['queue.keyboardNavigate']()} />
              <QueueShortcutHint keys="D" label={m['queue.keyboardApprove']()} />
              <QueueShortcutHint keys="R" label={m['queue.keyboardReject']()} />
              <QueueShortcutHint keys="F" label={m['queue.keyboardOpen']()} />
            </div>
            {retryableRevisionItems.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col bg-zinc-50/40 dark:bg-zinc-950/30">
        <div className="shrink-0 px-4 pt-3 empty:hidden sm:px-6">
          {/* Envois send_job (queued/sending/failed) — file DISTINCTE du draft
              outbox IA ci-dessous, rendue indépendamment de ses états. */}
          <SendJobsSection />
        </div>
        {outboxQuery.isLoading ? (
          <div className="p-5">
            <StateMessage title={m['queue.loading']()} />
          </div>
        ) : outboxQuery.error ? (
          <div className="p-5">
            <StateMessage
              title={m['queue.errorTitle']()}
              action={
                <Button variant="outline" size="sm" onClick={() => outboxQuery.refetch()}>
                  <RefreshCcw className="h-4 w-4" />
                  {m['queue.refresh']()}
                </Button>
              }
            />
          </div>
        ) : visibleItems.length === 0 &&
          savedDraftSearchResults.length === 0 &&
          mailboxSearchResults.length === 0 &&
          !hasSearch ? (
          <div className="p-5">
            <StateMessage
              title={m['queue.emptyTitle']()}
              description={m['queue.emptyDescription']()}
              action={
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
              }
            />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="border-border/60 flex min-h-0 flex-col border-r bg-white/75 dark:bg-zinc-950/50">
              <div className="border-border/60 flex min-h-11 shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
                <p className="text-sm font-medium">
                  {hasSearch
                    ? m['queue.search.results']({ count: resultCount })
                    : m['queue.search.queueCount']({ count: visibleItems.length })}
                </p>
                {isExternalSearchLoading ? (
                  <LoaderCircle className="text-muted-foreground h-4 w-4 animate-spin" />
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {hasSearch && savedDraftSearchResults.length > 0 ? (
                  <div className="mb-3">
                    <p className="text-muted-foreground px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {m['queue.search.savedDrafts']()}
                    </p>
                    <div className="space-y-1">
                      {savedDraftSearchResults.map((draft) => (
                        <SavedDraftSearchRow
                          key={draft.id}
                          draft={draft}
                          onOpen={() => {
                            setDraftId(draft.id);
                            setComposeOpen('true');
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {hasSearch && mailboxSearchResults.length > 0 ? (
                  <div className="mb-3">
                    <p className="text-muted-foreground px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {m['queue.search.mailboxThreads']()}
                    </p>
                    <div className="space-y-1">
                      {mailboxSearchResults.map((thread) => (
                        <MailboxSearchResultRow
                          key={thread.id}
                          thread={thread}
                          onOpen={() =>
                            navigate(`/mail/inbox?threadId=${encodeURIComponent(thread.id)}`)
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {visibleItems.length > 0 ? (
                  <div>
                    {hasSearch &&
                    (savedDraftSearchResults.length > 0 || mailboxSearchResults.length > 0) ? (
                      <p className="text-muted-foreground px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
                        {m['queue.search.agentDrafts']()}
                      </p>
                    ) : null}
                    <div className="space-y-1">
                      {visibleItems.map((item) => {
                        const displayStatus = undoDeadlines[item.id] ? 'approved' : item.status;
                        return (
                          <QueueItemListRow
                            key={item.id}
                            item={item}
                            selected={item.id === selectedItemId}
                            statusLabel={labels[displayStatus]}
                            displayStatus={displayStatus}
                            onSelect={() => setSelectedItemId(item.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {visibleItems.length === 0 &&
                savedDraftSearchResults.length === 0 &&
                mailboxSearchResults.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
                    {isExternalSearchLoading ? (
                      <>
                        <LoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
                        <p className="mt-3 text-sm font-medium">{m['queue.search.searching']()}</p>
                      </>
                    ) : (
                      <>
                        <Search className="text-muted-foreground h-5 w-5" />
                        <p className="mt-3 text-sm font-medium">{m['queue.search.noResults']()}</p>
                        <p className="text-muted-foreground mt-1 text-xs leading-5">
                          {m['queue.search.noResultsDescription']()}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              {selectedItem ? (
                <QueueItemRow
                  key={`${selectedItem.id}:${selectedItem.contentRevision}`}
                  item={selectedItem}
                  displayStatus={undoDeadlines[selectedItem.id] ? 'approved' : selectedItem.status}
                  isActionMutating={isActionMutating}
                  isSaving={
                    updateDraftMutation.isPending &&
                    updateDraftMutation.variables?.id === selectedItem.id
                  }
                  now={now}
                  undoDeadline={undoDeadlines[selectedItem.id]}
                  onApprove={() => approveItem(selectedItem)}
                  onCancel={() => cancelItem(selectedItem)}
                  onOpen={() => openItem(selectedItem)}
                  onRetry={() => retryItem(selectedItem)}
                  onSave={(draft) =>
                    updateDraftMutation.mutateAsync({
                      id: selectedItem.id,
                      expectedContentDigest: selectedItem.contentDigest,
                      ...draft,
                    })
                  }
                  onRequestRevision={(instruction) =>
                    revisionMutation.mutateAsync({ id: selectedItem.id, instruction })
                  }
                  onRetryRevision={() => retryRevisionMutation.mutateAsync(selectedItem.id)}
                  statusLabel={
                    labels[undoDeadlines[selectedItem.id] ? 'approved' : selectedItem.status]
                  }
                />
              ) : (
                <div className="p-4">
                  <StateMessage
                    title={m['queue.search.selectTitle']()}
                    description={m['queue.search.selectDescription']()}
                  />
                </div>
              )}
            </main>
          </div>
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

function QueueShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="bg-muted border-border/60 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold">
        {keys}
      </kbd>
      {label}
    </span>
  );
}

function QueueItemListRow({
  item,
  selected,
  displayStatus,
  statusLabel,
  onSelect,
}: {
  item: QueueItem;
  selected: boolean;
  displayStatus: OutboxStatus;
  statusLabel: string;
  onSelect: () => void;
}) {
  const recipients = normalizeEditableAddresses(item.to).join(', ');
  const preview = getPreview(item.body);

  return (
    <button
      type="button"
      data-queue-row={item.id}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'focus-visible:ring-primary/35 w-full rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2',
        selected
          ? 'border-primary/30 bg-primary/[0.07]'
          : 'hover:border-border hover:bg-muted/55 border-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          title={statusLabel}
          className={cn('h-2 w-2 shrink-0 rounded-full', statusDotTone[displayStatus])}
        >
          <span className="sr-only">{statusLabel}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5">
          {recipients || m['queue.search.noRecipient']()}
        </span>
        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
          {formatDate(item.updatedAt)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[13px] leading-5">
        {item.subject || m['queue.item.untitled']()}
      </p>
      {preview ? (
        <p className="text-muted-foreground mt-0.5 truncate text-xs leading-4">{preview}</p>
      ) : null}
      {displayStatus !== 'draft_ready' ? (
        <Badge
          variant="outline"
          className={cn(
            'mt-1.5 h-5 max-w-full border px-1.5 text-[10px]',
            statusTone[displayStatus],
          )}
        >
          <span className="truncate">{statusLabel}</span>
        </Badge>
      ) : null}
    </button>
  );
}

function SavedDraftSearchRow({ draft, onOpen }: { draft: DraftListRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:border-border hover:bg-muted/55 focus-visible:ring-primary/35 flex w-full gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
    >
      <span className="bg-muted text-muted-foreground mt-0.5 rounded-md p-1.5">
        <FileText className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold">{draft.recipient}</span>
          {draft.receivedAt ? (
            <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
              {formatDate(new Date(draft.receivedAt))}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-5">{draft.subject}</span>
        {draft.preview ? (
          <span className="text-muted-foreground mt-1 line-clamp-1 block text-xs">
            {draft.preview}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MailboxSearchResultRow({
  thread,
  onOpen,
}: {
  thread: MailboxSearchRow;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:border-border hover:bg-muted/55 focus-visible:ring-primary/35 flex w-full gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
    >
      <span className="bg-muted text-muted-foreground mt-0.5 rounded-md p-1.5">
        <Mail className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold">
            {thread.sender || m['queue.search.noRecipient']()}
          </span>
          {thread.receivedAt ? (
            <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
              {formatDate(thread.receivedAt)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm leading-5">
          {thread.subject || m['queue.item.untitled']()}
        </span>
      </span>
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
  statusLabel,
}: {
  item: QueueItem;
  displayStatus: OutboxStatus;
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
  const savedSignatureRef = useRef(draftSignature(serverDraft));
  const isDirty = currentSignature !== savedSignatureRef.current;
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
    const draftToSave = currentDraftRef.current;
    const signatureToSave = draftSignature(draftToSave);
    const savePromise = onSaveRef.current(draftToSave);
    savePromiseRef.current = savePromise;
    try {
      await savePromise;
      savedSignatureRef.current = signatureToSave;
      isDirtyRef.current = draftSignature(currentDraftRef.current) !== signatureToSave;
      setSaveState(isDirtyRef.current ? 'pending' : 'saved');
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

  useEffect(
    () => () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (isDirtyRef.current && !savePromiseRef.current) {
        void onSaveRef.current(currentDraftRef.current).catch(() => {});
      }
    },
    [],
  );

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
  const statusDescription = statusDescriptions()[displayStatus];
  const runtimeWasUpdated = isLegacyWorkerRuntimeError(item.error);
  const errorMessage = runtimeWasUpdated ? m['queue.item.workerRuntimeRecovered']() : item.error;
  const saveLabel =
    isSaving || saveState === 'saving'
      ? m['queue.actions.saving']()
      : saveState === 'error'
        ? m['queue.item.saveFailed']()
        : saveState === 'pending'
          ? m['queue.item.autosavePending']()
          : m['queue.item.autosaved']();

  return (
    <article className="flex min-h-0 flex-1 flex-col bg-white lg:mr-14 dark:bg-zinc-950">
      {/* Barre d'actions permanente : statut, autosave, envoi/annulation
          restent visibles quelle que soit la longueur du fil ou du brouillon.
          Envoyer termine la rangée en action primaire, le rappel des 15 s
          juste à côté ; pendant le délai, Annuler porte le compte à rebours. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-zinc-200 px-3 py-2 sm:px-4 dark:border-zinc-800">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            title={statusDescription}
            className={cn('border', statusTone[displayStatus])}
          >
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
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {canOpen ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
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
            <span className="text-muted-foreground hidden text-xs md:inline">
              {m['queue.item.sendHint']()}
            </span>
          ) : null}
          {canCancel && undoSeconds === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={isActionMutating || isSaving}
            >
              <XCircle className="h-4 w-4" />
              {m['queue.actions.reject']()}
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
              <kbd className="ml-1 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">D</kbd>
            </Button>
          ) : null}
          {undoSeconds > 0 ? (
            <Button type="button" size="sm" onClick={onCancel} disabled={isActionMutating}>
              <Undo2 className="h-4 w-4" />
              {m['queue.item.undoCountdown']({ seconds: undoSeconds })}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Poste de travail : le fil source est LU dans la même vue que la
          réponse — colonne contexte + colonne édition, chacune avec son
          propre défilement dès xl ; empilées (contexte d'abord) en dessous. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] xl:overflow-hidden">
        <QueueThreadContext
          threadId={item.threadId}
          classificationReason={item.classificationReason}
          className="h-[260px] min-h-[260px] overflow-hidden border-b border-zinc-200 xl:h-auto xl:max-h-none xl:min-h-0 xl:border-b-0 xl:border-r dark:border-zinc-800"
        />

        <div className="min-w-0 xl:min-h-0 xl:overflow-y-auto">
          <div className="space-y-3 p-3 sm:p-4">
            {item.status === 'draft_ready' ? (
              <div className="grid gap-3">
                <QueueField label={m['queue.item.to']()}>
                  <Input
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    disabled={!canEdit || isSaving}
                  />
                </QueueField>
                <div className="grid gap-2 sm:grid-cols-2">
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
                    className="h-10 text-base font-medium"
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
        </div>
      </div>

      {/* Pied fixe : l'instruction Codex reste à portée de main pendant la
          lecture du fil comme pendant l'édition de la réponse. */}
      {item.status === 'draft_ready' ? (
        <div className="shrink-0 border-t border-violet-200 bg-violet-50/60 px-3 py-2.5 sm:px-4 dark:border-violet-500/20 dark:bg-violet-500/10">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <div className="grid min-w-0 flex-1 gap-1">
              <Label htmlFor={`instruction-${item.id}`}>{m['queue.item.instruction']()}</Label>
              <Textarea
                id={`instruction-${item.id}`}
                className="min-h-11 bg-white dark:bg-zinc-950"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={m['queue.item.instructionPlaceholder']()}
                disabled={correctionPending || isActionMutating || isSaving}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => void requestRevision()}
              disabled={!instruction.trim() || correctionPending || isActionMutating || isSaving}
            >
              <Sparkles className="h-4 w-4" />
              {m['queue.actions.correct']()}
            </Button>
          </div>
          {correctionPending || item.reviewState === 'stale' ? (
            <p className="text-muted-foreground mt-1.5 text-xs">
              {correctionPending
                ? m['queue.item.revisionRequested']()
                : m['queue.item.revisionStale']()}
            </p>
          ) : null}
        </div>
      ) : null}
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
  const hasUserInputRef = useRef(false);
  const editor = useEditor({
    extensions: defaultExtensions,
    content: initialValue || '<p></p>',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      if (hasUserInputRef.current && currentEditor.isFocused) {
        onChange(currentEditor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert min-h-56 max-w-none px-4 py-3 leading-6 focus:outline-none',
      },
      handleDOMEvents: {
        beforeinput: (view, event) => {
          hasUserInputRef.current = event.isTrusted && view.hasFocus();
          return false;
        },
        paste: (view, event) => {
          hasUserInputRef.current = event.isTrusted && view.hasFocus();
          return false;
        },
        drop: (view, event) => {
          hasUserInputRef.current = event.isTrusted && view.hasFocus();
          return false;
        },
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
