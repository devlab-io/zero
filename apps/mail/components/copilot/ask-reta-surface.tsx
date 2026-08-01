import {
  draftHasContent,
  draftStorageKey,
  loadLocalDraft,
  saveLocalDraft,
  type ComposerDraftScope,
} from '@/lib/draft-storage';
import {
  askRetaConversationAtom,
  type AskRetaAssistantPayload,
  type AskRetaStepView,
  type AskRetaTurn,
} from './ask-reta-state';
import {
  clearAskRetaConversation,
  loadAskRetaConversation,
  saveAskRetaConversation,
} from '@/lib/ask-reta-conversation-storage';
import { insertIntoComposer, type ComposerInsertPayload } from '@/lib/composer-insert';
import { AskRetaStreamError, streamAskReta } from '@/lib/ask-reta-stream';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReplyStatePurge } from '@/hooks/use-reply-state-purge';
import { useActiveConnection } from '@/hooks/use-connections';
import { LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
import { log } from '@/lib/log';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

/**
 * Ask Reta panel (spec docs/spec/mail-copilot.md, slice 1) — the ONE sanctioned
 * generalist surface of the r9 contract. Strictly user-invoked; every
 * consequential action (open composer, save Gmail draft) is an explicit click.
 */

const ASK_RETA_MODELS: { key: string; label: () => string }[] = [
  { key: 'llama-4-scout', label: () => m['common.askReta.modelFast']() },
  { key: 'llama-3.3-70b', label: () => m['common.askReta.modelDeep']() },
];

const HISTORY_TURNS = 6;
const HISTORY_TURN_CHARS = 2_000;
const DRAFT_CONTEXT_CHARS = 8_000;

/**
 * Current unsent draft, as durably persisted by the composer (issue #34 seam).
 * The scope MUST mirror email-composer's persistence key ({threadId, draftId,
 * replyId: activeReplyId}) — the bare compose key would miss the draft or the
 * reply actually being edited. Read once per submit.
 */
const readComposerDraftContext = (scope: ComposerDraftScope) => {
  const snapshot = loadLocalDraft(draftStorageKey(scope));
  if (!snapshot || !draftHasContent(snapshot)) return undefined;
  return {
    subject: snapshot.subject.slice(0, 500) || undefined,
    to: snapshot.to.join(', ').slice(0, 500) || undefined,
    body: snapshot.message.slice(0, DRAFT_CONTEXT_CHARS) || undefined,
  };
};

export function AskRetaSurface() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [conversation, setConversation] = useAtom(askRetaConversationAtom);
  const [question, setQuestion] = useState('');
  const [threadId] = useQueryState('threadId');
  const [draftId] = useQueryState('draftId');
  const [activeReplyId] = useQueryState('activeReplyId');
  const [, setAskRetaOpen] = useQueryState('isAskRetaOpen');
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const purgeReplyState = useReplyStatePurge();
  // The EXACT persistence scope of whatever composer is (or would be) mounted.
  const composerScope: ComposerDraftScope = { threadId, draftId, replyId: activeReplyId };
  // The BARE compose scope for 'new' proposals. NO threadId: the composer's
  // autosave sends the URL threadId, so keeping the open thread would attach
  // the brand-new draft to that old thread. threadId is purged with the rest.
  const composeScope: ComposerDraftScope = {};
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: settingsData } = useSettings();
  const settingsSave = useMutation(trpc.settings.save.mutationOptions());
  const createDraft = useMutation(trpc.drafts.create.mutationOptions());

  // Slice-2 streaming state: steps arrive live; Stop aborts PREEMPTIVELY
  // (fetch abort → server request signal → pipeline race interruption).
  const [isAsking, setIsAsking] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AskRetaStepView[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Slice-2 persistence: DEVICE-LOCAL, scoped user+activeConnection, with a
  // REAL hydration barrier (revue 2026-08-01). Hazard: on a scope switch both
  // effects can run in ONE commit while the atom still holds the OLD scope's
  // turns — an unguarded save would write A's turns under B's key. Contract:
  // - `conversationScopeRef` names the scope the CURRENT atom content belongs
  //   to; saves happen ONLY when it matches the loaded scope.
  // - On switch: flush the old scope FIRST, abort any in-flight ask, disable
  //   saves (scope ref → null), hydrate; the save effect re-enables saves only
  //   when it observes the exact hydrated array (reference equality).
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { data: activeConnectionData } = useActiveConnection();
  const connectionId = activeConnectionData?.id;

  type ConversationScope = { userId: string; connectionId: string };
  const sameScope = (a: ConversationScope | null, b: ConversationScope | null) =>
    !!a && !!b && a.userId === b.userId && a.connectionId === b.connectionId;
  const scopeKeyOf = (scope: ConversationScope) => `${scope.userId}::${scope.connectionId}`;

  // Re-renderable hydration flag: submitting is DISABLED until the atom holds
  // the current scope's hydrated turns — a fast click at mount/switch can
  // never append a question to the wrong scope's conversation.
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const isHydrated =
    !!userId && !!connectionId && hydratedScopeKey === scopeKeyOf({ userId, connectionId });

  const loadedScopeRef = useRef<ConversationScope | null>(null);
  const conversationScopeRef = useRef<ConversationScope | null>(null);
  const conversationRef = useRef<AskRetaTurn[]>(conversation);
  conversationRef.current = conversation;
  const pendingHydrationRef = useRef<{ scope: ConversationScope; turns: AskRetaTurn[] } | null>(
    null,
  );

  useEffect(() => {
    if (!userId || !connectionId) return;
    const nextScope: ConversationScope = { userId, connectionId };
    if (sameScope(loadedScopeRef.current, nextScope)) return;

    // 1. Flush the OLD scope before anything else — its turns are still in the atom.
    const previous = loadedScopeRef.current;
    if (previous && sameScope(conversationScopeRef.current, previous)) {
      saveAskRetaConversation(previous.userId, previous.connectionId, conversationRef.current);
    }
    // 2. An in-flight ask belongs to the old scope: abort it, drop live steps.
    abortRef.current?.abort();
    setLiveSteps([]);
    // 3. Barrier down: saves AND submits disabled until hydration is observed.
    loadedScopeRef.current = nextScope;
    conversationScopeRef.current = null;
    setHydratedScopeKey(null);
    const turns = loadAskRetaConversation(userId, connectionId);
    pendingHydrationRef.current = { scope: nextScope, turns };
    setConversation(turns);
  }, [userId, connectionId, setConversation]);

  useEffect(() => {
    const pending = pendingHydrationRef.current;
    if (pending) {
      // Barrier up ONLY on the exact hydrated array — an old-scope value that
      // sneaks into the same commit can never be saved under the new key.
      if (conversation === pending.turns) {
        conversationScopeRef.current = pending.scope;
        pendingHydrationRef.current = null;
        setHydratedScopeKey(scopeKeyOf(pending.scope));
      }
      return;
    }
    const scope = conversationScopeRef.current;
    if (!scope || !sameScope(scope, loadedScopeRef.current)) return;
    saveAskRetaConversation(scope.userId, scope.connectionId, conversation);
  }, [conversation]);

  const modelKey =
    (settingsData?.settings as { askRetaModel?: string } | undefined)?.askRetaModel ??
    'llama-4-scout';

  const submit = async () => {
    const trimmed = question.trim();
    if (!trimmed || isAsking || !isHydrated) return;

    const history = conversation
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, HISTORY_TURN_CHARS) }));

    setConversation((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: trimmed },
    ]);
    setQuestion('');

    // Single read per submit, on the composer's exact scope key.
    const draftContext = readComposerDraftContext(composerScope);

    const controller = new AbortController();
    // Run guard (revue 2026-08-01): a LATE settlement of an old-scope stream
    // must never touch the state of a newer run — the switch effect replaces
    // `loadedScopeRef.current` with a fresh object, so reference equality
    // pins both the run (controller) and the scope it was started under.
    const scopeAtSubmit = loadedScopeRef.current;
    const isCurrentRun = () =>
      abortRef.current === controller && loadedScopeRef.current === scopeAtSubmit;

    abortRef.current = controller;
    setIsAsking(true);
    setLiveSteps([]);

    try {
      const result = await streamAskReta({
        input: {
          question: trimmed,
          history,
          context: {
            ...(threadId ? { threadId } : {}),
            ...(draftContext ? { draft: draftContext } : {}),
          },
        },
        signal: controller.signal,
        onStep: (step) => {
          if (!isCurrentRun()) return;
          setLiveSteps((prev) => [...prev, { ...step, id: crypto.randomUUID() }]);
        },
      });
      if (!isCurrentRun()) return;
      setConversation((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.answer,
          payload: {
            citations: result.citations,
            proposal: result.proposal,
            steps: result.steps.map((step) => ({ ...step, id: crypto.randomUUID() })),
            model: result.model,
          },
        } satisfies AskRetaTurn,
      ]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    } catch (error) {
      if (!isCurrentRun()) return; // stale run: no toast, no turn, no state
      if (error instanceof AskRetaStreamError && error.reason === 'aborted') {
        toast(m['common.askReta.cancelled']());
      } else {
        log.error('Ask Reta failed', error);
        toast.error(m['common.askReta.error']());
        setConversation((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: m['common.askReta.error']() },
        ]);
      }
    } finally {
      // Only the CURRENT run may reset the shared streaming state.
      if (abortRef.current === controller) {
        setIsAsking(false);
        setLiveSteps([]);
        abortRef.current = null;
      }
    }
  };

  /** Replay an edited search query — same caps, same read-only path, same folder. */
  const replaySearch = async (
    turnId: string,
    stepId: string,
    query: string,
    folder: string | undefined,
  ) => {
    try {
      const preview = await queryClient.fetchQuery(
        // The step's folder scope is PRESERVED: replaying a Sent-scoped search
        // must not silently widen to the whole mailbox.
        trpc.copilot.searchPreview.queryOptions({ query, ...(folder ? { folder } : {}) }),
      );
      setConversation((prev) =>
        prev.map((turn) => {
          if (turn.id !== turnId || !turn.payload) return turn;
          return {
            ...turn,
            payload: {
              ...turn.payload,
              steps: turn.payload.steps.map((step) =>
                step.id !== stepId || !step.search
                  ? step
                  : {
                      ...step,
                      detail: `"${query}"${folder ? ` in ${folder}` : ''} → ${preview.threads.length} threads`,
                      search: { ...step.search, query, threads: preview.threads },
                    },
              ),
            },
          };
        }),
      );
    } catch (error) {
      log.error('Ask Reta search replay failed', error);
      toast.error(m['common.actions.errorTryAgainLater']());
    }
  };

  const openCitation = (citedThreadId: string) => {
    // Full purge (mode/activeReplyId/draftId/picker) while switching thread —
    // stale reply state must never leak onto the cited thread.
    purgeReplyState({ threadId: citedThreadId });
    setAskRetaOpen(null);
  };

  /**
   * Insert a proposal into a composer. Targeting rule (revue UI 2026-08-01):
   * - 'reply' → the CURRENT scope key, live reply composer only.
   * - 'new'   → the BLANK compose scope: it must never inject into a live
   *   reply; the reply state is purged and the compose dialog opened instead.
   * In every path an occupied composer / non-empty snapshot requires an
   * explicit user confirmation — nothing is overwritten silently — and the
   * recipient travels with the payload (applied explicitly by the composer).
   */
  const openProposalInComposer = (payload: AskRetaAssistantPayload) => {
    const proposal = payload.proposal;
    if (!proposal) return;
    const isReply = proposal.kind === 'reply';
    const scopeKey = draftStorageKey(isReply ? composerScope : composeScope);
    const insertPayload: ComposerInsertPayload = {
      subject: proposal.subject,
      to: proposal.to,
      message: proposal.bodyHtml,
    };

    const finishLive = () => {
      toast.success(m['common.askReta.inserted']());
      setAskRetaOpen(null);
    };
    const writeSnapshotAndOpen = () => {
      saveLocalDraft(scopeKey, {
        to: proposal.to ? [proposal.to] : [],
        cc: [],
        bcc: [],
        subject: proposal.subject ?? '',
        message: proposal.bodyHtml,
        savedAt: Date.now(),
      });
      setAskRetaOpen(null);
      // Bare compose scope by construction: reply/draft params AND threadId
      // are purged, so the mounting composer derives exactly `{}` and its
      // autosave cannot attach the new draft to the previously open thread.
      purgeReplyState({ threadId: null });
      setComposeOpen('true');
    };

    const result = insertIntoComposer(scopeKey, insertPayload);
    if (result === 'inserted') return finishLive();
    if (result === 'occupied') {
      toast(m['common.askReta.replacePrompt'](), {
        action: {
          label: m['common.askReta.replace'](),
          onClick: () => {
            if (insertIntoComposer(scopeKey, insertPayload, { force: true }) === 'inserted') {
              finishLive();
            }
          },
        },
      });
      return;
    }

    // No live composer. A reply proposal needs its reply composer open — the
    // button is hidden otherwise (canInsertProposal), so reaching here with a
    // reply means the composer just closed: bail without touching anything.
    if (isReply) {
      toast.error(m['common.askReta.error']());
      return;
    }
    const existing = loadLocalDraft(scopeKey);
    if (existing && draftHasContent(existing)) {
      toast(m['common.askReta.replacePrompt'](), {
        action: { label: m['common.askReta.replace'](), onClick: writeSnapshotAndOpen },
      });
      return;
    }
    writeSnapshotAndOpen();
  };

  /** A reply proposal is insertable only into ITS thread's live reply composer. */
  const canInsertProposal = (payload: AskRetaAssistantPayload) => {
    const proposal = payload.proposal;
    if (!proposal) return false;
    if (proposal.kind === 'new') return true;
    return Boolean(proposal.threadId && proposal.threadId === threadId && activeReplyId);
  };

  const saveProposalAsDraft = async (payload: AskRetaAssistantPayload) => {
    const proposal = payload.proposal;
    if (!proposal) return;
    try {
      await createDraft.mutateAsync({
        to: proposal.to ?? '',
        subject: proposal.subject ?? '',
        message: proposal.bodyHtml,
        id: null,
        threadId: proposal.threadId ?? null,
        fromEmail: null,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.drafts.list.queryKey() });
      toast.success(m['common.askReta.draftCreated']());
    } catch (error) {
      log.error('Ask Reta draft creation failed', error);
      toast.error(m['common.actions.errorTryAgainLater']());
    }
  };

  const proposalText = (bodyHtml: string) =>
    bodyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .trim();

  const copyProposal = async (payload: AskRetaAssistantPayload) => {
    const proposal = payload.proposal;
    if (!proposal) return;
    try {
      await navigator.clipboard.writeText(proposalText(proposal.bodyHtml));
      toast.success(m['common.askReta.copied']());
    } catch (error) {
      log.error('Ask Reta clipboard copy failed', error);
      toast.error(m['common.actions.errorTryAgainLater']());
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{m['common.askReta.title']()}</p>
            <p className="text-muted-foreground text-xs">{m['common.askReta.subtitle']()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ask-reta-model" className="text-muted-foreground text-xs">
            {m['common.askReta.model']()}
          </label>
          <select
            id="ask-reta-model"
            value={modelKey}
            disabled={settingsSave.isPending}
            onChange={(event) => {
              void settingsSave
                .mutateAsync({ askRetaModel: event.target.value as never })
                .then(() =>
                  queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() }),
                )
                .catch((error) => {
                  log.error('Ask Reta model save failed', error);
                  toast.error(m['common.actions.errorTryAgainLater']());
                });
            }}
            className="bg-background h-7 rounded border px-1 text-xs"
          >
            {ASK_RETA_MODELS.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label()}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m['common.askReta.clear']()}
            onClick={() => {
              setConversation([]);
              // Effective clear: the device-local store is removed, not just the atom.
              if (userId && connectionId) clearAskRetaConversation(userId, connectionId);
            }}
            className="h-7 w-7"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {conversation.length === 0 && (
          <p className="text-muted-foreground pt-8 text-center text-sm">
            {m['common.askReta.empty']()}
          </p>
        )}
        {conversation.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] rounded-lg bg-[#006FFE] px-3 py-2 text-sm text-white'
                  : 'bg-muted/60 max-w-[95%] rounded-lg px-3 py-2 text-sm'
              }
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>

              {turn.payload?.steps && turn.payload.steps.length > 0 && (
                <ul className="text-muted-foreground mt-2 space-y-1 text-[11px]">
                  {turn.payload.steps.map((step) =>
                    step.search ? (
                      <AskRetaSearchStep
                        key={step.id}
                        step={step}
                        onOpenThread={openCitation}
                        onReplay={(query) =>
                          replaySearch(turn.id, step.id, query, step.search?.folder)
                        }
                      />
                    ) : (
                      <li key={step.id}>· {step.detail}</li>
                    ),
                  )}
                </ul>
              )}

              {turn.payload?.citations && turn.payload.citations.length > 0 && (
                <div className="mt-2">
                  <p className="text-muted-foreground text-[11px] font-medium">
                    {m['common.askReta.sources']()}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {turn.payload.citations.map((citation) => (
                      <button
                        key={citation.ref}
                        type="button"
                        onClick={() => openCitation(citation.threadId)}
                        title={`${citation.sender} — ${citation.date}${citation.quote ? ` — « ${citation.quote} »` : ''}`}
                        className="bg-background hover:bg-accent max-w-[240px] truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                      >
                        {citation.subject}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turn.payload?.proposal && (
                <div className="bg-background mt-2 rounded-lg border p-2">
                  <p className="text-[11px] font-medium">{m['common.askReta.proposal']()}</p>
                  {turn.payload.proposal.subject && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {turn.payload.proposal.subject}
                    </p>
                  )}
                  {/* Text-only preview: the sanitized HTML is used solely when
                      inserting into the composer or saving a Gmail draft. */}
                  <p className="text-muted-foreground mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs">
                    {proposalText(turn.payload.proposal.bodyHtml)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {canInsertProposal(turn.payload) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openProposalInComposer(turn.payload!)}
                      >
                        {m['common.askReta.openInComposer']()}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={createDraft.isPending}
                      onClick={() => void saveProposalAsDraft(turn.payload!)}
                    >
                      {m['common.askReta.createDraft']()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => void copyProposal(turn.payload!)}
                    >
                      {m['common.askReta.copy']()}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isAsking && (
          <div className="text-muted-foreground space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {m['common.askReta.thinking']()}
            </div>
            {/* Steps stream in as the pipeline completes them (slice 2). */}
            {liveSteps.length > 0 && (
              <ul className="space-y-0.5 pl-5 text-[11px]">
                {liveSteps.map((step) => (
                  <li key={step.id}>· {step.detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={m['common.askReta.placeholder']()}
          aria-label={m['common.askReta.placeholder']()}
          className="h-9"
          autoFocus
        />
        {isAsking ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => abortRef.current?.abort()}
          >
            {m['common.askReta.stop']()}
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={!question.trim() || !isHydrated}
          >
            {m['common.askReta.send']()}
          </Button>
        )}
      </form>
    </div>
  );
}

/**
 * A search step: the exact metadata thread set the search returned, each
 * thread clickable, with the query visible, editable and replayable (same
 * caps, same read-only path — copilot.searchPreview).
 */
function AskRetaSearchStep({
  step,
  onOpenThread,
  onReplay,
}: {
  step: AskRetaStepView;
  onOpenThread: (threadId: string) => void;
  onReplay: (query: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(step.search?.query ?? '');
  const [replaying, setReplaying] = useState(false);
  if (!step.search) return <li>· {step.detail}</li>;

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true">·</span>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={m['common.askReta.searchQueryLabel']()}
          className="h-6 max-w-[240px] px-1.5 text-[11px]"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          disabled={replaying || !query.trim()}
          onClick={() => {
            setReplaying(true);
            void onReplay(query.trim()).finally(() => setReplaying(false));
          }}
        >
          {replaying ? (
            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            m['common.askReta.replay']()
          )}
        </Button>
        <span className="text-muted-foreground">
          {step.search.threads.length} {m['common.askReta.threadsFound']()}
        </span>
      </div>
      {step.search.threads.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-3">
          {step.search.threads.map((thread) => (
            <button
              key={thread.threadId}
              type="button"
              onClick={() => onOpenThread(thread.threadId)}
              title={`${thread.sender} — ${thread.date}`}
              className="bg-background hover:bg-accent max-w-[220px] truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors"
            >
              {thread.subject}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export default AskRetaSurface;
