import {
  buildConfirmedDirectSend,
  canDirectSend,
  draftListRow,
  matchesDraftSearch,
  moveDraftSelection,
  nextDraftAfterDeletion,
  selectDraftRange,
  stripDraftHtml,
  toggleDraftSelection,
  type DraftListRow,
} from './draft-workspace-model';
import {
  Bot,
  ChevronRight,
  FilePenLine,
  FileText,
  Inbox,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DraftBulkActionBar, DraftDeleteDialog } from './draft-bulk-actions';
import { preloadComposeSurface } from '@/components/create/compose-surface';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { optimisticActionsAtom } from '@/store/optimistic-updates';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useMailboxOverview } from '@/hooks/use-mailbox-overview';
import { useAutoLoadDraftPage } from './use-auto-load-draft-page';
import { QueueReview } from '@/components/queue/queue-review';
import { interpretSendOutcome } from '@/lib/send-outcome';
import { useTRPC } from '@/providers/query-provider';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useSettings } from '@/hooks/use-settings';
import { useThreads } from '@/hooks/use-threads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDraft } from '@/hooks/use-drafts';
import { m } from '@/paraglide/messages';
import { useAtomValue } from 'jotai';
import { useQueryState } from 'nuqs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type DraftView = 'drafts' | 'agent';

const formatDraftDate = (value: number | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const recipientLabel = (values?: string[]) =>
  values?.filter(Boolean).join(', ') || m['draftWorkspace.noRecipient']();

export function DraftWorkspace() {
  const [viewParam, setViewParam] = useQueryState('view');
  const view: DraftView = viewParam === 'agent' ? 'agent' : 'drafts';
  const [threadsQuery, items, , loadMore] = useThreads();
  const mailboxOverview = useMailboxOverview();
  const optimisticActions = useAtomValue(optimisticActionsAtom);
  const optimisticallyDeletedIds = useMemo(
    () =>
      new Set(
        Object.values(optimisticActions)
          .filter((action) => action.type === 'DELETE_DRAFT')
          .flatMap((action) => action.threadIds),
      ),
    [optimisticActions],
  );
  const rows = useMemo(
    () => items.map(draftListRow).filter((row) => !optimisticallyDeletedIds.has(row.id)),
    [items, optimisticallyDeletedIds],
  );
  const draftCount = mailboxOverview.data?.folders.drafts ?? rows.length;
  const [search, setSearch] = useState('');
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesDraftSearch(row, search)),
    [rows, search],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [deleteCandidates, setDeleteCandidates] = useState<DraftListRow[]>([]);
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const [, setDraftId] = useQueryState('draftId');
  const { optimisticDeleteDrafts } = useOptimisticActions();
  const { enableScope, disableScope } = useHotkeysContext();

  const selectedRow = filteredRows.find((row) => row.id === selectedId) ?? null;
  const selectedDraftRows = rows.filter((row) => selectedDraftIds.has(row.id));
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedDraftIds.has(row.id));
  const someVisibleSelected = filteredRows.some((row) => selectedDraftIds.has(row.id));
  const selectedDraft = useDraft(selectedRow?.id ?? null, { enabled: view === 'drafts' });

  useEffect(() => {
    if (view !== 'drafts') {
      disableScope('draft-workspace');
      return;
    }
    enableScope('draft-workspace');
    return () => disableScope('draft-workspace');
  }, [disableScope, enableScope, view]);

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedId(null);
      return;
    }
    if (!filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0]?.id ?? null);
    }
  }, [filteredRows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    document.querySelector(`[data-draft-row="${CSS.escape(selectedId)}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedId]);

  useEffect(() => {
    const availableIds = new Set(rows.map((row) => row.id));
    setSelectedDraftIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (selectionAnchorId && !availableIds.has(selectionAnchorId)) setSelectionAnchorId(null);
  }, [rows, selectionAnchorId]);

  useAutoLoadDraftPage({
    rowCount: rows.length,
    search,
    hasNextPage: Boolean(threadsQuery.hasNextPage),
    isLoading: threadsQuery.isLoading,
    isFetchingNextPage: threadsQuery.isFetchingNextPage,
    loadMore,
  });

  const openDraft = (id = selectedId) => {
    if (!id) return;
    preloadComposeSurface();
    setDraftId(id);
    setComposeOpen('true');
  };

  const createDraft = () => {
    preloadComposeSurface();
    setDraftId(null);
    setComposeOpen('true');
  };

  const moveSelection = (direction: -1 | 1) => {
    setSelectedId((current) =>
      moveDraftSelection(
        filteredRows.map((row) => row.id),
        current,
        direction,
      ),
    );
  };

  const toggleSelection = (draftId: string) => {
    setSelectedDraftIds((current) => toggleDraftSelection(current, draftId));
    setSelectionAnchorId(draftId);
  };

  const handleRowSelect = (row: DraftListRow, event: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedId(row.id);
    if (event.shiftKey) {
      const orderedIds = filteredRows.map((item) => item.id);
      setSelectedDraftIds((current) =>
        selectDraftRange(orderedIds, current, selectionAnchorId ?? selectedId, row.id),
      );
      setSelectionAnchorId((current) => current ?? selectedId ?? row.id);
    } else if (event.metaKey || event.ctrlKey) {
      toggleSelection(row.id);
    }
  };

  const toggleAllVisible = () => {
    setSelectedDraftIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredRows.forEach((row) => next.delete(row.id));
      else filteredRows.forEach((row) => next.add(row.id));
      return next;
    });
    setSelectionAnchorId(filteredRows[0]?.id ?? null);
  };

  const clearSelection = () => {
    setSelectedDraftIds(new Set());
    setSelectionAnchorId(null);
  };

  const requestDeleteCurrent = () => {
    if (selectedRow) setDeleteCandidates([selectedRow]);
  };

  const requestDeleteSelection = () => {
    const candidates = selectedDraftRows.length
      ? selectedDraftRows
      : selectedRow
        ? [selectedRow]
        : [];
    if (candidates.length) setDeleteCandidates(candidates);
  };

  // --- Envoi direct (Mod+Enter) : brouillon COMPLET chargé, confirmation
  // explicite, clé d'idempotence stable par brouillon, envoi TEL QUE STOCKÉ
  // côté serveur (PJ/destinataires/threading/signature préservés).
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: sendEmail, isPending: isSendingDraft } = useMutation(
    trpc.mail.send.mutationOptions(),
  );
  const settings = useSettings();
  const [sendCandidate, setSendCandidate] = useState<{
    draftId: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
  } | null>(null);

  const submitDirectSend = async (candidate: {
    draftId: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
  }) => {
    if (isSendingDraft) return;
    const submission = buildConfirmedDirectSend(candidate, selectedDraft.data);
    if (!submission) {
      setSendCandidate(null);
      toast.info(m['draftWorkspace.sendNotLoaded']());
      return;
    }
    const { draftId } = submission;
    const sendingToast = toast.loading(m['states.sending']());
    try {
      const result = await sendEmail(submission);
      const outcome = interpretSendOutcome(result);
      if (!outcome.ok) {
        throw new Error(typeof outcome.error === 'string' ? outcome.error : 'Send failed');
      }
      setSendCandidate(null);
      toast.success(m['draftWorkspace.sendQueued']());
      void queryClient.invalidateQueries({ queryKey: trpc.mail.listThreads.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.drafts.get.queryKey({ id: draftId }) });
    } catch (error) {
      // La clé est déterministe par draft : retry, double frappe et reload
      // convergent vers le même send_job côté serveur.
      toast.error(error instanceof Error ? error.message : m['draftWorkspace.sendFailed']());
    } finally {
      toast.dismiss(sendingToast);
    }
  };

  const requestDirectSend = () => {
    if (view !== 'drafts' || !selectedRow) return;
    const check = canDirectSend(selectedRow.id, selectedDraft.data);
    if (!check.ok) {
      toast.info(
        check.reason === 'no-recipient'
          ? m['draftWorkspace.sendNoRecipient']()
          : m['draftWorkspace.sendNotLoaded'](),
      );
      return;
    }
    const candidate = {
      draftId: selectedRow.id,
      to: check.to,
      cc: check.cc,
      bcc: check.bcc,
      subject: check.subject,
    };
    if (settings.data?.settings.confirmDirectDraftSend ?? true) {
      setSendCandidate(candidate);
      return;
    }
    void submitDirectSend(candidate);
  };

  const confirmDirectSend = async () => {
    if (!sendCandidate || isSendingDraft) return;
    await submitDirectSend(sendCandidate);
  };

  const confirmDelete = () => {
    if (!deleteCandidates.length) return;
    const deletedIds = new Set(deleteCandidates.map((row) => row.id));
    setSelectedId((current) =>
      nextDraftAfterDeletion(
        filteredRows.map((row) => row.id),
        current,
        deletedIds,
      ),
    );
    optimisticDeleteDrafts([...deletedIds]);
    clearSelection();
    setDeleteCandidates([]);
  };

  useHotkeys(['j', 'arrowdown'], () => moveSelection(1), {
    scopes: ['draft-workspace'],
    preventDefault: true,
    enableOnFormTags: false,
  });
  useHotkeys(['k', 'arrowup'], () => moveSelection(-1), {
    scopes: ['draft-workspace'],
    preventDefault: true,
    enableOnFormTags: false,
  });
  useHotkeys(['e', 'enter'], () => openDraft(), {
    scopes: ['draft-workspace'],
    preventDefault: true,
    enableOnFormTags: false,
  });
  useHotkeys(['shift+3', 'delete', 'meta+backspace', 'ctrl+backspace'], requestDeleteSelection, {
    scopes: ['draft-workspace'],
    preventDefault: true,
    enableOnFormTags: false,
  });
  useHotkeys(['meta+a', 'ctrl+a'], toggleAllVisible, {
    scopes: ['draft-workspace'],
    preventDefault: true,
    enableOnFormTags: false,
  });
  useHotkeys('escape', clearSelection, {
    scopes: ['draft-workspace'],
    preventDefault: selectedDraftIds.size > 0,
    enableOnFormTags: false,
  });
  useHotkeys(['meta+enter', 'ctrl+enter'], requestDirectSend, {
    scopes: ['draft-workspace'],
    preventDefault: true,
    enableOnFormTags: false,
  });

  const switchView = (next: DraftView) => {
    setViewParam(next === 'agent' ? 'agent' : null);
  };

  return (
    <section className="bg-background text-foreground flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-border/60 flex shrink-0 flex-col gap-4 border-b px-5 py-4 lg:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                {m['draftWorkspace.title']()}
              </h1>
              {view === 'drafts' ? (
                <Badge variant="secondary" className="tabular-nums">
                  {draftCount}
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">{m['draftWorkspace.subtitle']()}</p>
          </div>
          <Button type="button" size="sm" onClick={createDraft}>
            <Plus className="size-4" />
            {m['draftWorkspace.newDraft']()}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bg-muted/60 inline-flex rounded-lg p-1">
            <ViewTab
              active={view === 'drafts'}
              icon={<FileText className="size-4" />}
              label={m['draftWorkspace.myDrafts']()}
              count={draftCount}
              onClick={() => switchView('drafts')}
            />
            <ViewTab
              active={view === 'agent'}
              icon={<Bot className="size-4" />}
              label={m['draftWorkspace.agentDrafts']()}
              onClick={() => switchView('agent')}
            />
          </div>
          {view === 'drafts' ? <DraftShortcutRail /> : null}
        </div>
      </header>

      {view === 'agent' ? (
        <QueueReview embedded />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(300px,38%)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="border-border/60 flex min-h-0 flex-col border-r">
            <div className="border-border/60 flex items-center gap-2 border-b p-3">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                onCheckedChange={toggleAllVisible}
                aria-label={m['draftWorkspace.selectAllVisible']()}
                className="ml-1"
              />
              <div className="relative min-w-0 flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={m['draftWorkspace.search']()}
                  className="h-9 pl-9"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={m['draftWorkspace.refresh']()}
                onClick={() => threadsQuery.refetch()}
                disabled={threadsQuery.isFetching}
              >
                <RefreshCcw className={cn('size-4', threadsQuery.isFetching && 'animate-spin')} />
              </Button>
            </div>

            <DraftBulkActionBar
              count={selectedDraftIds.size}
              onClear={clearSelection}
              onDelete={requestDeleteSelection}
            />

            <div className="min-h-0 flex-1 overflow-y-auto p-2" role="list">
              {threadsQuery.isLoading || (rows.length === 0 && threadsQuery.isFetchingNextPage) ? (
                <DraftListSkeleton />
              ) : filteredRows.length ? (
                <div className="space-y-1">
                  {filteredRows.map((row) => (
                    <DraftRow
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      bulkSelected={selectedDraftIds.has(row.id)}
                      onToggle={() => toggleSelection(row.id)}
                      onSelect={(event) => handleRowSelect(row, event)}
                      onOpen={() => openDraft(row.id)}
                    />
                  ))}
                  {threadsQuery.hasNextPage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground mt-2 w-full"
                      onClick={() => void loadMore()}
                      disabled={threadsQuery.isFetchingNextPage}
                    >
                      {threadsQuery.isFetchingNextPage
                        ? m['draftWorkspace.loadingMore']()
                        : m['draftWorkspace.loadMore']()}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <DraftEmptyState filtered={Boolean(search.trim())} onCompose={createDraft} />
              )}
            </div>
          </div>

          <DraftPreview
            row={selectedRow}
            draft={selectedDraft.data}
            loading={selectedDraft.isLoading}
            onEdit={() => openDraft()}
            onDelete={requestDeleteCurrent}
          />
        </div>
      )}

      <Dialog
        open={Boolean(sendCandidate)}
        onOpenChange={(open) => !open && setSendCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['draftWorkspace.sendTitle']()}</DialogTitle>
            <DialogDescription>
              {m['draftWorkspace.sendDescription']({
                recipients: [
                  ...(sendCandidate?.to ?? []),
                  ...(sendCandidate?.cc ?? []),
                  ...(sendCandidate?.bcc ?? []),
                ].join(', '),
                subject: sendCandidate?.subject || m['draftWorkspace.untitled'](),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendCandidate(null)}>
              {m['draftWorkspace.cancel']()}
            </Button>
            <Button
              type="button"
              disabled={isSendingDraft}
              onClick={() => void confirmDirectSend()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {m['draftWorkspace.sendConfirm']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DraftDeleteDialog
        candidates={deleteCandidates}
        onOpenChange={(open) => !open && setDeleteCandidates([])}
        onConfirm={confirmDelete}
      />
    </section>
  );
}

function ViewTab({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      {typeof count === 'number' ? <span className="text-xs tabular-nums">{count}</span> : null}
    </button>
  );
}

function DraftShortcutRail() {
  return (
    <div className="text-muted-foreground hidden flex-wrap items-center gap-2 text-xs lg:flex">
      <Shortcut keys="J / K" label={m['draftWorkspace.navigate']()} />
      <Shortcut keys="E" label={m['draftWorkspace.edit']()} />
      <Shortcut keys="⌘ ↵" label={m['draftWorkspace.send']()} />
      <Shortcut keys="#" label={m['draftWorkspace.delete']()} />
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="bg-muted border-border/60 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold">
        {keys}
      </kbd>
      {label}
    </span>
  );
}

function DraftRow({
  row,
  selected,
  bulkSelected,
  onToggle,
  onSelect,
  onOpen,
}: {
  row: DraftListRow;
  selected: boolean;
  bulkSelected: boolean;
  onToggle: () => void;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="listitem"
      data-draft-row={row.id}
      className={cn(
        'group flex w-full items-stretch rounded-lg border text-left transition-colors',
        bulkSelected
          ? 'border-primary/35 bg-primary/[0.09]'
          : selected
            ? 'border-primary/25 bg-primary/[0.06]'
            : 'hover:border-border/60 hover:bg-muted/55 border-transparent',
      )}
    >
      <div className="flex shrink-0 items-start pl-3 pt-4">
        <Checkbox
          checked={bulkSelected}
          onCheckedChange={onToggle}
          aria-label={m['draftWorkspace.selectDraft']({ subject: row.subject })}
        />
      </div>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        onDoubleClick={onOpen}
        className="focus-visible:ring-primary/40 flex min-w-0 flex-1 items-start gap-3 rounded-r-lg px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <div
          className={cn(
            'mt-0.5 rounded-md p-2',
            selected || bulkSelected
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <FileText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{row.recipient}</p>
            <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {formatDraftDate(row.receivedAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm">{row.subject}</p>
          <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
            {row.preview || m['draftWorkspace.openToPreview']()}
          </p>
        </div>
        <ChevronRight
          className={cn(
            'text-muted-foreground mt-3 size-4 opacity-0 transition-opacity',
            selected && 'opacity-100',
          )}
        />
      </button>
    </div>
  );
}

function DraftPreview({
  row,
  draft,
  loading,
  onEdit,
  onDelete,
}: {
  row: DraftListRow | null;
  draft?: { to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; content?: string };
  loading: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!row) {
    return (
      <div className="text-muted-foreground hidden min-h-0 items-center justify-center p-8 text-center md:flex">
        <div>
          <FilePenLine className="mx-auto size-8 opacity-45" />
          <p className="text-foreground mt-3 font-medium">{m['draftWorkspace.selectTitle']()}</p>
          <p className="mt-1 text-sm">{m['draftWorkspace.selectDescription']()}</p>
        </div>
      </div>
    );
  }

  const body = stripDraftHtml(draft?.content ?? row.preview);

  return (
    <article className="bg-background hidden min-h-0 flex-col md:flex">
      <div className="border-border/60 flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5 xl:px-8">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.12em]">
            {m['draftWorkspace.preview']()}
          </p>
          <h2 className="mt-2 truncate text-xl font-semibold tracking-tight">
            {draft?.subject || row.subject}
          </h2>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span>
              <strong className="text-foreground font-medium">{m['draftWorkspace.to']()}:</strong>{' '}
              {draft?.to?.length ? recipientLabel(draft.to) : row.recipient}
            </span>
            {draft?.cc?.length ? <span>Cc: {draft.cc.join(', ')}</span> : null}
            {draft?.bcc?.length ? <span>Bcc: {draft.bcc.join(', ')}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="size-4" />
            {m['draftWorkspace.delete']()}
          </Button>
          <Button type="button" size="sm" onClick={onEdit}>
            <FilePenLine className="size-4" />
            {m['draftWorkspace.editAndSend']()}
            <kbd className="ml-1 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">E</kbd>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 xl:px-8">
        {loading ? (
          <div className="mx-auto max-w-3xl space-y-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl whitespace-pre-wrap text-[15px] leading-7">
            {body || (
              <span className="text-muted-foreground">{m['draftWorkspace.emptyBody']()}</span>
            )}
          </div>
        )}
      </div>

      <div className="border-border/60 bg-background/95 flex shrink-0 items-center justify-between border-t px-6 py-3 backdrop-blur xl:px-8">
        <p className="text-muted-foreground text-xs">{m['draftWorkspace.sendHint']()}</p>
        <Button type="button" onClick={onEdit}>
          <Send className="size-4" />
          {m['draftWorkspace.continueEditing']()}
        </Button>
      </div>
    </article>
  );
}

function DraftListSkeleton() {
  return (
    <div className="space-y-2 p-1">
      {['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map((key) => (
        <div key={key} className="flex gap-3 rounded-lg px-3 py-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DraftEmptyState({ filtered, onCompose }: { filtered: boolean; onCompose: () => void }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-5 text-center">
      <div className="bg-muted rounded-full p-3">
        {filtered ? (
          <Search className="text-muted-foreground size-5" />
        ) : (
          <Inbox className="text-muted-foreground size-5" />
        )}
      </div>
      <p className="mt-3 text-sm font-semibold">
        {filtered ? m['draftWorkspace.noResults']() : m['draftWorkspace.emptyTitle']()}
      </p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs leading-5">
        {filtered
          ? m['draftWorkspace.noResultsDescription']()
          : m['draftWorkspace.emptyDescription']()}
      </p>
      {!filtered ? (
        <Button type="button" size="sm" variant="outline" className="mt-4" onClick={onCompose}>
          <Plus className="size-4" />
          {m['draftWorkspace.newDraft']()}
        </Button>
      ) : null}
    </div>
  );
}
