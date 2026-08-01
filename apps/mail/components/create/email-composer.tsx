import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { createDraftSaveLifecycle } from '@/lib/draft-save-lifecycle';
import { registerComposerInsertHandler } from '@/lib/composer-insert';
import { resolveComposerChord } from '@/lib/hotkeys/composer-chords';
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerLiveDraft } from '@/lib/live-draft-registry';
import { resolveComposerEscape } from '@/lib/composer-escape';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { ScheduleSendPicker } from './schedule-send-picker';
import { ownedDraftStorageKey } from '@/lib/draft-storage';
import useComposeEditor from '@/hooks/use-compose-editor';
import { Command, Plus, Type } from 'lucide-react';
import { zodResolver } from '@/lib/zod-resolver';
import { CurvedArrow } from '../icons/icons';
import { isMac } from '@/lib/platform';
import { log } from '@/lib/log';

import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useSettings } from '@/hooks/use-settings';

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
  attachmentKeywords,
  processComposerAttachments,
  replaceEmojiShortcodes,
} from './email-composer.helpers';
import { useComposerDraftPersistence } from '@/hooks/use-composer-draft-persistence';
import { schema, type EmailComposerProps } from './email-composer.types';
// Issue #32 — send-and-archive (mod+shift+Enter): the editor has no Mod-Shift-Enter
// keymap, so it is bound here with useHotkeys and archives the open thread after send.
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { WritingAssistantButton } from './writing-assistant-button';
import { ComposerAttachments } from './email-composer.attachments';
import { computeArchiveAfterSend } from './send-and-archive';
import type { ImageQuality } from '@/lib/image-compression';
import { ComposerDialogs } from './email-composer.dialogs';
import { ComposerHeader } from './email-composer.fields';
import { insertQuotedReply } from '@/lib/thread-quote';
import { TemplateButton } from './template-button';
import { useHotkeys } from 'react-hotkeys-hook';
import { useParams } from 'react-router';

export function EmailComposer({
  initialTo = [],
  initialCc = [],
  initialBcc = [],
  initialSubject = '',
  initialMessage = '',
  initialAttachments = [],
  draftOwner,
  onSendEmail,
  onClose,
  onAbandonEmpty,
  className,
  autofocus = false,
  settingsLoading = false,
  editorClassName,
  quoteRequest,
  onQuoteInserted,
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
  const ccInputRef = useRef<HTMLInputElement>(null);
  const bccInputRef = useRef<HTMLInputElement>(null);
  /** Racine du composer — périmètre du Escape-ferme-un-reply-vide (CUA échec 6). */
  const rootRef = useRef<HTMLDivElement>(null);
  // Course sauvegarde/fermeture (CUA round 4, échec 2) : après fermeture, plus
  // aucun démarrage de sauvegarde ni application de résultat en vol (setDraftId
  // réécrivait l'URL purgée). Une instance par montage du composer.
  const saveLifecycle = useRef(createDraftSaveLifecycle()).current;
  const [threadId] = useQueryState('threadId');
  const [isComposeOpen, setIsComposeOpen] = useQueryState('isComposeOpen');
  const params = useParams<{ folder: string }>();
  const { optimisticMoveThreadsTo } = useOptimisticActions();
  // Set by the send-and-archive handler; consumed once in proceedWithSend on success.
  const archiveAfterSendRef = useRef(false);
  const insertedQuoteIdRef = useRef<string | null>(null);
  const [draftId, setDraftId] = useQueryState('draftId');
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
  // Draft OWNER (owner-transition fix 2026-08-01): resolved by the PARENT via
  // ComposerOwnerGate and passed as a MANDATORY prop — this instance never
  // exists without its {userId, connectionId} and is remounted (React key)
  // when the owner changes, so every seam below sees ONE owner for its whole
  // lifetime.
  const {
    restored: restoredDraft,
    update: persistDraftSnapshot,
    clear: clearDraftSnapshot,
  } = useComposerDraftPersistence(draftOwner, {
    threadId,
    draftId,
    replyId: activeReplyId,
  });
  const processAndSetAttachments = async (
    filesToProcess: File[],
    quality: ImageQuality,
    showToast: boolean = false,
  ) => {
    const processedFiles = await processComposerAttachments(filesToProcess, quality, showToast);
    setValue('attachments', processedFiles, { shouldDirty: true });
    if (filesToProcess.length > 0) setHasUnsavedChanges(true);
  };

  // La seule assistance de rédaction exposée est volontairement bornée à la
  // correction/reformulation du texte déjà saisi (pas de résumé ni de chat).
  const trpc = useTRPC();
  const { mutateAsync: createDraft } = useMutation(trpc.drafts.create.mutationOptions());
  const { mutateAsync: deleteDraftById } = useMutation(trpc.drafts.delete.mutationOptions());

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

  // LIVE draft seam (slice 2bis): publish the CURRENT content — memory only,
  // no storage — so Ask Reta reads what was JUST typed, never a lagging
  // autosave. Registration is owner-aware: a stale unmount cannot remove a
  // newer instance of the same scope. Autosave/restore are untouched.
  const liveDraftRef = useRef<ReturnType<typeof registerLiveDraft> | null>(null);
  useEffect(() => {
    const scopeKey = ownedDraftStorageKey(draftOwner, {
      threadId,
      draftId,
      replyId: activeReplyId,
    });
    const handle = registerLiveDraft(scopeKey);
    liveDraftRef.current = handle;
    return () => {
      if (liveDraftRef.current === handle) liveDraftRef.current = null;
      handle.unregister();
    };
  }, [draftOwner.userId, draftOwner.connectionId, threadId, draftId, activeReplyId]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const publish = () => {
      liveDraftRef.current?.publish({
        to: getValues('to') ?? [],
        cc: getValues('cc') ?? [],
        bcc: getValues('bcc') ?? [],
        subject: getValues('subject') ?? '',
        bodyHtml: editor.getHTML(),
      });
    };
    publish(); // current state at (re)mount / scope change
    // Editor updates do not re-render the form: listen to the editor itself.
    editor.on('update', publish);
    return () => {
      editor.off('update', publish);
    };
    // Recipient/subject changes re-run this effect (watch values in deps).
  }, [editor, toEmails, ccEmails, bccEmails, subjectInput, threadId, draftId, activeReplyId]);

  // Ask Reta live-insert seam (spec docs/spec/mail-copilot.md): this composer
  // instance accepts a proposal under its EXACT persistence scope key. Without
  // `force` a non-empty body reports 'occupied' — the panel must ask the user
  // before replacing; nothing is ever overwritten silently.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const scopeKey = ownedDraftStorageKey(draftOwner, {
      threadId,
      draftId,
      replyId: activeReplyId,
    });
    return registerComposerInsertHandler(scopeKey, (payload, { force }) => {
      if (!force && editor.getText().trim().length > 0) return 'occupied';
      editor.commands.setContent(payload.message);
      if (payload.subject && !getValues('subject')) {
        setValue('subject', payload.subject, { shouldDirty: true });
      }
      // Recipient applied EXPLICITLY (never silently dropped): only fills an
      // empty To — an addressed draft keeps its recipients.
      if (payload.to && (getValues('to') ?? []).length === 0) {
        const recipients = payload.to
          .split(/[,;]/)
          .map((email) => email.trim())
          .filter(Boolean);
        if (recipients.length) setValue('to', recipients, { shouldDirty: true });
      }
      setHasUnsavedChanges(true);
      editor.commands.focus('end');
      return 'inserted';
    });
  }, [
    editor,
    draftOwner.userId,
    draftOwner.connectionId,
    threadId,
    draftId,
    activeReplyId,
    getValues,
    setValue,
  ]);

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

  useEffect(() => {
    if (!editor) return;
    const handleLinkShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        setToggleToolbar(true);
      }
    };
    editor.view.dom.addEventListener('keydown', handleLinkShortcut);
    return () => editor.view.dom.removeEventListener('keydown', handleLinkShortcut);
  }, [editor]);

  useEffect(() => {
    if (!editor || !quoteRequest || insertedQuoteIdRef.current === quoteRequest.id) return;

    const inserted = insertQuotedReply(editor, quoteRequest);
    if (!inserted) return;

    insertedQuoteIdRef.current = quoteRequest.id;
    onQuoteInserted?.(quoteRequest.id);
  }, [editor, quoteRequest, onQuoteInserted]);

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
          saveLifecycle.markClosed({ abandonedEmpty: true });
          clearDraftSnapshot();
          onAbandonEmpty?.();
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, draftId, onClose, onAbandonEmpty, clearDraftSnapshot, saveLifecycle]);

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

  const saveDraft = async () => {
    const values = getValues();

    if (!saveLifecycle.canStartSave()) return;
    if (!hasUnsavedChanges) return;
    const messageText = editor.getText();

    if (messageText.trim() === initialMessage.trim()) return;
    if (editor.getHTML() === initialMessage.trim()) return;
    if (!values.to.length || !values.subject.length || !messageText.length) return;

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

      // Résultat arrivé après la fermeture : ignoré — ne réécrit jamais l'URL
      // purgée (résurrection mesurée en CUA round 4). Si la fermeture était
      // l'abandon d'un composer vide, le brouillon créé en vol est supprimé
      // (compensation) : aucun orphelin ne ressème le prochain reply.
      if (!saveLifecycle.canApplySaveResult()) {
        if (saveLifecycle.wasAbandonedEmpty() && response?.id) {
          void deleteDraftById({ id: response.id }).catch(() => {});
        }
        return;
      }
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

  // r18 : jeter le brouillon (mod+shift+d / mod+shift+,) — suppression RÉELLE
  // et sans confirmation, parité Shortwave « Discard draft ». Ordre du cycle
  // de vie : marqué abandonné D'ABORD (une sauvegarde en vol se compense en
  // supprimant le brouillon qu'elle vient de créer — même contrat que
  // l'abandon d'un composer vide), snapshot local purgé, brouillon serveur
  // supprimé, composer fermé.
  const discardDraft = () => {
    saveLifecycle.markClosed({ abandonedEmpty: true });
    clearDraftSnapshot();
    if (draftId) void deleteDraftById({ id: draftId }).catch(() => {});
    setShowLeaveConfirmation(false);
    onAbandonEmpty?.();
    onClose?.();
  };

  // r18 : chords composer Shortwave (Cc/Bcc/pièce jointe/jeter) — liés ICI et
  // non au binder générique : ils doivent fonctionner pendant la frappe dans
  // l'éditeur et les champs (le binder désactive formulaires/contenteditable),
  // et mod+shift+, n'est pas exprimable dans react-hotkeys-hook v5. Portée
  // naturelle : le keydown bulle depuis l'élément focusé — un composer non
  // focusé ne reçoit rien.
  const handleComposerChordKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const action = resolveComposerChord(event.nativeEvent, isMac);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'toggleCc') {
      setShowCc(true);
      requestAnimationFrame(() => ccInputRef.current?.focus());
    } else if (action === 'toggleBcc') {
      setShowBcc(true);
      requestAnimationFrame(() => bccInputRef.current?.focus());
    } else if (action === 'attachFile') fileInputRef.current?.click();
    else discardDraft();
  };

  const handleClose = () => {
    const hasContent = editor?.getText()?.trim().length > 0;
    if (hasContent) {
      setShowLeaveConfirmation(true);
    } else {
      // Parité avec la branche Escape-close : un composer vide abandonné purge
      // aussi son snapshot local (`to` prérempli suffisait à le faire écrire).
      saveLifecycle.markClosed({ abandonedEmpty: true });
      clearDraftSnapshot();
      onAbandonEmpty?.();
      onClose?.();
    }
  };

  const confirmLeave = () => {
    setShowLeaveConfirmation(false);
    // Le brouillon serveur déjà créé est conservé (l'utilisateur part avec du
    // contenu), mais aucune sauvegarde tardive ne doit réécrire l'URL purgée.
    saveLifecycle.markClosed();
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

  return (
    <div
      ref={rootRef}
      onKeyDownCapture={handleComposerChordKeyDown}
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
          ccInputRef={ccInputRef}
          bccInputRef={bccInputRef}
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
            className={cn(`min-h-[200px] w-full`, editorClassName)}
          >
            <EditorContent editor={editor} className="h-full w-full max-w-full overflow-x-auto" />
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="inline-flex w-full shrink-0 items-end justify-between self-stretch rounded-b-2xl bg-[#FFFFFF] px-3 py-3 outline-white/5 dark:bg-[#202020]">
        <div className="flex flex-col items-start justify-start gap-2">
          <div className={toggleToolbar ? 'block max-w-full' : 'hidden'}>
            <Toolbar editor={editor} />
          </div>
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
            <WritingAssistantButton editor={editor} />
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
                    aria-label="Formatting options"
                    aria-expanded={toggleToolbar}
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
