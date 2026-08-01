import {
  draftListRow,
  matchesDraftSearch,
  moveDraftSelection,
  stripDraftHtml,
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
import { preloadComposeSurface } from '@/components/create/compose-surface';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useMailboxOverview } from '@/hooks/use-mailbox-overview';
import { QueueReview } from '@/components/queue/queue-review';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useThreads } from '@/hooks/use-threads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDraft } from '@/hooks/use-drafts';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
import { cn } from '@/lib/utils';

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
  const rows = useMemo(() => items.map(draftListRow), [items]);
  const draftCount = mailboxOverview.data?.folders.drafts ?? rows.length;
  const [search, setSearch] = useState('');
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesDraftSearch(row, search)),
    [rows, search],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<DraftListRow | null>(null);
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const [, setDraftId] = useQueryState('draftId');
  const { optimisticDeleteDraft } = useOptimisticActions();
  const { enableScope, disableScope } = useHotkeysContext();

  const selectedRow = filteredRows.find((row) => row.id === selectedId) ?? null;
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

  const requestDelete = () => {
    if (selectedRow) setDeleteCandidate(selectedRow);
  };

  const confirmDelete = () => {
    if (!deleteCandidate) return;
    const ids = filteredRows.map((row) => row.id).filter((id) => id !== deleteCandidate.id);
    const currentIndex = filteredRows.findIndex((row) => row.id === deleteCandidate.id);
    optimisticDeleteDraft(deleteCandidate.id);
    setSelectedId(ids[Math.min(currentIndex, ids.length - 1)] ?? null);
    setDeleteCandidate(null);
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
  useHotkeys(['shift+3', 'delete', 'meta+backspace', 'ctrl+backspace'], requestDelete, {
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

            <div className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
              {threadsQuery.isLoading ? (
                <DraftListSkeleton />
              ) : filteredRows.length ? (
                <div className="space-y-1">
                  {filteredRows.map((row) => (
                    <DraftRow
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      onSelect={() => setSelectedId(row.id)}
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
            onDelete={requestDelete}
          />
        </div>
      )}

      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['draftWorkspace.deleteTitle']()}</DialogTitle>
            <DialogDescription>
              {m['draftWorkspace.deleteDescription']({
                subject: deleteCandidate?.subject ?? m['draftWorkspace.untitled'](),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteCandidate(null)}>
              {m['draftWorkspace.cancel']()}
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {m['draftWorkspace.delete']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  onSelect,
  onOpen,
}: {
  row: DraftListRow;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-draft-row={row.id}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        'group w-full rounded-lg border px-3 py-3 text-left transition-colors',
        selected
          ? 'border-primary/25 bg-primary/[0.06]'
          : 'hover:border-border/60 hover:bg-muted/55 border-transparent',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 rounded-md p-2',
            selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
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
      </div>
    </button>
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
