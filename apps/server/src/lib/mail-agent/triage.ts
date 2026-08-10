import type { IGetThreadResponse } from '../driver/types';

export const RETA_TRIAGE_MAILBOX = 'thomas@devlab.io';
export const DEFAULT_TRIAGE_LOOKBACK_DAYS = 30;
export const DEFAULT_TRIAGE_MAX_RESULTS = 30;

const NO_REPLY_LOCAL_PART =
  /^(?:no[.-]?reply|do[.-]?not[.-]?reply|notifications?|alerts?|mailer-daemon)$/i;
const AUTOMATIC_REPLY_SUBJECT =
  /^(?:automatic reply|auto(?:matic)?[ -]?reply|out of office|réponse automatique|absence du bureau)\s*:/i;

const normalizeEmail = (value: string | undefined) => value?.trim().toLowerCase() ?? '';

const replySubject = (subject: string) =>
  /^re\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim() || '(sans objet)'}`;

export type TriageCandidate = {
  threadId: string;
  latestMessageId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  sourceAttachments: Array<{ filename: string; mimeType: string; size: number }>;
  classification: 'reply_needed' | 'no_reply_needed';
  classificationReason: string;
};

export function classifyTriageThread(input: {
  threadId: string;
  thread: IGetThreadResponse;
  mailboxEmail: string;
}): TriageCandidate | null {
  const mailboxEmail = normalizeEmail(input.mailboxEmail);
  const latest =
    input.thread.latest ?? input.thread.messages.findLast((message) => !message.isDraft);
  if (!latest || latest.isDraft) return null;

  const labels = new Set(input.thread.labels.map((label) => label.id.toUpperCase()));
  if (labels.has('SPAM') || labels.has('TRASH') || labels.has('DRAFT')) return null;
  if (normalizeEmail(latest.sender.email) === mailboxEmail) return null;

  const senderEmail = normalizeEmail(latest.replyTo || latest.sender.email);
  if (!senderEmail) return null;
  const senderLocalPart = senderEmail.split('@')[0] ?? '';
  const isAutomaticReply = AUTOMATIC_REPLY_SUBJECT.test(latest.subject.trim());
  const isAutomated =
    Boolean(latest.listUnsubscribe) ||
    NO_REPLY_LOCAL_PART.test(senderLocalPart) ||
    isAutomaticReply;
  const cc = [...latest.to, ...(latest.cc ?? [])]
    .map((recipient) => normalizeEmail(recipient.email))
    .filter((email) => email && email !== mailboxEmail && email !== senderEmail);
  const attachments = input.thread.messages.flatMap((message) =>
    (message.attachments ?? [])
      .filter((attachment) => attachment.filename)
      .map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
  );

  return {
    threadId: input.threadId,
    latestMessageId: latest.id,
    to: [senderEmail],
    cc: [...new Set(cc)],
    bcc: [],
    subject: replySubject(latest.subject),
    sourceAttachments: attachments,
    classification: isAutomated ? 'no_reply_needed' : 'reply_needed',
    classificationReason: isAutomated
      ? latest.listUnsubscribe
        ? 'Message de liste ou newsletter détecté'
        : isAutomaticReply
          ? 'Réponse automatique détectée'
          : 'Adresse expéditrice automatique détectée'
      : 'Dernier message entrant sans réponse ultérieure',
  };
}

export const triageSearchQuery = (lookbackDays: number) =>
  `newer_than:${lookbackDays}d -in:spam -in:trash -in:drafts`;
