import { log } from '@/lib/log';
import { useUndoSend } from '@/hooks/use-undo-send';
import { constructReplyBody, constructForwardBody } from '@/lib/utils';
import { useActiveConnection } from '@/hooks/use-connections';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { loadGitHubEmojis } from '@/lib/emoji-data';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useSettings } from '@/hooks/use-settings';
import { useThread } from '@/hooks/use-threads';
import { useSession } from '@/lib/auth-client';
import { serializeFiles } from '@/lib/schemas';
import { deriveReplyRecipients, deriveReplySubject } from './reply-recipients';
import { useDraft } from '@/hooks/use-drafts';
import { m } from '@/paraglide/messages';
import type { Sender } from '@/types';
import { useQueryState } from 'nuqs';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import posthog from 'posthog-js';
import { toast } from 'sonner';

// Loaded lazily: the editor (tiptap/prosemirror) only downloads when the user actually
// opens a reply/forward composer, keeping it out of the initial mail chunk. The emoji
// dataset (static JSON asset) is awaited too so the Emoji extension always initializes
// with the full list (its emoticon input rules are built at editor creation).
const EmailComposer = lazy(() =>
  Promise.all([import('../create/email-composer'), loadGitHubEmojis()]).then(([mod]) => ({
    default: mod.EmailComposer,
  })),
);

interface ReplyComposeProps {
  messageId?: string;
}

export default function ReplyCompose({ messageId }: ReplyComposeProps) {
  const [mode, setMode] = useQueryState('mode');
  const { enableScope, disableScope } = useHotkeysContext();
  const { data: aliases } = useEmailAliases();

  const [draftId, setDraftId] = useQueryState('draftId');
  const [threadId] = useQueryState('threadId');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const { data: emailData, refetch, latestDraft } = useThread(threadId);
  const { data: draft } = useDraft(draftId ?? null);
  const trpc = useTRPC();
  const { mutateAsync: sendEmail } = useMutation(trpc.mail.send.mutationOptions());
  const { data: activeConnection } = useActiveConnection();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: session } = useSession();
  const { handleUndoSend } = useUndoSend();

  // Find the specific message to reply to
  const replyToMessage =
    (messageId && emailData?.messages.find((msg) => msg.id === messageId)) || emailData?.latest;

  // Issue #32 (keyboard-parity): the reply / reply-all recipient + subject
  // defaults are derived from the pure, tested seam (./reply-recipients) and
  // wired into initialTo/initialCc/initialSubject below. This is the fix for the
  // empty «To» field: reply and reply-all now open pre-populated. A concrete
  // draft (a resumed compose) still wins so we never clobber a saved draft.
  const replyDefaults = useMemo(() => {
    if (!replyToMessage || !mode || !activeConnection?.email) {
      return { to: [] as string[], cc: [] as string[], subject: '' };
    }
    const { to, cc } = deriveReplyRecipients({
      mode,
      message: replyToMessage,
      userEmail: activeConnection.email,
      ownedEmails: aliases?.map((alias) => alias.email) ?? [],
    });
    const subject = deriveReplySubject({ mode, subject: replyToMessage.subject });
    return { to, cc, subject };
  }, [activeConnection?.email, aliases, mode, replyToMessage]);

  const handleSendEmail = async (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
    scheduleAt?: string;
  }) => {
    if (!replyToMessage || !activeConnection?.email) return;

    // Optimistic send (W2-H): show an immediate "Sending…" state and close the
    // composer as soon as the send resolves — no blocking refetch in the close path.
    const sendingToast = toast.loading(m['states.sending']());

    try {
      const userEmail = activeConnection.email.toLowerCase();
      const userName = activeConnection.name || session?.user?.name || '';

      let fromEmail = userEmail;

      if (aliases && aliases.length > 0 && replyToMessage) {
        const allRecipients = [
          ...(replyToMessage.to || []),
          ...(replyToMessage.cc || []),
          ...(replyToMessage.bcc || []),
        ];
        const matchingAlias = aliases.find((alias) =>
          allRecipients.some(
            (recipient) => recipient.email.toLowerCase() === alias.email.toLowerCase(),
          ),
        );

        if (matchingAlias) {
          fromEmail = userName.trim()
            ? `${userName.replace(/[<>]/g, '')} <${matchingAlias.email}>`
            : matchingAlias.email;
        } else {
          const primaryEmail =
            aliases.find((alias) => alias.primary)?.email || aliases[0]?.email || userEmail;
          fromEmail = userName.trim()
            ? `${userName.replace(/[<>]/g, '')} <${primaryEmail}>`
            : primaryEmail;
        }
      }

      const toRecipients: Sender[] = data.to.map((email) => ({
        email,
        name: email.split('@')[0] || 'User',
      }));

      const ccRecipients: Sender[] | undefined = data.cc
        ? data.cc.map((email) => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const bccRecipients: Sender[] | undefined = data.bcc
        ? data.bcc.map((email) => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const zeroSignature = settings?.settings.zeroSignature
        ? '<p style="color: #666; font-size: 12px;">Sent via <a href="https://0.email/" style="color: #0066cc; text-decoration: none;">Zero</a></p>'
        : '';

      const emailBody =
        mode === 'forward'
          ? constructForwardBody(
              data.message + zeroSignature,
              new Date(replyToMessage.receivedOn || '').toLocaleString(),
              { ...replyToMessage.sender, subject: replyToMessage.subject },
              toRecipients,
              //   replyToMessage.decodedBody,
            )
          : constructReplyBody(
              data.message + zeroSignature,
              new Date(replyToMessage.receivedOn || '').toLocaleString(),
              replyToMessage.sender,
              toRecipients,
              //   replyToMessage.decodedBody,
            );

      const result = await sendEmail({
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: data.subject,
        message: emailBody,
        attachments: await serializeFiles(data.attachments),
        fromEmail: fromEmail,
        draftId: draftId ?? undefined,
        headers: {
          'In-Reply-To': replyToMessage?.messageId ?? '',
          References: [
            ...(replyToMessage?.references ? replyToMessage.references.split(' ') : []),
            replyToMessage?.messageId,
          ]
            .filter(Boolean)
            .join(' '),
          'Thread-Id': replyToMessage?.threadId ?? '',
        },
        threadId: replyToMessage?.threadId,
        isForward: mode === 'forward',
        originalMessage: replyToMessage.decodedBody,
        scheduleAt: data.scheduleAt,
      });

      posthog.capture('Reply Email Sent');
      toast.dismiss(sendingToast);

      // Close the composer immediately; reconcile the thread in the BACKGROUND.
      // The blocking `await refetch()` was the measured cold-path stall (W2-H) —
      // it is now fire-and-forget so the send feels instant.
      setMode(null);
      setActiveReplyId(null);
      void refetch();

      handleUndoSend(result, settings, {
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        message: data.message,
        attachments: data.attachments,
        scheduleAt: data.scheduleAt,
      });
    } catch (error) {
      toast.dismiss(sendingToast);
      log.error('Error sending email:', error);
      toast.error(m['pages.createEmail.failedToSendEmail']());
    }
  };

  useEffect(() => {
    if (mode) {
      enableScope('compose');
    } else {
      disableScope('compose');
    }
    return () => {
      disableScope('compose');
    };
  }, [mode, enableScope, disableScope]);

  const ensureEmailArray = (emails: string | string[] | undefined | null): string[] => {
    if (!emails) return [];
    if (Array.isArray(emails)) {
      return emails.map((email) => email.trim().replace(/[<>]/g, ''));
    }
    if (typeof emails === 'string') {
      return emails
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0)
        .map((email) => email.replace(/[<>]/g, ''));
    }
    return [];
  };

  if (!mode || !emailData) return null;

  return (
    <div className="w-full rounded-2xl overflow-visible border">
      <Suspense
        fallback={
          <div className="flex h-[120px] w-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        }
      >
      <EmailComposer
        editorClassName="min-h-[50px]"
        className="w-full max-w-none! pb-1 overflow-visible"
        onSendEmail={handleSendEmail}
        onClose={async () => {
          setMode(null);
          setDraftId(null);
          setActiveReplyId(null);
        }}
        initialMessage={draft?.content ?? latestDraft?.decodedBody}
        initialTo={draft ? ensureEmailArray(draft.to) : replyDefaults.to}
        initialCc={draft ? ensureEmailArray(draft.cc) : replyDefaults.cc}
        initialBcc={ensureEmailArray(draft?.bcc)}
        initialSubject={draft?.subject ?? replyDefaults.subject}
        autofocus={true}
        settingsLoading={settingsLoading}
        replyingTo={replyToMessage?.sender.email}
      />
      </Suspense>
    </div>
  );
}
