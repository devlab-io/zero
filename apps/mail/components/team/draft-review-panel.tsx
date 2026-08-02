import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { insertIntoComposer } from '@/lib/composer-insert';
import { diffLines, type DiffLine } from '@/lib/text-diff';
import { useTRPC } from '@/providers/query-provider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useThread } from '@/hooks/use-threads';
import { useSession } from '@/lib/auth-client';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * Relecture de brouillon (P15) — section du panneau Team.
 *
 * Le brouillon appartient au PARTAGEUR : lui seul demande relecture (sur le
 * brouillon existant du fil) et applique une suggestion — dans SON composeur,
 * via la couture d'insertion existante, jamais par écriture serveur. Le
 * reviewer lit sous ACL, suggère (texte seul), compare et décide ; toute
 * action sur un brouillon modifié depuis est refusée serveur (stale) et
 * l'owner peut rebaser. Les états d'erreur ne bloquent jamais le panneau.
 */

type ReviewMember = { userId: string; name: string };

export function DraftReviewPanel({
  teamThreadId,
  threadId,
  sharerUserId,
  members,
}: {
  teamThreadId: string;
  /** threadId provider du fil OUVERT — cible de la couture d'insertion. */
  threadId: string | null;
  sharerUserId: string;
  members: ReviewMember[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? '';
  const isOwner = myUserId === sharerUserId;
  const thread = useThread(threadId, { enabled: isOwner && !!threadId });

  const reviewQuery = useQuery(
    trpc.teams.threadDraftReview.queryOptions(
      { teamThreadId },
      { staleTime: 15_000, retry: false },
    ),
  );
  const review = reviewQuery.data?.review ?? null;
  const isParty =
    !!review && (myUserId === review.ownerUserId || myUserId === review.reviewerUserId);
  const isReviewer = !!review && myUserId === review.reviewerUserId;

  const draftQuery = useQuery(
    trpc.teams.readReviewDraft.queryOptions(
      { reviewId: review?.id ?? '' },
      { enabled: !!review && isParty, staleTime: 10_000, retry: false },
    ),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.teams.threadDraftReview.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.readReviewDraft.queryKey() });
  };
  const request = useMutation(
    trpc.teams.requestDraftReview.mutationOptions({ onSuccess: invalidate }),
  );
  const suggest = useMutation(
    trpc.teams.suggestDraftEdit.mutationOptions({ onSuccess: invalidate }),
  );
  const decide = useMutation(
    trpc.teams.draftReviewDecision.mutationOptions({ onSuccess: invalidate }),
  );
  const rebase = useMutation(
    trpc.teams.rebaseDraftReview.mutationOptions({ onSuccess: invalidate }),
  );
  const applySuggestion = useMutation(
    trpc.teams.applyDraftSuggestion.mutationOptions({ onSuccess: invalidate }),
  );
  const cancel = useMutation(
    trpc.teams.cancelDraftReview.mutationOptions({ onSuccess: invalidate }),
  );

  const [reviewerUserId, setReviewerUserId] = useState('');
  const [suggestionText, setSuggestionText] = useState('');
  const [compareId, setCompareId] = useState<string | null>(null);
  const [applyHint, setApplyHint] = useState(false);

  const stateLabel = (state: string) => {
    switch (state) {
      case 'requested':
        return m['common.teamReview.stateRequested']();
      case 'changes_requested':
        return m['common.teamReview.stateChanges']();
      case 'approved':
        return m['common.teamReview.stateApproved']();
      default:
        return state;
    }
  };

  // Erreur non bloquante : le reste du panneau Team vit sa vie.
  if (reviewQuery.isError) return null;

  return (
    <section
      aria-label={m['common.teamReview.title']()}
      className="mt-3 border-t border-[#E7E7E7] pt-2 dark:border-[#252525]"
    >
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-muted-foreground text-xs font-medium uppercase">
          {m['common.teamReview.title']()}
        </h5>
        {review && (
          <span className="flex items-center gap-1">
            <Badge
              variant={review.state === 'approved' ? 'secondary' : 'outline'}
              className="text-[10px]"
            >
              {stateLabel(review.state)}
            </Badge>
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {m['common.teamReview.revision']({ count: review.revision })}
            </span>
          </span>
        )}
      </div>

      {!review ? (
        isOwner ? (
          thread.latestDraft?.id ? (
            <form
              className="mt-1.5 flex flex-wrap items-center gap-2 text-xs"
              onSubmit={(event) => {
                event.preventDefault();
                if (!reviewerUserId || !thread.latestDraft?.id) return;
                request.mutate({
                  teamThreadId,
                  draftId: thread.latestDraft.id,
                  reviewerUserId,
                });
              }}
            >
              <select
                value={reviewerUserId}
                onChange={(event) => setReviewerUserId(event.target.value)}
                aria-label={m['common.teamReview.reviewerLabel']()}
                className="h-7 rounded-md border border-[#E7E7E7] bg-white px-1.5 text-xs dark:border-[#252525] dark:bg-[#1E1E1E]"
              >
                <option value="">{m['common.teamReview.reviewerLabel']()}</option>
                {members
                  .filter((member) => member.userId !== myUserId)
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
              </select>
              <Button
                type="submit"
                size="sm"
                className="h-7 text-xs"
                disabled={!reviewerUserId || request.isPending}
              >
                {request.isPending ? (
                  <Loader2
                    className="h-3 w-3 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : null}
                {m['common.teamReview.request']()}
              </Button>
              {request.isError && (
                <span role="alert" className="text-destructive">
                  {m['common.teamReview.error']()}
                </span>
              )}
            </form>
          ) : (
            <p className="text-muted-foreground mt-1 text-xs">{m['common.teamReview.noDraft']()}</p>
          )
        ) : null
      ) : !isParty ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {m['common.teamReview.inProgress']({ reviewer: review.reviewerName })}
        </p>
      ) : (
        <div className="mt-1.5 space-y-2 text-xs">
          {draftQuery.data?.stale && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 text-amber-800 dark:text-amber-300">
              <span className="min-w-0 flex-1">{m['common.teamReview.stale']()}</span>
              {isOwner && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 text-[10px]"
                  disabled={rebase.isPending}
                  onClick={() => rebase.mutate({ reviewId: review.id })}
                >
                  {m['common.teamReview.rebase']()}
                </Button>
              )}
            </div>
          )}

          {isReviewer && review.state !== 'approved' && draftQuery.data && (
            <div className="space-y-1.5">
              <Textarea
                value={suggestionText || draftQuery.data.snapshot.bodyText}
                onChange={(event) => setSuggestionText(event.target.value)}
                aria-label={m['common.teamReview.suggestPlaceholder']()}
                placeholder={m['common.teamReview.suggestPlaceholder']()}
                className="min-h-[80px] text-xs"
                maxLength={100_000}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={suggest.isPending || draftQuery.data.stale}
                  onClick={() =>
                    suggest.mutate({
                      reviewId: review.id,
                      bodyText: suggestionText || draftQuery.data!.snapshot.bodyText,
                      baseDigest: draftQuery.data!.currentDigest,
                    })
                  }
                >
                  {m['common.teamReview.suggest']()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={decide.isPending || draftQuery.data.stale}
                  onClick={() =>
                    decide.mutate({
                      reviewId: review.id,
                      decision: 'approved',
                      baseDigest: draftQuery.data!.currentDigest,
                    })
                  }
                >
                  {m['common.teamReview.approve']()}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={decide.isPending || draftQuery.data.stale}
                  onClick={() =>
                    decide.mutate({
                      reviewId: review.id,
                      decision: 'changes_requested',
                      baseDigest: draftQuery.data!.currentDigest,
                    })
                  }
                >
                  {m['common.teamReview.requestChanges']()}
                </Button>
              </div>
              {(suggest.isError || decide.isError) && (
                <p role="alert" className="text-destructive">
                  {m['common.teamReview.staleError']()}
                </p>
              )}
            </div>
          )}

          {review.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-muted-foreground font-medium">
                {m['common.teamReview.suggestions']()}
              </p>
              {review.suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-md border border-[#E7E7E7] p-2 dark:border-[#252525]"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {suggestion.authorName}
                      {suggestion.note ? (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          — {suggestion.note}
                        </span>
                      ) : null}
                    </span>
                    {suggestion.appliedAt ? (
                      <Badge variant="secondary" className="text-[9px]">
                        {m['common.teamReview.applied']()}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      aria-expanded={compareId === suggestion.id}
                      onClick={() =>
                        setCompareId(compareId === suggestion.id ? null : suggestion.id)
                      }
                    >
                      {compareId === suggestion.id
                        ? m['common.teamReview.hideCompare']()
                        : m['common.teamReview.compare']()}
                    </Button>
                    {isOwner && !suggestion.appliedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px]"
                        disabled={applySuggestion.isPending}
                        onClick={() => {
                          // Application dans le composeur du PROPRIÉTAIRE via la
                          // couture d'insertion — l'autosave existant persiste.
                          const outcome = threadId
                            ? insertIntoComposer(
                                `team-review:${threadId}`,
                                { message: suggestion.bodyText },
                                { force: true },
                              )
                            : 'no-composer';
                          if (outcome === 'no-composer') {
                            setApplyHint(true);
                            return;
                          }
                          setApplyHint(false);
                          applySuggestion.mutate({ suggestionId: suggestion.id });
                        }}
                      >
                        {m['common.teamReview.apply']()}
                      </Button>
                    )}
                  </div>
                  {compareId === suggestion.id && draftQuery.data && (
                    <DiffView
                      before={draftQuery.data.snapshot.bodyText}
                      after={suggestion.bodyText}
                    />
                  )}
                </div>
              ))}
              {applyHint && (
                <p role="alert" className="text-muted-foreground">
                  {m['common.teamReview.applyNoComposer']()}
                </p>
              )}
            </div>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ reviewId: review.id })}
          >
            {m['common.teamReview.cancel']()}
          </Button>
        </div>
      )}
    </section>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  const { lines, bounded } = diffLines(before, after);
  return (
    <div className="mt-1.5 max-h-56 overflow-y-auto rounded bg-black/[0.03] p-1.5 font-mono text-[11px] leading-snug dark:bg-white/[0.04]">
      {bounded && (
        <p className="text-muted-foreground mb-1">{m['common.teamReview.diffBounded']()}</p>
      )}
      {lines.map((line: DiffLine, index: number) => (
        <p
          key={`${index}-${line.kind}`}
          className={cn(
            'whitespace-pre-wrap',
            line.kind === 'added' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
            line.kind === 'removed' &&
              'bg-rose-500/10 text-rose-800 line-through decoration-rose-400/60 dark:text-rose-300',
          )}
        >
          {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
          {line.text}
        </p>
      ))}
    </div>
  );
}
