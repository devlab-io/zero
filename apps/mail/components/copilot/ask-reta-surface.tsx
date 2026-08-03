import {
  askRetaConversationAtom,
  askRetaThreadCaptureAtom,
  type AskRetaAssistantPayload,
  type AskRetaStepView,
  type AskRetaTurn,
} from './ask-reta-state';
import {
  draftHasContent,
  loadLocalDraft,
  ownedDraftStorageKey,
  saveLocalDraft,
  type ComposerDraftScope,
  type DraftOwner,
} from '@/lib/draft-storage';
import {
  clearAskRetaConversation,
  loadAskRetaConversation,
  saveAskRetaConversation,
} from '@/lib/ask-reta-conversation-storage';
import { AskRetaConversation, askRetaProposalBodyToText } from './ask-reta-conversation';
import { insertIntoComposer, type ComposerInsertPayload } from '@/lib/composer-insert';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasLiveComposer, readLiveDraft } from '@/lib/live-draft-registry';
import { AskRetaStreamError, streamAskReta } from '@/lib/ask-reta-stream';
import type { AskRetaAttachment } from '@/lib/ask-reta-attachments';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useReplyStatePurge } from '@/hooks/use-reply-state-purge';
import { useActiveConnection } from '@/hooks/use-connections';
import { AskRetaComposer } from './ask-reta-composer';
import { useTRPC } from '@/providers/query-provider';
import { useMail } from '@/components/mail/use-mail';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { Mail, Trash2 } from 'lucide-react';
import { m } from '@/paraglide/messages';
import { useParams } from 'react-router';
import { useQueryState } from 'nuqs';
import { log } from '@/lib/log';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

/**
 * Ask Reta panel (spec docs/spec/mail-copilot.md, slice 1) — the ONE sanctioned
 * generalist surface of the r9 contract. Strictly user-invoked; every
 * consequential action (open composer, save Gmail draft) is an explicit click.
 */

// Slice 3B: the model list is the SERVER catalogue (copilot.modelCatalog) —
// nothing static, no settings.save side channel. The manager dialog is a
// separate lazy chunk so key management never weighs on the shell.
const ModelManagerDialog = lazy(() =>
  import('./model-manager').then((mod) => ({ default: mod.ModelManagerDialog })),
);

const MODEL_PROVIDER_GROUPS: { provider: string; label: string }[] = [
  { provider: 'workers-ai', label: 'Workers AI' },
  { provider: 'openai', label: 'OpenAI' },
  { provider: 'anthropic', label: 'Anthropic' },
  { provider: 'gemini', label: 'Google' },
  { provider: 'openrouter', label: 'OpenRouter' },
  { provider: 'moonshot', label: 'Moonshot' },
  { provider: 'zai', label: 'Z.AI' },
];

const HISTORY_TURNS = 6;
const HISTORY_TURN_CHARS = 2_000;
const DRAFT_CONTEXT_CHARS = 8_000;
type ConversationScope = { userId: string; connectionId: string };
const sameScope = (a: ConversationScope | null, b: ConversationScope | null) =>
  !!a && !!b && a.userId === b.userId && a.connectionId === b.connectionId;
const scopeKeyOf = (scope: ConversationScope) => `${scope.userId}::${scope.connectionId}`;

const boundDraftContext = (draft: { subject: string; to: string; body: string }) => {
  const bounded = {
    subject: draft.subject.slice(0, 500) || undefined,
    to: draft.to.slice(0, 500) || undefined,
    body: draft.body.slice(0, DRAFT_CONTEXT_CHARS) || undefined,
  };
  return bounded.subject || bounded.to || bounded.body ? bounded : undefined;
};

/**
 * Current unsent draft — read ONCE at submit time (slice 2bis, scope-fix):
 * the key is OWNED ({userId, connectionId} + composer scope) — an unresolved
 * owner reads NOTHING (fail-closed, never a legacy unscoped key).
 * 1. the LIVE registry for the exact owned scope wins: it is what was JUST
 *    typed, ahead of any lagging autosave. A mounted-but-empty composer is
 *    the truth too (no fallback to a stale local snapshot).
 * 2. the durable local snapshot is the fallback ONLY when no live composer is
 *    mounted for that owned scope.
 */
const readComposerDraftContext = (owner: DraftOwner | null, scope: ComposerDraftScope) => {
  if (!owner) return undefined;
  const scopeKey = ownedDraftStorageKey(owner, scope);
  if (hasLiveComposer(scopeKey)) {
    const live = readLiveDraft(scopeKey);
    if (!live) return undefined;
    return boundDraftContext({
      subject: live.subject,
      to: live.to.join(', '),
      body: live.bodyHtml,
    });
  }
  const snapshot = loadLocalDraft(scopeKey);
  if (!snapshot || !draftHasContent(snapshot)) return undefined;
  return boundDraftContext({
    subject: snapshot.subject,
    to: snapshot.to.join(', '),
    body: snapshot.message,
  });
};

export function AskRetaSurface() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [conversation, setConversation] = useAtom(askRetaConversationAtom);
  const [question, setQuestion] = useState('');
  const [attachments, setAttachments] = useState<AskRetaAttachment[]>([]);
  const [threadId] = useQueryState('threadId');
  const { folder: routeFolder } = useParams<{ folder: string }>();
  const [mail] = useMail();
  const [draftId] = useQueryState('draftId');
  const [activeReplyId] = useQueryState('activeReplyId');
  const [, setAskRetaOpen] = useQueryState('isAskRetaOpen');
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  const purgeReplyState = useReplyStatePurge();
  // Capture du raccourci (tour 06) : Y fige le fil ouvert au moment de la
  // frappe, Cmd+J fige « aucun fil ». Prioritaire sur l'URL pour l'affichage
  // ET le contexte serveur ; sans capture (bouton/palette), l'URL fait foi.
  const [threadCapture, setThreadCapture] = useAtom(askRetaThreadCaptureAtom);
  const effectiveThreadId = threadCapture ? threadCapture.threadId : threadId;
  const canonicalFolder = (
    ['inbox', 'sent', 'archive', 'spam', 'trash', 'bin', 'draft', 'snoozed'] as const
  ).find((folder) => folder === routeFolder);
  const selectedThreadIds = mail.bulkSelected.slice(0, 10);
  // Éphémère : mort à la fermeture du panneau (unmount) et à la fermeture du
  // fil sous-jacent ; le changement de compte/connexion purge plus bas.
  useEffect(() => () => setThreadCapture(null), [setThreadCapture]);
  useEffect(() => {
    if (!threadId) setThreadCapture(null);
  }, [threadId, setThreadCapture]);
  // The EXACT persistence scope of whatever composer is (or would be) mounted.
  const composerScope: ComposerDraftScope = { threadId, draftId, replyId: activeReplyId };
  // The BARE compose scope for 'new' proposals. NO threadId: the composer's
  // autosave sends the URL threadId, so keeping the open thread would attach
  // the brand-new draft to that old thread. threadId is purged with the rest.
  const composeScope: ComposerDraftScope = {};
  const scrollRef = useRef<HTMLDivElement>(null);

  const createDraft = useMutation(trpc.drafts.create.mutationOptions());
  // Server catalogue = single source of truth for models AND the selection
  // (slice 3B). Query cache is already owner/connection-partitioned upstream.
  const modelCatalogQuery = useQuery(trpc.copilot.modelCatalog.queryOptions());
  const modelCatalog = modelCatalogQuery.data;
  const selectModel = useMutation(trpc.copilot.selectModel.mutationOptions());
  const [manageOpen, setManageOpen] = useState(false);

  // Slice-2 streaming state: steps arrive live. Stop aborts the fetch, which
  // stops the server transport/pipeline immediately (late results discarded);
  // a provider call already dispatched server-side may finish there unused.
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

  // Re-renderable hydration flag: submitting is DISABLED until the atom holds
  // the current scope's hydrated turns — a fast click at mount/switch can
  // never append a question to the wrong scope's conversation.
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const isHydrated =
    !!userId && !!connectionId && hydratedScopeKey === scopeKeyOf({ userId, connectionId });
  // ZERO paint of a stale scope: until hydration lands, the panel renders an
  // empty conversation — A's turns are never visible on B, not even one frame.
  const visibleConversation = isHydrated ? conversation : [];
  // SINGLE display source for the asking state (review 02-3): on B's
  // pre-effect frame isAsking can still be true from A's run — every visual
  // branch (progression AND the Stop/Send switch) keys on this, never on
  // isAsking alone.
  const visibleAsking = isHydrated && isAsking;
  // Compact aria-live announcement (polite/atomic): thinking → latest step →
  // answer ready / error. Screen readers follow the ask without spam.
  const [announcement, setAnnouncement] = useState('');

  // Badge « fil actuel inclus » (prod CUA fix, durci tour 05) : la liaison
  // fil↔owner est DÉRIVÉE au rendu (ref latchée), plus aucun état posé par
  // effet — l'ancienne capture asynchrone laissait une fenêtre où le badge
  // pouvait ne jamais se peindre selon l'ordre des effets au montage lazy.
  // Sémantique inchangée : lié au owner+connexion où CE threadId est apparu ;
  // un changement de compte avec le même threadId le masque, la fermeture du
  // fil le tue, un nouveau fil le recapture. Le serveur reste l'autorité
  // d'ownership sur context.threadId — affichage seulement.
  const threadChipBindingRef = useRef<{ threadId: string; scopeKey: string } | null>(null);
  if (!effectiveThreadId) {
    threadChipBindingRef.current = null;
  } else if (userId && connectionId) {
    const currentScopeKey = scopeKeyOf({ userId, connectionId });
    if (
      !threadChipBindingRef.current ||
      threadChipBindingRef.current.threadId !== effectiveThreadId
    ) {
      // Premier rendu où CE fil est visible : lié au owner+connexion COURANTS.
      threadChipBindingRef.current = { threadId: effectiveThreadId, scopeKey: currentScopeKey };
    }
  }
  const threadChipBinding = threadChipBindingRef.current;
  const showThreadChip =
    !!effectiveThreadId &&
    isHydrated &&
    !!userId &&
    !!connectionId &&
    !!threadChipBinding &&
    threadChipBinding.threadId === effectiveThreadId &&
    threadChipBinding.scopeKey === scopeKeyOf({ userId, connectionId });
  // Sujet UNIQUEMENT s'il est DÉJÀ dans le cache react-query du compte
  // (getQueryData — zéro fetch, jamais de corps) ; sinon chip générique.
  const cachedThread = showThreadChip
    ? (queryClient.getQueryData(trpc.mail.get.queryKey({ id: effectiveThreadId })) as
        | { latest?: { subject?: string } }
        | undefined)
    : undefined;
  const threadChipSubject = cachedThread?.latest?.subject?.slice(0, 80);

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
    // 2. EVERYTHING of the old scope dies here (review 02-2): the in-flight
    //    ask is aborted AND its controller invalidated, the unsent question,
    //    the live steps, the announcement and the asking state are purged —
    //    a confidential draft question typed under A never exists under B.
    abortRef.current?.abort();
    abortRef.current = null;
    setIsAsking(false);
    setLiveSteps([]);
    setQuestion('');
    setAttachments([]);
    setAnnouncement('');
    // Slice 3B: the model manager dies with the scope too — its cards hold
    // ephemeral secret state that must never survive an account switch (the
    // dialog is ALSO keyed on the owner, this close is the first barrier).
    setManageOpen(false);
    // Tour 06 : la capture de fil du raccourci meurt avec le compte — le fil
    // de A n'est jamais transmis comme contexte sous B. UNIQUEMENT sur un
    // vrai changement (previous non nul) : la première hydratation ne doit
    // pas tuer la capture que le raccourci vient de poser.
    if (previous) setThreadCapture(null);
    // 3. Barrier down: saves AND submits disabled until hydration is observed.
    loadedScopeRef.current = nextScope;
    conversationScopeRef.current = null;
    setHydratedScopeKey(null);
    const turns = loadAskRetaConversation(userId, connectionId);
    pendingHydrationRef.current = { scope: nextScope, turns };
    setConversation(turns);
  }, [userId, connectionId, setConversation, setThreadCapture]);

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

  const selectedModelId = modelCatalog?.selectedModelId ?? 'workers-ai:llama-4-scout';

  const submit = async () => {
    const trimmed = question.trim();
    if (!trimmed || isAsking || !isHydrated) return;
    const attachmentsAtSubmit = attachments;

    const history = conversation
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, HISTORY_TURN_CHARS) }));

    setConversation((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        ...(attachmentsAtSubmit.length
          ? {
              attachments: attachmentsAtSubmit.map(({ name, type, size }) => ({
                name,
                type,
                size,
              })),
            }
          : {}),
      },
    ]);
    setQuestion('');
    setAttachments([]);

    // Single read per submit, on the composer's exact OWNED scope key —
    // isHydrated guarantees userId/connectionId are resolved here.
    const draftContext = readComposerDraftContext(
      userId && connectionId ? { userId, connectionId } : null,
      composerScope,
    );

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
    setAnnouncement(m['common.askReta.thinking']());

    try {
      const result = await streamAskReta({
        input: {
          question: trimmed,
          history,
          context: {
            // Capture du raccourci prioritaire (tour 06) ; le serveur reste
            // l'autorité d'ownership et rejette tout fil étranger.
            ...(effectiveThreadId ? { threadId: effectiveThreadId } : {}),
            ...(canonicalFolder ? { folder: canonicalFolder } : {}),
            ...(selectedThreadIds.length ? { selectedThreadIds } : {}),
            ...(draftContext ? { draft: draftContext } : {}),
            ...(attachmentsAtSubmit.length
              ? {
                  attachments: attachmentsAtSubmit.map(({ name, type, size, text }) => ({
                    name,
                    type,
                    size,
                    text,
                  })),
                }
              : {}),
          },
        },
        signal: controller.signal,
        onStep: (step) => {
          if (!isCurrentRun()) return;
          setLiveSteps((prev) => [...prev, { ...step, id: crypto.randomUUID() }]);
          setAnnouncement(step.detail);
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
      setAnnouncement(m['common.askReta.answerReady']());
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    } catch (error) {
      if (!isCurrentRun()) return; // stale run: no toast, no turn, no state
      if (error instanceof AskRetaStreamError && error.reason === 'aborted') {
        toast(m['common.askReta.cancelled']());
        setAnnouncement(m['common.askReta.cancelled']());
      } else {
        log.error('Ask Reta failed', error);
        toast.error(m['common.askReta.error']());
        setAnnouncement(m['common.askReta.error']());
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
    // Server contract: canonical folder enum only. A step folder always comes
    // from that enum; anything else (tampered storage) is dropped, not sent.
    const CANONICAL_FOLDERS = [
      'inbox',
      'sent',
      'archive',
      'spam',
      'trash',
      'bin',
      'draft',
      'snoozed',
    ] as const;
    type CanonicalFolder = (typeof CANONICAL_FOLDERS)[number];
    const canonicalFolder = CANONICAL_FOLDERS.includes(folder as CanonicalFolder)
      ? (folder as CanonicalFolder)
      : undefined;
    try {
      const preview = await queryClient.fetchQuery(
        // The step's folder scope is PRESERVED: replaying a Sent-scoped search
        // must not silently widen to the whole mailbox.
        trpc.copilot.searchPreview.queryOptions({
          query,
          ...(canonicalFolder ? { folder: canonicalFolder } : {}),
        }),
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
    // Owned keys only (scope-fix): without a resolved owner, no insert target
    // and no snapshot write — never a shared/legacy key.
    if (!userId || !connectionId) return;
    const owner: DraftOwner = { userId, connectionId };
    const isReply = proposal.kind === 'reply';
    const scopeKey = ownedDraftStorageKey(owner, isReply ? composerScope : composeScope);
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

  const copyProposal = async (payload: AskRetaAssistantPayload) => {
    const proposal = payload.proposal;
    if (!proposal) return;
    try {
      await navigator.clipboard.writeText(askRetaProposalBodyToText(proposal.bodyHtml));
      toast.success(m['common.askReta.copied']());
    } catch (error) {
      log.error('Ask Reta clipboard copy failed', error);
      toast.error(m['common.actions.errorTryAgainLater']());
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <label htmlFor="ask-reta-model" className="sr-only">
          {m['common.askReta.model']()}
        </label>
        <select
          id="ask-reta-model"
          value={selectedModelId}
          disabled={!modelCatalog || selectModel.isPending}
          onChange={(event) => {
            // Server is the source of truth: mutate, then atomically
            // refresh the catalogue (selection + configured flags).
            void selectModel
              .mutateAsync({ modelId: event.target.value })
              .then(() =>
                queryClient.invalidateQueries({
                  queryKey: trpc.copilot.modelCatalog.queryKey(),
                }),
              )
              .catch(() => {
                toast.error(m['common.actions.errorTryAgainLater']());
              });
          }}
          className="bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-xs"
        >
          {MODEL_PROVIDER_GROUPS.map((group) => {
            const models =
              modelCatalog?.models.filter((model) => model.provider === group.provider) ?? [];
            if (!models.length) return null;
            return (
              <optgroup key={group.provider} label={group.label}>
                {models.map((model) => {
                  // Configured models are selectable; the rest stay VISIBLE
                  // but disabled — the manage button is the configure path.
                  const locked =
                    model.requiresCredential &&
                    (!model.configured || !modelCatalog?.vaultAvailable);
                  return (
                    <option key={model.id} value={model.id} disabled={locked}>
                      {model.label}
                      {locked ? ` — ${m['common.askReta.notConfigured']()}` : ''}
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 px-2 text-xs"
          onClick={() => setManageOpen(true)}
        >
          {m['common.askReta.manageModels']()}
        </Button>
        {manageOpen && userId && connectionId ? (
          <Suspense fallback={null}>
            <ModelManagerDialog
              // Keyed on the owner: an account/connection switch can never
              // carry a card's ephemeral secret state across.
              key={`${userId}:${connectionId}`}
              open={manageOpen}
              onOpenChange={setManageOpen}
            />
          </Suspense>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={m['common.askReta.clear']()}
          onClick={() => {
            // Order matters (slice-2 review): kill the in-flight run FIRST —
            // abort + invalidate the controller + reset streaming state — so
            // a slow stream can never land a turn into the cleared state.
            abortRef.current?.abort();
            abortRef.current = null;
            setIsAsking(false);
            setLiveSteps([]);
            setAnnouncement('');
            setConversation([]);
            // Effective clear: the device-local store is removed, not just the atom.
            if (userId && connectionId) clearAskRetaConversation(userId, connectionId);
          }}
          className="size-9 shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Compact live region: thinking → latest step → answer ready.
          Rendered ONLY for the hydrated scope — no stale announcement paint. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {isHydrated ? announcement : ''}
      </p>

      <AskRetaConversation
        turns={visibleConversation}
        asking={visibleAsking}
        liveSteps={liveSteps}
        scrollRef={scrollRef}
        savingDraft={createDraft.isPending}
        onOpenThread={openCitation}
        onReplaySearch={replaySearch}
        canInsertProposal={canInsertProposal}
        onOpenProposal={openProposalInComposer}
        onSaveProposal={saveProposalAsDraft}
        onCopyProposal={copyProposal}
      />

      {/* Visual context (prod CUA fix 2026-08-01): the open thread rides along
          with the ask — say so. Subject ONLY if already cached (getQueryData,
          zero fetch, zero body); the chip dies with the thread AND with the
          account/connection it was captured under. Server-side ownership of
          context.threadId stays the authority — this is display only. */}
      {showThreadChip && (
        <div className="border-t px-3 pt-2">
          <span
            data-testid="ask-reta-thread-chip"
            className="bg-primary/10 text-primary inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-medium"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {m['common.askReta.currentThreadIncluded']()}
              {threadChipSubject ? ` — ${threadChipSubject}` : ''}
            </span>
          </span>
        </div>
      )}
      {(selectedThreadIds.length > 0 || canonicalFolder) && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 pt-2">
          {selectedThreadIds.length > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium">
              {m['common.askReta.selectedThreadsIncluded']({ count: selectedThreadIds.length })}
            </span>
          )}
          {canonicalFolder && (
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium">
              {m['common.askReta.folderIncluded']({ folder: canonicalFolder })}
            </span>
          )}
        </div>
      )}
      {/* Small render-time hint: the live composer's current draft will ride
          along with the next ask (read once at submit, live registry first). */}
      {isHydrated &&
        userId &&
        connectionId &&
        hasLiveComposer(ownedDraftStorageKey({ userId, connectionId }, composerScope)) && (
          <p className="text-muted-foreground border-t px-3 pt-2 text-[11px]">
            {m['common.askReta.draftIncluded']()}
          </p>
        )}
      <AskRetaComposer
        question={isHydrated ? question : ''}
        onQuestionChange={setQuestion}
        attachments={isHydrated ? attachments : []}
        onAttachmentsChange={setAttachments}
        userId={userId}
        connectionId={connectionId}
        disabled={!isHydrated}
        asking={visibleAsking}
        onSubmit={() => void submit()}
        onStop={() => abortRef.current?.abort()}
      />
    </div>
  );
}

export default AskRetaSurface;
