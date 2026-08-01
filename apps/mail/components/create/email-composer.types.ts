import type { ThreadQuoteRequest } from '@/lib/thread-quote';
import type { ParsedMessage } from '@/types';
import { z } from 'zod';

// Types, validation schema and the pure thread-content builder for EmailComposer,
// extracted verbatim from email-composer.tsx (behaviour unchanged).

export type ThreadContent = {
  from: string;
  to: string[];
  body: string;
  cc?: string[];
  subject: string;
}[];

export interface EmailComposerProps {
  initialTo?: string[];
  initialCc?: string[];
  initialBcc?: string[];
  initialSubject?: string;
  initialMessage?: string;
  initialAttachments?: File[];
  replyingTo?: string;
  onSendEmail: (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
    fromEmail?: string;
    scheduleAt?: string;
  }) => Promise<void>;
  onClose?: () => void;
  /**
   * Fermeture d'un composer VIDE (Escape / croix) : le brouillon serveur
   * correspondant est un abandon — l'hôte peut le supprimer (CUA round 4,
   * résurrection du « a » via latestDraft). Appelé AVANT onClose.
   */
  onAbandonEmpty?: () => void;
  className?: string;
  autofocus?: boolean;
  settingsLoading?: boolean;
  editorClassName?: string;
  quoteRequest?: ThreadQuoteRequest | null;
  onQuoteInserted?: (id: string) => void;
}

export type ComposerFormValues = z.infer<typeof schema>;

export const schema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  message: z.string().min(1),
  attachments: z.array(z.any()).optional(),
  headers: z.any().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  threadId: z.string().optional(),
  fromEmail: z.string().optional(),
});

export function buildThreadContent(
  emailData: { messages: ParsedMessage[] } | null | undefined,
): ThreadContent {
  if (!emailData) return [];
  return emailData.messages.map((message) => {
    return {
      body: message.decodedBody ?? '',
      from: message.sender.name ?? message.sender.email,
      to: message.to.reduce<string[]>((to, recipient) => {
        if (recipient.name) {
          to.push(recipient.name);
        }
        return to;
      }, []),
      cc: message.cc?.reduce<string[]>((cc, recipient) => {
        if (recipient.name) {
          cc.push(recipient.name);
        }
        return cc;
      }, []),
      subject: message.subject,
    };
  });
}
