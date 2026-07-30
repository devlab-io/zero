import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveComposerEscape } from '@/lib/composer-escape';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { ScheduleSendPicker } from './schedule-send-picker';
import { Command, Loader, Plus, Type } from 'lucide-react';
import useComposeEditor from '@/hooks/use-compose-editor';
import { CurvedArrow, Sparkles } from '../icons/icons';
import { getGitHubEmojis } from '@/lib/emoji-data';
import { zodResolver } from '@/lib/zod-resolver';
import { AnimatePresence } from 'motion/react';
import { log } from '@/lib/log';

import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useSettings } from '@/hooks/use-settings';

import { useThread } from '@/hooks/use-threads';
import { serializeFiles } from '@/lib/schemas';
import { Input } from '@/components/ui/input';
import { EditorContent } from '@tiptap/react';
import { useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { useQueryState } from 'nuqs';
import { Toolbar } from './toolbar';
import pluralize from 'pluralize';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  buildThreadContent,
  schema,
  type EmailComposerProps,
  type ThreadContent,
} from './email-composer.types';
import { useComposerDraftPersistence } from '@/hooks/use-composer-draft-persistence';
// Issue #32 — send-and-archive (mod+shift+Enter): the editor has no Mod-Shift-Enter
// keymap, so it is bound here with useHotkeys and archives the open thread after send.
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { ComposerAttachments } from './email-composer.attachments';
import { ContentPreview } from './email-composer.content-preview';
import { computeArchiveAfterSend } from './send-and-archive';
import type { ImageQuality } from '@/lib/image-compression';
import { ComposerDialogs } from './email-composer.dialogs';
import { compressImages } from '@/lib/image-compression';
import { ComposerHeader } from './email-composer.fields';
import { TemplateButton } from './template-button';
import { useHotkeys } from 'react-hotkeys-hook';
import { useParams } from 'react-router';

const shortcodeRegex = /:([a-zA-Z0-9_+-]+):/g;

export function EmailComposer({
  initialTo = [],
  initialCc = [],
  initialBcc = [],
  initialSubject = '',
  initialMessage = '',
  initialAttachments = [],
  onSendEmail,
  onClose,
  className,
  autofocus = false,
  settingsLoading = false,
  editorClassName,
}: EmailComposerProps) {
  const { data: aliases } = useEmailAliases();
  const { data: settings } = useSettings();
  const [showCc, setShowCc] = useState(initialCc.length > 0);
  const [showBcc, setShowBcc] = useState(initialBcc.length > 0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [messageLength, setMessageLength] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Racine du composer — périmètre du Escape-ferme-un-reply-vide (CUA échec 6). */
  const rootRef = useRef<HTMLDivElement>(null);
  const [threadId] = useQueryState('threadId');
  const [isComposeOpen, setIsComposeOpen] = useQueryState('isComposeOpen');
  const { data: emailData } = useThread(threadId ?? null);
  const params = useParams<{ folder: string }>();
  const { optimisticMoveThreadsTo } = useOptimisticActions();
  // Set by the send-and-archive handler; consumed once in proceedWithSend on success.
  const archiveAfterSendRef = useRef(false);
  const [draftId, setDraftId] = useQueryState('draftId');
  const [aiGeneratedMessage, setAiGeneratedMessage] = useState<string | null>(null);
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>();
  const [isScheduleValid, setIsScheduleValid] = useState<boolean>(true);
  const [showAttachmentWarning, setShowAttachmentWarning] = useState(false);
  const [originalAttachments, setOriginalAttachments] = useState<File[]>(initialAttachments);
  const [imageQuality, setImageQuality] = useState<ImageQuality>(
    settings?.settings?.imageCompression || 'medium',
  );
  const [activeReplyId] = useQueryState('activeReplyId');
  const [toggleToolbar, setToggleToolbar] = useState(false);
  // Durable local draft persistence (issue #34, check point 5): survives unmount,
  // pagehide/reload and a failed server autosave; restored on mount. The callbacks
  // are key-stable, so the persist effect only fires on real content changes.
  const {
    restored: restoredDraft,
    update: persistDraftSnapshot,
    clear: clearDraftSnapshot,
  } = useComposerDraftPersistence({
    threadId,
    draftId,
    replyId: activeReplyId,
  });
  const processAndSetAttachments = async (
    filesToProcess: File[],
    quality: ImageQuality,
    showToast: boolean = false,
  ) => {
    if (filesToProcess.length === 0) {
      setValue('attachments', [], { shouldDirty: true });
      return;
    }

    try {
      const compressedFiles = await compressImages(filesToProcess, {
        quality,
        maxWidth: 1920,
        maxHeight: 1080,
      });

      if (compressedFiles.length !== filesToProcess.length) {
        log.warn('Compressed files array length mismatch:', {
          original: filesToProcess.length,
          compressed: compressedFiles.length,
        });
        setValue('attachments', filesToProcess, { shouldDirty: true });
        setHasUnsavedChanges(true);
        if (showToast) {
          toast.error('Image compression failed, using original files');
        }
        return;
      }

      setValue('attachments', compressedFiles, { shouldDirty: true });
      setHasUnsavedChanges(true);

      if (showToast && quality !== 'original') {
        let totalOriginalSize = 0;
        let totalCompressedSize = 0;

        const imageFilesExist = filesToProcess.some((f) => f.type.startsWith('image/'));

        if (imageFilesExist) {
          filesToProcess.forEach((originalFile, index) => {
            if (originalFile.type.startsWith('image/') && compressedFiles[index]) {
              totalOriginalSize += originalFile.size;
              totalCompressedSize += compressedFiles[index].size;
            }
          });

          if (totalOriginalSize > totalCompressedSize) {
            const savings = (
              ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) *
              100
            ).toFixed(1);
            if (parseFloat(savings) > 0.1) {
              toast.success(`Images compressed: ${savings}% smaller`);
            }
          }
        }
      }
    } catch (error) {
      log.error('Error compressing images:', error);
      setValue('attachments', filesToProcess, { shouldDirty: true });
      setHasUnsavedChanges(true);
      if (showToast) {
        toast.error('Image compression failed, using original files');
      }
    }
  };

  const attachmentKeywords = [
    'attachment',
    'attached',
    'attaching',
    'see the file',
    'see the files',
  ];

  const trpc = useTRPC();
  const { mutateAsync: aiCompose } = useMutation(trpc.ai.compose.mutationOptions());
  const { mutateAsync: createDraft } = useMutation(trpc.drafts.create.mutationOptions());
  const { mutateAsync: generateEmailSubject } = useMutation(
    trpc.ai.generateEmailSubject.mutationOptions(),
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      to: restoredDraft?.to ?? initialTo,
      cc: restoredDraft?.cc ?? initialCc,
      bcc: restoredDraft?.bcc ?? initialBcc,
      subject: restoredDraft?.subject ?? initialSubject,
      message: restoredDraft?.message ?? initialMessage,
      attachments: initialAttachments,
      fromEmail:
        settings?.settings?.defaultEmailAlias ||
        aliases?.find((alias) => alias.primary)?.email ||
        aliases?.[0]?.email ||
        '',
    },
  });

  const { watch, setValue, getValues } = form;
  const toEmails = watch('to');
  const ccEmails = watch('cc');
  const bccEmails = watch('bcc');
  const subjectInput = watch('subject');
  const attachments = watch('attachments');
  const fromEmail = watch('fromEmail');

  const handleAttachment = async (newFiles: File[]) => {
    if (newFiles && newFiles.length > 0) {
      const newOriginals = [...originalAttachments, ...newFiles];
      setOriginalAttachments(newOriginals);
      await processAndSetAttachments(newOriginals, imageQuality, true);
    }
  };

  const removeAttachment = async (index: number) => {
    const newOriginals = originalAttachments.filter((_, i) => i !== index);
    setOriginalAttachments(newOriginals);
    await processAndSetAttachments(newOriginals, imageQuality);
    setHasUnsavedChanges(true);
  };

  const editor = useComposeEditor({
    initialValue: restoredDraft?.message ?? initialMessage,
    isReadOnly: isLoading,
    onLengthChange: (length) => {
      setHasUnsavedChanges(true);
      setMessageLength(length);
    },
    onModEnter: () => {
      void handleSend();
      return true;
    },
    onAttachmentsChange: async (files) => {
      await handleAttachment(files);
    },
    placeholder: 'Start your email here',
    autofocus,
  });

  // Add effect to focus editor when component mounts
  useEffect(() => {
    if (autofocus && editor) {
      const timeoutId = setTimeout(() => {
        editor.commands.focus('end');
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [editor, autofocus]);

  // Remove the TRPC query - we'll use the component's internal logic instead
  useEffect(() => {
    if (isComposeOpen === 'true' && editor) {
      editor.commands.focus();
    }
  }, [isComposeOpen, editor]);

  // Prevent browser navigation/refresh when there's unsaved content
  useEffect(() => {
    if (!editor) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasContent = editor?.getText()?.trim().length > 0;
      if (hasContent) {
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editor]);

  // Perhaps add `hasUnsavedChanges` to the condition
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // CUA 2026-07-30 (échec 6) : reply inline vide — Escape restait sans
        // effet (mode=replyAll conservé, Send visible). Décision extraite dans
        // lib/composer-escape.ts : vide → fermeture sans brouillon (bornée au
        // focus intérieur), non-vide → confirmation de sortie.
        const decision = resolveComposerEscape({
          hasContent: (editor?.getText()?.trim().length ?? 0) > 0,
          hasDraftId: !!draftId,
          targetInsideComposer: !!rootRef.current?.contains(e.target as Node),
        });
        if (decision === 'ignore') return;
        e.preventDefault();
        e.stopPropagation();
        if (decision === 'confirm') {
          setShowLeaveConfirmation(true);
        } else {
          // Un reply a `to` prérempli : la persistance locale a donc déjà écrit
          // un snapshot. Purge (comme confirmLeave), sinon il ressusciterait au
          // prochain reply du même fil alors que l'intention était d'abandonner.
          clearDraftSnapshot();
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, draftId, onClose, clearDraftSnapshot]);

  const proceedWithSend = async () => {
    try {
      if (isLoading || isSavingDraft) return;

      // Consume the send-and-archive intent once, before any early return, so a plain
      // send never inherits a stale flag.
      const shouldArchiveAfterSend = archiveAfterSendRef.current;
      archiveAfterSendRef.current = false;

      const values = getValues();

      // Validate recipient field
      if (!values.to || values.to.length === 0) {
        toast.error('Recipient is required');
        return;
      }

      if (!isScheduleValid) {
        toast.error('Please choose a valid date & time for scheduling');
        return;
      }

      setIsLoading(true);
      setAiGeneratedMessage(null);
      // Save draft before sending, we want to send drafts instead of sending new emails
      if (hasUnsavedChanges) await saveDraft();

      await onSendEmail({
        to: values.to,
        cc: showCc ? values.cc : undefined,
        bcc: showBcc ? values.bcc : undefined,
        subject: values.subject,
        message: editor.getHTML(),
        attachments: values.attachments || [],
        fromEmail: values.fromEmail,
        scheduleAt,
      });
      setHasUnsavedChanges(false);
      editor.commands.clearContent(true);
      form.reset();
      clearDraftSnapshot();
      setIsComposeOpen(null);

      // Send-and-archive (mod+shift+Enter): the send succeeded — archive the open thread.
      if (shouldArchiveAfterSend) {
        const target = computeArchiveAfterSend({ threadId, folder: params.folder });
        if (target) {
          optimisticMoveThreadsTo(target.threadIds, target.currentFolder, target.destination);
        }
      }
    } catch (error) {
      log.error('Error sending email:', error);
      toast.error('Failed to send email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    const values = getValues();
    const messageText = editor.getText().toLowerCase();
    const hasAttachmentKeywords = attachmentKeywords.some((keyword) => {
      const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
      return regex.test(messageText);
    });

    if (hasAttachmentKeywords && (!values.attachments || values.attachments.length === 0)) {
      setShowAttachmentWarning(true);
      return;
    }

    await proceedWithSend();
  };

  // mod+shift+Enter — send, then archive the open thread ("send and done"). The editor
  // owns Mod-Enter (plain send); this chord has no editor keymap so it is bound here.
  useHotkeys(
    'mod+shift+enter',
    () => {
      archiveAfterSendRef.current = true;
      void handleSend();
    },
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [handleSend],
  );

  const threadContent: ThreadContent = useMemo(() => buildThreadContent(emailData), [emailData]);

  const handleAiGenerate = async () => {
    try {
      setIsLoading(true);
      setAiIsLoading(true);
      const values = getValues();

      const result = await aiCompose({
        prompt: editor.getText(),
        emailSubject: values.subject,
        to: values.to,
        cc: values.cc,
        threadMessages: threadContent,
      });

      setAiGeneratedMessage(result.newBody);
      // toast.success('Email generated successfully');
    } catch (error) {
      log.error('Error generating AI email:', error);
      toast.error('Failed to generate email');
    } finally {
      setIsLoading(false);
      setAiIsLoading(false);
    }
  };

  const saveDraft = async () => {
    const values = getValues();

    if (!hasUnsavedChanges) return;
    const messageText = editor.getText();

    if (messageText.trim() === initialMessage.trim()) return;
    if (editor.getHTML() === initialMessage.trim()) return;
    if (!values.to.length || !values.subject.length || !messageText.length) return;
    if (aiGeneratedMessage || aiIsLoading || isGeneratingSubject) return;

    try {
      setIsSavingDraft(true);
      const draftData = {
        to: values.to.join(', '),
        cc: values.cc?.join(', '),
        bcc: values.bcc?.join(', '),
        subject: values.subject,
        message: editor.getHTML(),
        attachments: await serializeFiles(values.attachments ?? []),
        id: draftId,
        threadId: threadId ? threadId : null,
        fromEmail: values.fromEmail ? values.fromEmail : null,
      };

      const response = await createDraft(draftData);

      if (response?.id && response.id !== draftId) {
        setDraftId(response.id);
      }
    } catch (error) {
      log.error('Error saving draft:', error);
      toast.error('Failed to save draft');
      setIsSavingDraft(false);
      setHasUnsavedChanges(false);
    } finally {
      setIsSavingDraft(false);
      setHasUnsavedChanges(false);
    }
  };

  const handleGenerateSubject = async () => {
    try {
      setIsGeneratingSubject(true);
      const messageText = editor.getText().trim();

      if (!messageText) {
        toast.error('Please enter some message content first');
        return;
      }

      const { subject } = await generateEmailSubject({ message: messageText });
      setValue('subject', subject);
      setHasUnsavedChanges(true);
    } catch (error) {
      log.error('Error generating subject:', error);
      toast.error('Failed to generate subject');
    } finally {
      setIsGeneratingSubject(false);
    }
  };

  const handleClose = () => {
    const hasContent = editor?.getText()?.trim().length > 0;
    if (hasContent) {
      setShowLeaveConfirmation(true);
    } else {
      onClose?.();
    }
  };

  const confirmLeave = () => {
    setShowLeaveConfirmation(false);
    clearDraftSnapshot();
    onClose?.();
  };

  const cancelLeave = () => {
    setShowLeaveConfirmation(false);
  };

  // Persist the latest composer state locally on every change (issue #34, check
  // point 5). The persistence hook flushes this on pagehide/visibility-hidden/unmount,
  // so a draft survives teardown, reload and a failed server autosave.
  useEffect(() => {
    if (!editor) return;
    persistDraftSnapshot({
      to: toEmails,
      cc: ccEmails ?? [],
      bcc: bccEmails ?? [],
      subject: subjectInput,
      message: editor.getHTML(),
      savedAt: Date.now(),
    });
  }, [toEmails, ccEmails, bccEmails, subjectInput, messageLength, editor, persistDraftSnapshot]);

  // A restored draft that carried cc/bcc reveals those rows so they are not silently dropped.
  useEffect(() => {
    if (restoredDraft?.cc?.length) setShowCc(true);
    if (restoredDraft?.bcc?.length) setShowBcc(true);
  }, [restoredDraft]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const autoSaveTimer = setTimeout(() => {
      saveDraft();
    }, 3000);

    return () => clearTimeout(autoSaveTimer);
  }, [hasUnsavedChanges, saveDraft]);

  useEffect(() => {
    const handlePasteFiles = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData || !clipboardData.files.length) return;

      const pastedFiles = Array.from(clipboardData.files);
      if (pastedFiles.length > 0) {
        event.preventDefault();
        handleAttachment(pastedFiles);
        toast.success(`${pluralize('file', pastedFiles.length, true)} attached`);
      }
    };

    document.addEventListener('paste', handlePasteFiles);
    return () => {
      document.removeEventListener('paste', handlePasteFiles);
    };
  }, [handleAttachment]);

  // useHotkeys('meta+y', async (e) => {
  //   if (!editor.getText().trim().length && !subjectInput.trim().length) {
  //     toast.error('Please enter a subject or a message');
  //     return;
  //   }
  //   if (!subjectInput.trim()) {
  //     await handleGenerateSubject();
  //   }
  //   setAiGeneratedMessage(null);
  //   await handleAiGenerate();
  // });

  // keep fromEmail in sync when settings or aliases load afterwards
  useEffect(() => {
    const preferred =
      settings?.settings?.defaultEmailAlias ??
      aliases?.find((a) => a.primary)?.email ??
      aliases?.[0]?.email;

    if (preferred && getValues('fromEmail') !== preferred) {
      setValue('fromEmail', preferred, { shouldDirty: false });
    }
  }, [settings?.settings?.defaultEmailAlias, aliases, getValues, setValue]);

  const handleQualityChange = async (newQuality: ImageQuality) => {
    setImageQuality(newQuality);
    await processAndSetAttachments(originalAttachments, newQuality, true);
  };

  const handleScheduleChange = useCallback((value?: string) => {
    setScheduleAt(value);
  }, []);

  const handleScheduleValidityChange = useCallback((valid: boolean) => {
    setIsScheduleValid(valid);
  }, []);

  const replaceEmojiShortcodes = (text: string): string => {
    if (!text.trim().length || !text.includes(':')) return text;
    return text.replace(shortcodeRegex, (match, shortcode): string => {
      const emoji = getGitHubEmojis().find(
        (e) => e.shortcodes.includes(shortcode) || e.name === shortcode,
      );
      return emoji?.emoji ?? match;
    });
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'flex max-h-[500px] w-full max-w-[750px] flex-col overflow-hidden rounded-2xl bg-[#FAFAFA] shadow-sm dark:bg-[#202020]',
        className,
      )}
    >
      <div className="no-scrollbar dark:bg-panelDark flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl">
        <ComposerHeader
          control={form.control}
          isLoading={isLoading}
          showCc={showCc}
          showBcc={showBcc}
          onToggleCc={() => setShowCc(!showCc)}
          onToggleBcc={() => setShowBcc(!showBcc)}
          canClose={!!onClose}
          onCloseClick={handleClose}
          activeReplyId={activeReplyId}
          subjectInput={subjectInput}
          onSubjectInputChange={(value) => {
            const next = replaceEmojiShortcodes(value);
            setValue('subject', next);
            setHasUnsavedChanges(true);
          }}
          onGenerateSubject={handleGenerateSubject}
          isGeneratingSubject={isGeneratingSubject}
          messageLength={messageLength}
          aliases={aliases}
          fromEmail={fromEmail || ''}
          onFromChange={(value) => {
            setValue('fromEmail', value);
            setHasUnsavedChanges(true);
          }}
        />

        {/* Message Content */}
        <div className="flex-1 overflow-y-auto border-t bg-[#FFFFFF] px-3 py-3 outline-white/5 dark:bg-[#202020]">
          <div
            onClick={() => {
              editor.commands.focus();
            }}
            className={cn(
              `min-h-[200px] w-full`,
              editorClassName,
              aiGeneratedMessage !== null ? 'blur-sm' : '',
            )}
          >
            <EditorContent editor={editor} className="h-full w-full max-w-full overflow-x-auto" />
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="inline-flex w-full shrink-0 items-end justify-between self-stretch rounded-b-2xl bg-[#FFFFFF] px-3 py-3 outline-white/5 dark:bg-[#202020]">
        <div className="flex flex-col items-start justify-start gap-2">
          {toggleToolbar && <Toolbar editor={editor} />}
          <div className="flex items-center justify-start gap-2">
            <Button
              size={'xs'}
              onClick={handleSend}
              disabled={isLoading || settingsLoading || !isScheduleValid}
            >
              <div className="flex items-center justify-center">
                <div className="text-center text-sm leading-none text-white dark:text-black">
                  <span>Send </span>
                </div>
              </div>
              <div className="flex h-5 items-center justify-center gap-1 rounded-sm bg-white/10 px-1 dark:bg-black/10">
                <Command className="h-3.5 w-3.5 text-white dark:text-black" />
                <CurvedArrow className="mt-1.5 h-4 w-4 fill-white dark:fill-black" />
              </div>
            </Button>
            <ScheduleSendPicker
              value={scheduleAt}
              onChange={handleScheduleChange}
              onValidityChange={handleScheduleValidityChange}
            />
            <Button
              variant={'secondary'}
              size={'xs'}
              onClick={() => fileInputRef.current?.click()}
              className="bg-background cursor-pointer border transition-colors hover:bg-gray-50 dark:hover:bg-[#404040]"
            >
              <Plus className="h-3 w-3 fill-[#9A9A9A]" />
              <span className="hidden px-0.5 text-sm md:block">Add</span>
            </Button>
            <TemplateButton
              editor={editor}
              subject={subjectInput}
              setSubject={(value) => setValue('subject', value)}
              to={toEmails}
              cc={ccEmails ?? []}
              bcc={bccEmails ?? []}
              setRecipients={(field, val) => setValue(field, val)}
            />
            <Input
              type="file"
              id="attachment-input"
              className="hidden"
              onChange={async (event) => {
                const fileList = event.target.files;
                if (fileList) {
                  await handleAttachment(Array.from(fileList));
                }
              }}
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              ref={fileInputRef}
              style={{ zIndex: 100 }}
            />
            <ComposerAttachments
              attachments={attachments}
              imageQuality={imageQuality}
              onQualityChange={handleQualityChange}
              onRemove={removeAttachment}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => setToggleToolbar(!toggleToolbar)}
                    className={`h-auto w-auto rounded p-1.5 ${toggleToolbar ? 'bg-muted' : 'bg-background'} cursor-pointer border transition-colors hover:bg-gray-50 dark:hover:bg-[#404040]`}
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Formatting options</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex items-start justify-start gap-2">
          <div className="relative">
            <AnimatePresence>
              {aiGeneratedMessage !== null ? (
                <ContentPreview
                  content={aiGeneratedMessage}
                  onAccept={() => {
                    editor.commands.setContent({
                      type: 'doc',
                      content: aiGeneratedMessage.split(/\r?\n/).map((line) => {
                        return {
                          type: 'paragraph',
                          content: line.trim().length === 0 ? [] : [{ type: 'text', text: line }],
                        };
                      }),
                    });
                    setAiGeneratedMessage(null);
                  }}
                  onReject={() => {
                    setAiGeneratedMessage(null);
                  }}
                />
              ) : null}
            </AnimatePresence>
            <Button
              size={'xs'}
              variant={'ghost'}
              className="cursor-pointer border border-[#8B5CF6]"
              onClick={async () => {
                if (!subjectInput.trim()) {
                  await handleGenerateSubject();
                }
                setAiGeneratedMessage(null);
                await handleAiGenerate();
              }}
              disabled={isLoading || aiIsLoading || messageLength < 1}
            >
              <div className="flex items-center justify-center gap-2.5 pl-0.5">
                <div className="flex h-5 items-center justify-center gap-1 rounded-sm">
                  {aiIsLoading ? (
                    <Loader className="h-3.5 w-3.5 animate-spin fill-black dark:fill-white" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 fill-black dark:fill-white" />
                  )}
                </div>
                <div className="hidden text-center text-sm leading-none text-black md:block dark:text-white">
                  Generate
                </div>
              </div>
            </Button>
          </div>
        </div>
      </div>

      <ComposerDialogs
        showLeaveConfirmation={showLeaveConfirmation}
        onLeaveOpenChange={setShowLeaveConfirmation}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        showAttachmentWarning={showAttachmentWarning}
        onAttachmentWarningOpenChange={setShowAttachmentWarning}
        onSendAnyway={() => {
          setShowAttachmentWarning(false);
          void proceedWithSend();
        }}
      />
    </div>
  );
}
