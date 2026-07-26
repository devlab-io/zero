import { HIDDEN_CONTENT_MARKER, sanitizeMailContent } from '../lib/mail-sanitize';
import type { ParsedMessage } from '../types';
import { logger } from '../lib/logger';

// `htmlToText` vivait ici : un `cheerio.load` suivi d'un `.text()`, sans la moindre notion de
// contenu CACHÉ. Une charge en `display:none`, en blanc sur blanc ou masquée par une classe CSS
// en ressortait EN CLAIR (trois payloads vérifiés), puis partait dans le prompt de résumé, donc
// dans le résumé, donc dans le prompt de labellisation qui consomme ce résumé. La neutralisation
// passe désormais par `sanitizeMailContent` — le point d'entrée unique du courrier entrant vers
// un LLM — qui retire l'invisible et marque le contenu comme non fiable.

export const escapeXml = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

export const messageToXML = async (message: ParsedMessage) => {
  try {
    if (!message.decodedBody) return null;

    const sanitized = sanitizeMailContent(message.decodedBody);
    // Le seuil porte sur le CORPS neutralisé, marqueurs de retrait déduits — et non sur
    // `text`, qui porte l'en-tête de mise en garde. Sans cela, un message dont TOUT le
    // contenu est caché paraîtrait substantiel par la seule longueur de ces marqueurs et
    // partirait au modèle alors qu'il ne reste rien à résumer.
    const visible = sanitized.body.split(HIDDEN_CONTENT_MARKER).join('').trim();
    if (visible.length < 10) {
      return null;
    }
    const body = sanitized.text;

    const safeSenderName = escapeXml(message.sender?.name || 'Unknown');
    const safeSubject = escapeXml(message.subject || '');
    const safeDate = escapeXml(message.receivedOn || '');

    const toElements = (message.to || [])
      .map((r: { email?: string }) => `<to>${escapeXml(r?.email || '')}</to>`)
      .join('');
    const ccElements = (message.cc || [])
      .map((r: { email?: string }) => `<cc>${escapeXml(r?.email || '')}</cc>`)
      .join('');

    return `
        <message>
          <from>${safeSenderName}</from>
          ${toElements}
          ${ccElements}
          <date>${safeDate}</date>
          <subject>${safeSubject}</subject>
          <body>${escapeXml(body)}</body>
        </message>
        `;
  } catch (error) {
    logger.info('[MESSAGE_TO_XML] Failed to convert message to XML:', {
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const getParticipants = (messages: ParsedMessage[]) => {
  const participants = new Map<string, { name?: string; email: string }>();

  const setIfUnset = (sender: { email?: string; name?: string } | null | undefined) => {
    if (!sender?.email) return;
    if (!participants.has(sender.email)) {
      participants.set(sender.email, {
        name: sender.name,
        email: sender.email,
      });
    }
  };

  messages.forEach((message) => {
    setIfUnset(message.sender);
    (message.to || []).forEach(setIfUnset);
    (message.cc || []).forEach(setIfUnset);
  });

  return Array.from(participants.values());
};

export const threadToXML = async (messages: ParsedMessage[], existingSummary?: string) => {
  const participants = getParticipants(messages);
  const title = messages[0]?.subject || 'No Subject';
  const subject = messages[0]?.subject || 'No Subject';

  const participantsXML = participants
    .map((p) => {
      const displayName = escapeXml(p.name || p.email);
      const emailTag = p.name ? `< ${escapeXml(p.email)} >` : '';
      return `<participant>${displayName} ${emailTag}</participant>`;
    })
    .join('');

  const messagesXML = await Promise.all(messages.map(messageToXML));
  const validMessagesXML = messagesXML.filter(Boolean).join('');

  return `
    <thread>
      <title>${escapeXml(title)}</title>
      <subject>${escapeXml(subject)}</subject>
      <participants>
        ${participantsXML}
      </participants>
      ${existingSummary ? `<summary>${escapeXml(existingSummary)}</summary>` : ''}
      <messages>
        ${validMessagesXML}
      </messages>
    </thread>
  `;
};
