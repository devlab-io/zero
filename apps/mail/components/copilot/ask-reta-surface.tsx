import {
  draftHasContent,
  draftStorageKey,
  loadLocalDraft,
  saveLocalDraft,
  type ComposerDraftScope,
} from '@/lib/draft-storage';
import { askRetaConversationAtom, type AskRetaAssistantPayload } from './ask-reta-state';
import { insertIntoComposer, type ComposerInsertPayload } from '@/lib/composer-insert';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { useSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { useRef, useState } from 'react';
import { useQueryState } from 'nuqs';
import { log } from '@/lib/log';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

/**
 * Ask Reta panel (spec docs/spec/mail-copilot.md, slice 1) — the ONE sanctioned
 * generalist surface of the r9 contract. Strictly user-invoked; every
 * consequential action (open composer, save Gmail draft) is an explicit click.
 */

const ASK_RETA_MODELS: { key: string; label: string }[] = [
  { key: 'llama-4-scout', label: 'Llama 4 Scout · fast' },
  { key: 'llama-3.3-70b', label: 'Llama 3.3 70B · deep' },
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
  const [threadId, setThreadId] = useQueryState('threadId');
  const [draftId] = useQueryState('draftId');
  const [activeReplyId] = useQueryState('activeReplyId');
  const [, setAskRetaOpen] = useQueryState('isAskRetaOpen');
  const [, setComposeOpen] = useQueryState('isComposeOpen');
  // The EXACT persistence scope of whatever composer is (or would be) mounted.
  const composerScope: ComposerDraftScope = { threadId, draftId, replyId: activeReplyId };
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: settingsData } = useSettings();
  const settingsSave = useMutation(trpc.settings.save.mutationOptions());
  const createDraft = useMutation(trpc.drafts.create.mutationOptions());
  const ask = useMutation(trpc.copilot.ask.mutationOptions());

  const modelKey =
    (settingsData?.settings as { askRetaModel?: string } | undefined)?.askRetaModel ??
    'llama-4-scout';

  const submit = async () => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;

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

    try {
      const result = await ask.mutateAsync({
        question: trimmed,
        history,
        context: {
          ...(threadId ? { threadId } : {}),
          ...(draftContext ? { draft: draftContext } : {}),
        },
      });
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
        },
      ]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    } catch (error) {
      log.error('Ask Reta failed', error);
      toast.error(m['common.askReta.error']());
      setConversation((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: m['common.askReta.error']() },
      ]);
    }
  };

  const openCitation = (citedThreadId: string) => {
    setThreadId(citedThreadId);
    setAskRetaOpen(null);
  };

  /**
   * Insert a proposal into the composer. Order of attempts:
   * 1. live insert into the mounted composer for the current scope key;
   * 2. 'occupied' → the user confirms replacement via the toast action;
   * 3. no live composer → persisted snapshot (same key) + open the composer —
   *    but never over an existing snapshot without the same confirmation.
   */
  const openProposalInComposer = (payload: AskRetaAssistantPayload) => {
    const proposal = payload.proposal;
    if (!proposal) return;
    const scopeKey = draftStorageKey(composerScope);
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
    if (proposal.kind === 'reply') {
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
    await navigator.clipboard.writeText(proposalText(proposal.bodyHtml));
    toast.success(m['common.askReta.copied']());
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
                );
            }}
            className="bg-background h-7 rounded border px-1 text-xs"
          >
            {ASK_RETA_MODELS.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m['common.askReta.clear']()}
            onClick={() => setConversation([])}
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
                <ul className="text-muted-foreground mt-2 space-y-0.5 text-[11px]">
                  {turn.payload.steps.map((step) => (
                    <li key={step.id}>· {step.detail}</li>
                  ))}
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
                        title={`${citation.sender} — ${citation.date}`}
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
        {ask.isPending && (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {m['common.askReta.thinking']()}
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
        <Button
          type="submit"
          size="sm"
          className="h-9"
          disabled={ask.isPending || !question.trim()}
        >
          {m['common.askReta.send']()}
        </Button>
      </form>
    </div>
  );
}

export default AskRetaSurface;
