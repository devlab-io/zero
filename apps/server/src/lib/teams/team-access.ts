import { getThread, getZeroAgent, getZeroDB } from '../server-utils';
import type { CommentQuote, TeamThreadMetadata } from './team-store';
import type { IGetThreadResponse } from '../driver/types';
import { getContext } from 'hono/context-storage';
import type { HonoContext } from '../../ctx';

/**
 * Bounded read proxy for SHARED threads (P0 correction: metadata alone does
 * not satisfy sharing). An authorized teammate — on ANY mailbox — reads the
 * full snapshot AND future messages of the shared thread, and downloads its
 * attachments, through the backend:
 *
 *   resolveAccess(teamThreadId, sessionUserId)  →  then, and only then, the
 *   server uses sharerConnectionId to read THAT thread from the sharer's
 *   synced mailbox replica.
 *
 * Guarantees: credentials never leave the server, the read is bounded to the
 * shared thread (getThread(connectionId, threadId) — no list, no folder, no
 * other thread), attachments are only reachable for messages OF that thread,
 * and every surface (UI, MCP, AI) goes through the SAME gate. Revoking access
 * or unsharing closes the proxy immediately (the check runs per call).
 */

const MAX_QUOTE_CHARS = 400;
const MAX_PREVIEW_CHARS = 240;
const MAX_PARTICIPANTS = 20;

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve ACL then read the full shared thread from the sharer's mailbox. */
export async function readSharedThread(userId: string, teamThreadId: string) {
  const db = await getZeroDB(userId);
  const share = await db.resolveTeamThreadAccess(teamThreadId);
  const { result } = await getThread(share.sharerConnectionId, share.threadId);
  return { share: toPublicShare(share), thread: result };
}

/**
 * Attachment proxy bounded to the shared thread: the message MUST belong to
 * the thread (verified against the sharer-side thread read) before the
 * attachment bytes are fetched via the sharer's connection.
 */
export async function readSharedAttachment(
  userId: string,
  teamThreadId: string,
  messageId: string,
  attachmentId: string,
) {
  const db = await getZeroDB(userId);
  const share = await db.resolveTeamThreadAccess(teamThreadId);
  const { result } = await getThread(share.sharerConnectionId, share.threadId);
  const message = result.messages.find((m) => m.id === messageId);
  if (!message) throw new Error('message_not_in_thread');
  const executionCtx = getContext<HonoContext>().executionCtx;
  const { stub: agent } = await getZeroAgent(share.sharerConnectionId, executionCtx);
  const attachments = (await agent.getMessageAttachments(messageId, { inlineOnly: false })) as {
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
    body: string;
  }[];
  const attachment = attachments.find((a) => a.attachmentId === attachmentId);
  if (!attachment) throw new Error('attachment_not_found');
  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    body: attachment.body,
  };
}

/**
 * Server-captured structured quote of a message OF the shared thread — same
 * authorization as readSharedThread, never client-supplied text.
 */
export async function buildSharedQuote(
  userId: string,
  teamThreadId: string,
  messageId: string,
): Promise<CommentQuote> {
  const db = await getZeroDB(userId);
  const share = await db.resolveTeamThreadAccess(teamThreadId);
  const { result } = await getThread(share.sharerConnectionId, share.threadId);
  const message = result.messages.find((m) => m.id === messageId);
  if (!message) throw new Error('message_not_in_thread');
  const source = message.decodedBody || message.body || '';
  return {
    messageId,
    authorEmail: message.sender.email,
    authorName: message.sender.name,
    receivedOn: message.receivedOn,
    text: stripHtmlToText(source).slice(0, MAX_QUOTE_CHARS),
  };
}

/**
 * Share-time metadata capture from the sharer's OWN mailbox read (route-side,
 * never client-side): list-surface fields only.
 */
export function buildTeamThreadMetadata(
  connection: { id: string; email: string; providerId: string },
  threadId: string,
  thread: IGetThreadResponse,
): TeamThreadMetadata {
  const latest = thread.latest ?? thread.messages[thread.messages.length - 1];
  const participants = new Map<string, { name?: string; email: string }>();
  for (const message of thread.messages) {
    const candidates = [message.sender, ...message.to, ...(message.cc ?? [])];
    for (const candidate of candidates) {
      if (!candidate?.email) continue;
      const key = candidate.email.toLowerCase();
      if (!participants.has(key)) participants.set(key, candidate);
      if (participants.size >= MAX_PARTICIPANTS) break;
    }
    if (participants.size >= MAX_PARTICIPANTS) break;
  }
  return {
    threadId,
    sharerConnectionId: connection.id,
    sharerEmail: connection.email,
    providerId: connection.providerId,
    subject: latest?.subject ?? '',
    preview: stripHtmlToText(latest?.decodedBody || latest?.body || '').slice(0, MAX_PREVIEW_CHARS),
    participants: [...participants.values()],
    messageCount: thread.messages.length,
    latestReceivedOn: latest?.receivedOn ?? null,
  };
}

/** Public share projection: sharerConnectionId NEVER crosses to the client. */
export function toPublicShare(share: {
  id: string;
  teamId: string;
  threadId: string;
  sharerUserId: string;
  sharerEmail: string;
  providerId: string;
  visibility: 'team' | 'restricted';
  subject: string;
  preview: string;
  participants: { name?: string; email: string }[];
  messageCount: number;
  latestReceivedOn: string | null;
  status: 'open' | 'closed';
  assigneeUserId: string | null;
  lastActivityAt: Date;
  createdAt: Date;
}) {
  return {
    id: share.id,
    teamId: share.teamId,
    threadId: share.threadId,
    sharerUserId: share.sharerUserId,
    sharerEmail: share.sharerEmail,
    providerId: share.providerId,
    visibility: share.visibility,
    subject: share.subject,
    preview: share.preview,
    participants: share.participants,
    messageCount: share.messageCount,
    latestReceivedOn: share.latestReceivedOn,
    status: share.status,
    assigneeUserId: share.assigneeUserId,
    lastActivityAt: share.lastActivityAt,
    createdAt: share.createdAt,
  };
}
