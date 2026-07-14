/*
 * Licensed to Zero Email Inc. under one or more contributor license agreements.
 * You may not use this file except in compliance with the Apache License, Version 2.0 (the "License").
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Reuse or distribution of this file requires a license from Zero Email Inc.
 */

import { parseAddressList as parseEmailAddressList } from 'email-addresses';
import type { IGetThreadResponse, ParsedDraft } from './types';

export const MCP_THREAD_MESSAGE_LIMIT = 20;
export const MCP_THREAD_TEXT_LIMIT_BYTES = 64 * 1024;
export const MCP_DRAFT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
export const MCP_RECIPIENT_LIMIT = 50;

export type AgentDraftRecipient = { email: string; name?: string };

export type AgentThreadContext = {
  threadId: string;
  messages: Array<{
    id: string;
    from: AgentDraftRecipient;
    to: AgentDraftRecipient[];
    cc: AgentDraftRecipient[];
    subject: string;
    receivedOn: string;
    text: string;
  }>;
  totalTextBytes: number;
  truncated: boolean;
};

export type AgentReplyMetadata = {
  to: AgentDraftRecipient[];
  cc: AgentDraftRecipient[];
  subject: string;
  threadId: string;
  replyToMessageId: string;
  serverDerivedReplyHeaders: ServerDerivedReplyHeaders;
};

export type ServerDerivedReplyHeaders = {
  inReplyTo: string;
  references: string;
};

export type AgentDraftProjection = {
  id: string;
  threadId: string | null;
  to: AgentDraftRecipient[];
  cc: AgentDraftRecipient[];
  bcc: AgentDraftRecipient[];
  subject: string;
  message: string;
  revision: string;
};

export type AgentDraftListItem = Omit<AgentDraftProjection, 'message' | 'revision'>;

const encoder = new TextEncoder();

const utf8Length = (value: string) => encoder.encode(value).byteLength;

const assertHeaderValue = (label: string, value: string, maximum: number) => {
  if (/[\r\n]/.test(value) || value.length > maximum) {
    throw new Error(`Provider returned an invalid ${label}`);
  }
  return value;
};

const RFC_MESSAGE_ID = /^<[^<>\s@]+@[^<>\s@]+>$/;
const HEADER_CONTROL = /[\u0000-\u001f\u007f]/;

export const assertServerDerivedReplyHeaders = (
  headers: ServerDerivedReplyHeaders,
): ServerDerivedReplyHeaders => {
  const inReplyTo = headers.inReplyTo.trim();
  if (
    !inReplyTo ||
    inReplyTo.length > 998 ||
    HEADER_CONTROL.test(inReplyTo) ||
    !RFC_MESSAGE_ID.test(inReplyTo)
  ) {
    throw new Error('Provider returned an invalid RFC Message-ID for reply threading');
  }

  const rawReferences = headers.references.trim();
  if (!rawReferences || rawReferences.length > 998 || HEADER_CONTROL.test(rawReferences)) {
    throw new Error('Provider returned invalid References for reply threading');
  }
  const references = rawReferences.split(/[ \t]+/).filter(Boolean);
  if (!references.length || references.some((reference) => !RFC_MESSAGE_ID.test(reference))) {
    throw new Error('Provider returned invalid References for reply threading');
  }

  return { inReplyTo, references: references.join(' ') };
};

const deriveServerReplyHeaders = (
  messageId: string | undefined,
  priorReferences: string | undefined,
): ServerDerivedReplyHeaders => {
  const inReplyTo = messageId?.trim() ?? '';
  const references = [...new Set([...(priorReferences?.trim().split(/[ \t]+/) ?? []), inReplyTo])]
    .filter(Boolean)
    .join(' ');
  return assertServerDerivedReplyHeaders({ inReplyTo, references });
};

const assertEmail = (email: string) => {
  const value = assertHeaderValue('email address', email.trim(), 320);
  if (!/^[^\s@]+@[^\s@]+$/.test(value)) {
    throw new Error('Provider returned an invalid email address');
  }
  return value;
};

const truncateUtf8 = (value: string, maximumBytes: number) => {
  const bytes = encoder.encode(value);
  if (bytes.byteLength <= maximumBytes) return { value, truncated: false };
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  for (let end = maximumBytes; end >= Math.max(0, maximumBytes - 3); end -= 1) {
    try {
      return { value: decoder.decode(bytes.slice(0, end)), truncated: true };
    } catch {
      // Move left to the previous complete UTF-8 code point (at most three bytes).
    }
  }
  throw new Error('Unable to truncate sanitized mail content at a UTF-8 boundary');
};

const cleanParticipant = (participant: { email: string; name?: string }): AgentDraftRecipient => ({
  email: assertEmail(participant.email),
  ...(participant.name?.trim()
    ? { name: assertHeaderValue('recipient name', participant.name.trim(), 998) }
    : {}),
});

const canonicalEmail = (email: string) => email.trim().toLowerCase();

const dedupeRecipients = (recipients: AgentDraftRecipient[]) => {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = canonicalEmail(recipient.email);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseProviderRecipient = (value: string): AgentDraftRecipient[] => {
  const parsed = parseEmailAddressList(value);
  if (!parsed) throw new Error('Provider returned an invalid draft recipient');
  return parsed.flatMap((entry) => {
    if (entry.type === 'group') {
      return (entry.addresses ?? []).map((address) => ({
        email: assertEmail(address.address),
        ...(address.name ? { name: assertHeaderValue('recipient name', address.name, 998) } : {}),
      }));
    }
    return [
      {
        email: assertEmail(entry.address),
        ...(entry.name ? { name: assertHeaderValue('recipient name', entry.name, 998) } : {}),
      },
    ];
  });
};

const parseProviderRecipients = (values: string[] | undefined) =>
  dedupeRecipients((values ?? []).flatMap(parseProviderRecipient));

const providerThreadId = (draft: ParsedDraft): string | null => {
  const raw = draft.rawMessage as
    | { threadId?: unknown; conversationId?: unknown; id?: unknown }
    | undefined;
  if (typeof raw?.threadId === 'string' && raw.threadId) return raw.threadId;
  if (typeof raw?.conversationId === 'string' && raw.conversationId) return raw.conversationId;
  return null;
};

const revisionPayload = (
  connectionId: string,
  projection: Omit<AgentDraftProjection, 'revision'>,
  providerCasToken?: string,
) => JSON.stringify({ connectionId, providerCasToken: providerCasToken ?? null, ...projection });

const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const projectOwnedDraft = async (
  connectionId: string,
  draft: ParsedDraft,
  providerCasToken?: string,
): Promise<AgentDraftProjection> => {
  if (!draft.id) throw new Error('Provider returned a draft without an id');
  const message = draft.content ?? '';
  if (utf8Length(message) > MCP_DRAFT_BODY_LIMIT_BYTES) {
    throw new Error(`Draft ${draft.id} exceeds the 2 MiB MCP body limit`);
  }

  const projection = {
    id: draft.id,
    threadId: providerThreadId(draft),
    to: parseProviderRecipients(draft.to),
    cc: parseProviderRecipients(draft.cc),
    bcc: parseProviderRecipients(draft.bcc),
    subject: assertHeaderValue('draft subject', draft.subject ?? '', 998),
    message,
  };
  const recipientCount = projection.to.length + projection.cc.length + projection.bcc.length;
  if (recipientCount > MCP_RECIPIENT_LIMIT) {
    throw new Error(`Draft ${draft.id} exceeds the 50-recipient MCP limit`);
  }
  if (
    providerCasToken !== undefined &&
    (!providerCasToken || providerCasToken.length > 4096 || /[\r\n]/.test(providerCasToken))
  ) {
    throw new Error(`Provider returned an invalid CAS token for draft ${draft.id}`);
  }
  return {
    ...projection,
    revision: await digest(revisionPayload(connectionId, projection, providerCasToken)),
  };
};

export const projectDraftListItem = (raw: unknown, fallbackId: string): AgentDraftListItem => {
  if (!raw || typeof raw !== 'object')
    throw new Error(`Provider omitted draft projection ${fallbackId}`);
  const draft = raw as Record<string, unknown>;
  const id = typeof draft.id === 'string' && draft.id ? draft.id : fallbackId;
  if (!id) throw new Error('Provider returned a draft list item without an id');
  const recipients = (key: 'to' | 'cc' | 'bcc') => {
    const values = draft[key];
    if (values === undefined || values === null) return [];
    if (!Array.isArray(values)) {
      throw new Error(`Provider returned invalid ${key} recipients for draft ${id}`);
    }
    return dedupeRecipients(
      values.flatMap((value) => {
        if (typeof value === 'string') return parseProviderRecipient(value);
        if (
          value &&
          typeof value === 'object' &&
          'email' in value &&
          typeof value.email === 'string'
        ) {
          return [
            cleanParticipant({
              email: value.email,
              ...('name' in value && typeof value.name === 'string' && value.name
                ? { name: value.name }
                : {}),
            }),
          ];
        }
        throw new Error(`Provider returned invalid ${key} recipients for draft ${id}`);
      }),
    );
  };
  const threadId = typeof draft.threadId === 'string' && draft.threadId ? draft.threadId : null;
  return {
    id,
    threadId,
    to: recipients('to'),
    cc: recipients('cc'),
    bcc: recipients('bcc'),
    subject: assertHeaderValue(
      'draft subject',
      typeof draft.subject === 'string' ? draft.subject : '',
      998,
    ),
  };
};

export const buildAgentThreadContext = (
  threadId: string,
  thread: IGetThreadResponse,
  sanitize: (content: string | null | undefined) => { text: string },
): AgentThreadContext => {
  const source = thread.messages
    .filter((message) => message.isDraft !== true)
    .slice(-MCP_THREAD_MESSAGE_LIMIT);
  let remainingBytes = MCP_THREAD_TEXT_LIMIT_BYTES;
  let truncated =
    thread.messages.filter((message) => message.isDraft !== true).length > source.length;
  const messages = [] as AgentThreadContext['messages'];

  for (const message of [...source].reverse()) {
    const sanitized = sanitize(message.decodedBody ?? message.processedHtml ?? message.body).text;
    const bounded = truncateUtf8(sanitized, remainingBytes);
    messages.unshift({
      id: message.id,
      from: cleanParticipant(message.sender),
      to: message.to.map(cleanParticipant),
      cc: (message.cc ?? []).map(cleanParticipant),
      subject: message.subject,
      receivedOn: message.receivedOn,
      text: bounded.value,
    });
    remainingBytes -= utf8Length(bounded.value);
    truncated ||= bounded.truncated;
    if (remainingBytes === 0) break;
  }

  return {
    threadId,
    messages,
    totalTextBytes: MCP_THREAD_TEXT_LIMIT_BYTES - remainingBytes,
    truncated,
  };
};

const parseReplyTo = (value: string | undefined): AgentDraftRecipient | undefined => {
  if (!value) return undefined;
  const parsed = parseProviderRecipient(value);
  return parsed.length === 1 ? parsed[0] : undefined;
};

export const deriveReplyMetadata = (
  threadId: string,
  thread: IGetThreadResponse,
  ownedAddresses: string[],
): AgentReplyMetadata => {
  const latest = thread.messages.findLast((message) => message.isDraft !== true) ?? thread.latest;
  if (!latest || latest.isDraft === true)
    throw new Error(`Thread ${threadId} has no replyable message`);

  const excluded = new Set(ownedAddresses.map(assertEmail).map(canonicalEmail));
  const sender = parseReplyTo(latest.replyTo) ?? cleanParticipant(latest.sender);
  const senderIsOwned = excluded.has(canonicalEmail(sender.email));
  const originalTo = latest.to.map(cleanParticipant);
  const originalCc = (latest.cc ?? []).map(cleanParticipant);
  const to = dedupeRecipients(
    (senderIsOwned ? originalTo : [sender]).filter(
      (recipient) => !excluded.has(canonicalEmail(recipient.email)),
    ),
  );
  if (!to.length) throw new Error(`Thread ${threadId} has no external reply recipient`);
  const toSet = new Set(to.map((recipient) => canonicalEmail(recipient.email)));
  const cc = dedupeRecipients([...originalTo, ...originalCc]).filter((recipient) => {
    const email = canonicalEmail(recipient.email);
    return !excluded.has(email) && !toSet.has(email);
  });
  if (to.length + cc.length > MCP_RECIPIENT_LIMIT) {
    throw new Error(`Thread ${threadId} reply exceeds the 50-recipient MCP limit`);
  }

  const originalSubject = latest.subject.trim();
  const subject = /^re\s*:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
  if (!originalSubject || /[\r\n]/.test(subject) || subject.length > 998) {
    throw new Error(`Thread ${threadId} has an invalid reply subject`);
  }

  return {
    to,
    cc,
    subject,
    threadId,
    replyToMessageId: latest.id,
    serverDerivedReplyHeaders: deriveServerReplyHeaders(latest.messageId, latest.references),
  };
};

export const assertCurrentRevision = (current: AgentDraftProjection, expected: string) => {
  if (current.revision !== expected) {
    throw new Error(`Draft ${current.id} revision is stale; fetch it again with getDraft`);
  }
};
