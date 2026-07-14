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
  MCP_DRAFT_NOT_FOUND,
  createDraftLoopHandlers,
  registerDraftLoopTools,
  type DraftLoopCreateData,
  type DraftLoopDependencies,
} from './mcp-draft-loop';
import {
  MCP_SERVER_INFO,
  MCP_SERVER_INSTRUCTIONS,
  PayloadBoundIdempotency,
  type AtomicIdempotencyStorage,
  type IdempotencyTransaction,
} from './mcp-tools';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { IGetThreadResponse, ParsedDraft } from '../../lib/driver/types';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sanitizeMailContent } from '../../lib/mail-sanitize';
import { describe, expect, it, vi } from 'vitest';

const { sanitizeTipTapHtml: realSanitizeTipTapHtml } = await vi.importActual<
  typeof import('../../lib/sanitize-tip-tap-html')
>('../../lib/sanitize-tip-tap-html');

vi.mock('../../lib/sanitize-tip-tap-html', () => ({
  sanitizeTipTapHtml: vi.fn(async (html: string) => ({ html, inlineImages: [] })),
}));
vi.mock('../../lib/driver/utils', () => ({
  deleteActiveConnection: vi.fn(),
  FatalErrors: [],
  fromBase64Url: (value: string) => value,
  sanitizeContext: (value: unknown) => value,
  StandardizedError: class StandardizedError extends Error {},
}));

const { OutlookMailManager } = await import('../../lib/driver/microsoft');

const memoryStorage = (): AtomicIdempotencyStorage => {
  const values = new Map<string, unknown>();
  const transaction: IdempotencyTransaction = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      values.set(key, value);
    },
  };
  return { ...transaction, transaction: async (closure) => closure(transaction) };
};

const message = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `message-${index}`,
  title: `Message ${index}`,
  subject: 'Quarterly review',
  tags: [],
  sender: { name: 'Client', email: 'client@example.com' },
  to: [
    { name: 'Thomas', email: 'thomas@devlab.io' },
    { name: 'Teammate', email: 'teammate@devlab.io' },
  ],
  cc: [{ name: 'Observer', email: 'observer@example.com' }],
  bcc: null,
  tls: true,
  receivedOn: new Date(Date.UTC(2026, 6, 14, 0, index)).toISOString(),
  unread: false,
  body: `<p>${'bounded '.repeat(900)}</p><span style="display:none">HIDDEN-SECRET</span>`,
  processedHtml: `<p>${'bounded '.repeat(900)}</p><span style="display:none">HIDDEN-SECRET</span>`,
  blobUrl: '',
  threadId: 'thread-owned',
  ...overrides,
});

const ownedThread = (): IGetThreadResponse => {
  const messages = Array.from({ length: 25 }, (_, index) => message(index));
  return {
    messages,
    latest: messages.at(-1),
    hasUnread: false,
    totalReplies: messages.length,
    labels: [{ id: 'INBOX', name: 'Inbox' }],
  } as IGetThreadResponse;
};

const fakeEnvironment = ({ normalizeProviderBodies = false } = {}) => {
  const drafts = new Map<string, ParsedDraft>();
  let nextDraft = 0;
  let createEffects = 0;
  let updateEffects = 0;
  let sendCalls = 0;
  const createdInputs: DraftLoopCreateData[] = [];
  const sanitize = vi.fn(sanitizeMailContent);

  const dependencies: DraftLoopDependencies = {
    getActiveConnection: async () => ({ id: 'connection-owned', email: 'thomas@devlab.io' }),
    getThread: async (_connectionId, threadId) =>
      threadId === 'thread-owned' ? ownedThread() : null,
    getEmailAliases: async () => [
      { email: 'thomas@devlab.io', primary: true },
      { email: 'alias@devlab.io' },
    ],
    listDrafts: async (_connectionId, params) => ({
      threads: [...drafts.values()].slice(0, params.maxResults).map((draft) => ({
        id: draft.id,
        historyId: null,
        $raw: {
          id: draft.id,
          threadId: (draft.rawMessage as { threadId?: string } | undefined)?.threadId,
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
        },
      })),
      nextPageToken: null,
    }),
    getDraft: async (_connectionId, draftId) => drafts.get(draftId) ?? null,
    createDraft: async (_connectionId, data) => {
      createdInputs.push(structuredClone(data));
      const persistedMessage = normalizeProviderBodies
        ? (await realSanitizeTipTapHtml(data.message)).html
        : data.message;
      if (data.id) {
        updateEffects += 1;
        const current = drafts.get(data.id);
        if (!current) return { error: 'not found' };
        drafts.set(data.id, {
          ...current,
          to: [data.to],
          cc: data.cc ? [data.cc] : [],
          bcc: data.bcc ? [data.bcc] : [],
          subject: data.subject,
          content: persistedMessage,
          rawMessage: { threadId: data.threadId } as unknown as ParsedDraft['rawMessage'],
        });
        return { id: data.id, success: true };
      }
      createEffects += 1;
      const id = `provider-draft-${++nextDraft}`;
      drafts.set(id, {
        id,
        to: [data.to],
        cc: data.cc ? [data.cc] : [],
        bcc: data.bcc ? [data.bcc] : [],
        subject: data.subject,
        content: persistedMessage,
        rawMessage: { threadId: data.threadId } as unknown as ParsedDraft['rawMessage'],
      });
      return { id, success: true };
    },
    sanitizeMailContent: sanitize,
  };

  return {
    dependencies,
    drafts,
    createdInputs,
    sanitize,
    get createEffects() {
      return createEffects;
    },
    get updateEffects() {
      return updateEffects;
    },
    get sendCalls() {
      return sendCalls;
    },
    observeSend() {
      sendCalls += 1;
    },
  };
};

const mcpRequest = async (
  transport: WebStandardStreamableHTTPServerTransport,
  body: Record<string, unknown>,
  sessionId?: string,
) => {
  const response = await transport.handleRequest(
    new Request('http://zero.test/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const responseText = await response.text();
  return { response, body: responseText ? JSON.parse(responseText) : null };
};

const toolResult = (response: { body: unknown }) => {
  const body = response.body as {
    result: { content: Array<{ type: string; text: string }>; isError?: boolean };
  };
  return {
    isError: body.result.isError === true,
    text: body.result.content[0]?.text ?? '',
  };
};

describe('revisable draft handlers', () => {
  it('sanitizes every returned body and bounds context to 20 messages / 64 KiB', async () => {
    const environment = fakeEnvironment();
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    const context = await handlers.getThreadContext({ threadId: 'thread-owned' });
    expect(typeof context).not.toBe('string');
    if (typeof context === 'string') return;
    expect(context.messages.length).toBeGreaterThan(0);
    expect(context.messages.length).toBeLessThanOrEqual(20);
    expect(context.totalTextBytes).toBeLessThanOrEqual(64 * 1024);
    expect(context.truncated).toBe(true);
    expect(environment.sanitize).toHaveBeenCalledTimes(context.messages.length);
    for (const item of context.messages) {
      expect(item.text).toContain('[UNTRUSTED EMAIL CONTENT - SANITIZED]');
      expect(item.text).not.toContain('HIDDEN-SECRET');
      expect(item).not.toHaveProperty('attachments');
      expect(item).not.toHaveProperty('headers');
    }
  });

  it('keeps the 64 KiB text bound when truncation crosses a multibyte character', async () => {
    const environment = fakeEnvironment();
    environment.dependencies.getThread = async () => {
      const unicodeMessage = message(1, {
        body: `<p>${'🧭'.repeat(40_000)}</p>`,
        processedHtml: `<p>${'🧭'.repeat(40_000)}</p>`,
      });
      return {
        messages: [unicodeMessage],
        latest: unicodeMessage,
        hasUnread: false,
        totalReplies: 1,
        labels: [],
      } as IGetThreadResponse;
    };
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    const context = await handlers.getThreadContext({ threadId: 'thread-owned' });
    expect(typeof context).not.toBe('string');
    if (typeof context === 'string') return;
    expect(context.totalTextBytes).toBeLessThanOrEqual(64 * 1024);
    expect(new TextEncoder().encode(context.messages[0]?.text ?? '').byteLength).toBe(
      context.totalTextBytes,
    );
    expect(context.truncated).toBe(true);
  });

  it('creates one server-derived effect for 20 concurrent calls and conflicts before mutation', async () => {
    const environment = fakeEnvironment();
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    const input = {
      threadId: 'thread-owned',
      message: 'First reply body',
      idempotencyKey: 'reply-key',
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => handlers.createReplyDraft(input)),
    );
    expect(environment.createEffects).toBe(1);
    expect(new Set(results.map((result) => result.value.id))).toEqual(
      new Set(['provider-draft-1']),
    );
    expect(results.filter((result) => result.deduped)).toHaveLength(19);
    expect(environment.createdInputs[0]).toMatchObject({
      to: 'client@example.com',
      cc: 'teammate@devlab.io, observer@example.com',
      subject: 'Re: Quarterly review',
      threadId: 'thread-owned',
      replyToMessageId: 'message-24',
      id: null,
    });
    await expect(
      handlers.createReplyDraft({ ...input, message: 'Changed payload' }),
    ).rejects.toThrow('different payload');
    expect(environment.createEffects).toBe(1);
  });

  it('keeps the same draft id, deduplicates 20 updates, and rejects stale revisions unchanged', async () => {
    const environment = fakeEnvironment();
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    const created = await handlers.createReplyDraft({
      threadId: 'thread-owned',
      message: 'Initial body',
      idempotencyKey: 'create-key',
    });
    const current = await handlers.getDraft({ draftId: created.value.id });
    expect(typeof current).not.toBe('string');
    if (typeof current === 'string') return;
    const updateInput = {
      draftId: current.id,
      revision: current.revision,
      message: 'Revised body',
      idempotencyKey: 'update-key',
    };
    const updates = await Promise.all(
      Array.from({ length: 20 }, () => handlers.updateDraft(updateInput)),
    );
    expect(environment.updateEffects).toBe(1);
    expect(new Set(updates.map((result) => result.value.id))).toEqual(new Set([current.id]));
    expect(updates.filter((result) => result.deduped)).toHaveLength(19);
    const mutationsBeforeStale = environment.updateEffects;
    await expect(
      handlers.updateDraft({
        ...updateInput,
        message: 'Must not overwrite',
        idempotencyKey: 'stale-key',
      }),
    ).rejects.toThrow('revision is stale');
    expect(environment.updateEffects).toBe(mutationsBeforeStale);
    expect(environment.drafts.get(current.id)?.content).toBe('Revised body');
  });

  it('accepts provider-normalized HTML across create, get, and same-id update', async () => {
    const environment = fakeEnvironment({ normalizeProviderBodies: true });
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    const created = await handlers.createReplyDraft({
      threadId: 'thread-owned',
      message: '<p>Initial normalized body</p>',
      idempotencyKey: 'normalized-create-key',
    });
    const current = await handlers.getDraft({ draftId: created.value.id });
    expect(typeof current).not.toBe('string');
    if (typeof current === 'string') return;
    expect(current.message).toContain('<!DOCTYPE html');

    const updated = await handlers.updateDraft({
      draftId: current.id,
      revision: current.revision,
      message: '<p>Revised normalized body</p>',
      idempotencyKey: 'normalized-update-key',
    });

    expect(updated.value.id).toBe(current.id);
    expect(updated.value.message).toContain('<!DOCTYPE html');
    expect(sanitizeMailContent(updated.value.message).text).toBe(
      sanitizeMailContent('<p>Revised normalized body</p>').text,
    );
    expect(updated.value.revision).not.toBe(current.revision);
    expect(environment.createEffects).toBe(1);
    expect(environment.updateEffects).toBe(1);
    expect(environment.sendCalls).toBe(0);
  });

  it('lists only bounded draft projections without bodies, revisions, or raw provider data', async () => {
    const environment = fakeEnvironment();
    for (let index = 0; index < 55; index += 1) {
      environment.drafts.set(`draft-${index}`, {
        id: `draft-${index}`,
        to: ['client@example.com'],
        cc: [],
        bcc: [],
        subject: `Draft ${index}`,
        content: `private body ${index}`,
        rawMessage: { threadId: `thread-${index}` } as unknown as ParsedDraft['rawMessage'],
      });
    }
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    const result = await handlers.listDrafts({ maxResults: 20 });
    expect(result.drafts).toHaveLength(20);
    for (const draft of result.drafts) {
      expect(draft).not.toHaveProperty('message');
      expect(draft).not.toHaveProperty('revision');
      expect(draft).not.toHaveProperty('rawMessage');
      expect(draft).not.toHaveProperty('attachments');
    }
  });

  it('makes missing and other-user draft ids indistinguishable', async () => {
    const environment = fakeEnvironment();
    const handlers = createDraftLoopHandlers(
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    expect(await handlers.getDraft({ draftId: 'missing' })).toBe(MCP_DRAFT_NOT_FOUND);
    expect(await handlers.getDraft({ draftId: 'other-user-draft' })).toBe(MCP_DRAFT_NOT_FOUND);
  });
});

describe('Outlook reply-draft provider seam', () => {
  const makeManager = () => {
    const calls: Array<{ path: string; operation: 'post' | 'patch'; body: unknown }> = [];
    const manager = new OutlookMailManager({
      auth: {
        userId: 'user-owned',
        accessToken: 'unused-test-token',
        refreshToken: 'unused-test-refresh',
        email: 'thomas@devlab.io',
      },
    });
    const graphClient = {
      api: (path: string) => ({
        post: async (body: unknown) => {
          calls.push({ path, operation: 'post', body });
          if (path.endsWith('/createReply')) return { id: 'outlook-reply-draft' };
          return { id: 'generic-draft' };
        },
        patch: async (body: unknown) => {
          calls.push({ path, operation: 'patch', body });
          const id = path.split('/').at(-1);
          return { id };
        },
      }),
    };
    Object.assign(manager, { graphClient });
    return { manager, calls };
  };

  it('uses Graph createReply then patches that exact unsent draft', async () => {
    const { manager, calls } = makeManager();
    const result = await manager.createDraft({
      to: 'client@example.com',
      cc: 'observer@example.com',
      subject: 'Re: Quarterly review',
      message: '<p>Server-derived reply</p>',
      attachments: [],
      id: null,
      threadId: 'outlook-conversation',
      replyToMessageId: 'outlook-message-owned',
      fromEmail: null,
    } as Parameters<typeof manager.createDraft>[0] & { replyToMessageId: string });

    expect(calls.map(({ path, operation }) => `${operation} ${path}`)).toEqual([
      'post /me/messages/outlook-message-owned/createReply',
      'patch /me/messages/outlook-reply-draft',
    ]);
    expect(result.id).toBe('outlook-reply-draft');
  });

  it('updates an existing Outlook draft in place without delete/recreate fallback', async () => {
    const { manager, calls } = makeManager();
    const result = await manager.createDraft({
      to: 'client@example.com',
      subject: 'Re: Quarterly review',
      message: '<p>Revised body</p>',
      attachments: [],
      id: 'outlook-existing-draft',
      threadId: 'outlook-conversation',
      fromEmail: null,
    });

    expect(calls.map(({ path, operation }) => `${operation} ${path}`)).toEqual([
      'patch /me/mailfolders/drafts/messages/outlook-existing-draft',
    ]);
    expect(result.id).toBe('outlook-existing-draft');
  });
});

describe('in-process Streamable HTTP MCP smoke', () => {
  it('initializes, lists, reads, creates, gets, and updates without a send effect', async () => {
    const environment = fakeEnvironment();
    const server = new McpServer(MCP_SERVER_INFO, { instructions: MCP_SERVER_INSTRUCTIONS });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => 'smoke-session',
      enableJsonResponse: true,
    });
    registerDraftLoopTools(
      server,
      environment.dependencies,
      new PayloadBoundIdempotency(memoryStorage()),
    );
    await server.connect(transport);

    const initialized = await mcpRequest(transport, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'zero-local-smoke', version: '1.0.0' },
      },
    });
    expect(initialized.response.status).toBe(200);
    expect(initialized.body).toMatchObject({
      result: { serverInfo: MCP_SERVER_INFO, instructions: MCP_SERVER_INSTRUCTIONS },
    });
    const sessionId = initialized.response.headers.get('mcp-session-id');
    expect(sessionId).toBe('smoke-session');
    await mcpRequest(
      transport,
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
      sessionId!,
    );

    const listed = await mcpRequest(
      transport,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
      sessionId!,
    );
    const tools = (listed.body as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      'getThreadContext',
      'createReplyDraft',
      'listDrafts',
      'getDraft',
      'updateDraft',
    ]);
    for (const forbidden of [
      'sendEmail',
      'sendDraft',
      'approveDraft',
      'deleteDraft',
      'markAsSpam',
      'updateSettings',
    ]) {
      expect(tools.some((tool) => tool.name === forbidden)).toBe(false);
    }

    const contextResponse = await mcpRequest(
      transport,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'getThreadContext', arguments: { threadId: 'thread-owned' } },
      },
      sessionId!,
    );
    const context = JSON.parse(toolResult(contextResponse).text);
    expect(context.messages.length).toBeLessThanOrEqual(20);
    expect(context.totalTextBytes).toBeLessThanOrEqual(64 * 1024);

    const createResponse = await mcpRequest(
      transport,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'createReplyDraft',
          arguments: {
            threadId: 'thread-owned',
            message: 'Initial HTTP smoke body',
            idempotencyKey: 'http-create',
          },
        },
      },
      sessionId!,
    );
    const created = JSON.parse(toolResult(createResponse).text);
    expect(environment.createdInputs[0]).toMatchObject({
      threadId: 'thread-owned',
      replyToMessageId: 'message-24',
      subject: 'Re: Quarterly review',
    });

    const getResponse = await mcpRequest(
      transport,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'getDraft', arguments: { draftId: created.id } },
      },
      sessionId!,
    );
    const fetched = JSON.parse(toolResult(getResponse).text);

    const updateResponse = await mcpRequest(
      transport,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'updateDraft',
          arguments: {
            draftId: fetched.id,
            revision: fetched.revision,
            message: 'Revised HTTP smoke body',
            idempotencyKey: 'http-update',
          },
        },
      },
      sessionId!,
    );
    const updatedResult = toolResult(updateResponse);
    expect(updatedResult.isError).toBe(false);
    const updated = JSON.parse(updatedResult.text);
    expect(updated.id).toBe(created.id);
    expect(updated.message).toBe('Revised HTTP smoke body');
    expect(environment.createEffects).toBe(1);
    expect(environment.updateEffects).toBe(1);
    expect(environment.sendCalls).toBe(0);

    await server.close();
  });
});
