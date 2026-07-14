import { useUndoSend, type EmailData, deserializeFiles } from '@/hooks/use-undo-send';
import { useActiveConnection } from '@/hooks/use-connections';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { cleanEmailAddresses } from '@/lib/email-utils';
import { loadGitHubEmojis } from '@/lib/emoji-data';
import { Dialog } from '@/components/ui/dialog';
import { m } from '@/paraglide/messages';
import { log } from '@/lib/log';

import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { serializeFiles } from '@/lib/schemas';
import { useDraft } from '@/hooks/use-drafts';

import { RefreshCcw } from 'lucide-react';
import type { Attachment } from '@/types';
import { useQueryState } from 'nuqs';
import posthog from 'posthog-js';
import { toast } from 'sonner';
import './prosemirror.css';

// Loaded lazily: the editor (tiptap/prosemirror) only downloads when the compose
// dialog/page actually renders it, keeping it out of the initial mail chunk. The emoji
// dataset (static JSON asset) is awaited too so the Emoji extension always initializes
// with the full list (its emoticon input rules are built at editor creation).
const EmailComposer = lazy(() =>
  Promise.all([import('./email-composer'), loadGitHubEmojis()]).then(([mod]) => ({
    default: mod.EmailComposer,
  })),
);

// Define the draft type to include CC and BCC fields
type DraftType = {
  id: string;
  content?: string;
  subject?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  attachments?: File[];
};

export function CreateEmail({
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  initialCc = '',
  initialBcc = '',
  draftId: propDraftId,
}: {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialCc?: string;
  initialBcc?: string;
  draftId?: string | null;
}) {
  const { data: session } = useSession();

  const { data: aliases } = useEmailAliases();
  const [draftId, setDraftId] = useQueryState('draftId');
  const {
    data: draft,
    isLoading: isDraftLoading,
    error: draftError,
    refetch: refetchDraft,
  } = useDraft(draftId ?? propDraftId ?? null);

  const trpc = useTRPC();
  const { mutateAsync: sendEmail } = useMutation(trpc.mail.send.mutationOptions());
  const [isComposeOpen, setIsComposeOpen] = useQueryState('isComposeOpen');
  const [, setThreadId] = useQueryState('threadId');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const { data: activeConnection } = useActiveConnection();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { handleUndoSend } = useUndoSend();
  // If there was an error loading the draft, set the failed state
  useEffect(() => {
    if (draftError) {
      log.error('Error loading draft:', draftError);
      toast.error(m['pages.createEmail.failedToLoadDraft']());
    }
  }, [draftError]);

  const { data: activeAccount } = useActiveConnection();

  const userEmail = activeAccount?.email || activeConnection?.email || session?.user?.email || '';
  const userName = activeAccount?.name || activeConnection?.name || session?.user?.name || '';

  const handleSendEmail = async (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
    fromEmail?: string;
    scheduleAt?: string;
  }) => {
    const fromEmail = data.fromEmail || aliases?.[0]?.email || userEmail;

    const zeroSignature = settings?.settings.zeroSignature
      ? '<p style="color: #666; font-size: 12px;">Sent via <a href="https://0.email/" style="color: #0066cc; text-decoration: none;">Zero</a></p>'
      : '';

    const result = await sendEmail({
      to: data.to.map((email) => ({ email, name: email.split('@')[0] || email })),
      cc: data.cc?.map((email) => ({ email, name: email.split('@')[0] || email })),
      bcc: data.bcc?.map((email) => ({ email, name: email.split('@')[0] || email })),
      subject: data.subject,
      message: data.message + zeroSignature,
      attachments: await serializeFiles(data.attachments),
      fromEmail: userName.trim() ? `${userName.replace(/[<>]/g, '')} <${fromEmail}>` : fromEmail,
      draftId: draftId ?? undefined,
      scheduleAt: data.scheduleAt,
    });

    setDraftId(null);
    clearUndoData();

    // Track different email sending scenarios
    if (data.cc && data.cc.length > 0 && data.bcc && data.bcc.length > 0) {
      posthog.capture('Create Email Sent with CC and BCC');
    } else if (data.cc && data.cc.length > 0) {
      posthog.capture('Create Email Sent with CC');
    } else if (data.bcc && data.bcc.length > 0) {
      posthog.capture('Create Email Sent with BCC');
    } else {
      posthog.capture('Create Email Sent');
    }

    handleUndoSend(result, settings, {
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      message: data.message,
      attachments: data.attachments,
      fromEmail: data.fromEmail,
      scheduleAt: data.scheduleAt,
    });
  };

  useEffect(() => {
    if (propDraftId && !draftId) {
      setDraftId(propDraftId);
    }
  }, [propDraftId, draftId, setDraftId]);

  // Process initial email addresses
  const processInitialEmails = (emailStr: string) => {
    if (!emailStr) return [];
    const cleanedAddresses = cleanEmailAddresses(emailStr);
    return cleanedAddresses || [];
  };

  const clearUndoData = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('undoEmailData');
    }
  };

  const undoEmailData = useMemo((): EmailData | null => {
    if (isComposeOpen !== 'true') return null;
    if (typeof window === 'undefined') return null;

    const storedData = localStorage.getItem('undoEmailData');
    if (!storedData) return null;

    try {
      const parsedData = JSON.parse(storedData);

      if (parsedData.attachments && Array.isArray(parsedData.attachments)) {
        parsedData.attachments = deserializeFiles(parsedData.attachments);
      }

      return parsedData;
    } catch (error) {
      log.error('Failed to parse undo email data:', error);
      return null;
    }
  }, [isComposeOpen]);

  // Cast draft to our extended type that includes CC and BCC
  const typedDraft = draft as unknown as DraftType;

  const handleDialogClose = (open: boolean) => {
    setIsComposeOpen(open ? 'true' : null);
    if (!open) {
      setDraftId(null);
      clearUndoData();
    }
  };

  const base64ToFile = (base64: string, filename: string, mimeType: string): File | null => {
    try {
      const byteString = atob(base64);
      const byteArray = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      return new File([byteArray], filename, { type: mimeType });
    } catch (error) {
      log.error('Failed to convert base64 to file', error);
      return null;
    }
  };

  // convert the attachments into File[]
  const files: File[] = ((typedDraft?.attachments as Attachment[] | undefined) || [])
    .map((att: Attachment) => base64ToFile(att.body, att.filename, att.mimeType))
    .filter((file): file is File => file !== null);

  return (
    <>
      <Dialog open={!!isComposeOpen} onOpenChange={handleDialogClose}>
        <div className="flex min-h-[100dvh] w-full min-w-0 flex-col items-center justify-end px-0 pt-[env(safe-area-inset-top)] sm:justify-center sm:px-4 sm:py-4">
          {draftError ? (
            <div
              role="alert"
              className="bg-background flex min-h-[20rem] w-full max-w-[750px] flex-1 flex-col items-center justify-center gap-3 rounded-t-2xl border p-6 text-center sm:h-[600px] sm:flex-none sm:rounded-2xl"
            >
              <p className="font-medium">{m['pages.createEmail.failedToLoadDraft']()}</p>
              <Button type="button" variant="outline" onClick={() => void refetchDraft()}>
                <RefreshCcw className="h-4 w-4" />
                {m['states.retry']()}
              </Button>
            </div>
          ) : isDraftLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="bg-background flex min-h-[20rem] w-full max-w-[750px] flex-1 items-center justify-center rounded-t-2xl border sm:h-[600px] sm:flex-none sm:rounded-2xl"
            >
              <div className="text-center">
                <div className="border-muted border-t-primary mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 motion-reduce:animate-none" />
                <p>{m['states.composer.loading']()}</p>
              </div>
            </div>
          ) : (
            <Suspense
              fallback={
                <div
                  role="status"
                  aria-live="polite"
                  className="bg-background flex min-h-[20rem] w-full max-w-[750px] flex-1 items-center justify-center rounded-t-2xl border sm:h-[600px] sm:flex-none sm:rounded-2xl"
                >
                  <div className="border-muted border-t-primary mx-auto h-6 w-6 animate-spin rounded-full border-2 motion-reduce:animate-none" />
                  <span className="sr-only">{m['states.composer.loading']()}</span>
                </div>
              }
            >
              <EmailComposer
                key={typedDraft?.id || undoEmailData?.to?.join(',') || 'composer'}
                className="h-[calc(100dvh_-_env(safe-area-inset-top))] max-h-none rounded-none border-x-0 border-b-0 shadow-none sm:h-auto sm:max-h-[min(46rem,calc(100dvh_-_2rem))] sm:rounded-2xl sm:border sm:shadow-sm"
                onSendEmail={handleSendEmail}
                initialMessage={undoEmailData?.message || typedDraft?.content || initialBody}
                initialTo={
                  undoEmailData?.to ||
                  typedDraft?.to?.map((e: string) => e.replace(/[<>]/g, '')) ||
                  processInitialEmails(initialTo)
                }
                initialCc={
                  undoEmailData?.cc ||
                  typedDraft?.cc?.map((e: string) => e.replace(/[<>]/g, '')) ||
                  processInitialEmails(initialCc)
                }
                initialBcc={
                  undoEmailData?.bcc ||
                  typedDraft?.bcc?.map((e: string) => e.replace(/[<>]/g, '')) ||
                  processInitialEmails(initialBcc)
                }
                onClose={() => {
                  setThreadId(null);
                  setActiveReplyId(null);
                  setIsComposeOpen(null);
                  setDraftId(null);
                  clearUndoData();
                }}
                initialAttachments={undoEmailData?.attachments || files}
                initialSubject={undoEmailData?.subject || typedDraft?.subject || initialSubject}
                autofocus={false}
                settingsLoading={settingsLoading}
              />
            </Suspense>
          )}
        </div>
      </Dialog>
    </>
  );
}
