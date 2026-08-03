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
  buildCitationResources,
  buildDraftPreviewObject,
  buildThreadCitations,
  citationResourceUri,
  draftPreviewOutputSchema,
  formatCompactThreadList,
  formatOutboxItem,
  formatSender,
  handleCancelOutboxItem,
  enqueueConfirmedStoredDraft,
  handleRetryOutboxItem,
  handleSendConfirmedDraft,
  handleUpdateDraft,
  mcpToolDescriptions as descriptions,
  mcpToolSchemas as schemas,
  threadCitationsOutputSchema,
  DRAFT_NOT_FOUND_MESSAGE,
  MCP_SERVER_INFO,
  MCP_TOOL_DEFINITIONS,
  resolveIdempotentDraft,
  type CreateDraftResult,
  type DraftIdempotencyStore,
  type PreviewableDraft,
  type SendElicitOutcome,
} from './mcp-tools';
import {
  cancelDraftOutboxJob,
  enqueueDraftJob,
  getDraftOutboxItem,
  listDraftOutboxItems,
  retryDraftOutboxJob,
} from '../../lib/draft-outbox';
import { createSendJob, markSendJobEnqueued } from '../../lib/send-outbox';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getThread, getZeroAgent } from '../../lib/server-utils';
import { sanitizeMailContent } from '../../lib/mail-sanitize';
import { composeEmail } from '../../trpc/routes/ai/compose';
import { runMcpDbOpWithFreshDb } from './mcp-db-operation';
import { getCurrentDateContext } from '../../lib/prompts';
import type { ThreadsResponse } from '@zero/types';
import { invariant } from '../../lib/invariant';
import { connection } from '../../db/schema';
import { logger } from '../../lib/logger';
import { env } from 'cloudflare:workers';
import { eq, and } from 'drizzle-orm';
import { McpAgent } from 'agents/mcp';
import type { DB } from '../../db';
import z from 'zod';

type DraftRecipient = z.infer<typeof schemas.createDraft.to.element>;

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
    description:
      'Zero draft-first mail MCP (one elicitation-gated stored-draft send; no delete, spam or account-settings surface)',
  });

  activeConnectionId: string | undefined;

  /**
   * Every mailbox handler must CAPTURE `this.activeConnectionId` once at entry
   * and resolve its agent from that captured id. A stub captured at init()
   * stays bound to the first connection after setActiveConnection; and reading
   * `this.activeConnectionId` twice inside one handler can straddle a
   * concurrent switch — id and agent would then disagree mid-operation.
   */
  private async agentFor(connectionId: string | undefined) {
    invariant(connectionId, 'No active connection');
    const { stub } = await getZeroAgent(connectionId);
    return stub;
  }

  private async dbOp<T>(operation: (db: DB) => Promise<T>): Promise<T> {
    return await runMcpDbOpWithFreshDb(env.HYPERDRIVE.connectionString, operation);
  }

  /** In-flight createDraft tasks per idempotency storage key (atomic dedupe). */
  private draftCreationsInFlight = new Map<string, Promise<CreateDraftResult>>();

  async init(): Promise<void> {
    if (!this.props.userId) return;
    const _connection = await this.dbOp((db) =>
      db.query.connection.findFirst({
        where: eq(connection.userId, this.props.userId),
      }),
    );
    if (!_connection) {
      throw new Error('Unauthorized');
    }
    this.activeConnectionId = _connection.id;

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
      {
        description: descriptions.getServerCapabilities,
        inputSchema: schemas.getServerCapabilities,
      },
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
        const connections = await this.dbOp((db) =>
          db.query.connection.findMany({
            where: eq(connection.userId, this.props.userId),
          }),
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
      { description: descriptions.getActiveConnection, inputSchema: schemas.getActiveConnection },
      async () => {
        if (!this.activeConnectionId) {
          throw new Error('No active connection');
        }
        const activeConnectionId = this.activeConnectionId;
        const active = await this.dbOp((db) =>
          db.query.connection.findFirst({
            where: eq(connection.id, activeConnectionId),
          }),
        );
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
        const owned = await this.dbOp((db) =>
          db.query.connection.findFirst({
            where: and(eq(connection.userId, this.props.userId), eq(connection.email, s.email)),
          }),
        );
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
        const agent = await this.agentFor(this.activeConnectionId);
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
        const agent = await this.agentFor(this.activeConnectionId);
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
        const connectionId = this.activeConnectionId;
        invariant(connectionId, 'no active connection');
        const { result: thread } = await getThread(connectionId, s.threadId);
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
      { description: descriptions.getThreadSummary, inputSchema: schemas.getThreadSummary },
      async (s) => {
        // Captured ONCE before any await: a concurrent setActiveConnection must
        // not make the read and the ownership comparison disagree mid-handler.
        const connectionId = this.activeConnectionId;
        if (!connectionId) {
          return text('No active connection');
        }
        const response = await env.VECTORIZE.getByIds([s.id]);
        const { result: thread } = await getThread(connectionId, s.id);
        if (response.length && response?.[0]?.metadata?.['summary'] && thread?.latest?.subject) {
          const result = response[0].metadata as { summary: string; connection: string };
          if (result.connection !== connectionId) {
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
        const agent = await this.agentFor(this.activeConnectionId);
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
      { description: descriptions.getLabel, inputSchema: schemas.getLabel },
      async (s) => {
        const agent = await this.agentFor(this.activeConnectionId);
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
        const items = await this.dbOp((db) =>
          listDraftOutboxItems(db, {
            userId: this.props.userId,
            status: s.status,
          }),
        );
        if (!items.length) return text('No outbox items');
        return text(items.map(formatOutboxItem).join('\n'));
      },
    );

    this.server.registerTool(
      'getOutboxItem',
      { description: descriptions.getOutboxItem, inputSchema: schemas.getOutboxItem },
      async (s) => {
        const item = await this.dbOp((db) =>
          getDraftOutboxItem(db, { id: s.id, userId: this.props.userId }),
        );
        // Missing OR other-user ids share one identical message — existence is never revealed.
        return text(item ? formatOutboxItem(item) : 'Outbox item not found');
      },
    );

    // --- write: draft (idempotent) -------------------------------------------
    this.server.registerTool(
      'createDraft',
      { description: descriptions.createDraft, inputSchema: schemas.createDraft },
      async (data) => {
        // Captured ONCE: the idempotency scope and the draft target must be the
        // same connection even if setActiveConnection runs mid-flight.
        const connectionId = this.activeConnectionId;
        if (!connectionId) {
          throw new Error('No active connection');
        }
        const result = await resolveIdempotentDraft(
          connectionId,
          data.idempotencyKey,
          draftIdempotencyStore,
          async () =>
            (await this.agentFor(connectionId)).createDraft({
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
          this.draftCreationsInFlight,
        );
        const suffix = result.deduped ? ' (idempotent: existing draft)' : '';
        return text(result.id ? `Draft created: ${result.id}${suffix}` : `Draft created${suffix}`);
      },
    );

    // --- read: draft preview (P9 API-first, structured output) ---------------
    this.server.registerTool(
      'previewDraft',
      {
        description: descriptions.previewDraft,
        inputSchema: schemas.previewDraft,
        outputSchema: draftPreviewOutputSchema,
      },
      async (s) => {
        const connectionId = this.activeConnectionId;
        if (!connectionId) {
          throw new Error('No active connection');
        }
        // Le stub agent est scopé à LA connexion active de CET utilisateur :
        // un draftId d'un autre compte échoue côté fournisseur → not-found
        // uniforme, l'existence n'est jamais révélée.
        const draft = await (await this.agentFor(connectionId))
          .getDraft(s.draftId)
          .catch(() => null);
        if (!draft) {
          return {
            content: [{ type: 'text' as const, text: DRAFT_NOT_FOUND_MESSAGE }],
            isError: true,
          };
        }
        const structured = buildDraftPreviewObject(draft as PreviewableDraft);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
          structuredContent: structured,
        };
      },
    );

    // --- write: THE ONLY send-capable tool (P9 élargi, elicitation) ----------
    this.server.registerTool(
      'sendConfirmedDraft',
      { description: descriptions.sendConfirmedDraft, inputSchema: schemas.sendConfirmedDraft },
      async (s) => {
        // Capturé UNE fois : preview, elicitation et enqueue frappent la même
        // connexion même si setActiveConnection court pendant le handler.
        const connectionId = this.activeConnectionId;
        if (!connectionId) {
          return text('No active connection');
        }
        const agent = await this.agentFor(connectionId);
        const message = await handleSendConfirmedDraft(
          {
            getDraft: async (draftId) =>
              ((await agent.getDraft(draftId).catch(() => null)) as PreviewableDraft | null) ??
              null,
            // Le SDK lève si le client ne déclare pas la capability
            // elicitation — handleSendConfirmedDraft traduit en fail-closed.
            elicit: async (params) =>
              (await this.server.server.elicitInput(params)) as SendElicitOutcome,
            enqueueSend: async (input) => {
              // Outbox durable UNIQUEMENT — jamais d'appel fournisseur direct.
              // Le consumer délivrera via sendStoredDraft (brouillon tel que
              // stocké : PJ/threading/signature préservés).
              return await this.dbOp((db) =>
                enqueueConfirmedStoredDraft({
                  createJob: () =>
                    createSendJob(db, {
                      connectionId,
                      clientSubmissionKey: input.clientSubmissionKey,
                      payload: {
                        draftId: input.draftId,
                        sendAsStored: true,
                        to: [],
                        subject: input.subject,
                        message: '',
                      },
                      threadId: null,
                      scheduledSendAt: null,
                    }),
                  publish: (jobId) =>
                    env.send_email_queue.send(
                      { messageId: jobId, jobId, connectionId },
                      { delaySeconds: 0 },
                    ),
                  markEnqueued: (jobId) => markSendJobEnqueued(db, jobId),
                }),
              );
            },
            audit: (event) =>
              logger.info('[mcp] sendConfirmedDraft audit', {
                userId: this.props.userId,
                connectionId,
                draftId: event.draftId,
                outcome: event.outcome,
              }),
          },
          { draftId: s.draftId },
        );
        return text(message);
      },
    );

    // --- write: draft update in place (P9, idempotent) -----------------------
    this.server.registerTool(
      'updateDraft',
      { description: descriptions.updateDraft, inputSchema: schemas.updateDraft },
      async (s) => {
        // Capturé UNE fois : lecture et écriture frappent la même connexion
        // même si setActiveConnection court pendant le handler.
        const connectionId = this.activeConnectionId;
        if (!connectionId) {
          return text('No active connection');
        }
        const agent = await this.agentFor(connectionId);
        const message = await handleUpdateDraft(
          {
            getDraft: async (draftId) =>
              ((await agent.getDraft(draftId).catch(() => null)) as PreviewableDraft | null) ??
              null,
            saveDraft: async (data) =>
              (await agent.createDraft({
                to: data.to,
                cc: data.cc,
                bcc: data.bcc,
                subject: data.subject,
                message: data.message,
                attachments: [],
                id: data.id,
                threadId: data.threadId,
                fromEmail: null,
              })) as { id?: string | null },
          },
          {
            draftId: s.draftId,
            to: s.to,
            cc: s.cc,
            bcc: s.bcc,
            subject: s.subject,
            message: s.message,
            threadId: s.threadId,
          },
        );
        return text(message);
      },
    );

    // --- read: structured citations + embedded resources (P9, SDK 1.29) ------
    this.server.registerTool(
      'getThreadCitations',
      {
        description: descriptions.getThreadCitations,
        inputSchema: schemas.getThreadCitations,
        outputSchema: threadCitationsOutputSchema,
      },
      async (s) => {
        // L'ACL s'applique AU READ : getThread ne lit que la connexion active
        // de CET utilisateur — les ressources embarquées en héritent.
        const connectionId = this.activeConnectionId;
        if (!connectionId) {
          throw new Error('No active connection');
        }
        const { result: thread } = await getThread(connectionId, s.threadId);
        const citations = buildThreadCitations(
          s.threadId,
          thread.messages.map((message) => ({
            id: message.id,
            sender: message.sender,
            receivedOn: message.receivedOn,
            subject: message.subject,
            decodedBody: message.decodedBody,
            body: message.body,
          })),
          s.maxCitations ?? 3,
        );
        const structured = {
          threadId: s.threadId,
          citations: citations.map((citation) => ({
            ...citation,
            resourceUri: citationResourceUri(citation),
          })),
        };
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(structured) },
            // Aperçus EMBARQUÉS : une ressource text/plain exacte par message
            // cité (uri mail://thread/…/message/…#quote).
            ...buildCitationResources(citations),
          ],
          structuredContent: structured,
        };
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
        const connectionId = this.activeConnectionId;
        const queued = await this.dbOp((db) =>
          enqueueDraftJob(db, {
            connectionId,
            threadId: data.threadId ?? null,
            mission: data.mission ?? null,
            subject: data.subject ?? null,
            body: data.body ?? null,
          }),
        );
        return text(`Draft job queued: ${queued.id}`);
      },
    );

    this.server.registerTool(
      'cancelOutboxItem',
      { description: descriptions.cancelOutboxItem, inputSchema: schemas.cancelOutboxItem },
      async (s) => {
        const message = await this.dbOp((db) =>
          handleCancelOutboxItem(
            {
              getItem: (id) => getDraftOutboxItem(db, { id, userId: this.props.userId }),
              cancel: (item) => cancelDraftOutboxJob(db, item),
            },
            s.id,
          ),
        );
        return text(message);
      },
    );

    this.server.registerTool(
      'retryOutboxItem',
      { description: descriptions.retryOutboxItem, inputSchema: schemas.retryOutboxItem },
      async (s) => {
        const message = await this.dbOp((db) =>
          handleRetryOutboxItem(
            {
              getItem: (id) => getDraftOutboxItem(db, { id, userId: this.props.userId }),
              retry: (item) => retryDraftOutboxJob(db, item),
            },
            s.id,
          ),
        );
        return text(message);
      },
    );

    logger.info('[ZeroMCP] draft-first, elicitation-gated surface registered', {
      userId: this.props.userId,
      toolCount: MCP_TOOL_DEFINITIONS.length,
    });
  }
}
