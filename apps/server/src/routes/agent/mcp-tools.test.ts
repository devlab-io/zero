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

/**
 * Focused proofs for the draft-only "Claude and Codex API" MCP surface.
 *
 * Runs in Node (no DO / SQLite / workers): every handler here is dependency-injected, so
 * the read-only + draft-only paths are exercised against fakes with zero send capability.
 * Runs in Node with dependency-injected handlers and no provider or production writes.
 */

import {
  MCP_TOOL_DEFINITIONS,
  MCP_SEND_GUARANTEES,
  OUTBOX_NOT_FOUND,
  buildCapabilities,
  buildMcpSchemaSnapshot,
  createDraftInputSchema,
  formatCompactThread,
  formatCompactThreadList,
  formatOutboxItem,
  formatSender,
  handleCancelOutboxItem,
  handleInspectOutboxItem,
  handleRetryOutboxItem,
  jsonSchemaForShape,
  mcpToolSchemas,
} from './mcp-tools';
import type { DraftOutboxItem, DraftOutboxStatus } from '../../lib/draft-outbox/state-machine';
import type { ThreadsResponse } from '@zero/types';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const seedItem = (status: DraftOutboxStatus): DraftOutboxItem => ({
  id: 'outbox-1',
  connectionId: 'conn-1',
  threadId: 'thread-1',
  mission: 'Répondre à la relance facture',
  status,
  gmailDraftId: status === 'draft_ready' || status === 'approved' ? 'gdraft-1' : null,
  subject: 'Re: Facture 2026-07',
  body: 'Ia ora na, ...',
  idempotencyKey: 'idem-1',
  scheduledSendAt: null,
  error: status === 'failed' ? 'Gmail rate limited' : null,
  createdAt: new Date('2026-07-13T00:00:00.000Z'),
  updatedAt: new Date('2026-07-13T00:00:00.000Z'),
});

function statefulOutbox(seed: DraftOutboxItem) {
  let current: DraftOutboxItem = seed;
  return {
    getItem: async () => current,
    cancel: async (item: DraftOutboxItem) => {
      current = { ...item, status: 'cancelled', scheduledSendAt: null };
      return current;
    },
    retry: async (item: DraftOutboxItem) => {
      current = { ...item, status: 'queued', gmailDraftId: null, error: null };
      return current;
    },
    get current() {
      return current;
    },
  };
}

const fakeProjection: ThreadsResponse = {
  threads: [
    {
      id: 'thread-1',
      historyId: null,
      subject: 'Proposition commerciale Devlab',
      sender: { name: 'Hinatea', email: 'hinatea@client.pf' },
      receivedOn: '2026-07-13T08:00:00.000Z',
      labels: [
        { id: 'INBOX', name: 'Inbox' },
        { id: 'UNREAD', name: 'Unread' },
      ],
      unread: true,
    },
    // Row with a MISSING sender — the historical "sender undefined" crash vector.
    {
      id: 'thread-2',
      historyId: null,
      subject: 'Suivi hebdo',
      receivedOn: '2026-07-12T08:00:00.000Z',
      labels: [],
      unread: false,
    },
  ],
  nextPageToken: 'cursor-xyz',
};

// --- proofs ----------------------------------------------------------------

describe('formatSender — safe against the historical "sender undefined" MCP crash', () => {
  it('never throws on a missing sender / name / email', () => {
    expect(formatSender(undefined)).toBe('Unknown sender');
    expect(formatSender(null)).toBe('Unknown sender');
    expect(formatSender({})).toBe('Unknown sender');
    expect(formatSender({ email: 'a@b.pf' })).toBe('a@b.pf');
    expect(formatSender({ name: 'X', email: 'a@b.pf' })).toBe('X <a@b.pf>');
    // Angle brackets in the display name are stripped (no header injection).
    expect(formatSender({ name: 'A<>B', email: 'a@b.pf' })).toBe('AB <a@b.pf>');
  });
});

describe('compact thread list — no body / N+1, safe rows', () => {
  it('renders metadata only and carries NO message body', () => {
    const out = formatCompactThreadList(fakeProjection);
    expect(out).toContain('ID: thread-1');
    expect(out).toContain('From: Hinatea <hinatea@client.pf>');
    expect(out).toContain('From: Unknown sender'); // thread-2, no crash
    expect(out).toContain('nextPageToken: cursor-xyz');
    expect(out).not.toMatch(/body|decodedBody|processedHtml|base64/i);
  });

  it('returns a friendly empty sentinel', () => {
    expect(formatCompactThreadList({ threads: [], nextPageToken: '' })).toBe('No threads found');
  });

  it('a single row exposes only compact fields', () => {
    const row = formatCompactThread(fakeProjection.threads[0]);
    expect(row).toContain('Unread: yes');
    expect(row).toContain('Labels: Inbox, Unread');
  });
});

describe('outbox inspect / cancel / retry — ownership-scoped + idempotent', () => {
  it('missing AND cross-user ids share one identical not-found message', async () => {
    const missing = await handleInspectOutboxItem({ getItem: async () => null }, 'nope');
    const crossUser = await handleCancelOutboxItem(
      { getItem: async () => null, cancel: async (i) => i },
      'other-users-id',
    );
    expect(missing).toBe(OUTBOX_NOT_FOUND);
    expect(crossUser).toBe(OUTBOX_NOT_FOUND);
  });

  it('cancel is idempotent: second cancel is a no-op that reports the state', async () => {
    const box = statefulOutbox(seedItem('draft_ready'));
    expect(await handleCancelOutboxItem(box, 'outbox-1')).toBe('Outbox item outbox-1 cancelled');
    expect(box.current.status).toBe('cancelled');
    expect(await handleCancelOutboxItem(box, 'outbox-1')).toBe(
      'Outbox item outbox-1 is already cancelled',
    );
  });

  it('a sent item can never be cancelled', async () => {
    const box = statefulOutbox(seedItem('sent'));
    expect(await handleCancelOutboxItem(box, 'outbox-1')).toMatch(/already sent/);
    expect(box.current.status).toBe('sent');
  });

  it('retry only from failed, and is idempotent once re-queued', async () => {
    const box = statefulOutbox(seedItem('failed'));
    expect(await handleRetryOutboxItem(box, 'outbox-1')).toBe(
      'Outbox item outbox-1 re-queued for regeneration',
    );
    expect(box.current.status).toBe('queued');
    expect(await handleRetryOutboxItem(box, 'outbox-1')).toMatch(/already queued; retry is a no-op/);
  });

  it('formatOutboxItem never leaks send internals', () => {
    const parsed = JSON.parse(formatOutboxItem(seedItem('draft_ready')));
    expect(parsed).toMatchObject({ id: 'outbox-1', status: 'draft_ready', gmailDraftId: 'gdraft-1' });
    expect(Object.keys(parsed)).not.toContain('idempotencyKey');
  });
});

describe('surface guarantees — draft-only whitelist', () => {
  const WRITE_WHITELIST = new Set([
    'createDraft',
    'enqueueDraftJob',
    'cancelOutboxItem',
    'retryOutboxItem',
  ]);

  it('capabilities state that sending is impossible', () => {
    const caps = buildCapabilities(
      MCP_TOOL_DEFINITIONS.map((d) => ({
        name: d.name,
        category: d.category,
        mutates: d.mutates,
        idempotent: d.idempotent,
      })),
    );
    expect(caps.canSendMail).toBe(false);
    expect(caps.canPermanentlyDeleteMail).toBe(false);
    expect(caps.canReportSpam).toBe(false);
    expect(caps.canChangeAccountSettings).toBe(false);
    expect(caps.statement).toMatch(/no tool can send mail/i);
    expect(MCP_SEND_GUARANTEES.canSendMail).toBe(false);
  });

  it('every WRITE tool is within the create-draft + reviewable-outbox whitelist', () => {
    const writes = MCP_TOOL_DEFINITIONS.filter((d) => d.category === 'write').map((d) => d.name);
    for (const name of writes) expect(WRITE_WHITELIST.has(name)).toBe(true);
    // enqueue/create + cancel/retry are all present.
    expect(new Set(writes)).toEqual(WRITE_WHITELIST);
  });

  it('no tool advertises send / permanent-delete / spam / account-settings', () => {
    for (const def of MCP_TOOL_DEFINITIONS) {
      expect(def.name).not.toMatch(/send|deleteAll|permanentlyDelete|spam|markAsSpam|settings/i);
    }
    // Retired mutation tools (D1) are absent from the surface.
    const names = new Set(MCP_TOOL_DEFINITIONS.map((d) => d.name));
    for (const retired of ['markThreadsRead', 'markThreadsUnread', 'modifyLabels', 'createLabel']) {
      expect(names.has(retired as never)).toBe(false);
    }
  });

  it('every mutation tool is declared idempotent', () => {
    for (const def of MCP_TOOL_DEFINITIONS) {
      if (def.mutates) expect(def.idempotent).toBe(true);
    }
  });
});

describe('schema snapshot is a valid, stable JSON schema', () => {
  it('each tool renders a JSON-schema object with typed properties', () => {
    const snap = buildMcpSchemaSnapshot();
    expect(snap.tools).toHaveLength(MCP_TOOL_DEFINITIONS.length);
    const createDraft = snap.tools.find((t) => t.name === 'createDraft')!;
    expect(createDraft.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        subject: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
    });
    // Every draft mutation requires the idempotency key as well as its payload.
    const required = (createDraft.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toContain('subject');
    expect(required).toContain('idempotencyKey');
  });

  it('enum schema round-trips (outbox status filter)', () => {
    const node = jsonSchemaForShape(mcpToolSchemas.listOutbox) as {
      properties: { status: { enum?: string[] } };
    };
    expect(node.properties.status.enum).toContain('draft_ready');
  });
});

describe('strict MCP input bounds', () => {
  const recipient = { email: 'valid@example.com' };
  const validDraft = {
    to: [recipient],
    subject: 'Subject',
    message: 'Body',
    idempotencyKey: 'request-1',
  };

  it('accepts only valid, header-safe email recipients', () => {
    expect(createDraftInputSchema.safeParse(validDraft).success).toBe(true);
    expect(
      createDraftInputSchema.safeParse({ ...validDraft, to: [{ email: 'not-an-email' }] }).success,
    ).toBe(false);
    expect(
      createDraftInputSchema.safeParse({
        ...validDraft,
        to: [{ email: 'victim@example.com\r\nBcc: attacker@example.com' }],
      }).success,
    ).toBe(false);
    expect(
      createDraftInputSchema.safeParse({ ...validDraft, subject: 'Hello\r\nBcc: attacker' }).success,
    ).toBe(false);
  });

  it('enforces integer page sizes from 1 through 50 and queries through 2048 characters', () => {
    const listSchema = z.object(mcpToolSchemas.listThreads);
    for (const invalid of [0, 51, 1.5]) {
      expect(listSchema.safeParse({ maxResults: invalid }).success).toBe(false);
    }
    expect(listSchema.safeParse({ maxResults: 1 }).success).toBe(true);
    expect(listSchema.safeParse({ maxResults: 50 }).success).toBe(true);
    expect(listSchema.safeParse({ query: 'q'.repeat(2048) }).success).toBe(true);
    expect(listSchema.safeParse({ query: 'q'.repeat(2049) }).success).toBe(false);
  });

  it('rejects more than 50 total recipients, oversized subjects, and bodies over 2 MiB', () => {
    expect(
      createDraftInputSchema.safeParse({
        ...validDraft,
        to: Array.from({ length: 25 }, () => recipient),
        cc: Array.from({ length: 26 }, () => recipient),
      }).success,
    ).toBe(false);
    expect(
      createDraftInputSchema.safeParse({ ...validDraft, subject: 's'.repeat(999) }).success,
    ).toBe(false);
    expect(
      createDraftInputSchema.safeParse({ ...validDraft, message: 'é'.repeat(1024 * 1024 + 1) })
        .success,
    ).toBe(false);
  });

  it('requires mutation keys from 1 through 128 trimmed characters', () => {
    expect(createDraftInputSchema.safeParse({ ...validDraft, idempotencyKey: 'k'.repeat(128) }).success)
      .toBe(true);
    for (const key of [undefined, '', '   ', 'k'.repeat(129)]) {
      expect(createDraftInputSchema.safeParse({ ...validDraft, idempotencyKey: key }).success).toBe(
        false,
      );
    }
    for (const shape of [
      mcpToolSchemas.enqueueDraftJob,
      mcpToolSchemas.cancelOutboxItem,
      mcpToolSchemas.retryOutboxItem,
    ]) {
      expect(z.object(shape).safeParse({ id: 'item-1' }).success).toBe(false);
    }
  });
});
