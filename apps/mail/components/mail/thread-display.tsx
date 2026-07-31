import {
  Archive,
  ArchiveX,
  Folders,
  Lightning,
  Mail,
  Printer,
  Reply,
  Star,
  ThreeDots,
  Trash,
  X,
} from '../icons/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveActiveThreadIndex, useAdjacentThreadPrefetch } from '@/hooks/use-thread-prefetch';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { selectThreadShellRow, selectThreadViewState } from '@/lib/thread-view-state';
import { useOptimisticThreadState } from '@/components/mail/optimistic-thread-state';
import { preloadComposeSurface } from '@/components/create/compose-surface';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { shouldExtendReaderPages } from '@/lib/mail-pagination';
import { focusedIndexAtom } from '@/hooks/use-mail-navigation';
import { type ThreadDestination } from '@/lib/thread-actions';
import { handleUnsubscribe } from '@/lib/email-utils.client';
import { useThread, useThreads } from '@/hooks/use-threads';
import { EmptyStateIcon } from '../icons/empty-state-svg';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsOffline } from '@/hooks/use-online-status';
import { useAnimations } from '@/hooks/use-animations';
// #32 label/move picker — self-contained, driven by the `picker` query-state (l/v shortcuts).
import { LabelMovePicker } from './label-move-picker';
import { MailDisplaySkeleton } from './mail-skeleton';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { Inbox, RefreshCcw } from 'lucide-react';
import { markStage } from '@/lib/perf-stages';
import { NotesPanel } from './note-panel';
import { cn, FOLDERS } from '@/lib/utils';
import type { Attachment } from '@/types';
import { m } from '@/paraglide/messages';
import { useParams } from 'react-router';
import { useQueryState } from 'nuqs';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

import { THREAD_TRANSITION_WRAPPER_CLASS } from './thread-display.transition';
import { ThreadActionButton } from './thread-display.action-button';
import { MessageList } from './thread-display.message-list';
import { printThread } from './thread-display.print';

export { ThreadDemo } from './thread-display.demo';

// #44 (gate A8): the motion-powered thread transition lives in a lazily-loaded sibling so
// `motion` stays out of the critical inbox chunk. It resolves when a thread is first shown
// with animations on (via the Suspense boundary below); a structurally-equivalent fallback is
// rendered while it loads, so the first such thread may render without its entry animation.
const AnimatedMessageList = lazy(() => import('./thread-display.animated-message-list'));

// #44 (gate A8): reply composer (pulls posthog-js + its shell) is loaded lazily so it stays out
// of the critical inbox chunk. It resolves when the user opens a reply (via the Suspense below);
// its embedded editor was already lazy, so this adds only the composer shell to that same
// on-open resolution. The composer's own behaviour is unchanged.
const ReplyCompose = lazy(() => import('./reply-composer'));

// CUA 2026-07-30 (échec 2) : le reply inline (r/a) attendait ENCORE le
// téléchargement de son chunk lazy au moment de l'ouverture (1058 ms mesurés) —
// le warm idle existant (app-sidebar → preloadComposeSurface) ne couvre que la
// voie `c` (create-email/email-composer/emoji), pas reply-composer ni la liste
// de messages animée. On réchauffe le tout à l'idle : chunks toujours hors du
// bundle critique (gate #44 intacte), plus d'attente réseau sur r/a.
let composerChunksWarmed = false;
function warmComposerChunks() {
  if (composerChunksWarmed) return;
  composerChunksWarmed = true;
  // Réarmement sur échec (parité compose-surface, revue Codex) : un import qui
  // rejette pendant une fenêtre réseau dégradée ne doit pas pin le warm à
  // « fait » pour toute la session.
  try {
    preloadComposeSurface();
    void Promise.all([
      import('./reply-composer'),
      import('./thread-display.animated-message-list'),
    ]).catch(() => {
      composerChunksWarmed = false;
    });
  } catch {
    composerChunksWarmed = false;
  }
}

const isFullscreen = false;
export function ThreadDisplay() {
  const isMobile = useIsMobile();
  const params = useParams<{ folder: string }>();

  const folder = params?.folder ?? 'inbox';
  const [id, setThreadId] = useQueryState('threadId');
  const { data: emailData, isLoading, isError, refetch: refetchThread } = useThread(id ?? null);
  const isOffline = useIsOffline();
  const [threadsQuery, items, , loadMoreThreads] = useThreads();
  const [focusedIndex, setFocusedIndex] = useAtom(focusedIndexAtom);
  useAdjacentThreadPrefetch(items, id, Boolean(emailData), focusedIndex);

  // Parité Shortwave r3 : pendant la lecture, la liste ne défile pas, donc la
  // pagination au scroll ne s'arme jamais — ArrowDown/j butait sur la fin des
  // pages chargées pour un mail bas dans l'inbox. Étendre la liste depuis le
  // lecteur donne aussi des cibles réelles au préchargement des deux suivants.
  const readerIndex = useMemo(
    () =>
      resolveActiveThreadIndex(
        items.map((item) => item.id),
        id,
        focusedIndex,
      ),
    [items, id, focusedIndex],
  );
  const loadMoreThreadsRef = useRef(loadMoreThreads);
  loadMoreThreadsRef.current = loadMoreThreads;
  const readerHasNextPage = threadsQuery.hasNextPage ?? false;
  const readerIsFetchingNextPage = threadsQuery.isFetchingNextPage;
  useEffect(() => {
    if (!id) return;
    if (
      shouldExtendReaderPages({
        index: readerIndex,
        itemCount: items.length,
        isFetchingNextPage: readerIsFetchingNextPage,
        hasNextPage: readerHasNextPage,
      })
    ) {
      void loadMoreThreadsRef.current();
    }
  }, [id, readerIndex, items.length, readerIsFetchingNextPage, readerHasNextPage]);
  const [isStarred, setIsStarred] = useState(false);
  const [isImportant, setIsImportant] = useState(false);

  const [navigationDirection, setNavigationDirection] = useState<'previous' | 'next' | null>(null);

  const animationsEnabled = useAnimations();

  // Jalon perf : le corps du fil actif est rendu (messages présents). Posé
  // APRÈS le paint (effect), mesuré depuis `thread:open` (clic liste).
  const bodyReadyId = emailData?.messages?.length ? id : null;
  useEffect(() => {
    if (bodyReadyId) markStage('thread:body-ready');
  }, [bodyReadyId]);

  // Réchauffage idle des chunks composer (voir warmComposerChunks ci-dessus).
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warmComposerChunks, { timeout: 3000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(warmComposerChunks, 1500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Collect all attachments from all messages in the thread
  const allThreadAttachments = useMemo(() => {
    if (!emailData?.messages) return [];
    return emailData.messages.reduce<Attachment[]>((acc, message) => {
      if (message.attachments && message.attachments.length > 0) {
        acc.push(...message.attachments);
      }
      return acc;
    }, []);
  }, [emailData?.messages]);

  const [mode, setMode] = useQueryState('mode');
  const [activeReplyId, setActiveReplyId] = useQueryState('activeReplyId');
  const [, setDraftId] = useQueryState('draftId');

  // Devlab: threads can be opened directly in reply/replyAll/forward mode from the
  // mail list (r / a / f). When a mode arrives without an explicit reply target,
  // default to the latest message once the thread has loaded.
  useEffect(() => {
    if (mode && !activeReplyId && emailData?.messages?.length) {
      setActiveReplyId(emailData.messages[emailData.messages.length - 1]?.id ?? '');
    }
  }, [mode, activeReplyId, emailData?.messages, setActiveReplyId]);

  const trpc = useTRPC();
  const { mutateAsync: toggleImportant } = useMutation(trpc.mail.toggleImportant.mutationOptions());
  const [, setIsComposeOpen] = useQueryState('isComposeOpen');

  // Get optimistic state for this thread
  const optimisticState = useOptimisticThreadState(id ?? '');

  const handleNext = useCallback(() => {
    if (!id || !items.length || focusedIndex === null) return setThreadId(null);
    if (focusedIndex < items.length - 1) {
      const nextIndex = Math.max(1, focusedIndex + 1);

      const nextThread = items[nextIndex];
      if (nextThread) {
        setMode(null);
        setActiveReplyId(null);
        setDraftId(null);
        setThreadId(nextThread.id);
        setFocusedIndex(focusedIndex + 1);
        if (animationsEnabled) {
          setNavigationDirection('next');
        }
      }
    }
  }, [
    items,
    id,
    focusedIndex,
    setThreadId,
    setFocusedIndex,
    setMode,
    setActiveReplyId,
    setDraftId,
    animationsEnabled,
  ]);

  const handleUnsubscribeProcess = () => {
    if (!emailData?.latest) return;
    toast.promise(handleUnsubscribe({ emailData: emailData.latest }), {
      success: 'Unsubscribed successfully!',
      error: 'Failed to unsubscribe',
    });
  };

  const isInArchive = folder === FOLDERS.ARCHIVE;
  const isInSpam = folder === FOLDERS.SPAM;
  const isInBin = folder === FOLDERS.BIN;
  const handleClose = useCallback(() => {
    setThreadId(null);
    setMode(null);
    setActiveReplyId(null);
    setDraftId(null);
  }, [setThreadId, setMode, setActiveReplyId, setDraftId]);

  const { optimisticMoveThreadsTo } = useOptimisticActions();

  const moveThreadTo = useCallback(
    async (destination: ThreadDestination) => {
      if (!id) return;

      setMode(null);
      setActiveReplyId(null);
      setDraftId(null);

      optimisticMoveThreadsTo([id], folder, destination);
      handleNext();
    },
    [id, folder, optimisticMoveThreadsTo, handleNext, setMode, setActiveReplyId, setDraftId],
  );

  const { optimisticToggleStar } = useOptimisticActions();

  const handleToggleStar = useCallback(async () => {
    if (!emailData || !id) return;

    const newStarredState = !isStarred;
    optimisticToggleStar([id], newStarredState);
    setIsStarred(newStarredState);
  }, [emailData, id, isStarred, optimisticToggleStar]);

  const handleToggleImportant = useCallback(async () => {
    if (!emailData || !id) return;
    await toggleImportant({ ids: [id] });
    await refetchThread();
    if (isImportant) {
      toast.success(m['common.mail.markedAsImportant']());
    } else {
      toast.error('Failed to mark as important');
    }
  }, [emailData, id]);

  // Set initial star state based on email data
  useEffect(() => {
    if (emailData?.latest?.tags) {
      // Check if any tag has the name 'STARRED'
      setIsStarred(emailData.latest.tags.some((tag) => tag.name === 'STARRED'));
      setIsImportant(emailData.latest.tags.some((tag) => tag.name === 'IMPORTANT'));
    }
  }, [emailData?.latest?.tags]);

  useEffect(() => {
    if (optimisticState.optimisticStarred !== null) {
      setIsStarred(optimisticState.optimisticStarred);
    }
  }, [optimisticState.optimisticStarred]);

  //   // Automatically open Reply All composer when email thread is loaded
  //   useEffect(() => {
  //     if (emailData?.latest?.id) {
  //       // Small delay to ensure other effects have completed
  //       const timer = setTimeout(() => {
  //         setMode('replyAll');
  //         setActiveReplyId(emailData.latest!.id);
  //       }, 50);

  //       return () => clearTimeout(timer);
  //     }
  //   }, [emailData?.latest?.id, setMode, setActiveReplyId]);

  // Removed conflicting useEffect that was clearing activeReplyId

  // Scroll to the active reply composer when it's opened
  useEffect(() => {
    if (mode && activeReplyId) {
      setTimeout(() => {
        const replyElement = document.getElementById(`reply-composer-${activeReplyId}`);
        if (replyElement) {
          replyElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100); // Short delay to ensure the component is rendered
    }
  }, [mode, activeReplyId]);

  const handleAnimationComplete = useCallback(() => {
    setNavigationDirection(null);
  }, [setNavigationDirection]);

  // Honest active-thread state (issue #34): a failed fetch shows a finite error
  // with retry/back — never an endless skeleton.
  const threadState = selectThreadViewState({
    hasSelection: !!id,
    hasData: !!emailData,
    isLoading,
    isError,
    isOffline,
  });

  // CUA 2026-07-30 (échecs 3-4) : shell optimiste — pendant le fetch openThread
  // (~900 ms à froid), sujet/expéditeur/date sont DÉJÀ dans la ligne de liste
  // (projection). Peints immédiatement au-dessus du squelette : l'ouverture et
  // l'avance post-archive montrent le fil cible sans attendre le corps.
  const optimisticShellRow = useMemo(() => selectThreadShellRow(items, id), [items, id]);

  return (
    <div
      className={cn(
        'flex flex-col',
        isFullscreen ? 'h-screen' : isMobile ? 'h-full' : 'h-[calc(100dvh-19px)] rounded-xl',
      )}
    >
      <div
        className={cn(
          'bg-panelLight dark:bg-panelDark relative flex flex-col overflow-hidden rounded-xl duration-300',
          isMobile ? 'h-full' : 'h-full',
          !isMobile && !isFullscreen && 'rounded-r-lg',
          isFullscreen ? 'fixed inset-0 z-50' : '',
        )}
      >
        {threadState === 'no-selection' ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <EmptyStateIcon width={200} height={200} />
              <div className="mt-4">
                <p className="text-lg">It's empty here</p>
                <p className="text-md text-muted-foreground dark:text-white/50">
                  Choose an email to view details
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setIsComposeOpen('true')}
                    className="inline-flex h-7 cursor-pointer items-center justify-center gap-0.5 overflow-hidden rounded-lg border bg-white px-2 transition-colors hover:bg-gray-100 dark:border-none dark:bg-[#313131] dark:hover:bg-[#404040]"
                  >
                    <Mail className="mr-1 h-3.5 w-3.5 fill-[#959595]" />
                    <div className="flex items-center justify-center gap-2.5 px-0.5">
                      <div className="dark:text-base-gray-950 justify-start text-sm leading-none">
                        Send email
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : threadState === 'loading' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScrollArea className="h-full flex-1" type="auto">
              <div className="pb-4">
                {optimisticShellRow ? (
                  <div className="px-4 pt-4 md:px-6" data-testid="thread-shell">
                    <h2 className="text-lg font-semibold leading-snug text-black dark:text-white">
                      {optimisticShellRow.subject}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm dark:text-white/50">
                      {optimisticShellRow.sender?.name || optimisticShellRow.sender?.email}
                    </p>
                  </div>
                ) : null}
                <MailDisplaySkeleton isFullscreen={isFullscreen} />
              </div>
            </ScrollArea>
          </div>
        ) : threadState === 'error' ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="flex max-w-md flex-col items-center justify-center gap-3 text-center">
              <EmptyStateIcon width={160} height={160} />
              <div>
                <p className="text-lg">{m['states.thread.errorTitle']()}</p>
                <p className="text-md text-muted-foreground dark:text-white/50">
                  {isOffline
                    ? m['states.mailList.offlineNotice']()
                    : m['states.thread.errorDescription']()}
                </p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refetchThread()}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-white px-3 text-sm transition-colors hover:bg-gray-100 dark:border-none dark:bg-[#313131] dark:hover:bg-[#404040]"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {m['states.thread.retry']()}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-muted-foreground inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-[#313131]"
                >
                  {m['states.thread.back']()}
                </button>
              </div>
            </div>
          </div>
        ) : id && emailData ? (
          <>
            <div
              className={cn(
                'flex shrink-0 items-center px-1 pb-[10px] md:px-3 md:pb-[11px] md:pt-[12px]',
                isMobile && 'bg-panelLight dark:bg-panelDark sticky top-0 z-10 mt-2',
              )}
            >
              <div className="flex flex-1 items-center gap-2">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleClose}
                        className="inline-flex h-7 w-7 items-center justify-center gap-1 overflow-hidden rounded-md hover:bg-white md:hidden dark:hover:bg-[#313131]"
                      >
                        <X className="fill-iconLight dark:fill-iconDark h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-white dark:bg-[#313131]">
                      {m['common.actions.close']()}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <ThreadActionButton
                  icon={X}
                  label={m['common.actions.close']()}
                  onClick={handleClose}
                  className="hidden md:flex"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('replyAll');
                    setActiveReplyId(emailData?.latest?.id ?? '');
                  }}
                  className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-lg border bg-white px-1.5 transition-colors hover:bg-gray-100 dark:border-none dark:bg-[#313131] dark:hover:bg-[#404040]"
                >
                  <Reply className="fill-muted-foreground dark:fill-[#9B9B9B]" />
                  <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
                    <div className="justify-start whitespace-nowrap text-sm leading-none text-black dark:text-white">
                      {m['common.threadDisplay.replyAll']()}
                    </div>
                  </div>
                </button>
                <NotesPanel threadId={id} />
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleToggleStar}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-lg bg-white transition-colors hover:bg-gray-100 dark:bg-[#313131] dark:hover:bg-[#404040]"
                      >
                        <Star
                          className={cn(
                            'ml-[2px] mt-[2.4px] h-5 w-5',
                            isStarred
                              ? 'fill-yellow-400 stroke-yellow-400'
                              : 'fill-transparent stroke-[#9D9D9D] dark:stroke-[#9D9D9D]',
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-white dark:bg-[#313131]">
                      {isStarred
                        ? m['common.threadDisplay.unstar']()
                        : m['common.threadDisplay.star']()}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => moveThreadTo('archive')}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-lg bg-white transition-colors hover:bg-gray-100 dark:bg-[#313131] dark:hover:bg-[#404040]"
                      >
                        <Archive className="fill-iconLight dark:fill-iconDark" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-white dark:bg-[#313131]">
                      {m['common.threadDisplay.archive']()}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {!isInBin && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => moveThreadTo('bin')}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-lg border border-[#FCCDD5] bg-[#FDE4E9] transition-colors hover:bg-[#fccdd5]/70 dark:border-[#6E2532] dark:bg-[#411D23] dark:hover:bg-[#6E2532]/70"
                        >
                          <Trash className="fill-[#F43F5E]" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-white dark:bg-[#313131]">
                        {m['common.mail.moveToBin']()}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Thread actions"
                      aria-haspopup="menu"
                      className="focus:outline-hidden inline-flex h-7 w-7 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-lg bg-white transition-colors focus:ring-0 dark:bg-[#313131]"
                    >
                      <ThreeDots className="fill-iconLight dark:fill-iconDark" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-[#313131]">
                    {/* <DropdownMenuItem onClick={() => setIsFullscreen(!isFullscreen)}>
                      <Expand className="fill-iconLight dark:fill-iconDark mr-2" />
                      <span>
                        {isFullscreen
                          ? t('common.threadDisplay.exitFullscreen')
                          : t('common.threadDisplay.enterFullscreen')}
                      </span>
                    </DropdownMenuItem> */}

                    {isInSpam || isInArchive || isInBin ? (
                      <DropdownMenuItem onClick={() => moveThreadTo('inbox')}>
                        <Inbox className="mr-2 h-4 w-4" />
                        <span>{m['common.mail.moveToInbox']()}</span>
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            printThread(emailData);
                          }}
                        >
                          <Printer className="fill-iconLight dark:fill-iconDark mr-2 h-4 w-4" />
                          <span>{m['common.threadDisplay.printThread']()}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => moveThreadTo('spam')}>
                          <ArchiveX className="fill-iconLight dark:fill-iconDark mr-2" />
                          <span>{m['common.threadDisplay.moveToSpam']()}</span>
                        </DropdownMenuItem>
                        {emailData.latest?.listUnsubscribe ||
                        emailData.latest?.listUnsubscribePost ? (
                          <DropdownMenuItem onClick={handleUnsubscribeProcess}>
                            <Folders className="fill-iconLight dark:fill-iconDark mr-2" />
                            <span>{m['common.mailDisplay.unsubscribe']()}</span>
                          </DropdownMenuItem>
                        ) : null}
                      </>
                    )}
                    {!isImportant && (
                      <DropdownMenuItem onClick={handleToggleImportant}>
                        <Lightning className="fill-iconLight dark:fill-iconDark mr-2" />
                        {m['common.mail.markAsImportant']()}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className={cn('flex min-h-0 flex-1 flex-col', isMobile && 'h-full')}>
              {(() => {
                const messageListProps = {
                  messages: emailData.messages,
                  isFullscreen,
                  totalReplies: emailData?.totalReplies,
                  allThreadAttachments,
                  mode: mode || undefined,
                  activeReplyId: activeReplyId || undefined,
                  isMobile,
                };
                // Animations on → lazy motion wrapper (resolved on first thread render). The
                // Suspense fallback is STRUCTURALLY EQUIVALENT to the resolved output: the animated
                // path renders <motion.div className="h-full w-full"><MessageList/></motion.div>,
                // and motion.div IS a <div>, so the fallback uses the same <div> + shared
                // THREAD_TRANSITION_WRAPPER_CLASS — the transition DOM (layout/scroll box) stays
                // stable while the chunk loads. Off → plain MessageList, exactly as before. motion
                // is not part of this route-critical chunk.
                return animationsEnabled ? (
                  <Suspense
                    fallback={
                      <div className={THREAD_TRANSITION_WRAPPER_CLASS}>
                        <MessageList {...messageListProps} />
                      </div>
                    }
                  >
                    <AnimatedMessageList
                      threadKey={id}
                      navigationDirection={navigationDirection}
                      onAnimationComplete={handleAnimationComplete}
                      messageListProps={messageListProps}
                    />
                  </Suspense>
                ) : (
                  <MessageList {...messageListProps} />
                );
              })()}

              {mode &&
                activeReplyId &&
                activeReplyId === emailData.messages[emailData.messages.length - 1]?.id && (
                  <div
                    className="border-border bg-panelLight dark:bg-panelDark sticky bottom-0 z-10 border-t px-4 py-2"
                    id={`reply-composer-${activeReplyId}`}
                  >
                    <Suspense fallback={null}>
                      <ReplyCompose messageId={activeReplyId} />
                    </Suspense>
                  </div>
                )}
              <LabelMovePicker />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
