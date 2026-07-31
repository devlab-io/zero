import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { formatDate, formatTime, shouldShowSeparateTime } from '@/lib/date-utils';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Forward, Printer, Reply, ReplyAll, ThreeDots } from '../icons/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useFetchAttachmentBodies } from '@/hooks/use-attachments';
import { CopyIcon, HardDriveDownload, Lock } from 'lucide-react';
import type { Sender, ParsedMessage, Attachment } from '@/types';
import { useActiveConnection } from '@/hooks/use-connections';
import { useThreadLabels } from '@/hooks/use-labels';
import { useThread } from '@/hooks/use-threads';
import { BimiAvatar } from '../ui/bimi-avatar';
import { RenderLabels } from './render-labels';
import { MailContent } from './mail-content';
import { m } from '@/paraglide/messages';
import { useParams } from 'react-router';
import { useQueryState } from 'nuqs';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import {
  ThreadAttachments,
  downloadAttachment,
  formatFileSize,
  getFileIcon,
  handleDownloadAllAttachments,
  openAttachment,
} from './mail-display.attachments';
import { MailDisplayLabels } from './mail-display.labels';
import { ActionButton } from './mail-display.parts';
import { printMail } from './mail-display.print';

type Props = {
  emailData: ParsedMessage;
  isFullscreen: boolean;
  isMuted: boolean;
  isLoading: boolean;
  index: number;
  totalEmails?: number;
  demo?: boolean;
  subject?: string;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  threadAttachments?: Attachment[];
  /** r15a : jalon content-painted, fourni uniquement pour le message actif. */
  onContentPainted?: () => void;
};

const cleanEmailDisplay = (email?: string) => {
  if (!email) return '';
  const match = email.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1] : email;
};

const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  return name.trim();
};

const MailDisplay = ({
  emailData,
  index,
  totalEmails,
  demo,
  threadAttachments,
  onContentPainted,
}: Props) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const { data: threadData } = useThread(emailData.threadId ?? null);
  // Plus aucun fetch de corps de pièces jointes au rendu (l'ancien useAttachments
  // par message déclenchait un waterfall getMessageAttachments sur chaque thread
  // ouvert). Les puces se dessinent depuis les métadonnées du thread ; les corps
  // sont téléchargés au clic via fetchAttachmentBodies.
  const messageAttachments = useMemo(
    () => (emailData.attachments ?? []).filter((attachment) => attachment.attachmentId),
    [emailData.attachments],
  );
  const fetchAttachmentBodies = useFetchAttachmentBodies();
  const withAttachmentBody = useCallback(
    async (
      attachment: { attachmentId: string },
      action: (full: Attachment) => void | Promise<void>,
    ) => {
      try {
        const bodies = await fetchAttachmentBodies(emailData.id);
        const full = bodies.find((item) => item.attachmentId === attachment.attachmentId);
        if (!full) throw new Error('Attachment not found');
        await action(full);
      } catch {
        toast.error(m['common.mailDisplay.failedToOpenAttachment']());
      }
    },
    [emailData.id, fetchAttachmentBodies],
  );
  //   const [unsubscribed, setUnsubscribed] = useState(false);
  //   const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [preventCollapse, setPreventCollapse] = useState(false);
  const { folder } = useParams<{ folder: string }>();
  //   const [selectedAttachment, setSelectedAttachment] = useState<null | {
  //     id: string;
  //     name: string;
  //     type: string;
  //     url: string;
  //   }>(null);
  const [openDetailsPopover, setOpenDetailsPopover] = useState<boolean>(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [activeReplyId, setActiveReplyId] = useQueryState('activeReplyId');
  const { labels: threadLabels } = useThreadLabels(
    emailData.tags ? emailData.tags.map((l) => l.id) : [],
  );
  const { data: activeConnection } = useActiveConnection();
  //   const trpc = useTRPC();

  const isLastEmail = useMemo(
    () => emailData.id === threadData?.latest?.id,
    [emailData.id, threadData?.latest?.id],
  );

  const [, setMode] = useQueryState('mode');

  useEffect(() => {
    if (!demo) {
      if (activeReplyId === emailData.id) {
        // Always expand the email being replied to
        setIsCollapsed(false);
      } else {
        // For emails not being replied to, use the default behavior:
        // - Last email should be expanded
        // - All other emails should be collapsed
        setIsCollapsed(!isLastEmail);
      }
      // Set all emails to collapsed by default except the last one
      if (totalEmails && index === totalEmails - 1) {
        if (totalEmails > 5) {
          setTimeout(() => {
            const element = document.getElementById(`mail-${emailData.id}`);
            element?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    }
  }, [demo, emailData.id, isLastEmail, activeReplyId]);

  //   const listUnsubscribeAction = useMemo(
  //     () =>
  //       emailData.listUnsubscribe
  //         ? getListUnsubscribeAction({
  //             listUnsubscribe: emailData.listUnsubscribe,
  //             listUnsubscribePost: emailData.listUnsubscribePost,
  //           })
  //         : undefined,
  //     [emailData.listUnsubscribe, emailData.listUnsubscribePost],
  //   );

  //   const _handleUnsubscribe = async () => {
  //     setIsUnsubscribing(true);
  //     try {
  //       await handleUnsubscribe({
  //         emailData,
  //       });
  //       setIsUnsubscribing(false);
  //       setUnsubscribed(true);
  //     } catch (e) {
  //       setIsUnsubscribing(false);
  //       setUnsubscribed(false);
  //     }
  //   };

  // Clear any pending timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  // Function to handle popover state changes
  const handlePopoverChange = useCallback((open: boolean) => {
    setOpenDetailsPopover(open);

    if (!open) {
      // When closing the popover, prevent collapse for a short time
      setPreventCollapse(true);

      // Clear any existing timeout
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }

      // Set a timeout to allow collapse again after a delay
      collapseTimeoutRef.current = setTimeout(() => {
        setPreventCollapse(false);
      }, 300);
    }
  }, []);

  // Handle email collapse toggle
  const toggleCollapse = useCallback(() => {
    // Only toggle if we're not in prevention mode
    if (!preventCollapse && !openDetailsPopover) {
      setIsCollapsed(!isCollapsed);
    }
  }, [isCollapsed, preventCollapse, openDetailsPopover]);

  // Handle email copy of senders
  const handleCopySenderEmail = useCallback(async (personEmail: string) => {
    if (!personEmail) return;

    await navigator.clipboard.writeText(personEmail || '');
    toast.success(m['common.mailDisplay.emailCopied']());
  }, []);

  const renderPerson = useCallback(
    (person: Sender) => (
      <Popover key={person.email}>
        <PopoverTrigger asChild>
          <div
            key={person.email}
            className="dark:bg-panelDark inline-flex items-center justify-start gap-1.5 overflow-hidden rounded-full border bg-white p-1 pr-2"
          >
            <BimiAvatar
              email={person.email}
              name={person.name || person.email}
              className="h-5 w-5"
            />
            <div className="text-panelDark justify-start text-sm font-medium leading-none dark:text-white">
              {person.name || person.email}
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="min-w-fit text-sm">
          <div className="flex items-center gap-2">
            <BimiAvatar
              email={person.email}
              name={person.name || person.email}
              className="h-12 w-12"
            />
            <div>
              <p className="font-medium">{person.name || 'Unknown'}</p>
              <div className="group flex items-center gap-2">
                <p>{person.email || 'No email'}</p>
                <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <CopyIcon
                    size={14}
                    className="cursor-pointer"
                    onClick={() => handleCopySenderEmail(person.email)}
                  />
                </span>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    ),
    [],
  );

  const people = useMemo(() => {
    if (!activeConnection) return [];
    const connectionEmail = activeConnection.email;
    const allPeople = [
      ...(folder === 'sent' ? [] : [emailData.sender]),
      ...(emailData.to || []),
      ...(emailData.cc || []),
      ...(emailData.bcc || []),
    ];
    return allPeople.filter(
      (p): p is Sender =>
        Boolean(p?.email) &&
        p.email !== connectionEmail &&
        p.name !== 'No Sender Name' &&
        p === allPeople.find((other) => other?.email === p?.email),
    );
  }, [emailData, activeConnection]);

  return (
    <div
      className={cn('relative flex-1 overflow-hidden')}
      id={`mail-${emailData.id}`}
      onClick={(e) => {
        if (openDetailsPopover) {
          e.stopPropagation();
        }
      }}
    >
      <>
        {/* Contrat r8 : les panneaux « research » IA du lecteur sont retirés. */}
        <div className="relative h-full overflow-y-auto">
          <div className={cn('px-4', index === 0 && 'border-b py-4')}>
            {index === 0 && (
              <>
                <span className="inline-flex items-center gap-2 font-medium text-black dark:text-white">
                  <span>
                    {emailData.subject}{' '}
                    <span className="text-muted-foreground dark:text-[#8C8C8C]">
                      {totalEmails && totalEmails > 1 && `[${totalEmails}]`}
                    </span>
                  </span>
                </span>

                <div className="mt-2 flex items-center gap-2">
                  {emailData?.tags?.length ? (
                    <MailDisplayLabels labels={emailData?.tags.map((t) => t.name) || []} />
                  ) : null}
                  {emailData?.tags?.length ? (
                    <div className="bg-iconLight dark:bg-iconDark/20 relative h-3 w-0.5 rounded-full" />
                  ) : null}
                  <RenderLabels labels={threadLabels} />
                  {threadLabels.length ? (
                    <div className="bg-iconLight dark:bg-iconDark/20 relative h-3 w-0.5 rounded-full" />
                  ) : null}
                  <div className="text-muted-foreground flex items-center gap-2 text-sm dark:text-[#8C8C8C]">
                    {(() => {
                      if (people.length <= 2) {
                        return people.map(renderPerson);
                      }

                      // Only show first two people plus count if we have at least two people
                      const firstPerson = people[0];
                      const secondPerson = people[1];

                      if (firstPerson && secondPerson) {
                        return (
                          <>
                            {renderPerson(firstPerson)}
                            {renderPerson(secondPerson)}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm">
                                  +{people.length - 2}{' '}
                                  {people.length - 2 === 1 ? 'other' : 'others'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="flex flex-col gap-1">
                                {people.slice(2).map((person) => (
                                  <div key={person.email}>{renderPerson(person)}</div>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          </>
                        );
                      }

                      return null;
                    })()}
                  </div>
                </div>
                {threadAttachments && threadAttachments.length > 0 && (
                  <ThreadAttachments attachments={threadAttachments} />
                )}
              </>
            )}
          </div>
          <div className="flex cursor-pointer flex-col pb-2 duration-200" onClick={toggleCollapse}>
            <div className="mt-3 flex w-full items-start justify-between gap-4 px-4">
              <div className="flex w-full justify-center gap-4">
                <BimiAvatar
                  email={emailData?.sender?.email}
                  name={emailData?.sender?.name}
                  className="mt-3 h-8 w-8"
                />

                <div className="flex w-full items-center justify-between">
                  <div className="flex w-full items-center justify-start">
                    <div className="flex w-full flex-col">
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {cleanNameDisplay(emailData?.sender?.name)}
                            </span>
                          </div>

                          <Popover open={openDetailsPopover} onOpenChange={handlePopoverChange}>
                            <PopoverTrigger asChild>
                              <button
                                className="hover:bg-iconLight/10 dark:hover:bg-iconDark/20 flex cursor-pointer items-center gap-2 rounded-md p-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setOpenDetailsPopover(!openDetailsPopover);
                                }}
                                ref={triggerRef}
                              >
                                <p className="text-muted-foreground text-xs underline dark:text-[#8C8C8C]">
                                  {m['common.mailDisplay.details']()}
                                </p>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="dark:bg-panelDark flex w-[420px] overflow-auto rounded-lg border p-4 text-left shadow-lg md:w-auto"
                              onBlur={(e) => {
                                if (!triggerRef.current?.contains(e.relatedTarget)) {
                                  setOpenDetailsPopover(false);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="space-y-1 text-sm">
                                <div className="flex">
                                  <span className="w-24 text-end text-gray-500">
                                    {m['common.mailDisplay.from']()}:
                                  </span>
                                  <div className="ml-3">
                                    <span className="text-muted-foreground text-nowrap pr-1 font-bold">
                                      {cleanNameDisplay(emailData?.sender?.name)}
                                    </span>
                                    {emailData?.sender?.name !== emailData?.sender?.email && (
                                      <span className="text-muted-foreground text-nowrap">
                                        {cleanEmailDisplay(emailData?.sender?.email)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex">
                                  <span className="w-24 text-nowrap text-end text-gray-500">
                                    {m['common.mailDisplay.to']()}:
                                  </span>
                                  <span className="text-muted-foreground ml-3 text-nowrap">
                                    {emailData?.to
                                      ?.map((t) => cleanEmailDisplay(t.email))
                                      .join(', ')}
                                  </span>
                                </div>
                                {emailData?.replyTo && emailData.replyTo.length > 0 && (
                                  <div className="flex">
                                    <span className="w-24 text-nowrap text-end text-gray-500">
                                      {m['common.mailDisplay.replyTo']()}:
                                    </span>
                                    <span className="text-muted-foreground ml-3 text-nowrap">
                                      {cleanEmailDisplay(emailData?.replyTo)}
                                    </span>
                                  </div>
                                )}
                                {emailData?.cc && emailData.cc.length > 0 && (
                                  <div className="flex">
                                    <span className="shrink-0text-nowrap w-24 text-end text-gray-500">
                                      {m['common.mailDisplay.cc']()}:
                                    </span>
                                    <span className="text-muted-foreground ml-3 text-nowrap">
                                      {emailData?.cc
                                        ?.map((t) => cleanEmailDisplay(t.email))
                                        .join(', ')}
                                    </span>
                                  </div>
                                )}
                                {emailData?.bcc && emailData.bcc.length > 0 && (
                                  <div className="flex">
                                    <span className="w-24 text-end text-gray-500">
                                      {m['common.mailDisplay.bcc']()}:
                                    </span>
                                    <span className="text-muted-foreground ml-3 text-nowrap">
                                      {emailData?.bcc
                                        ?.map((t) => cleanEmailDisplay(t.email))
                                        .join(', ')}
                                    </span>
                                  </div>
                                )}
                                <div className="flex">
                                  <span className="w-24 text-end text-gray-500">
                                    {m['common.mailDisplay.date']()}:
                                  </span>
                                  <span className="text-muted-foreground ml-3 text-nowrap">
                                    {emailData?.receivedOn &&
                                    !isNaN(new Date(emailData.receivedOn).getTime())
                                      ? format(new Date(emailData.receivedOn), 'PPpp')
                                      : ''}
                                  </span>
                                </div>
                                <div className="flex">
                                  <span className="w-24 text-end text-gray-500">
                                    {m['common.mailDisplay.mailedBy']()}:
                                  </span>
                                  <span className="text-muted-foreground ml-3 text-nowrap">
                                    {cleanEmailDisplay(emailData?.sender?.email)}
                                  </span>
                                </div>
                                <div className="flex">
                                  <span className="w-24 text-end text-gray-500">
                                    {m['common.mailDisplay.signedBy']()}:
                                  </span>
                                  <span className="text-muted-foreground ml-3 text-nowrap">
                                    {cleanEmailDisplay(emailData?.sender?.email)}
                                  </span>
                                </div>
                                {emailData.tls && (
                                  <div className="flex items-center">
                                    <span className="w-24 text-end text-gray-500">
                                      {m['common.mailDisplay.security']()}:
                                    </span>
                                    <div className="text-muted-foreground ml-3 flex items-center gap-1">
                                      <Lock className="h-4 w-4 text-green-600" />{' '}
                                      {m['common.mailDisplay.standardEncryption']()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="flex items-center justify-center">
                          <div className="text-muted-foreground flex-nowrap! mr-2 flex flex-col items-end text-sm font-medium dark:text-[#8C8C8C]">
                            <time className="whitespace-nowrap">
                              {emailData?.receivedOn ? formatDate(emailData.receivedOn) : ''}
                            </time>
                            {shouldShowSeparateTime(emailData?.receivedOn) && (
                              <time className="whitespace-nowrap text-xs opacity-75">
                                {emailData?.receivedOn && formatTime(emailData.receivedOn)}
                              </time>
                            )}
                          </div>

                          {/* options menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-md bg-white transition-colors hover:bg-gray-100 focus:outline-none focus:ring-0 dark:bg-[#313131] dark:hover:bg-[#3d3d3d]"
                              >
                                <ThreeDots className="fill-iconLight dark:fill-iconDark" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white dark:bg-[#313131]">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  printMail(emailData, messageAttachments);
                                }}
                              >
                                <Printer className="fill-iconLight dark:fill-iconDark mr-2 h-4 w-4" />
                                {m['common.mailDisplay.print']()}
                              </DropdownMenuItem>
                              {(messageAttachments?.length ?? 0) > 0 && (
                                <DropdownMenuItem
                                  disabled={!messageAttachments?.length}
                                  className={
                                    !messageAttachments?.length
                                      ? 'data-disabled:pointer-events-auto'
                                      : ''
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    void (async () => {
                                      try {
                                        const bodies = await fetchAttachmentBodies(emailData.id);
                                        await handleDownloadAllAttachments(
                                          emailData.subject || 'email',
                                          // Les images CID inline du corps ne sont pas des
                                          // pièces jointes téléchargeables.
                                          bodies.filter((item) => !item.contentId),
                                        )();
                                      } catch {
                                        toast.error(
                                          m['common.mailDisplay.failedToDownloadAttachment'](),
                                        );
                                      }
                                    })();
                                  }}
                                >
                                  <HardDriveDownload className="fill-iconLight dark:text-iconDark dark:fill-iconLight mr-2 h-4 w-4" />
                                  Download All Attachments
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <div className="flex gap-1">
                          <p className="text-muted-foreground text-sm font-medium dark:text-[#8C8C8C]">
                            {m['common.mailDisplay.to']()}:{' '}
                            {(() => {
                              // Combine to and cc recipients
                              const allRecipients = [
                                ...(emailData?.to || []),
                                ...(emailData?.cc || []),
                              ];

                              // If you're the only recipient
                              if (allRecipients.length === 1 && folder !== 'sent') {
                                return <span key="you">You</span>;
                              }

                              // Show first 3 recipients + count of others
                              const visibleRecipients = allRecipients.slice(0, 3);
                              const remainingCount = allRecipients.length - 3;

                              return (
                                <>
                                  {visibleRecipients.map((recipient, index) => (
                                    <span key={recipient.email}>
                                      {cleanNameDisplay(recipient.name) ||
                                        cleanEmailDisplay(recipient.email)}
                                      {index < visibleRecipients.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                  {remainingCount > 0 && (
                                    <span key="others">{`, +${remainingCount} others`}</span>
                                  )}
                                </>
                              );
                            })()}
                          </p>
                          {(emailData?.bcc?.length || 0) > 0 && (
                            <p className="text-muted-foreground text-sm font-medium dark:text-[#8C8C8C]">
                              Bcc:{' '}
                              {emailData?.bcc?.map((recipient, index) => (
                                <span key={recipient.email}>
                                  {cleanNameDisplay(recipient.name) ||
                                    cleanEmailDisplay(recipient.email)}
                                  {index < (emailData?.bcc?.length || 0) - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pending, needs a storage to make the unsubscribe status consitent */}
                    {/* <span className="text-muted-foreground flex grow-0 items-center gap-2 text-sm">
                    {listUnsubscribeAction && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="xs"
                            variant="secondary"
                            disabled={unsubscribed || isUnsubscribing}
                          >
                            {unsubscribed && <Check className="h-4 w-4" />}
                            {isUnsubscribing && (
                              <LoaderCircleIcon className="h-4 w-4 animate-spin" />
                            )}
                            {unsubscribed
                              ? t('common.mailDisplay.unsubscribed')
                              : t('common.mailDisplay.unsubscribe')}
                          </Button>
                        </DialogTrigger>

                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t('common.mailDisplay.unsubscribe')}</DialogTitle>
                            <DialogDescription className="break-words">
                              {t('common.mailDisplay.unsubscribeDescription')}
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter className="gap-2">
                            <DialogClose asChild>
                              <Button disabled={isUnsubscribing} variant="outline">
                                {t('common.mailDisplay.cancel')}
                              </Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button disabled={isUnsubscribing} onClick={_handleUnsubscribe}>
                                {t('common.mailDisplay.unsubscribe')}
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </span> */}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={cn('h-0 overflow-hidden duration-200', !isCollapsed && 'h-px')}></div>

          <div
            className={cn(
              'grid overflow-hidden duration-200',
              isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="h-fit w-full p-0">
                {/* mail main body */}
                {emailData?.decodedBody ? (
                  <MailContent
                    id={emailData.id}
                    html={emailData?.decodedBody}
                    senderEmail={emailData.sender.email}
                    onContentPainted={onContentPainted}
                  />
                ) : null}
                {/* mail attachments */}
                {messageAttachments && messageAttachments.length > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2 px-4 pt-4">
                    {messageAttachments.map((attachment) => (
                      <div
                        key={`${attachment.filename}-${attachment.attachmentId}`}
                        className="flex"
                      >
                        <button
                          className="flex cursor-pointer items-center gap-1 rounded-[5px] bg-[#FAFAFA] px-1.5 py-1 text-sm font-medium hover:bg-[#F0F0F0] dark:bg-[#262626] dark:hover:bg-[#303030]"
                          onClick={() => void withAttachmentBody(attachment, openAttachment)}
                        >
                          {getFileIcon(attachment.filename)}
                          <span className="max-w-[15ch] truncate text-sm text-black dark:text-white">
                            {attachment.filename}
                          </span>{' '}
                          <span className="text-muted-foreground whitespace-nowrap text-sm dark:text-[#929292]">
                            {formatFileSize(attachment.size)}
                          </span>
                        </button>
                        <button
                          onClick={() => void withAttachmentBody(attachment, downloadAttachment)}
                          className="flex cursor-pointer items-center gap-1 rounded-[5px] px-1.5 py-1 text-sm"
                        >
                          <HardDriveDownload className="text-muted-foreground dark:text-muted-foreground h-4 w-4 fill-[#FAFAFA] dark:fill-[#262626]" />
                        </button>
                        {index < (messageAttachments?.length || 0) - 1 && (
                          <div className="m-auto h-2 w-px bg-[#E0E0E0] dark:bg-[#424242]" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="my-2.5 flex gap-2 px-4">
                  <ActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCollapsed(false);
                      setMode('reply');
                      setActiveReplyId(emailData.id);
                    }}
                    icon={<Reply className="fill-muted-foreground dark:fill-[#9B9B9B]" />}
                    text={m['common.mail.reply']()}
                    shortcut={isLastEmail ? 'r' : undefined}
                  />
                  <ActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCollapsed(false);
                      setMode('replyAll');
                      setActiveReplyId(emailData.id);
                    }}
                    icon={<ReplyAll className="fill-muted-foreground dark:fill-[#9B9B9B]" />}
                    text={m['common.mail.replyAll']()}
                    shortcut={isLastEmail ? 'a' : undefined}
                  />
                  <ActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCollapsed(false);
                      setMode('forward');
                      setActiveReplyId(emailData.id);
                    }}
                    icon={<Forward className="fill-muted-foreground dark:fill-[#9B9B9B]" />}
                    text={m['common.mail.forward']()}
                    shortcut={isLastEmail ? 'f' : undefined}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    </div>
  );
};

export default memo(MailDisplay);
