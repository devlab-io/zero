import { parseAddressList, parseFrom, wasSentWithTLS } from '../email-utils';
import type { IOutgoingMessage, ParsedMessage } from '../../types';
import { sanitizeTipTapHtml } from '../sanitize-tip-tap-html';
import { type gmail_v1 } from '@googleapis/gmail';
import { getSimpleLoginSender } from './utils';
import type { ManagerConfig } from './types';
import * as he from 'he';

export function parseMessage({
  id,
  threadId,
  snippet,
  labelIds,
  payload,
}: gmail_v1.Schema$Message): Omit<
  ParsedMessage,
  'body' | 'processedHtml' | 'blobUrl' | 'totalReplies'
> {
  const receivedOn =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'date')?.value || 'Failed';

  // If there's a SimpleLogin Header, use it as the sender
  const simpleLoginSender = getSimpleLoginSender(payload);

  const sender =
    simpleLoginSender ||
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'from')?.value ||
    'Failed';
  const subject = payload?.headers?.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
  const references =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'references')?.value || '';
  const inReplyTo =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'in-reply-to')?.value || '';
  const messageId =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'message-id')?.value || '';
  const listUnsubscribe =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'list-unsubscribe')?.value || undefined;
  const listUnsubscribePost =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'list-unsubscribe-post')?.value ||
    undefined;
  const replyTo =
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'reply-to')?.value || undefined;
  const toHeaders =
    payload?.headers
      ?.filter((h) => h.name?.toLowerCase() === 'to')
      .map((h) => h.value)
      .filter((v) => typeof v === 'string') || [];
  const to = toHeaders.flatMap((to) => parseAddressList(to));

  const ccHeaders =
    payload?.headers
      ?.filter((h) => h.name?.toLowerCase() === 'cc')
      .map((h) => h.value)
      .filter((v) => typeof v === 'string') || [];

  const cc =
    ccHeaders.length > 0
      ? ccHeaders
          .filter((header) => header.trim().length > 0)
          .flatMap((header) => parseAddressList(header))
      : null;

  const receivedHeaders =
    payload?.headers
      ?.filter((header) => header.name?.toLowerCase() === 'received')
      .map((header) => header.value || '') || [];
  const hasTLSReport = payload?.headers?.some(
    (header) => header.name?.toLowerCase() === 'tls-report',
  );

  return {
    id: id || 'ERROR',
    bcc: [],
    threadId: threadId || '',
    title: snippet ? he.decode(snippet).trim() : 'ERROR',
    tls: wasSentWithTLS(receivedHeaders) || !!hasTLSReport,
    tags: labelIds?.map((l) => ({ id: l, name: l, type: 'user' })) || [],
    listUnsubscribe,
    listUnsubscribePost,
    replyTo,
    references,
    inReplyTo,
    sender: parseFrom(sender),
    unread: labelIds ? labelIds.includes('UNREAD') : false,
    to,
    cc,
    receivedOn,
    subject: subject ? subject.replace(/"/g, '').trim() : '(no subject)',
    messageId,
    isDraft: labelIds ? labelIds.includes('DRAFT') : false,
  };
}

export async function parseOutgoing(
  {
    to,
    subject,
    message,
    attachments,
    headers,
    cc,
    bcc,
    fromEmail,
    originalMessage = null,
  }: IOutgoingMessage,
  config: ManagerConfig,
) {
  const { createMimeMessage } = await import('mimetext');
  const msg = createMimeMessage();

  const defaultFromEmail = config.auth?.email || 'nobody@example.com';
  const senderEmail = fromEmail || defaultFromEmail;

  msg.setSender(`${fromEmail}`);

  const uniqueRecipients = new Set<string>();

  if (!Array.isArray(to)) {
    throw new Error('Recipient address required');
  }

  if (to.length === 0) {
    throw new Error('Recipient address required');
  }

  const toRecipients = to
    .filter((recipient) => {
      if (!recipient || !recipient.email) {
        return false;
      }

      const email = recipient.email.toLowerCase();

      if (!uniqueRecipients.has(email)) {
        uniqueRecipients.add(email);
        return true;
      }
      return false;
    })
    .map((recipient) => {
      const emailMatch = recipient.email.match(/<([^>]+)>/);
      const email = emailMatch ? emailMatch[1] : recipient.email;
      if (!email) {
        throw new Error('Invalid email address');
      }
      return {
        name: recipient.name || '',
        addr: email,
      };
    });

  if (toRecipients.length > 0) {
    msg.setRecipients(toRecipients);
  } else {
    throw new Error('No valid recipients found in To field');
  }

  if (Array.isArray(cc) && cc.length > 0) {
    const ccRecipients = cc
      .filter((recipient) => {
        const email = recipient.email.toLowerCase();
        if (!uniqueRecipients.has(email) && email !== senderEmail) {
          uniqueRecipients.add(email);
          return true;
        }
        return false;
      })
      .map((recipient) => ({
        name: recipient.name || '',
        addr: recipient.email,
      }));

    if (ccRecipients.length > 0) {
      msg.setCc(ccRecipients);
    }
  }

  if (Array.isArray(bcc) && bcc.length > 0) {
    const bccRecipients = bcc
      .filter((recipient) => {
        const email = recipient.email.toLowerCase();
        if (!uniqueRecipients.has(email) && email !== senderEmail) {
          uniqueRecipients.add(email);
          return true;
        }
        return false;
      })
      .map((recipient) => ({
        name: recipient.name || '',
        addr: recipient.email,
      }));

    if (bccRecipients.length > 0) {
      msg.setBcc(bccRecipients);
    }
  }

  msg.setSubject(subject);

  const { html: processedMessage, inlineImages } = await sanitizeTipTapHtml(message.trim());

  if (originalMessage) {
    msg.addMessage({
      contentType: 'text/html',
      data: `${processedMessage}${originalMessage}`,
    });
  } else {
    msg.addMessage({
      contentType: 'text/html',
      data: processedMessage,
    });
  }

  if (inlineImages.length > 0) {
    for (const image of inlineImages) {
      msg.addAttachment({
        inline: true,
        filename: `${image.cid}`,
        contentType: image.mimeType,
        data: image.data,
        headers: {
          'Content-ID': `<${image.cid}>`,
          'Content-Disposition': 'inline',
        },
      });
    }
  }

  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      if (value) {
        if (key.toLowerCase() === 'references' && value) {
          const refs = value
            .split(' ')
            .filter(Boolean)
            .map((ref) => {
              if (!ref.startsWith('<')) ref = `<${ref}`;
              if (!ref.endsWith('>')) ref = `${ref}>`;
              return ref;
            });
          msg.setHeader(key, refs.join(' '));
        } else {
          msg.setHeader(key, value);
        }
      }
    });
  }

  if (attachments?.length > 0) {
    for (const file of attachments) {
      let base64Content: string | undefined;

      const f = file as { base64?: unknown; arrayBuffer?: () => Promise<ArrayBuffer> };
      if (typeof f.base64 === 'string') base64Content = f.base64;
      else if (typeof f.arrayBuffer === 'function') {
        const buffer = Buffer.from(await f.arrayBuffer());
        base64Content = buffer.toString('base64');
      }

      if (!base64Content) continue;

      msg.addAttachment({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        data: base64Content,
      });
    }
  }

  const emailContent = msg.asRaw();
  const encodedMessage = Buffer.from(emailContent).toString('base64');

  return {
    raw: encodedMessage,
  };
}

export function findAttachments(
  parts: gmail_v1.Schema$MessagePart[],
): gmail_v1.Schema$MessagePart[] {
  let results: gmail_v1.Schema$MessagePart[] = [];

  for (const part of parts) {
    if (part.filename && part.filename.length > 0) {
      const contentDisposition =
        part.headers?.find((h) => h.name?.toLowerCase() === 'content-disposition')?.value || '';
      const isInline = contentDisposition.toLowerCase().includes('inline');
      const hasContentId = part.headers?.some((h) => h.name?.toLowerCase() === 'content-id');

      if (!isInline || (isInline && !hasContentId)) {
        results.push(part);
      }
    }

    if (part.parts && Array.isArray(part.parts)) {
      results = results.concat(findAttachments(part.parts));
    }

    if (part.body?.attachmentId && part.mimeType === 'message/rfc822') {
      if (part.filename && part.filename.length > 0) {
        results.push(part);
      }
    }
  }

  return results;
}

/**
 * Extrait le Content-ID nettoyé (`<logo@x>` → `logo@x`) d'une part MIME, ou null.
 * Exporté pour que driver et tests partagent la même normalisation que les refs
 * `cid:` laissées dans le corps par parseThread.
 */
export function partContentId(part: gmail_v1.Schema$MessagePart): string | null {
  const raw = part.headers?.find((h) => h.name?.toLowerCase() === 'content-id')?.value;
  return raw ? raw.replace(/[<>]/g, '') : null;
}

/**
 * Parts d'images inline référencées par `cid:` dans le corps HTML : disposition
 * inline + Content-ID + attachmentId. Complément exact de findAttachments (qui
 * les exclut) — c'est la population que parseThread ne télécharge plus au sync.
 */
export function findInlineImageParts(
  parts: gmail_v1.Schema$MessagePart[],
): gmail_v1.Schema$MessagePart[] {
  let results: gmail_v1.Schema$MessagePart[] = [];

  for (const part of parts) {
    const contentDisposition =
      part.headers?.find((h) => h.name?.toLowerCase() === 'content-disposition')?.value || '';
    const isInline = contentDisposition.toLowerCase().includes('inline');

    if (isInline && partContentId(part) && part.body?.attachmentId) {
      results.push(part);
    }

    if (part.parts && Array.isArray(part.parts)) {
      results = results.concat(findInlineImageParts(part.parts));
    }
  }

  return results;
}
