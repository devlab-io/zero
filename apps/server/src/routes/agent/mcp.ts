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
  composeEmailInputSchema,
  createDraftInputSchema,
  formatCompactThreadList,
  formatOutboxItem,
  formatSender,
  handleCancelOutboxItem,
  handleRetryOutboxItem,
  mcpToolDescriptions as descriptions,
  mcpToolAnnotations as annotations,
  mcpToolSchemas as schemas,
  MCP_SERVER_INSTRUCTIONS,
  MCP_SERVER_INFO,
  MCP_TOOL_DEFINITIONS,
  PayloadBoundIdempotency,
  type DraftRecipient,
} from './mcp-tools';
import {
  cancelDraftOutboxJob,
  enqueueDraftJob,
  getDraftOutboxItem,
  listDraftOutboxItems,
  retryDraftOutboxJob,
} from '../../lib/draft-outbox';
import { ActiveAccountResolver, withManagedResource } from './mcp-account';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getThread, getZeroAgent } from '../../lib/server-utils';
import { sanitizeMailContent } from '../../lib/mail-sanitize';
import { composeEmail } from '../../trpc/routes/ai/compose';
import { getCurrentDateContext } from '../../lib/prompts';
import { registerDraftLoopTools } from './mcp-draft-loop';
import type { ThreadsResponse } from '@zero/types';
import { connection } from '../../db/schema';
import { logger } from '../../lib/logger';
import { env } from 'cloudflare:workers';
import { eq, and } from 'drizzle-orm';
import { McpAgent } from 'agents/mcp';
import { createDb } from '../../db';
import type { DB } from '../../db';

const formatDraftRecipient = (recipient: DraftRecipient) => {
  if (!recipient.name) return recipient.email;
  return `${recipient.name.replace(/[<>]/g, '').trim()} <${recipient.email}>`;
};

const formatDraftRecipients = (recipients: DraftRecipient[]) =>
  recipients.map(formatDraftRecipient).join(', ');

/** Single-text-block MCP tool result. */
const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

const isProviderNotFound = (error: unknown) => {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    originalError?: { code?: unknown; status?: unknown; statusCode?: unknown };
  };
  return [
    candidate?.code,
    candidate?.status,
    candidate?.statusCode,
    candidate?.originalError?.code,
    candidate?.originalError?.status,
    candidate?.originalError?.statusCode,
  ].some((value) => value === 404 || value === '404' || value === 'not_found');
};

export class ZeroMCP extends McpAgent<typeof env, Record<string, unknown>, { userId: string }> {
  server = new McpServer(
    {
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      description: 'Zero draft-only mail MCP (no send / delete / spam / account-settings surface)',
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  private async withDb<T>(use: (db: DB) => Promise<T>): Promise<T> {
    return withManagedResource(() => {
      const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
      return { value: db, close: () => conn.end() };
    }, use);
  }

  private async getOwnedConnection(db: DB, connectionId: string) {
    const active = await db.query.connection.findFirst({
      where: and(eq(connection.id, connectionId), eq(connection.userId, this.props.userId)),
    });
    if (!active) throw new Error('Connection not found');
    return active;
  }

  async init(): Promise<void> {
    if (!this.props.userId) return;
    const accountResolver = new ActiveAccountResolver(this.props.userId, {
      findFirstOwnedConnection: (userId) =>
        this.withDb((db) =>
          db.query.connection.findFirst({ where: eq(connection.userId, userId) }),
        ),
      findOwnedConnectionById: (userId, connectionId) =>
        this.withDb((db) =>
          db.query.connection.findFirst({
            where: and(eq(connection.userId, userId), eq(connection.id, connectionId)),
          }),
        ),
      findOwnedConnectionByEmail: (userId, email) =>
        this.withDb((db) =>
          db.query.connection.findFirst({
            where: and(eq(connection.userId, userId), eq(connection.email, email)),
          }),
        ),
      getAgent: async (connectionId) => (await getZeroAgent(connectionId)).stub,
    });
    await accountResolver.initialize();

    const idempotency = new PayloadBoundIdempotency(this.ctx.storage);

    // --- health / capabilities ------------------------------------------------
    this.server.registerTool(
      'getServerCapabilities',
      {
        description: descriptions.getServerCapabilities,
        inputSchema: schemas.getServerCapabilities,
        annotations: annotations.getServerCapabilities,
      },
      async () => {
        const capabilities = buildCapabilities(MCP_TOOL_DEFINITIONS);
        return text(JSON.stringify(capabilities, null, 2));
      },
    );

    // --- accounts / connections ----------------------------------------------
    this.server.registerTool(
      'getConnections',
      {
        description: descriptions.getConnections,
        inputSchema: schemas.getConnections,
        annotations: annotations.getConnections,
      },
      async () => {
        const connections = await this.withDb((db) =>
          db.query.connection.findMany({ where: eq(connection.userId, this.props.userId) }),
        );
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
      {
        description: descriptions.getActiveConnection,
        inputSchema: schemas.getActiveConnection,
        annotations: annotations.getActiveConnection,
      },
      async () => {
        const active = await accountResolver.getActiveConnection();
        return text(`Email: ${active.email} | Provider: ${active.providerId}`);
      },
    );

    this.server.registerTool(
      'setActiveConnection',
      {
        description: descriptions.setActiveConnection,
        inputSchema: schemas.setActiveConnection,
        annotations: annotations.setActiveConnection,
      },
      async (s) => {
        // Ownership-scoped: an unknown or other-user address is "not found" — existence is
        // never revealed (spec §"Cross-user ... identifiers are rejected without revealing").
        const owned = await accountResolver.setActiveByEmail(s.email);
        return text(`Active connection set to ${owned.email}`);
      },
    );

    // --- read: threads (compact) ---------------------------------------------
    this.server.registerTool(
      'listThreads',
      {
        description: descriptions.listThreads,
        inputSchema: schemas.listThreads,
        annotations: annotations.listThreads,
      },
      async (s) => {
        const { agent } = await accountResolver.getActiveAgent();
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
      {
        description: descriptions.searchThreads,
        inputSchema: schemas.searchThreads,
        annotations: annotations.searchThreads,
      },
      async (s) => {
        const { agent } = await accountResolver.getActiveAgent();
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
      {
        description: descriptions.getThread,
        inputSchema: schemas.getThread,
        annotations: annotations.getThread,
      },
      async (s) => {
        const active = await accountResolver.getActiveConnection();
        const { result: thread } = await getThread(active.id, s.threadId);
        return {
          content: [
            { type: 'text' as const, text: `Subject: ${thread.latest?.subject ?? '(no subject)'}` },
            {
              type: 'text' as const,
              text: `Latest Message Received: ${thread.latest?.receivedOn ?? 'unknown'}`,
            },
            {
              type: 'text' as const,
              text: `Latest Message Sender: ${formatSender(thread.latest?.sender)}`,
            },
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
      {
        description: descriptions.getThreadSummary,
        inputSchema: schemas.getThreadSummary,
        annotations: annotations.getThreadSummary,
      },
      async (s) => {
        const active = await accountResolver.getActiveConnection();
        const response = await env.VECTORIZE.getByIds([s.id]);
        const { result: thread } = await getThread(active.id, s.id);
        if (response.length && response?.[0]?.metadata?.['summary'] && thread?.latest?.subject) {
          const result = response[0].metadata as { summary: string; connection: string };
          if (result.connection !== active.id) {
            return text('No summary found for this connection');
          }
          return {
            content: [
              { type: 'text' as const, text: result.summary },
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
      {
        description: descriptions.getUserLabels,
        inputSchema: schemas.getUserLabels,
        annotations: annotations.getUserLabels,
      },
      async () => {
        const { agent } = await accountResolver.getActiveAgent();
        const labels = await agent.getUserLabels();
        return text(
          labels
            .map((label) => `Name: ${label.name} ID: ${label.id} Color: ${label.color}`)
            .join('\n'),
        );
      },
    );

    this.server.registerTool(
      'getLabel',
      {
        description: descriptions.getLabel,
        inputSchema: schemas.getLabel,
        annotations: annotations.getLabel,
      },
      async (s) => {
        const { agent } = await accountResolver.getActiveAgent();
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
      {
        description: descriptions.getCurrentDate,
        inputSchema: schemas.getCurrentDate,
        annotations: annotations.getCurrentDate,
      },
      async () => text(getCurrentDateContext()),
    );

    this.server.registerTool(
      'composeEmail',
      {
        description: descriptions.composeEmail,
        inputSchema: composeEmailInputSchema,
        annotations: annotations.composeEmail,
      },
      async (data) => {
        const active = await accountResolver.getActiveConnection();
        const newBody = await composeEmail({
          prompt: data.prompt,
          emailSubject: data.emailSubject,
          to: data.to,
          cc: data.cc,
          threadMessages: data.threadMessages,
          username: 'AI Assistant',
          connectionId: active.id,
        });
        return text(newBody);
      },
    );

    // --- read: outbox inspect -------------------------------------------------
    this.server.registerTool(
      'listOutbox',
      {
        description: descriptions.listOutbox,
        inputSchema: schemas.listOutbox,
        annotations: annotations.listOutbox,
      },
      async (s) => {
        const active = await accountResolver.getActiveConnection();
        const items = await this.withDb(async (db) => {
          const ownedItems = await listDraftOutboxItems(db, {
            userId: this.props.userId,
            status: s.status,
          });
          return ownedItems.filter((item) => item.connectionId === active.id);
        });
        if (!items.length) return text('No outbox items');
        return text(items.map(formatOutboxItem).join('\n'));
      },
    );

    this.server.registerTool(
      'getOutboxItem',
      {
        description: descriptions.getOutboxItem,
        inputSchema: schemas.getOutboxItem,
        annotations: annotations.getOutboxItem,
      },
      async (s) => {
        const active = await accountResolver.getActiveConnection();
        const item = await this.withDb(async (db) => {
          return getDraftOutboxItem(db, {
            id: s.id,
            userId: this.props.userId,
            connectionId: active.id,
          });
        });
        // Missing OR other-user ids share one identical message — existence is never revealed.
        return text(item ? formatOutboxItem(item) : 'Outbox item not found');
      },
    );

    // --- write: draft (idempotent) -------------------------------------------
    this.server.registerTool(
      'createDraft',
      {
        description: descriptions.createDraft,
        inputSchema: createDraftInputSchema,
        annotations: annotations.createDraft,
      },
      async (data) => {
        const active = await accountResolver.getActiveConnection();
        const result = await idempotency.execute({
          connectionId: active.id,
          idempotencyKey: data.idempotencyKey,
          payload: { operation: 'createDraft', ...data, idempotencyKey: undefined },
          effect: () =>
            this.withDb(async (db) => {
              await this.getOwnedConnection(db, active.id);
              const { stub: agent } = await getZeroAgent(active.id);
              const created = await agent.createDraft({
                to: formatDraftRecipients(data.to),
                cc: data.cc?.length ? formatDraftRecipients(data.cc) : undefined,
                bcc: data.bcc?.length ? formatDraftRecipients(data.bcc) : undefined,
                subject: data.subject,
                message: data.message,
                attachments: [],
                id: null,
                threadId: data.threadId ?? null,
                fromEmail: null,
              });
              if (created?.error) throw new Error(`Failed to create draft: ${created.error}`);
              return { id: created?.id ?? null };
            }),
        });
        const suffix = result.deduped ? ' (idempotent: existing draft)' : '';
        return text(
          result.value.id ? `Draft created: ${result.value.id}${suffix}` : `Draft created${suffix}`,
        );
      },
    );

    // --- write: reviewable outbox (idempotent) -------------------------------
    this.server.registerTool(
      'enqueueDraftJob',
      {
        description: descriptions.enqueueDraftJob,
        inputSchema: schemas.enqueueDraftJob,
        annotations: annotations.enqueueDraftJob,
      },
      async (data) => {
        const active = await accountResolver.getActiveConnection();
        const result = await idempotency.execute({
          connectionId: active.id,
          idempotencyKey: data.idempotencyKey,
          payload: { operation: 'enqueueDraftJob', ...data, idempotencyKey: undefined },
          effect: () =>
            this.withDb(async (db) => {
              await this.getOwnedConnection(db, active.id);
              return enqueueDraftJob(db, {
                connectionId: active.id,
                threadId: data.threadId ?? null,
                mission: data.mission ?? null,
                subject: data.subject ?? null,
                body: data.body ?? null,
              });
            }),
        });
        return text(`Draft job queued: ${result.value.id}`);
      },
    );

    this.server.registerTool(
      'cancelOutboxItem',
      {
        description: descriptions.cancelOutboxItem,
        inputSchema: schemas.cancelOutboxItem,
        annotations: annotations.cancelOutboxItem,
      },
      async (s) => {
        const active = await accountResolver.getActiveConnection();
        const result = await idempotency.execute({
          connectionId: active.id,
          idempotencyKey: s.idempotencyKey,
          payload: { operation: 'cancelOutboxItem', id: s.id },
          effect: () =>
            this.withDb((db) =>
              handleCancelOutboxItem(
                {
                  getItem: (id) =>
                    getDraftOutboxItem(db, {
                      id,
                      userId: this.props.userId,
                      connectionId: active.id,
                    }),
                  cancel: (item) => cancelDraftOutboxJob(db, item),
                },
                s.id,
              ),
            ),
        });
        return text(result.value);
      },
    );

    this.server.registerTool(
      'retryOutboxItem',
      {
        description: descriptions.retryOutboxItem,
        inputSchema: schemas.retryOutboxItem,
        annotations: annotations.retryOutboxItem,
      },
      async (s) => {
        const active = await accountResolver.getActiveConnection();
        const result = await idempotency.execute({
          connectionId: active.id,
          idempotencyKey: s.idempotencyKey,
          payload: { operation: 'retryOutboxItem', id: s.id },
          effect: () =>
            this.withDb((db) =>
              handleRetryOutboxItem(
                {
                  getItem: (id) =>
                    getDraftOutboxItem(db, {
                      id,
                      userId: this.props.userId,
                      connectionId: active.id,
                    }),
                  retry: (item) => retryDraftOutboxJob(db, item),
                },
                s.id,
              ),
            ),
        });
        return text(result.value);
      },
    );

    registerDraftLoopTools(
      this.server,
      {
        getActiveConnection: () => accountResolver.getActiveConnection(),
        getThread: async (connectionId, threadId) => {
          const { stub } = await getZeroAgent(connectionId);
          const thread = await stub.getThread(threadId, false);
          return thread.messages.length ? thread : null;
        },
        getEmailAliases: async (connectionId) => {
          const { stub } = await getZeroAgent(connectionId);
          return stub.getEmailAliases();
        },
        listDrafts: async (connectionId, params) => {
          const { stub } = await getZeroAgent(connectionId);
          return stub.listDrafts(params);
        },
        getDraft: async (connectionId, draftId) => {
          const { stub } = await getZeroAgent(connectionId);
          try {
            return await stub.getDraft(draftId);
          } catch (error) {
            if (isProviderNotFound(error)) return null;
            throw new Error(`Failed to read draft ${draftId} from the active account`, {
              cause: error,
            });
          }
        },
        createDraft: async (connectionId, data) => {
          const { stub } = await getZeroAgent(connectionId);
          return stub.createDraft(data);
        },
        sanitizeMailContent,
      },
      idempotency,
    );

    logger.info('[ZeroMCP] draft-only surface registered', {
      userId: this.props.userId,
      toolCount: MCP_TOOL_DEFINITIONS.length,
    });
  }
}
