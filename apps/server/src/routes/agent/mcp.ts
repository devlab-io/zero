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

import {
  buildCapabilities,
  draftIdempotencyStorageKey,
  formatCompactThreadList,
  formatOutboxItem,
  formatSender,
  handleCancelOutboxItem,
  handleRetryOutboxItem,
  mcpToolDescriptions as descriptions,
  mcpToolSchemas as schemas,
  MCP_SERVER_INFO,
  MCP_TOOL_DEFINITIONS,
  resolveIdempotentDraft,
  type DraftIdempotencyStore,
} from './mcp-tools';
import {
  cancelDraftOutboxJob,
  enqueueDraftJob,
  getDraftOutboxItem,
  listDraftOutboxItems,
  retryDraftOutboxJob,
} from '../../lib/draft-outbox';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getThread, getZeroAgent } from '../../lib/server-utils';
import { sanitizeMailContent } from '../../lib/mail-sanitize';
import { composeEmail } from '../../trpc/routes/ai/compose';
import type { ThreadsResponse } from '@zero/types';
import { getCurrentDateContext } from '../../lib/prompts';
import { connection } from '../../db/schema';
import { logger } from '../../lib/logger';
import { env } from 'cloudflare:workers';
import { eq, and } from 'drizzle-orm';
import { McpAgent } from 'agents/mcp';
import { createDb } from '../../db';
import z from 'zod';

const draftRecipientSchema = schemas.createDraft.to.element;

type DraftRecipient = z.infer<typeof draftRecipientSchema>;

const formatDraftRecipient = (recipient: DraftRecipient) => {
  if (!recipient.name) return recipient.email;
  return `${recipient.name.replace(/[<>]/g, '').trim()} <${recipient.email}>`;
};

const formatDraftRecipients = (recipients: DraftRecipient[]) =>
  recipients.map(formatDraftRecipient).join(', ');

/** Single-text-block MCP tool result. */
const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

export class ZeroMCP extends McpAgent<typeof env, Record<string, unknown>, { userId: string }> {
  server = new McpServer({
    name: MCP_SERVER_INFO.name,
    version: MCP_SERVER_INFO.version,
    description: 'Zero draft-only mail MCP (no send / delete / spam / account-settings surface)',
  });

  activeConnectionId: string | undefined;

  async init(): Promise<void> {
    if (!this.props.userId) return;
    const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
    const _connection = await db.query.connection.findFirst({
      where: eq(connection.userId, this.props.userId),
    });
    if (!_connection) {
      throw new Error('Unauthorized');
    }
    this.activeConnectionId = _connection.id;

    const { stub: agent } = await getZeroAgent(_connection.id);

    // DO-storage-backed idempotency for createDraft (spec: mutation tools are idempotent).
    const draftIdempotencyStore: DraftIdempotencyStore = {
      get: (key) => this.ctx.storage.get<string>(key),
      put: async (key, value) => {
        await this.ctx.storage.put(key, value);
      },
    };

    // --- health / capabilities ------------------------------------------------
    this.server.registerTool(
      'getServerCapabilities',
      { description: descriptions.getServerCapabilities, inputSchema: schemas.getServerCapabilities },
      async () => {
        const capabilities = buildCapabilities(
          MCP_TOOL_DEFINITIONS.map((d) => ({
            name: d.name,
            category: d.category,
            mutates: d.mutates,
            idempotent: d.idempotent,
          })),
        );
        return text(JSON.stringify(capabilities, null, 2));
      },
    );

    // --- accounts / connections ----------------------------------------------
    this.server.registerTool(
      'getConnections',
      { description: descriptions.getConnections, inputSchema: schemas.getConnections },
      async () => {
        const connections = await db.query.connection.findMany({
          where: eq(connection.userId, this.props.userId),
        });
        return {
          content: connections.map((c) => ({
            type: 'text' as const,
            text: `Email: ${c.email} | Provider: ${c.providerId}`,
          })),
        };
      },
    );

    this.server.registerTool(
      'getActiveConnection',
      { description: descriptions.getActiveConnection, inputSchema: schemas.getActiveConnection },
      async () => {
        if (!this.activeConnectionId) {
          throw new Error('No active connection');
        }
        const active = await db.query.connection.findFirst({
          where: eq(connection.id, this.activeConnectionId),
        });
        if (!active) {
          throw new Error('Connection not found');
        }
        return text(`Email: ${active.email} | Provider: ${active.providerId}`);
      },
    );

    this.server.registerTool(
      'setActiveConnection',
      { description: descriptions.setActiveConnection, inputSchema: schemas.setActiveConnection },
      async (s) => {
        // Ownership-scoped: an unknown or other-user address is "not found" — existence is
        // never revealed (spec §"Cross-user ... identifiers are rejected without revealing").
        const owned = await db.query.connection.findFirst({
          where: and(eq(connection.userId, this.props.userId), eq(connection.email, s.email)),
        });
        if (!owned) {
          throw new Error('Connection not found');
        }
        this.activeConnectionId = owned.id;
        return text(`Active connection set to ${owned.email}`);
      },
    );

    // --- read: threads (compact) ---------------------------------------------
    this.server.registerTool(
      'listThreads',
      { description: descriptions.listThreads, inputSchema: schemas.listThreads },
      async (s) => {
        // Single projection query (#22/#30) — compact metadata, NO per-row body/N+1.
        const response = (await agent.getThreadsFromDB({
          folder: s.folder,
          q: s.query,
          maxResults: s.maxResults,
          labelIds: s.labelIds,
          pageToken: s.pageToken,
        })) as ThreadsResponse;
        return text(formatCompactThreadList(response));
      },
    );

    this.server.registerTool(
      'searchThreads',
      { description: descriptions.searchThreads, inputSchema: schemas.searchThreads },
      async (s) => {
        const response = (await agent.getThreadsFromDB({
          folder: s.folder,
          q: s.query,
          maxResults: s.maxResults,
          pageToken: s.pageToken,
        })) as ThreadsResponse;
        return text(formatCompactThreadList(response));
      },
    );

    this.server.registerTool(
      'getThread',
      { description: descriptions.getThread, inputSchema: schemas.getThread },
      async (s) => {
        const { result: thread } = await getThread(this.activeConnectionId!, s.threadId);
        return {
          content: [
            { type: 'text' as const, text: `Subject: ${thread.latest?.subject ?? '(no subject)'}` },
            {
              type: 'text' as const,
              text: `Latest Message Received: ${thread.latest?.receivedOn ?? 'unknown'}`,
            },
            { type: 'text' as const, text: `Latest Message Sender: ${formatSender(thread.latest?.sender)}` },
            {
              type: 'text' as const,
              text: `Latest Message Sanitized Content: ${
                sanitizeMailContent(thread.latest?.decodedBody).text
              }`,
            },
            { type: 'text' as const, text: `Thread ID: ${s.threadId}` },
          ],
        };
      },
    );

    this.server.registerTool(
      'getThreadSummary',
      { description: descriptions.getThreadSummary, inputSchema: schemas.getThreadSummary },
      async (s) => {
        if (!this.activeConnectionId) {
          return text('No active connection');
        }
        const response = await env.VECTORIZE.getByIds([s.id]);
        const { result: thread } = await getThread(this.activeConnectionId, s.id);
        if (response.length && response?.[0]?.metadata?.['summary'] && thread?.latest?.subject) {
          const result = response[0].metadata as { summary: string; connection: string };
          if (result.connection !== this.activeConnectionId) {
            return text('No summary found for this connection');
          }
          const shortResponse = await env.AI.run('@cf/facebook/bart-large-cnn', {
            input_text: result.summary,
          });
          return {
            content: [
              { type: 'text' as const, text: shortResponse.summary as string },
              { type: 'text' as const, text: `Subject: ${thread.latest?.subject}` },
              { type: 'text' as const, text: `Sender: ${formatSender(thread.latest?.sender)}` },
              { type: 'text' as const, text: `Date: ${thread.latest?.receivedOn}` },
            ],
          };
        }
        return text('No summary found');
      },
    );

    // --- read: labels ---------------------------------------------------------
    this.server.registerTool(
      'getUserLabels',
      { description: descriptions.getUserLabels, inputSchema: schemas.getUserLabels },
      async () => {
        const labels = await agent.getUserLabels();
        return text(
          labels.map((label) => `Name: ${label.name} ID: ${label.id} Color: ${label.color}`).join('\n'),
        );
      },
    );

    this.server.registerTool(
      'getLabel',
      { description: descriptions.getLabel, inputSchema: schemas.getLabel },
      async (s) => {
        const label = await agent.getLabel(s.id);
        return {
          content: [
            { type: 'text' as const, text: `Name: ${label.name}` },
            { type: 'text' as const, text: `ID: ${label.id}` },
          ],
        };
      },
    );

    // --- read: utilities ------------------------------------------------------
    this.server.registerTool(
      'getCurrentDate',
      { description: descriptions.getCurrentDate, inputSchema: schemas.getCurrentDate },
      async () => text(getCurrentDateContext()),
    );

    this.server.registerTool(
      'composeEmail',
      { description: descriptions.composeEmail, inputSchema: schemas.composeEmail },
      async (data) => {
        if (!this.activeConnectionId) {
          throw new Error('No active connection');
        }
        const newBody = await composeEmail({
          prompt: data.prompt,
          emailSubject: data.emailSubject,
          to: data.to,
          cc: data.cc,
          threadMessages: data.threadMessages,
          username: 'AI Assistant',
          connectionId: this.activeConnectionId,
        });
        return text(newBody);
      },
    );

    // --- read: outbox inspect -------------------------------------------------
    this.server.registerTool(
      'listOutbox',
      { description: descriptions.listOutbox, inputSchema: schemas.listOutbox },
      async (s) => {
        const items = await listDraftOutboxItems(db, {
          userId: this.props.userId,
          status: s.status,
        });
        if (!items.length) return text('No outbox items');
        return text(items.map(formatOutboxItem).join('\n'));
      },
    );

    this.server.registerTool(
      'getOutboxItem',
      { description: descriptions.getOutboxItem, inputSchema: schemas.getOutboxItem },
      async (s) => {
        const item = await getDraftOutboxItem(db, { id: s.id, userId: this.props.userId });
        // Missing OR other-user ids share one identical message — existence is never revealed.
        return text(item ? formatOutboxItem(item) : 'Outbox item not found');
      },
    );

    // --- write: draft (idempotent) -------------------------------------------
    this.server.registerTool(
      'createDraft',
      { description: descriptions.createDraft, inputSchema: schemas.createDraft },
      async (data) => {
        if (!this.activeConnectionId) {
          throw new Error('No active connection');
        }
        const result = await resolveIdempotentDraft(
          this.activeConnectionId,
          data.idempotencyKey,
          draftIdempotencyStore,
          () =>
            agent.createDraft({
              to: formatDraftRecipients(data.to),
              cc: data.cc?.length ? formatDraftRecipients(data.cc) : undefined,
              bcc: data.bcc?.length ? formatDraftRecipients(data.bcc) : undefined,
              subject: data.subject,
              message: data.message,
              attachments: [],
              id: null,
              threadId: data.threadId ?? null,
              fromEmail: null,
            }),
        );
        const suffix = result.deduped ? ' (idempotent: existing draft)' : '';
        return text(result.id ? `Draft created: ${result.id}${suffix}` : `Draft created${suffix}`);
      },
    );

    // --- write: reviewable outbox (idempotent) -------------------------------
    this.server.registerTool(
      'enqueueDraftJob',
      { description: descriptions.enqueueDraftJob, inputSchema: schemas.enqueueDraftJob },
      async (data) => {
        if (!this.activeConnectionId) {
          throw new Error('No active connection');
        }
        const queued = await enqueueDraftJob(db, {
          connectionId: this.activeConnectionId,
          threadId: data.threadId ?? null,
          mission: data.mission ?? null,
          subject: data.subject ?? null,
          body: data.body ?? null,
        });
        return text(`Draft job queued: ${queued.id}`);
      },
    );

    this.server.registerTool(
      'cancelOutboxItem',
      { description: descriptions.cancelOutboxItem, inputSchema: schemas.cancelOutboxItem },
      async (s) => {
        const message = await handleCancelOutboxItem(
          {
            getItem: (id) => getDraftOutboxItem(db, { id, userId: this.props.userId }),
            cancel: (item) => cancelDraftOutboxJob(db, item),
          },
          s.id,
        );
        return text(message);
      },
    );

    this.server.registerTool(
      'retryOutboxItem',
      { description: descriptions.retryOutboxItem, inputSchema: schemas.retryOutboxItem },
      async (s) => {
        const message = await handleRetryOutboxItem(
          {
            getItem: (id) => getDraftOutboxItem(db, { id, userId: this.props.userId }),
            retry: (item) => retryDraftOutboxJob(db, item),
          },
          s.id,
        );
        return text(message);
      },
    );

    logger.info('[ZeroMCP] draft-only surface registered', {
      userId: this.props.userId,
      toolCount: MCP_TOOL_DEFINITIONS.length,
    });
    this.ctx.waitUntil(conn.end());
  }
}
