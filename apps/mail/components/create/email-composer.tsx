import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { m } from '@/paraglide/messages';
import { Button } from '../ui/button';
import { useQueryState } from 'nuqs';
import { Toolbar } from './toolbar';
import pluralize from 'pluralize';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  canRetryComposerSave,
  ComposerAutosaveRevisions,
  reduceComposerSaveStatus,
  runVersionedComposerSave,
  shouldScheduleComposerAutosave,
  type ComposerSaveDecision,
  type ComposerSaveStatus,
} from '@/components/mail/composer-trust';
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
  const [snapshotTick, setSnapshotTick] = useState(0);
  const autosaveRevisionsRef = useRef<ComposerAutosaveRevisions | null>(null);
  const saveInFlightRef = useRef(false);
  if (!autosaveRevisionsRef.current) {
    autosaveRevisionsRef.current = new ComposerAutosaveRevisions();
  }
  const markComposerEdited = useCallback(() => {
    autosaveRevisionsRef.current?.markEdited();
    setHasUnsavedChanges(true);
    setSnapshotTick((current) => current + 1);
  }, []);
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
  const [saveStatus, dispatchSaveStatus] = useReducer(
    reduceComposerSaveStatus,
    restoredDraft ? 'local' : ('idle' as ComposerSaveStatus),
  );
  const lastSnapshotRef = useRef<string | null>(null);
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

  useEffect(() => {
    const subscription = watch((_values, { name }) => {
      if (name === 'fromEmail') return;
      markComposerEdited();
    });
    return () => subscription.unsubscribe();
  }, [markComposerEdited, watch]);

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
    onChange: () => markComposerEdited(),
    onLengthChange: (length) => {
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

  useEffect(() => {
    const editorElement = editor?.view.dom;
    if (!editorElement) return;
    editorElement.setAttribute('role', 'textbox');
    editorElement.setAttribute('aria-multiline', 'true');
    editorElement.setAttribute('aria-label', m['states.composer.bodyLabel']());
  }, [editor]);

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

  const applySaveDecision = (decision: ComposerSaveDecision) => {
    switch (decision.effect) {
      case 'server':
        setHasUnsavedChanges(false);
        dispatchSaveStatus({ type: 'SAVE_SUCCEEDED' });
        break;
      case 'local':
        setHasUnsavedChanges(true);
        dispatchSaveStatus({ type: 'LOCAL_PERSISTED' });
        break;
      case 'error':
        setHasUnsavedChanges(true);
        dispatchSaveStatus({ type: 'SAVE_FAILED' });
        break;
      case 'none':
        break;
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    const values = getValues();

    if (!hasUnsavedChanges || saveInFlightRef.current) return false;
    const messageText = editor.getText();
    const localPersisted = persistDraftSnapshot({
      to: values.to,
      cc: values.cc ?? [],
      bcc: values.bcc ?? [],
      subject: values.subject,
      message: editor.getHTML(),
      savedAt: Date.now(),
    });

    if (!localPersisted) {
      setHasUnsavedChanges(true);
      dispatchSaveStatus({ type: 'SAVE_FAILED' });
      return false;
    }

    // Incomplete drafts are still durable locally, but the provider draft API needs
    // all three fields. Stop the autosave loop only after localStorage confirms the
    // snapshot, and never claim a server save.
    if (!values.to.length || !values.subject.length || !messageText.length) {
      setHasUnsavedChanges(false);
      dispatchSaveStatus({ type: 'LOCAL_PERSISTED' });
      return false;
    }
    if (aiGeneratedMessage || aiIsLoading || isGeneratingSubject) return false;
    const autosaveRevisions = autosaveRevisionsRef.current;
    if (!autosaveRevisions) return false;

    saveInFlightRef.current = true;
    setIsSavingDraft(true);
    dispatchSaveStatus({ type: 'SAVE_STARTED' });

    const result = await runVersionedComposerSave(autosaveRevisions, async () => {
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

      return createDraft(draftData);
    });

    try {
      if (result.ok) {
        if (result.value?.id && result.value.id !== draftId) {
          setDraftId(result.value.id);
        }
        applySaveDecision(result.decision);
        return result.decision.effect === 'server';
      }

      log.error('Error saving draft:', result.error);
      if (result.decision.effect === 'error') {
        toast.error('Failed to save draft');
      }
      applySaveDecision(result.decision);
      return false;
    } finally {
      saveInFlightRef.current = false;
      setIsSavingDraft(false);
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

  // Escape follows the same close policy as the visible close control for new mail,
  // replies, and forwards: discard empty composers, otherwise ask before leaving.
  useEffect(() => {
    if (!editor || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, onClose, handleClose]);

  const confirmLeave = () => {
    setShowLeaveConfirmation(false);
    clearDraftSnapshot();
    onClose?.();
  };

  const cancelLeave = () => {
    setShowLeaveConfirmation(false);
  };

  // Persist the latest composer state locally on every change. Comparing the
  // serialized form also catches recipient edits, which do not pass through the
  // editor's onLengthChange callback.
  useEffect(() => {
    if (!editor) return;
    const snapshot = {
      to: toEmails,
      cc: ccEmails ?? [],
      bcc: bccEmails ?? [],
      subject: subjectInput,
      message: editor.getHTML(),
      savedAt: Date.now(),
    };
    const signature = JSON.stringify({
      ...snapshot,
      savedAt: 0,
      fromEmail,
      attachments: (attachments ?? []).map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      })),
    });
    const changed = lastSnapshotRef.current !== null && lastSnapshotRef.current !== signature;
    lastSnapshotRef.current = signature;

    const persisted = persistDraftSnapshot(snapshot);
    if (changed) {
      setHasUnsavedChanges(true);
      dispatchSaveStatus({ type: persisted ? 'LOCAL_PERSISTED' : 'SAVE_FAILED' });
    }
  }, [
    toEmails,
    ccEmails,
    bccEmails,
    subjectInput,
    messageLength,
    snapshotTick,
    attachments,
    fromEmail,
    editor,
    persistDraftSnapshot,
  ]);

  // A restored draft that carried cc/bcc reveals those rows so they are not silently dropped.
  useEffect(() => {
    if (restoredDraft?.cc?.length) setShowCc(true);
    if (restoredDraft?.bcc?.length) setShowBcc(true);
  }, [restoredDraft]);

  useEffect(() => {
    if (
      !shouldScheduleComposerAutosave({
        dirty: hasUnsavedChanges,
        status: saveStatus,
        inFlight: isSavingDraft,
      })
    ) {
      return;
    }

    const autoSaveTimer = setTimeout(() => {
      void saveDraft();
    }, 3000);

    return () => clearTimeout(autoSaveTimer);
  }, [hasUnsavedChanges, isSavingDraft, saveDraft, saveStatus, snapshotTick]);

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

  const saveStatusLabel = {
    idle: m['states.composer.autosave.idle'](),
    local: m['states.composer.autosave.local'](),
    saving: m['states.composer.autosave.saving'](),
    server: m['states.composer.autosave.server'](),
    error: m['states.composer.autosave.error'](),
  } satisfies Record<ComposerSaveStatus, string>;

  return (
    <div
      role="region"
      aria-labelledby="composer-title"
      aria-describedby="composer-description"
      className={cn(
        'bg-background flex min-h-0 w-full min-w-0 max-w-[750px] flex-col overflow-hidden rounded-2xl shadow-sm',
        'max-h-[min(46rem,calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1rem))]',
        className,
      )}
    >
      <h2 id="composer-title" className="sr-only">
        {m['states.composer.title']()}
      </h2>
      <p id="composer-description" className="sr-only">
        {m['states.composer.description']()}
      </p>
      <div className="no-scrollbar dark:bg-panelDark flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl">
        <ComposerHeader
          control={form.control}
          isLoading={isLoading}
          showCc={showCc}
          showBcc={showBcc}
          onToggleCc={() => setShowCc(!showCc)}
          onToggleBcc={() => setShowBcc(!showBcc)}
          subjectInput={subjectInput}
          onSubjectInputChange={(value) => {
            const next = replaceEmojiShortcodes(value);
            setValue('subject', next);
            setHasUnsavedChanges(true);
          }}
          aliases={aliases}
          fromEmail={fromEmail || ''}
          onFromChange={(value) => {
            setValue('fromEmail', value, { shouldDirty: true });
            markComposerEdited();
          }}
        />

        {/* Message Content */}
        <div className="bg-background flex-1 overflow-y-auto overflow-x-hidden border-t px-3 py-3">
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
            <EditorContent
              editor={editor}
              className="h-full w-full max-w-full overflow-x-hidden break-words [&_.ProseMirror]:break-words"
            />
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="bg-background sticky bottom-0 z-20 flex w-full shrink-0 flex-col gap-2 self-stretch border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-end sm:justify-between [&_button]:min-h-11 sm:[&_button]:min-h-10">
        <div className="flex min-w-0 flex-col items-start justify-start gap-2">
          {toggleToolbar && <Toolbar editor={editor} />}
          <div className="flex min-w-0 flex-wrap items-center justify-start gap-2">
            <Button
              size="xs"
              className="min-h-11 sm:min-h-10"
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
              variant="secondary"
              size="xs"
              aria-label={m['states.composer.attach']()}
              onClick={() => fileInputRef.current?.click()}
              className="bg-background hover:bg-accent min-h-11 cursor-pointer border transition-colors sm:min-h-10"
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
                    variant="ghost"
                    size="icon"
                    aria-label={m['states.composer.formatting']()}
                    onClick={() => setToggleToolbar(!toggleToolbar)}
                    className={cn(
                      'hover:bg-accent min-h-11 min-w-11 cursor-pointer rounded-md border p-1.5 transition-colors sm:min-h-10 sm:min-w-10',
                      toggleToolbar ? 'bg-muted' : 'bg-background',
                    )}
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Formatting options</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:justify-start">
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'min-w-0 text-xs font-medium tabular-nums',
              saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {saveStatusLabel[saveStatus]}
          </div>
          {canRetryComposerSave(saveStatus) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-10"
              onClick={() => void saveDraft()}
            >
              {m['states.composer.autosave.retry']()}
            </Button>
          ) : null}
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
              size="xs"
              variant="ghost"
              className="min-h-11 cursor-pointer border border-[#8B5CF6] sm:min-h-10"
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-10"
            onClick={() => void handleGenerateSubject()}
            disabled={isLoading || isGeneratingSubject || messageLength < 1}
          >
            {m['states.composer.generateSubject']()}
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-10"
              onClick={handleClose}
            >
              {m['states.composer.close']()}
            </Button>
          ) : null}
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
