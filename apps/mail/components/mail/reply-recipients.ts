import type { ParsedMessage, Sender } from '@/types';

// reply-recipients — pure, testable derivation of reply / reply-all recipients.
//
// Extracted verbatim (behaviour-identical) from the recipient block that used to
// live inline in `reply-composer.tsx`. It is the seam issue #32 (keyboard-parity)
// plugs into: #32 wires the returned `to`/`cc` into the composer's `initialTo` /
// `initialCc` to fix the empty «To» field. Kept pure here so that fix is unit
// testable; this module deliberately does NOT wire anything and does NOT fix the
// bug — reply-composer still initialises the composer from the draft only.
//
// Faithful to the validated base: no subject derivation (the base has none) and
// no extra case-insensitive de-duplication beyond the original `to.includes`
// check. Comparisons are lower-cased; the ORIGINAL-case address is pushed.

export type ReplyMode = 'reply' | 'replyAll' | 'forward';

export interface DeriveReplyRecipientsArgs {
  /** The composer mode: 'reply' | 'replyAll' | 'forward' (any other value → empty). */
  mode: string;
  /** The message being replied to / forwarded. */
  message: Pick<ParsedMessage, 'sender' | 'to' | 'cc'>;
  /** The active connection's email address. */
  userEmail: string;
}

export interface ReplyRecipients {
  to: string[];
  cc: string[];
}

export function deriveReplyRecipients({
  mode,
  message,
  userEmail,
}: DeriveReplyRecipientsArgs): ReplyRecipients {
  const to: string[] = [];
  const cc: string[] = [];

  if (!mode || !userEmail) return { to, cc };

  const user = userEmail.toLowerCase();
  const senderEmail = message.sender.email.toLowerCase();

  if (mode === 'reply') {
    // Reply to sender. If replying to our own email, reply to the first recipient.
    if (senderEmail !== user) {
      to.push(message.sender.email);
    } else if (message.to && message.to.length > 0 && message.to[0]?.email) {
      to.push(message.to[0].email);
    }
  } else if (mode === 'replyAll') {
    // Add original sender if not current user.
    if (senderEmail !== user) {
      to.push(message.sender.email);
    }

    // Add original recipients from the To field.
    message.to?.forEach((recipient: Sender) => {
      const recipientEmail = recipient.email.toLowerCase();
      if (recipientEmail !== user && recipientEmail !== senderEmail) {
        to.push(recipient.email);
      }
    });

    // Add CC recipients not already in To.
    message.cc?.forEach((recipient: Sender) => {
      const recipientEmail = recipient.email.toLowerCase();
      if (recipientEmail !== user && !to.includes(recipient.email)) {
        cc.push(recipient.email);
      }
    });
  }

  // forward / other: start with empty recipients.
  return { to, cc };
}
