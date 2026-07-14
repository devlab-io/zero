import type { ParsedMessage, Sender } from '@/types';

// reply-recipients — pure, testable derivation of reply / reply-all recipients
// and the reply/forward subject.
//
// `deriveReplyRecipients` was extracted verbatim (behaviour-identical) from the
// recipient block that used to live inline in `reply-composer.tsx`. It is the
// seam issue #32 (keyboard-parity) plugs into: #32 now wires the returned
// `to`/`cc` into the composer's `initialTo` / `initialCc` to fix the empty «To»
// field, and `deriveReplySubject` into `initialSubject`. Kept pure here so both
// are unit testable.
//
// `deriveReplyRecipients` stays faithful to the validated base: comparisons are
// lower-cased and the ORIGINAL-case address is pushed; the only de-duplication is
// the original `to.includes` check. `deriveReplySubject` is the #32 extension —
// it mirrors the niveau8 wave's Re:/Fwd: prefixing (idempotent for an already
// prefixed subject), and is the single source the composer reads for the subject.

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

export interface DeriveReplySubjectArgs {
  /** The composer mode: 'reply' | 'replyAll' | 'forward' (any other value → subject unchanged). */
  mode: string;
  /** The subject of the message being replied to / forwarded. */
  subject?: string | null;
}

/**
 * Derive the composer subject for reply / reply-all / forward.
 *
 * `reply`/`replyAll` prefix `Re:`, `forward` prefixes `Fwd:`. The prefix is
 * idempotent: a subject that already starts with `Re:` or `Fwd:` (any case) is
 * returned unchanged, so threading a long conversation never stacks prefixes.
 * An unknown mode returns the trimmed original untouched.
 */
export function deriveReplySubject({ mode, subject }: DeriveReplySubjectArgs): string {
  const original = (subject ?? '').trim();

  if (mode !== 'reply' && mode !== 'replyAll' && mode !== 'forward') return original;
  if (/^(re|fwd):/i.test(original)) return original;

  const prefix = mode === 'forward' ? 'Fwd:' : 'Re:';
  return `${prefix} ${original}`.trim();
}
