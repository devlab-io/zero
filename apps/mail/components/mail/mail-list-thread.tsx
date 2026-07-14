import {
  buildProjectedThreadData,
  threadRowPropsAreEqual,
  type ThreadRowProps,
} from './mail-list-thread-projection';
import { useOptimisticThreadState } from '@/components/mail/optimistic-thread-state';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThreadContextMenu } from '@/components/context/thread-context';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { highlightText } from '@/lib/email-utils-highlight.client';
import { useMail, type Config } from '@/components/mail/use-mail';
import { ThreadHoverActions } from './mail-list-thread-actions';
import { focusedIndexAtom } from '@/hooks/use-mail-navigation';
import { type ThreadDestination } from '@/lib/thread-actions';
import { useThread, useThreads } from '@/hooks/use-threads';
import { GroupPeople, PencilCompose } from '../icons/icons';
import { memo, useCallback, useMemo, useRef } from 'react';
import { useSearchValue } from '@/hooks/use-search-value';
import { useQueryClient } from '@tanstack/react-query';
import { cn, FOLDERS, formatDate } from '@/lib/utils';
import { useTRPC } from '@/providers/query-provider';
import { useThreadLabels } from '@/hooks/use-labels';
import { cleanNameDisplay } from './mail-list-utils';
import { MailLabels } from './mail-list-labels';
import { BimiAvatar } from '../ui/bimi-avatar';
import { RenderLabels } from './render-labels';
import { m } from '@/paraglide/messages';
import { useParams } from 'react-router';
import { Avatar } from '../ui/avatar';
import { Check } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useAtom } from 'jotai';

export const Thread = memo(function Thread({
  message,
  onClick,
  isKeyboardFocused,
  index,
}: ThreadRowProps) {
  const [searchValue] = useSearchValue();
  const { folder } = useParams<{ folder: string }>();
  const [, threads] = useThreads();
  const [threadId] = useQueryState('threadId');
  // #30: rich-projection rows render from `message` and DO NOT fetch the body
  // (enabled:false → no per-row mail.get, no processEmailContent). Thin rows (search,
  // via rawListThreads) fall back to the per-thread fetch so search keeps working.
  // Sent is excluded: its row shows recipients (latestMessage.to), which the threads
  // projection does not carry — keep fetching there to preserve that display.
  const isProjected = message.unread !== undefined && folder !== FOLDERS.SENT;
  const thread = useThread(message.id, { enabled: !isProjected });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // #30 (suite M2): préchargement délibéré du corps au survol (pattern Superhuman, ruling
  // w2a). Alimente le cache pour l'ouverture du fil (froid mesuré 4,2 s serveur) et pour
  // ThreadContextMenu (enabled:false). 120 ms de garde: un balayage du pointeur sur la
  // liste ne déclenche aucun fetch; staleTime 1 h aligné sur useThread (déduplication).
  const hoverPrefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectedData = useMemo(
    () => (isProjected ? buildProjectedThreadData(message) : undefined),
    [isProjected, message],
  );
  const getThreadData = isProjected ? projectedData : thread.data;
  const isGroupThread = isProjected ? false : thread.isGroupThread;
  const latestDraft = isProjected ? undefined : thread.latestDraft;
  const [id, setThreadId] = useQueryState('threadId');
  const [focusedIndex, setFocusedIndex] = useAtom(focusedIndexAtom);

  const { latestMessage, idToUse, cleanName } = useMemo(() => {
    const latestMessage = getThreadData?.latest;
    const idToUse = latestMessage?.threadId ?? latestMessage?.id;
    const cleanName = latestMessage?.sender?.name
      ? latestMessage.sender.name.trim().replace(/^['"]|['"]$/g, '')
      : '';

    return { latestMessage, idToUse, cleanName };
  }, [getThreadData?.latest]);

  const optimisticState = useOptimisticThreadState(idToUse ?? '');

  const { displayStarred, displayImportant, displayUnread, optimisticLabels, emailContent } =
    useMemo(() => {
      const emailContent = getThreadData?.latest?.body;
      const displayStarred =
        optimisticState.optimisticStarred !== null
          ? optimisticState.optimisticStarred
          : (getThreadData?.latest?.tags?.some((tag) => tag.name === 'STARRED') ?? false);

      const displayImportant =
        optimisticState.optimisticImportant !== null
          ? optimisticState.optimisticImportant
          : (getThreadData?.latest?.tags?.some((tag) => tag.name === 'IMPORTANT') ?? false);

      const displayUnread =
        optimisticState.optimisticRead !== null
          ? !optimisticState.optimisticRead
          : (getThreadData?.hasUnread ?? false);

      let labels: { id: string; name: string }[] = [];
      if (getThreadData?.labels) {
        labels = [...getThreadData.labels];
        const hasStarredLabel = labels.some((label) => label.name === 'STARRED');

        if (optimisticState.optimisticStarred !== null) {
          if (optimisticState.optimisticStarred && !hasStarredLabel) {
            labels.push({ id: 'starred-optimistic', name: 'STARRED' });
          } else if (!optimisticState.optimisticStarred && hasStarredLabel) {
            labels = labels.filter((label) => label.name !== 'STARRED');
          }
        }

        if (optimisticState.optimisticLabels) {
          labels = labels.filter(
            (label) => !optimisticState.optimisticLabels.removedLabelIds.includes(label.id),
          );

          optimisticState.optimisticLabels.addedLabelIds.forEach((labelId) => {
            if (!labels.some((label) => label.id === labelId)) {
              labels.push({ id: labelId, name: labelId });
            }
          });
        }
      }

      return {
        displayStarred,
        displayImportant,
        displayUnread,
        optimisticLabels: labels,
        emailContent,
      };
    }, [
      optimisticState.optimisticStarred,
      optimisticState.optimisticImportant,
      optimisticState.optimisticRead,
      getThreadData?.latest?.tags,
      getThreadData?.hasUnread,
      getThreadData?.labels,
      optimisticState.optimisticLabels,
    ]);

  const { optimisticToggleStar, optimisticToggleImportant, optimisticMoveThreadsTo } =
    useOptimisticActions();

  const handleToggleStar = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!getThreadData || !idToUse) return;

      const newStarredState = !displayStarred;
      optimisticToggleStar([idToUse], newStarredState);
    },
    [getThreadData, idToUse, displayStarred, optimisticToggleStar],
  );

  const handleToggleImportant = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!getThreadData || !idToUse) return;

      const newImportantState = !displayImportant;
      optimisticToggleImportant([idToUse], newImportantState);
    },
    [getThreadData, idToUse, displayImportant, optimisticToggleImportant],
  );

  const handleNext = useCallback(
    (id: string) => {
      if (!id || !threads.length || focusedIndex === null) return setThreadId(null);
      if (focusedIndex < threads.length - 1) {
        const nextThread = threads[focusedIndex];
        if (nextThread) {
          setThreadId(nextThread.id);
          // Don't clear activeReplyId - let ThreadDisplay handle Reply All auto-opening
          setFocusedIndex(focusedIndex);
        }
      }
    },
    [threads, id, focusedIndex],
  );

  const moveThreadTo = useCallback(
    async (destination: ThreadDestination) => {
      if (!idToUse) return;
      handleNext(idToUse);
      optimisticMoveThreadsTo([idToUse], folder ?? '', destination);
    },
    [idToUse, folder, optimisticMoveThreadsTo, handleNext],
  );

  const { labels: threadLabels } = useThreadLabels(
    optimisticLabels ? optimisticLabels.map((l) => l.id) : [],
  );

  const [mailState, setMail] = useMail();
  const { isMailSelected, isMailBulkSelected } = useMemo(() => {
    const isSelected =
      !threadId || !idToUse ? false : idToUse === threadId || threadId === mailState.selected;
    const isBulkSelected = idToUse ? mailState.bulkSelected.includes(idToUse) : false;

    return { isMailSelected: isSelected, isMailBulkSelected: isBulkSelected };
  }, [threadId, idToUse, mailState.selected, mailState.bulkSelected]);

  const { isFolderInbox, isFolderSpam, isFolderSent, isFolderBin } = useMemo(
    () => ({
      isFolderInbox: folder === FOLDERS.INBOX || !folder,
      isFolderSpam: folder === FOLDERS.SPAM,
      isFolderSent: folder === FOLDERS.SENT,
      isFolderBin: folder === FOLDERS.BIN,
    }),
    [folder],
  );

  // Check if thread has a draft
  const hasDraft = useMemo(() => {
    return !!latestDraft;
  }, [latestDraft]);

  const content = useMemo(() => {
    if (!latestMessage || !getThreadData) return null;

    return (
      <div
        className={cn('select-none border-b md:my-1 md:border-none')}
        onClick={onClick ? onClick(latestMessage) : undefined}
        // Devlab: hover targeting restored — required for Superhuman-style
        // single-key actions (d/r/a/f/h) on the thread under the cursor.
        onMouseEnter={() => {
          window.dispatchEvent(new CustomEvent('emailHover', { detail: { id: idToUse } }));
          if (hoverPrefetchTimer.current) clearTimeout(hoverPrefetchTimer.current);
          hoverPrefetchTimer.current = setTimeout(() => {
            void queryClient.prefetchQuery(
              trpc.mail.get.queryOptions({ id: idToUse }, { staleTime: 1000 * 60 * 60 }),
            );
          }, 120);
        }}
        onMouseLeave={() => {
          window.dispatchEvent(new CustomEvent('emailHover', { detail: { id: null } }));
          if (hoverPrefetchTimer.current) clearTimeout(hoverPrefetchTimer.current);
        }}
      >
        <div
          data-thread-id={idToUse}
          key={idToUse}
          className={cn(
            'hover:bg-offsetLight dark:hover:bg-primary/5 group relative mx-1 flex cursor-pointer flex-col items-start rounded-lg py-2 text-left text-sm hover:opacity-100',
            (isMailSelected || isMailBulkSelected || isKeyboardFocused) &&
              'border-border bg-primary/5 opacity-100',
            isKeyboardFocused && 'ring-primary/50',
            'relative',
            'group',
          )}
        >
          <ThreadHoverActions
            index={index}
            displayStarred={displayStarred}
            displayImportant={displayImportant}
            isFolderBin={isFolderBin}
            onToggleStar={handleToggleStar}
            onToggleImportant={handleToggleImportant}
            moveThreadTo={moveThreadTo}
          />

          <div
            className={`relative flex w-full items-center justify-between gap-4 px-4 ${displayUnread ? '' : 'opacity-60'}`}
          >
            <div>
              {isMailBulkSelected ? (
                <Avatar
                  className={cn(
                    'h-8 w-8 rounded-full',
                    displayUnread && !isMailSelected && !isFolderSent ? '' : 'border',
                  )}
                >
                  <div
                    className="flex h-full w-full items-center justify-center rounded-full bg-[#006FFE] p-2 dark:bg-[#006FFE]"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setMail((prev: Config) => ({
                        ...prev,
                        bulkSelected: prev.bulkSelected.filter((id: string) => id !== idToUse),
                      }));
                    }}
                  >
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </Avatar>
              ) : isGroupThread ? (
                <Avatar
                  className={cn(
                    'h-8 w-8 rounded-full',
                    displayUnread && !isMailSelected && !isFolderSent ? '' : 'border',
                  )}
                >
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-[#FFFFFF] p-2 dark:bg-[#373737]">
                    <GroupPeople className="h-4 w-4" />
                  </div>
                </Avatar>
              ) : (
                <BimiAvatar
                  email={latestMessage.sender.email}
                  name={cleanName || latestMessage.sender.email}
                  className={cn(
                    'h-8 w-8 rounded-full',
                    displayUnread && !isMailSelected && !isFolderSent ? '' : 'border',
                  )}
                />
              )}
              {/* {displayUnread && !isMailSelected && !isFolderSent ? (
                  <>
                    <span className="absolute left-2 top-2 size-1.5 rounded bg-[#006FFE]" />
                    <span className="absolute left-[11px] top-4 size-1 rounded bg-[#006FFE]" />
                  </>
                ) : null} */}
            </div>

            <div className="flex w-full justify-between">
              <div className="w-full">
                <div className="flex w-full flex-row items-center justify-between">
                  <div className="flex flex-row items-center gap-[4px]">
                    <span
                      className={cn(
                        displayUnread && !isMailSelected ? 'font-bold' : 'font-medium',
                        'text-md flex items-baseline gap-1 group-hover:opacity-100',
                      )}
                    >
                      {isFolderSent ? (
                        <span
                          className={cn(
                            'overflow-hidden truncate text-sm md:max-w-[15ch] xl:max-w-[25ch]',
                          )}
                        >
                          {highlightText(latestMessage.subject, searchValue.highlight)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={cn('line-clamp-1 overflow-hidden text-sm')}>
                            {highlightText(
                              cleanNameDisplay(latestMessage.sender.name) || '',
                              searchValue.highlight,
                            )}
                          </span>
                          {displayUnread && !isMailSelected && !isFolderSent ? (
                            <>
                              <span className="ml-0.5 size-2 rounded-full bg-[#006FFE]" />
                            </>
                          ) : null}
                        </div>
                      )}{' '}
                      {/* {!isFolderSent ? (
                          <span className="hidden items-center space-x-2 md:flex">
                            <RenderLabels labels={threadLabels} />
                          </span>
                        ) : null} */}
                    </span>
                    {getThreadData.totalReplies > 1 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="rounded-md text-xs opacity-70">
                            [{getThreadData.totalReplies}]
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="p-1 text-xs">
                          {m['common.mail.replies']({ count: getThreadData.totalReplies })}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    {hasDraft ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center">
                            <PencilCompose className="h-3 w-3 fill-blue-500 dark:fill-blue-400" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="p-1 text-xs">Draft</TooltipContent>
                      </Tooltip>
                    ) : null}
                    {/* {hasNotes ? (
                        <span className="inline-flex items-center">
                          <StickyNote className="h-3 w-3 fill-amber-500 stroke-amber-500 dark:fill-amber-400 dark:stroke-amber-400" />
                        </span>
                      ) : null} */}
                    <MailLabels labels={optimisticLabels} />
                  </div>
                  {latestMessage.receivedOn ? (
                    <p
                      className={cn(
                        'text-muted-foreground text-nowrap text-xs font-normal opacity-70 transition-opacity group-hover:opacity-100 dark:text-[#8C8C8C]',
                        isMailSelected && 'opacity-100',
                      )}
                    >
                      {formatDate(latestMessage.receivedOn.split('.')[0] || '')}
                    </p>
                  ) : null}
                </div>
                <div className="flex justify-between">
                  {isFolderSent ? (
                    <p
                      className={cn(
                        'mt-1 line-clamp-1 max-w-[50ch] overflow-hidden text-sm text-[#8C8C8C] md:max-w-[25ch]',
                      )}
                    >
                      {latestMessage.to.map((e) => e.email).join(', ')}
                    </p>
                  ) : (
                    <p
                      className={cn(
                        'mt-1 line-clamp-1 w-[95%] min-w-0 overflow-hidden text-sm text-[#8C8C8C]',
                      )}
                    >
                      {highlightText(latestMessage.subject, searchValue.highlight)}
                    </p>
                  )}
                  {/* <div className="hidden md:flex">
                      {getThreadData.labels ? <MailLabels labels={getThreadData.labels} /> : null}
                    </div> */}
                  {threadLabels && (
                    <div className="mr-0 flex w-fit items-center justify-end gap-1">
                      {!isFolderSent ? <RenderLabels labels={threadLabels} /> : null}
                      {/* {getThreadData.labels ? <MailLabels labels={getThreadData.labels} /> : null} */}
                    </div>
                  )}
                </div>
                {emailContent && (
                  <div className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                    {highlightText(emailContent, searchValue.highlight)}
                  </div>
                )}
                {/* {mainSearchTerm && (
                    <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                      <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5">
                        {mainSearchTerm}
                      </span>
                    </div>
                  )} */}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    latestMessage,
    getThreadData,
    optimisticState,
    idToUse,
    folder,
    isFolderBin,
    isFolderSent,
    isFolderSpam,
    isFolderInbox,
    onClick,
    searchValue,
    displayUnread,
    isMailSelected,
    isMailBulkSelected,
    threadLabels,
    optimisticLabels,
    emailContent,
  ]);

  return latestMessage ? (
    !optimisticState.shouldHide && idToUse ? (
      <ThreadContextMenu
        threadId={idToUse}
        isInbox={isFolderInbox}
        isSpam={isFolderSpam}
        isSent={isFolderSent}
        isBin={isFolderBin}
      >
        {content}
      </ThreadContextMenu>
    ) : null
  ) : null;
}, threadRowPropsAreEqual);
