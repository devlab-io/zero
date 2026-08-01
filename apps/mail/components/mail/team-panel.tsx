import {
  applyMention,
  extractMentionQuery,
  filterMentionCandidates,
  resolveMentions,
  segmentMentions,
  type MentionMember,
} from '@/lib/team-mentions';
import {
  useMyTeams,
  useSharesForThread,
  useTeamComments,
  useTeamMembers,
  useTeamPresenceFallback,
  useTeamRealtime,
} from '@/hooks/use-teams';
import { Check, CircleDot, Loader2, Quote, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTRPC } from '@/providers/query-provider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useThread } from '@/hooks/use-threads';
import { useSession } from '@/lib/auth-client';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/**
 * Panneau Équipe d'un fil OUVERT de ma boîte : partager, statut, assignation,
 * commentaires internes (mentions, citations serveur, réactions), présence et
 * typing temps réel (WebSocket primaire, polling en fallback).
 */

const REACTION_EMOJIS = ['👍', '✅', '👀', '❤️', '🔥', '😂'] as const;

type Share = {
  id: string;
  teamId: string;
  teamName: string;
  visibility: 'team' | 'restricted';
  status: 'open' | 'closed';
  assigneeUserId: string | null;
  sharerUserId: string;
  commentCount: number;
};

export function TeamPanel({ threadId }: { threadId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  // Toujours interrogé (badge compteur visible panneau fermé) ; staleTime 30 s.
  const { data: sharesData } = useSharesForThread(threadId);
  const shares = (sharesData?.shares ?? []) as Share[];
  const shareCount = shares.length;

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={isOpen}
            aria-label={m['common.teams.panelTitle']()}
            className={cn(
              'relative inline-flex h-7 w-7 items-center justify-center gap-1 overflow-hidden rounded-lg bg-white dark:bg-[#313131]',
              shareCount > 0 && 'text-blue-500',
              isOpen && 'bg-white/80 dark:bg-[#313131]/80',
            )}
            onClick={() => setIsOpen(!isOpen)}
          >
            <Users
              className={cn('h-4 w-4', shareCount > 0 ? 'stroke-blue-500' : 'text-[#9A9A9A]')}
            />
            {shareCount > 0 && (
              <span className="bg-primary text-primary-foreground absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {shareCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-white dark:bg-[#313131]">
          <p>{m['common.teams.panelTitle']()}</p>
        </TooltipContent>
      </Tooltip>

      {isOpen && (
        <div
          role="dialog"
          aria-label={m['common.teams.panelTitle']()}
          className="motion-safe:animate-in motion-safe:fade-in-20 motion-safe:zoom-in-95 dark:bg-panelDark max-w-screen fixed top-20 z-50 h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)] w-full overflow-hidden rounded-t-lg border border-t bg-[#FAFAFA] shadow-lg duration-100 sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:h-auto sm:max-h-[80vh] sm:w-[380px] sm:max-w-[90vw] sm:rounded-xl sm:border lg:left-[-230px] xl:left-[-330px] dark:border-[#252525]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E7E7] p-3 dark:border-[#252525]">
            <h3 className="flex items-center text-sm font-medium text-black dark:text-white">
              <Users className="mr-2 h-4 w-4" />
              {m['common.teams.panelTitle']()}
              {shareCount > 0 && (
                <Badge variant="outline" className="ml-2">
                  {shareCount}
                </Badge>
              )}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0 hover:bg-white/10"
              onClick={() => setIsOpen(false)}
              aria-label={m['common.actions.close']()}
            >
              <X className="h-4 w-4 fill-[#9A9A9A]" />
            </Button>
          </div>
          <ScrollArea className="max-h-[calc(80vh-3rem)]">
            <div className="space-y-3 p-3">
              <ShareControls threadId={threadId} shares={shares} />
              {shares.map((share) => (
                <SharedThreadSection key={share.id} share={share} threadId={threadId} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function ShareControls({ threadId, shares }: { threadId: string; shares: Share[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: teamsData } = useMyTeams();
  const teams = teamsData?.teams ?? [];
  const sharedTeamIds = new Set(shares.map((share) => share.teamId));
  const shareableTeams = teams.filter((team) => !sharedTeamIds.has(team.id));
  const [teamId, setTeamId] = useState('');
  const shareMutation = useMutation(
    trpc.teams.share.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.teams.sharesForThread.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.teams.listThreads.queryKey() });
      },
    }),
  );

  if (teams.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {m['common.teams.noTeamsHint']()}{' '}
        <a href="/settings/teams" className="underline">
          {m['common.teams.manageTeams']()}
        </a>
      </p>
    );
  }
  if (shareableTeams.length === 0) return null;

  const selected = teamId || shareableTeams[0]!.id;
  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(event) => setTeamId(event.target.value)}
        aria-label={m['common.teams.selectTeam']()}
        className="h-8 flex-1 rounded-md border border-[#E7E7E7] bg-white px-2 text-sm dark:border-[#252525] dark:bg-[#1E1E1E]"
      >
        {shareableTeams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-8"
        disabled={shareMutation.isPending}
        onClick={() => shareMutation.mutate({ teamId: selected, threadId })}
      >
        {shareMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          m['common.teams.share']()
        )}
      </Button>
    </div>
  );
}

function SharedThreadSection({ share, threadId }: { share: Share; threadId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const realtime = useTeamRealtime(share.id);
  useTeamPresenceFallback(share.id, true, realtime.connected);
  const { data: membersData } = useTeamMembers(share.teamId);
  const members = (membersData?.members ?? []) as (MentionMember & { role: string })[];
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );
  const invalidateShares = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: trpc.teams.sharesForThread.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.listThreads.queryKey() });
  }, [queryClient, trpc]);
  const setStatus = useMutation(
    trpc.teams.setStatus.mutationOptions({ onSuccess: invalidateShares }),
  );
  const setAssignee = useMutation(
    trpc.teams.setAssignee.mutationOptions({ onSuccess: invalidateShares }),
  );
  const unshare = useMutation(trpc.teams.unshare.mutationOptions({ onSuccess: invalidateShares }));

  if (realtime.revoked) {
    return (
      <div className="text-muted-foreground rounded-lg border border-[#E7E7E7] p-3 text-xs dark:border-[#252525]">
        {m['common.teams.accessRevoked']()}
      </div>
    );
  }

  const isDone = share.status === 'closed';
  return (
    <section
      aria-label={share.teamName}
      className="rounded-lg border border-[#E7E7E7] bg-white p-3 dark:border-[#252525] dark:bg-[#1E1E1E]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{share.teamName}</span>
          {share.visibility === 'restricted' && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {m['common.teams.restricted']()}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant={isDone ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            aria-pressed={isDone}
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate({ teamThreadId: share.id, status: isDone ? 'open' : 'closed' })
            }
          >
            {isDone ? <Check className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
            {isDone ? m['common.teams.done']() : m['common.teams.open']()}
          </Button>
          {(share.sharerUserId === myUserId ||
            members.find((member) => member.userId === myUserId)?.role === 'owner') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={m['common.teams.unshare']()}
              disabled={unshare.isPending}
              onClick={() => unshare.mutate({ teamThreadId: share.id })}
            >
              <Trash2 className="h-3.5 w-3.5 text-[#9A9A9A]" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <UserPlus className="h-3.5 w-3.5 shrink-0 text-[#9A9A9A]" aria-hidden />
        <select
          value={share.assigneeUserId ?? ''}
          aria-label={m['common.teams.assignee']()}
          onChange={(event) =>
            setAssignee.mutate({
              teamThreadId: share.id,
              assigneeUserId: event.target.value || null,
            })
          }
          className="h-7 flex-1 rounded-md border border-[#E7E7E7] bg-white px-1.5 text-xs dark:border-[#252525] dark:bg-[#1E1E1E]"
        >
          <option value="">{m['common.teams.unassigned']()}</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
        <PresenceRow
          others={realtime.othersPresent}
          typingUserIds={realtime.typingUserIds}
          memberById={memberById}
        />
      </div>

      <CommentsBlock
        share={share}
        threadId={threadId}
        members={members}
        live={realtime.connected}
        sendTyping={realtime.sendTyping}
      />
    </section>
  );
}

function PresenceRow({
  others,
  typingUserIds,
  memberById,
}: {
  others: { userId: string }[];
  typingUserIds: string[];
  memberById: Map<string, MentionMember>;
}) {
  if (others.length === 0) return null;
  const typingNames = typingUserIds
    .map((userId) => memberById.get(userId)?.name)
    .filter((name): name is string => !!name);
  return (
    <div className="flex shrink-0 items-center gap-1" aria-live="polite">
      <span className="flex -space-x-1.5">
        {others.slice(0, 4).map((user) => {
          const member = memberById.get(user.userId);
          return (
            <span
              key={user.userId}
              title={member?.name ?? ''}
              className="border-background flex h-5 w-5 items-center justify-center rounded-full border bg-blue-100 text-[9px] font-medium text-blue-900 dark:bg-blue-900 dark:text-blue-100"
            >
              {(member?.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
          );
        })}
      </span>
      {typingNames.length > 0 && (
        <span className="text-muted-foreground text-[10px] motion-safe:animate-pulse">
          {m['common.teams.typing']({ name: typingNames[0]! })}
        </span>
      )}
    </div>
  );
}

type CommentRow = {
  id: string;
  body: string;
  mentions: string[];
  quote: {
    messageId: string;
    authorEmail: string;
    authorName?: string;
    receivedOn: string;
    text: string;
  } | null;
  createdAt: string | Date;
  authorUserId: string;
  authorName: string;
  reactions: { emoji: string; userId: string }[];
};

function CommentsBlock({
  share,
  threadId,
  members,
  live,
  sendTyping,
}: {
  share: Share;
  threadId: string;
  members: MentionMember[];
  live: boolean;
  sendTyping: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const { data: commentsData, isLoading } = useTeamComments(share.id, live);
  const comments = (commentsData?.comments ?? []) as CommentRow[];
  const { data: threadData } = useThread(threadId);
  const latestMessage =
    threadData?.latest ?? threadData?.messages?.[threadData.messages.length - 1];

  const [body, setBody] = useState('');
  const [caret, setCaret] = useState(0);
  const [quoteLatest, setQuoteLatest] = useState(false);
  const trackedMentions = useRef<MentionMember[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const invalidateComments = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: trpc.teams.listComments.queryKey({ teamThreadId: share.id }),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.sharesForThread.queryKey() });
  }, [queryClient, trpc, share.id]);

  const addComment = useMutation(
    trpc.teams.addComment.mutationOptions({
      onSuccess: () => {
        setBody('');
        setQuoteLatest(false);
        trackedMentions.current = [];
        invalidateComments();
      },
    }),
  );
  const deleteComment = useMutation(
    trpc.teams.deleteComment.mutationOptions({ onSuccess: invalidateComments }),
  );
  const toggleReaction = useMutation(
    trpc.teams.toggleReaction.mutationOptions({ onSuccess: invalidateComments }),
  );

  const mentionQuery = extractMentionQuery(body, caret);
  const candidates = mentionQuery ? filterMentionCandidates(members, mentionQuery.query) : [];

  const pickMention = (member: MentionMember) => {
    if (!mentionQuery) return;
    const applied = applyMention(body, caret, mentionQuery.start, member);
    trackedMentions.current = [...trackedMentions.current, member];
    setBody(applied.text);
    setCaret(applied.caret);
    textareaRef.current?.focus();
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || addComment.isPending) return;
    addComment.mutate({
      teamThreadId: share.id,
      body: trimmed,
      mentions: resolveMentions(trimmed, trackedMentions.current),
      quoteMessageId: quoteLatest && latestMessage?.id ? latestMessage.id : undefined,
    });
  };

  return (
    <div className="mt-2 border-t border-[#E7E7E7] pt-2 dark:border-[#252525]">
      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" /> {m['common.teams.loadingComments']()}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground py-1 text-xs">{m['common.teams.noComments']()}</p>
      ) : (
        <ul className="space-y-2" aria-label={m['common.teams.comments']()}>
          {comments.map((comment) => (
            <li key={comment.id} className="group text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{comment.authorName}</span>
                <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                  {format(new Date(comment.createdAt), 'd MMM HH:mm')}
                  {comment.authorUserId === myUserId && (
                    <button
                      type="button"
                      aria-label={m['common.teams.deleteComment']()}
                      className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => deleteComment.mutate({ commentId: comment.id })}
                    >
                      <Trash2 className="h-3 w-3 text-[#9A9A9A]" />
                    </button>
                  )}
                </span>
              </div>
              {comment.quote && (
                <blockquote className="text-muted-foreground mt-0.5 border-l-2 border-blue-300 pl-2 italic">
                  <Quote className="mr-1 inline h-3 w-3" aria-hidden />
                  {comment.quote.text}
                  <span className="not-italic">
                    {' '}
                    — {comment.quote.authorName ?? comment.quote.authorEmail}
                  </span>
                </blockquote>
              )}
              <p className="mt-0.5 whitespace-pre-wrap break-words">
                {(() => {
                  // Clé data-dépendante : offset cumulé du segment dans le corps.
                  let offset = 0;
                  return segmentMentions(comment.body, members).map((segment) => {
                    const key = `${offset}:${segment.type}`;
                    offset += segment.text.length;
                    return segment.type === 'mention' ? (
                      <mark
                        key={key}
                        className={cn(
                          'rounded bg-blue-100 px-0.5 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100',
                          segment.userId === myUserId && 'bg-amber-100 dark:bg-amber-900/60',
                        )}
                      >
                        {segment.text}
                      </mark>
                    ) : (
                      <span key={key}>{segment.text}</span>
                    );
                  });
                })()}
              </p>
              <div className="mt-0.5 flex items-center gap-1">
                {REACTION_EMOJIS.filter((emoji) =>
                  comment.reactions.some((reaction) => reaction.emoji === emoji),
                ).map((emoji) => {
                  const count = comment.reactions.filter((r) => r.emoji === emoji).length;
                  const mine = comment.reactions.some(
                    (r) => r.emoji === emoji && r.userId === myUserId,
                  );
                  return (
                    <button
                      key={emoji}
                      type="button"
                      aria-pressed={mine}
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                        mine
                          ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/40'
                          : 'border-[#E7E7E7] hover:bg-gray-50 dark:border-[#252525] dark:hover:bg-white/5',
                      )}
                      onClick={() => toggleReaction.mutate({ commentId: comment.id, emoji })}
                    >
                      {emoji} {count}
                    </button>
                  );
                })}
                <ReactionPicker
                  onPick={(emoji) => toggleReaction.mutate({ commentId: comment.id, emoji })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-2">
        {candidates.length > 0 && (
          <ul
            role="listbox"
            aria-label={m['common.teams.mentionSuggestions']()}
            className="dark:bg-panelDark absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-md border border-[#E7E7E7] bg-white shadow-md dark:border-[#252525]"
          >
            {candidates.map((candidate) => (
              <li key={candidate.userId}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickMention(candidate);
                  }}
                >
                  <span className="font-medium">{candidate.name}</span>
                  <span className="text-muted-foreground truncate">{candidate.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          ref={textareaRef}
          value={body}
          rows={2}
          placeholder={m['common.teams.commentPlaceholder']()}
          aria-label={m['common.teams.commentPlaceholder']()}
          className="min-h-[52px] resize-none text-xs"
          onChange={(event) => {
            setBody(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            sendTyping();
          }}
          onSelect={(event) => setCaret((event.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        {addComment.isError && (
          <p className="text-destructive mt-1 text-[11px]" role="alert">
            {m['common.teams.commentError']()}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between">
          {latestMessage?.id ? (
            <button
              type="button"
              aria-pressed={quoteLatest}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                quoteLatest
                  ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100'
                  : 'text-muted-foreground hover:bg-gray-50 dark:hover:bg-white/5',
              )}
              onClick={() => setQuoteLatest((value) => !value)}
            >
              <Quote className="h-3 w-3" /> {m['common.teams.quoteLatest']()}
            </button>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!body.trim() || addComment.isPending}
            onClick={submit}
          >
            {addComment.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              m['common.teams.comment']()
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReactionPicker({ onPick }: { onPick: (emoji: (typeof REACTION_EMOJIS)[number]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={m['common.teams.addReaction']()}
        className="text-muted-foreground rounded-full border border-dashed border-[#E7E7E7] px-1.5 py-0.5 text-[10px] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-[#252525] dark:hover:bg-white/5"
        onClick={() => setOpen((value) => !value)}
      >
        +
      </button>
      {open && (
        <span className="dark:bg-panelDark absolute bottom-full left-0 z-10 mb-1 flex gap-0.5 rounded-md border border-[#E7E7E7] bg-white p-1 shadow-md dark:border-[#252525]">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded px-1 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
