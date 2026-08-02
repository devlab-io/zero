import type { AskRetaAssistantPayload, AskRetaStepView, AskRetaTurn } from './ask-reta-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoaderCircle } from 'lucide-react';
import { m } from '@/paraglide/messages';
import type { RefObject } from 'react';
import { useState } from 'react';

type AskRetaConversationProps = {
  turns: AskRetaTurn[];
  asking: boolean;
  liveSteps: AskRetaStepView[];
  scrollRef: RefObject<HTMLDivElement | null>;
  savingDraft: boolean;
  onOpenThread: (threadId: string) => void;
  onReplaySearch: (
    turnId: string,
    stepId: string,
    query: string,
    folder: string | undefined,
  ) => Promise<void>;
  canInsertProposal: (payload: AskRetaAssistantPayload) => boolean;
  onOpenProposal: (payload: AskRetaAssistantPayload) => void;
  onSaveProposal: (payload: AskRetaAssistantPayload) => Promise<void>;
  onCopyProposal: (payload: AskRetaAssistantPayload) => Promise<void>;
};

export const askRetaProposalBodyToText = (bodyHtml: string) =>
  bodyHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .trim();

export function AskRetaConversation({
  turns,
  asking,
  liveSteps,
  scrollRef,
  savingDraft,
  onOpenThread,
  onReplaySearch,
  canInsertProposal,
  onOpenProposal,
  onSaveProposal,
  onCopyProposal,
}: AskRetaConversationProps) {
  return (
    <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
      {turns.length === 0 && (
        <p className="text-muted-foreground pt-8 text-center text-sm">
          {m['common.askReta.empty']()}
        </p>
      )}
      {turns.map((turn) => (
        <AskRetaTurnCard
          key={turn.id}
          turn={turn}
          savingDraft={savingDraft}
          onOpenThread={onOpenThread}
          onReplaySearch={onReplaySearch}
          canInsertProposal={canInsertProposal}
          onOpenProposal={onOpenProposal}
          onSaveProposal={onSaveProposal}
          onCopyProposal={onCopyProposal}
        />
      ))}
      {asking && (
        <div className="text-muted-foreground space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {m['common.askReta.thinking']()}
          </div>
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
  );
}

function AskRetaTurnCard({
  turn,
  savingDraft,
  onOpenThread,
  onReplaySearch,
  canInsertProposal,
  onOpenProposal,
  onSaveProposal,
  onCopyProposal,
}: Pick<
  AskRetaConversationProps,
  | 'savingDraft'
  | 'onOpenThread'
  | 'onReplaySearch'
  | 'canInsertProposal'
  | 'onOpenProposal'
  | 'onSaveProposal'
  | 'onCopyProposal'
> & { turn: AskRetaTurn }) {
  const payload = turn.payload;
  return (
    <div className={turn.role === 'user' ? 'flex justify-end' : ''}>
      <div
        className={
          turn.role === 'user'
            ? 'max-w-[85%] rounded-lg bg-[#006FFE] px-3 py-2 text-sm text-white'
            : 'bg-muted/60 max-w-[95%] rounded-lg px-3 py-2 text-sm'
        }
      >
        <p className="whitespace-pre-wrap">{turn.content}</p>
        {turn.attachments && turn.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {turn.attachments.map((attachment) => (
              <span
                key={`${turn.id}:${attachment.name}`}
                className="border-current/25 rounded-full border px-2 py-0.5 text-[11px]"
              >
                📎 {attachment.name}
              </span>
            ))}
          </div>
        )}

        {payload?.steps && payload.steps.length > 0 && (
          <ul className="text-muted-foreground mt-2 space-y-1 text-[11px]">
            {payload.steps.map((step) =>
              step.search ? (
                <AskRetaSearchStep
                  key={step.id}
                  step={step}
                  onOpenThread={onOpenThread}
                  onReplay={(query) => onReplaySearch(turn.id, step.id, query, step.search?.folder)}
                />
              ) : (
                <li key={step.id}>· {step.detail}</li>
              ),
            )}
          </ul>
        )}

        {payload?.citations && payload.citations.length > 0 && (
          <div className="mt-2">
            <p className="text-muted-foreground text-[11px] font-medium">
              {payload.citations.every((citation) => citation.kind === 'metadata')
                ? m['common.askReta.metadataCitation']()
                : m['common.askReta.sources']()}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {payload.citations.map((citation) => (
                <button
                  key={citation.ref}
                  type="button"
                  disabled={citation.kind === 'upload'}
                  onClick={() => {
                    if (citation.kind !== 'upload') onOpenThread(citation.threadId);
                  }}
                  title={
                    citation.kind === 'metadata'
                      ? `${m['common.askReta.metadataCitation']()} — ${citation.sender} — ${citation.date}`
                      : citation.kind === 'upload'
                        ? `${citation.subject} — « ${citation.quote} »`
                        : `${citation.sender} — ${citation.date}${citation.quote ? ` — « ${citation.quote} »` : ''}`
                  }
                  className="bg-background enabled:hover:bg-accent max-w-[240px] truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                >
                  {citation.kind === 'metadata' ? (
                    <>
                      <span className="text-muted-foreground">
                        {m['common.askReta.metadataCitation']()} ·{' '}
                      </span>
                      {citation.sender} — {citation.subject}
                    </>
                  ) : citation.kind === 'upload' ? (
                    <>📎 {citation.subject}</>
                  ) : (
                    citation.subject
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {payload?.proposal && (
          <div className="bg-background mt-2 rounded-lg border p-2">
            <p className="text-[11px] font-medium">{m['common.askReta.proposal']()}</p>
            {payload.proposal.subject && (
              <p className="text-muted-foreground mt-0.5 text-xs">{payload.proposal.subject}</p>
            )}
            <p className="text-muted-foreground mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs">
              {askRetaProposalBodyToText(payload.proposal.bodyHtml)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {canInsertProposal(payload) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onOpenProposal(payload)}
                >
                  {m['common.askReta.openInComposer']()}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={savingDraft}
                onClick={() => void onSaveProposal(payload)}
              >
                {m['common.askReta.createDraft']()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => void onCopyProposal(payload)}
              >
                {m['common.askReta.copy']()}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
