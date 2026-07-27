import { parseAddressList, parseFrom, wasSentWithTLS } from '../email-utils';
import { normalizeHeaderValue, safeOutgoingHeaders } from '../mime-headers';
import type { IOutgoingMessage, ParsedMessage } from '../../types';
import { sanitizeTipTapHtml } from '../sanitize-tip-tap-html';
import { type gmail_v1 } from '@googleapis/gmail';
import { getSimpleLoginSender } from './utils';
import type { ManagerConfig } from './types';
import * as he from 'he';

/** En-tête Gmail réduit à ce que l'extraction consomme, avec un `name` garanti STRING. */
type SafeHeader = { name: string; value: string | null };

/**
 * Normalise les en-têtes d'un payload potentiellement hostile.
 *
 * Le corps d'une réponse Gmail sort de `JSON.parse` (driver/gmail-batch.ts:106, qui rend un
 * `unknown` ensuite typé par assertion) : rien ne garantit À L'EXÉCUTION que `headers` soit
 * un tableau, ni que ses entrées soient des objets. `headers.find(...)` sur une chaîne, ou
 * `h.name` sur une entrée nulle, levait un TypeError brut. Comme google-threads.ts parse le
 * fil entier sous un `Promise.all`, une seule ligne hostile emportait TOUT le lot. On écarte
 * ici les entrées inexploitables et on conserve les autres : dégradation partielle, jamais
 * d'exception.
 */
function toSafeHeaders(payload: unknown): SafeHeader[] {
  const container =
    typeof payload === 'object' && payload !== null
      ? (payload as { headers?: unknown })
      : undefined;
  const raw = container?.headers;
  if (!Array.isArray(raw)) return [];

  const safe: SafeHeader[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { name, value } = entry as { name?: unknown; value?: unknown };
    // Un en-tête sans nom exploitable n'était de toute façon jamais retenu par les `find`.
    if (typeof name !== 'string') continue;
    safe.push({ name, value: typeof value === 'string' ? value : null });
  }
  return safe;
}

/**
 * `labelIds` réduit aux chaînes réellement présentes. Une chaîne nue (`labelIds: 'INBOX'`)
 * n'a pas de `.map` : elle faisait lever la construction de `tags`.
 */
function toSafeLabelIds(labelIds: unknown): string[] {
  if (!Array.isArray(labelIds)) return [];
  return labelIds.filter((label): label is string => typeof label === 'string');
}

export function parseMessage(
  message: gmail_v1.Schema$Message,
): Omit<ParsedMessage, 'body' | 'processedHtml' | 'blobUrl' | 'totalReplies'> {
  // Message DÉGRADÉ plutôt que TypeError : une entrée nulle ou non-objet faisait lever la
  // déstructuration elle-même, avant toute garde. Les replis appliqués sont exactement ceux
  // du message vide déjà supportés (`ERROR` / `Failed` / `(no subject)`).
  const source: gmail_v1.Schema$Message =
    typeof message === 'object' && message !== null ? message : {};
  const { id, threadId, snippet, payload } = source;
  const headers = toSafeHeaders(payload);
  const labelIds = toSafeLabelIds(source.labelIds);

  const receivedOn = headers.find((h) => h.name.toLowerCase() === 'date')?.value || 'Failed';

  // If there's a SimpleLogin Header, use it as the sender.
  // `getSimpleLoginSender` (driver/utils.ts) déréférence `payload.headers` sans garde ; on
  // lui passe les en-têtes déjà normalisés, seule donnée qu'il consulte.
  const simpleLoginSender = getSimpleLoginSender({ headers });

  const sender =
    simpleLoginSender || headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Failed';
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
  // Ces trois valeurs repartent telles quelles dans les en-têtes d'une RÉPONSE
  // (components/mail/reply-composer.tsx -> mail.send -> setHeader). Une rupture de ligne
  // laissée ici est une injection d'en-tête MIME chez le destinataire suivant : on la
  // neutralise à l'extraction, avant même qu'elle n'entre dans le produit.
  const references = normalizeHeaderValue(
    headers.find((h) => h.name.toLowerCase() === 'references')?.value || '',
  );
  const inReplyTo = normalizeHeaderValue(
    headers.find((h) => h.name.toLowerCase() === 'in-reply-to')?.value || '',
  );
  const messageId = normalizeHeaderValue(
    headers.find((h) => h.name.toLowerCase() === 'message-id')?.value || '',
  );
  const listUnsubscribe =
    headers.find((h) => h.name.toLowerCase() === 'list-unsubscribe')?.value || undefined;
  const listUnsubscribePost =
    headers.find((h) => h.name.toLowerCase() === 'list-unsubscribe-post')?.value || undefined;
  const replyTo = headers.find((h) => h.name.toLowerCase() === 'reply-to')?.value || undefined;
  const toHeaders = headers
    .filter((h) => h.name.toLowerCase() === 'to')
    .map((h) => h.value)
    .filter((v) => typeof v === 'string');
  const to = toHeaders.flatMap((to) => parseAddressList(to));

  const ccHeaders = headers
    .filter((h) => h.name.toLowerCase() === 'cc')
    .map((h) => h.value)
    .filter((v) => typeof v === 'string');

  const cc =
    ccHeaders.length > 0
      ? ccHeaders
          .filter((header) => header.trim().length > 0)
          .flatMap((header) => parseAddressList(header))
      : null;

  const receivedHeaders = headers
    .filter((header) => header.name.toLowerCase() === 'received')
    .map((header) => header.value || '');
  const hasTLSReport = headers.some((header) => header.name.toLowerCase() === 'tls-report');

  return {
    id: typeof id === 'string' && id ? id : 'ERROR',
    bcc: [],
    threadId: typeof threadId === 'string' ? threadId : '',
    title: typeof snippet === 'string' && snippet ? he.decode(snippet).trim() : 'ERROR',
    tls: wasSentWithTLS(receivedHeaders) || hasTLSReport,
    tags: labelIds.map((l) => ({ id: l, name: l, type: 'user' })),
    listUnsubscribe,
    listUnsubscribePost,
    replyTo,
    references,
    inReplyTo,
    sender: parseFrom(sender),
    unread: labelIds.includes('UNREAD'),
    to,
    cc,
    receivedOn,
    subject: subject ? subject.replace(/"/g, '').trim() : '(no subject)',
    messageId,
    isDraft: labelIds.includes('DRAFT'),
  };
}

/**
 * Construit le MIME brut d'un message sortant.
 *
 * La DÉSTRUCTURATION était la première instruction : `parseOutgoing(null)` levait un
 * TypeError avant toute garde, et un corps sans `message` mourait plus loin sur
 * « Cannot read properties of undefined (reading 'trim') ». Or cette fonction est appelée
 * par `create`/`sendDraft`, donc par l'envoi différé : une erreur non diagnosticable y est
 * classée AMBIGUË et la réservation est réglée `unresolved` — terminal, non rejouable —
 * alors qu'aucun octet n'est parti. Les deux formes rendent désormais un refus explicite,
 * que `classifySendFailure` peut traiter comme la non-acceptation prouvée qu'elle est.
 */
export async function parseOutgoing(outgoing: IOutgoingMessage, config: ManagerConfig) {
  if (typeof outgoing !== 'object' || outgoing === null) {
    throw new Error('Outgoing message payload required');
  }
  const {
    to,
    subject,
    message,
    attachments,
    headers,
    cc,
    bcc,
    fromEmail,
    originalMessage = null,
  } = outgoing;

  if (typeof message !== 'string') {
    throw new Error('Message body required');
  }

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

  // Dernier verrou avant `setHeader` : mimetext n'échappe NI le nom NI la valeur, et la file
  // de messages (main.ts) reconstruit un IOutgoingMessage sans repasser par le schéma tRPC.
  // Voir lib/mime-headers.ts.
  for (const [key, value] of safeOutgoingHeaders(headers)) {
    if (key.toLowerCase() === 'references') {
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

/**
 * Pièces jointes d'un arbre de parties Gmail, sur une entrée POTENTIELLEMENT HOSTILE.
 *
 * Comme `parseMessage`, cette fonction consomme du `JSON.parse` (driver/gmail-batch.ts) : le
 * type ne garantit rien à l'exécution. `findAttachments(null)` levait « parts is not
 * iterable » et `findAttachments([null])` un TypeError sur `part.filename` — dans les deux
 * cas au milieu d'un `Promise.all` qui parse le fil entier, donc UN fil hostile emportait
 * tout le lot. On écarte les entrées inexploitables et on conserve les autres.
 */
export function findAttachments(
  parts: gmail_v1.Schema$MessagePart[] | null | undefined,
): gmail_v1.Schema$MessagePart[] {
  if (!Array.isArray(parts)) return [];

  let results: gmail_v1.Schema$MessagePart[] = [];

  for (const part of parts) {
    if (typeof part !== 'object' || part === null) continue;

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
