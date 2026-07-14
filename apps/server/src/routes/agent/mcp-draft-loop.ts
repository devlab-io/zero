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
  createReplyDraftInputSchema,
  mcpToolAnnotations as annotations,
  mcpToolDescriptions as descriptions,
  mcpToolSchemas as schemas,
  updateDraftInputSchema,
  type PayloadBoundIdempotency,
} from './mcp-tools';
import {
  assertCurrentRevision,
  buildAgentThreadContext,
  deriveReplyMetadata,
  projectDraftListItem,
  projectOwnedDraft,
  type AgentDraftProjection,
} from '../../lib/driver/agent-drafts';
import type { IGetThreadResponse, ParsedDraft } from '../../lib/driver/types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const MCP_DRAFT_NOT_FOUND = 'Draft not found';
export const MCP_THREAD_NOT_FOUND = 'Thread not found';

export type DraftLoopCreateData = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  message: string;
  attachments: [];
  id: string | null;
  threadId: string | null;
  replyToMessageId?: string;
  fromEmail: null;
};

export interface DraftLoopDependencies {
  getActiveConnection: () => Promise<{ id: string; email: string }>;
  getThread: (connectionId: string, threadId: string) => Promise<IGetThreadResponse | null>;
  getEmailAliases: (
    connectionId: string,
  ) => Promise<Array<{ email: string; name?: string; primary?: boolean }>>;
  listDrafts: (
    connectionId: string,
    params: { maxResults: number },
  ) => Promise<{
    threads: Array<{ id: string; historyId: string | null; $raw?: unknown }>;
    nextPageToken: string | null;
  }>;
  getDraft: (connectionId: string, draftId: string) => Promise<ParsedDraft | null>;
  createDraft: (
    connectionId: string,
    data: DraftLoopCreateData,
  ) => Promise<{ id?: string | null; success?: boolean; error?: string }>;
  sanitizeMailContent: (content: string | null | undefined) => { text: string };
}

const formatRecipients = (recipients: Array<{ email: string; name?: string }>) =>
  recipients.map((recipient) => recipient.email).join(', ');

const text = (value: unknown) => ({
  content: [
    { type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) },
  ],
});

const getOwnedDraft = async (
  dependencies: DraftLoopDependencies,
  connectionId: string,
  draftId: string,
): Promise<AgentDraftProjection | null> => {
  const draft = await dependencies.getDraft(connectionId, draftId);
  if (!draft || draft.id !== draftId) return null;
  return projectOwnedDraft(connectionId, draft);
};

export const createDraftLoopHandlers = (
  dependencies: DraftLoopDependencies,
  idempotency: PayloadBoundIdempotency,
) => ({
  getThreadContext: async (input: { threadId: string }) => {
    const active = await dependencies.getActiveConnection();
    const thread = await dependencies.getThread(active.id, input.threadId);
    if (!thread?.messages.length) return MCP_THREAD_NOT_FOUND;
    return buildAgentThreadContext(input.threadId, thread, dependencies.sanitizeMailContent);
  },

  createReplyDraft: async (input: {
    threadId: string;
    message: string;
    idempotencyKey: string;
  }) => {
    const active = await dependencies.getActiveConnection();
    return idempotency.execute({
      connectionId: active.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        operation: 'createReplyDraft',
        threadId: input.threadId,
        message: input.message,
      },
      effect: async () => {
        const thread = await dependencies.getThread(active.id, input.threadId);
        if (!thread?.messages.length) throw new Error(MCP_THREAD_NOT_FOUND);
        const aliases = await dependencies.getEmailAliases(active.id);
        const metadata = deriveReplyMetadata(input.threadId, thread, [
          active.email,
          ...aliases.map((alias) => alias.email),
        ]);
        const created = await dependencies.createDraft(active.id, {
          to: formatRecipients(metadata.to),
          cc: metadata.cc.length ? formatRecipients(metadata.cc) : undefined,
          subject: metadata.subject,
          message: input.message,
          attachments: [],
          id: null,
          threadId: metadata.threadId,
          replyToMessageId: metadata.replyToMessageId,
          fromEmail: null,
        });
        if (created.error)
          throw new Error(`Provider failed to create reply draft: ${created.error}`);
        if (!created.id) throw new Error('Provider created a reply draft without returning its id');
        return { id: created.id, ...metadata };
      },
    });
  },

  listDrafts: async (input: { maxResults: number }) => {
    const active = await dependencies.getActiveConnection();
    const result = await dependencies.listDrafts(active.id, {
      maxResults: input.maxResults,
    });
    return {
      drafts: result.threads
        .slice(0, input.maxResults)
        .map((item) => projectDraftListItem(item.$raw, item.id)),
    };
  },

  getDraft: async (input: { draftId: string }) => {
    const active = await dependencies.getActiveConnection();
    return (await getOwnedDraft(dependencies, active.id, input.draftId)) ?? MCP_DRAFT_NOT_FOUND;
  },

  updateDraft: async (input: {
    draftId: string;
    revision: string;
    message: string;
    idempotencyKey: string;
  }) => {
    const active = await dependencies.getActiveConnection();
    return idempotency.execute({
      connectionId: active.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        operation: 'updateDraft',
        draftId: input.draftId,
        revision: input.revision,
        message: input.message,
      },
      effect: async () => {
        const current = await getOwnedDraft(dependencies, active.id, input.draftId);
        if (!current) throw new Error(MCP_DRAFT_NOT_FOUND);
        assertCurrentRevision(current, input.revision);
        const updated = await dependencies.createDraft(active.id, {
          to: formatRecipients(current.to),
          cc: current.cc.length ? formatRecipients(current.cc) : undefined,
          bcc: current.bcc.length ? formatRecipients(current.bcc) : undefined,
          subject: current.subject,
          message: input.message,
          attachments: [],
          id: current.id,
          threadId: current.threadId,
          fromEmail: null,
        });
        if (updated.error)
          throw new Error(`Provider failed to update draft ${current.id}: ${updated.error}`);
        if (updated.id && updated.id !== current.id) {
          throw new Error(`Provider changed draft id during update: expected ${current.id}`);
        }
        const verified = await getOwnedDraft(dependencies, active.id, current.id);
        if (!verified) throw new Error(`Provider did not return updated draft ${current.id}`);
        if (verified.message !== input.message) {
          throw new Error(`Provider did not persist the requested body for draft ${current.id}`);
        }
        return verified;
      },
    });
  },
});

export const registerDraftLoopTools = (
  server: McpServer,
  dependencies: DraftLoopDependencies,
  idempotency: PayloadBoundIdempotency,
) => {
  const handlers = createDraftLoopHandlers(dependencies, idempotency);

  server.registerTool(
    'getThreadContext',
    {
      description: descriptions.getThreadContext,
      inputSchema: schemas.getThreadContext,
      annotations: annotations.getThreadContext,
    },
    async (input) => text(await handlers.getThreadContext(input)),
  );
  server.registerTool(
    'createReplyDraft',
    {
      description: descriptions.createReplyDraft,
      inputSchema: createReplyDraftInputSchema,
      annotations: annotations.createReplyDraft,
    },
    async (input) => text((await handlers.createReplyDraft(input)).value),
  );
  server.registerTool(
    'listDrafts',
    {
      description: descriptions.listDrafts,
      inputSchema: schemas.listDrafts,
      annotations: annotations.listDrafts,
    },
    async (input) => text(await handlers.listDrafts(input)),
  );
  server.registerTool(
    'getDraft',
    {
      description: descriptions.getDraft,
      inputSchema: schemas.getDraft,
      annotations: annotations.getDraft,
    },
    async (input) => text(await handlers.getDraft(input)),
  );
  server.registerTool(
    'updateDraft',
    {
      description: descriptions.updateDraft,
      inputSchema: updateDraftInputSchema,
      annotations: annotations.updateDraft,
    },
    async (input) => text((await handlers.updateDraft(input)).value),
  );

  return handlers;
};
