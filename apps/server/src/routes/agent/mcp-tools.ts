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
 * MCP tool surface — single source of truth for the draft-only "Claude and Codex API"
 * (spec niveau8-mailos §"Claude and Codex API contract"; issue #36).
 *
 * This module is intentionally free of `cloudflare:workers` / `env` imports and of any
 * driver/DB instantiation: it holds only zod schemas, human descriptions, pure formatters
 * and dependency-injected handlers. `mcp.ts` COMPOSES the live surface by wiring these to
 * the real `agent` stub / DB / DO storage (issue #26 "Option B": composition from a
 * consolidated tool module, no duplicated definitions). The same definitions drive the
 * committable schema snapshot and the local smoke evidence under `docs/agent/`, so the
 * published surface and its documentation can never silently drift.
 *
 * Non-negotiable (spec §"Non-negotiable product rules" #1/#2): NO tool here sends mail,
 * permanently deletes mail, reports spam, or changes account settings. Every agent write
 * stops at a Gmail draft or a reviewable outbox item; a human in Zero is the send boundary.
 */

import type { DraftOutboxItem, DraftOutboxStatus } from '../../lib/draft-outbox/state-machine';
import { draftOutboxStatuses } from '../../lib/draft-outbox/state-machine';
import { sanitizeMailField } from '../../lib/mail-sanitize';
import type { ThreadsResponse } from '@zero/types';
import type { Sender } from '../../types';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Server identity + hard capability guarantees (health/capabilities tool)
// ---------------------------------------------------------------------------

export const MCP_SERVER_INFO = {
  name: 'zero-mcp',
  version: '1.1.0',
} as const;

/**
 * The four operations this surface can NEVER perform. These are asserted by
 * `scripts/security/check-agent-surface.mjs` and surfaced verbatim to agents by the
 * `getServerCapabilities` tool so a client can verify the draft-only contract at runtime.
 */
export const MCP_SEND_GUARANTEES = {
  canSendMail: false,
  canPermanentlyDeleteMail: false,
  canReportSpam: false,
  canChangeAccountSettings: false,
} as const;

export const MCP_DRAFT_ONLY_STATEMENT =
  'This MCP server is draft-only. No tool can send mail, permanently delete mail, report ' +
  'spam, or change account settings. Agent output stops at a Gmail draft or a reviewable ' +
  'outbox item; a human in Zero performs any send.';

export interface McpCapabilities {
  server: typeof MCP_SERVER_INFO;
  draftOnly: true;
  humanReviewIsTheSendBoundary: true;
  canSendMail: false;
  canPermanentlyDeleteMail: false;
  canReportSpam: false;
  canChangeAccountSettings: false;
  statement: string;
  toolCount: number;
  tools: { name: string; category: 'read' | 'write'; mutates: boolean; idempotent: boolean }[];
}

export function buildCapabilities(
  tools: { name: string; category: 'read' | 'write'; mutates: boolean; idempotent: boolean }[],
): McpCapabilities {
  return {
    server: MCP_SERVER_INFO,
    draftOnly: true,
    humanReviewIsTheSendBoundary: true,
    ...MCP_SEND_GUARANTEES,
    statement: MCP_DRAFT_ONLY_STATEMENT,
    toolCount: tools.length,
    tools,
  };
}

// ---------------------------------------------------------------------------
// Pure formatters (safe against the historical "sender undefined" MCP crash)
// ---------------------------------------------------------------------------

/**
 * Render a sender safely — never dereferences a missing name/email (bug #36).
 *
 * Nom ET adresse sont choisis par l'expéditeur et partent vers un modèle porteur d'outils :
 * ils passent par `sanitizeMailField` (aplatissement sur une ligne, retrait de l'invisible,
 * borne de longueur). Sans cela, un saut de ligne dans le nom fabriquait une ligne de rendu
 * supplémentaire dans `formatCompactThreadList`.
 */
export function formatSender(sender?: Partial<Sender> | null): string {
  const email = sanitizeMailField(sender?.email, '');
  const name = sanitizeMailField(sender?.name?.replace(/[<>]/g, ''), '');
  if (!email) return name || 'Unknown sender';
  return name ? `${name} <${email}>` : email;
}

/**
 * Compact thread row for list/search: subject, id, date, sender, unread and label
 * NAMES only. Carries NO message body or attachment — mirrors the #30 projection
 * budget so the MCP list path stays a single query with no per-row N+1.
 */
export function formatCompactThread(thread: ThreadsResponse['threads'][number]): string {
  const labels = (thread.labels ?? []).map((l) => l.name).join(', ') || '—';
  return [
    `ID: ${thread.id}`,
    `Subject: ${sanitizeMailField(thread.subject, '(no subject)')}`,
    `From: ${formatSender(thread.sender)}`,
    `Date: ${thread.receivedOn ?? 'unknown'}`,
    `Unread: ${thread.unread ? 'yes' : 'no'}`,
    `Labels: ${labels}`,
  ].join(' | ');
}

export function formatCompactThreadList(response: ThreadsResponse): string {
  if (!response.threads.length) return 'No threads found';
  const rows = response.threads.map(formatCompactThread);
  if (response.nextPageToken) rows.push(`nextPageToken: ${response.nextPageToken}`);
  return rows.join('\n');
}

/** Structured, machine-parseable view of an owned outbox item (inspect). No raw send data. */
export function formatOutboxItem(item: DraftOutboxItem): string {
  return JSON.stringify(
    {
      id: item.id,
      status: item.status,
      subject: item.subject,
      threadId: item.threadId ?? null,
      gmailDraftId: item.gmailDraftId ?? null,
      scheduledSendAt: item.scheduledSendAt ? new Date(item.scheduledSendAt).toISOString() : null,
      error: item.error ?? null,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Idempotency — createDraft (spec §"Mutation tools must be idempotent")
// ---------------------------------------------------------------------------

export interface DraftIdempotencyStore {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
}

export const draftIdempotencyStorageKey = (connectionId: string, idempotencyKey: string) =>
  `mcp_draft_idem:${connectionId}:${idempotencyKey}`;

export interface CreateDraftResult {
  id: string | null;
  deduped: boolean;
}

/**
 * Idempotent Gmail draft creation. With an idempotencyKey, a previously-created draft id
 * is returned instead of creating a second Gmail draft — so duplicate calls with one key
 * produce one logical result. Without a key (or store) behaviour is unchanged.
 */
export async function resolveIdempotentDraft(
  connectionId: string,
  idempotencyKey: string | undefined,
  store: DraftIdempotencyStore | undefined,
  create: () => Promise<{ id?: string | null; error?: string | null }>,
): Promise<CreateDraftResult> {
  const key = idempotencyKey?.trim();
  if (!key || !store) {
    const created = await create();
    if (created?.error) throw new Error(`Failed to create draft: ${created.error}`);
    return { id: created?.id ?? null, deduped: false };
  }

  const storageKey = draftIdempotencyStorageKey(connectionId, key);
  const existing = await store.get(storageKey);
  if (existing) return { id: existing, deduped: true };

  const created = await create();
  if (created?.error) throw new Error(`Failed to create draft: ${created.error}`);
  if (created?.id) await store.put(storageKey, created.id);
  return { id: created?.id ?? null, deduped: false };
}

// ---------------------------------------------------------------------------
// Outbox inspect / cancel / retry — ownership-scoped + idempotent
// ---------------------------------------------------------------------------

/** Cross-user / missing ids get ONE identical message — existence is never revealed. */
export const OUTBOX_NOT_FOUND = 'Outbox item not found';

const CANCELLABLE = new Set<DraftOutboxStatus>(['queued', 'generating', 'draft_ready', 'approved']);

export interface OutboxInspectDeps {
  getItem: (id: string) => Promise<DraftOutboxItem | null>;
}
export interface OutboxCancelDeps extends OutboxInspectDeps {
  cancel: (item: DraftOutboxItem) => Promise<DraftOutboxItem>;
}
export interface OutboxRetryDeps extends OutboxInspectDeps {
  retry: (item: DraftOutboxItem) => Promise<DraftOutboxItem>;
}

export async function handleInspectOutboxItem(
  deps: OutboxInspectDeps,
  id: string,
): Promise<string> {
  const item = await deps.getItem(id);
  if (!item) return OUTBOX_NOT_FOUND;
  return formatOutboxItem(item);
}

export async function handleCancelOutboxItem(deps: OutboxCancelDeps, id: string): Promise<string> {
  const item = await deps.getItem(id);
  if (!item) return OUTBOX_NOT_FOUND;
  // Idempotent: a second cancel is a no-op that reports the terminal state.
  if (item.status === 'cancelled') return `Outbox item ${item.id} is already cancelled`;
  if (item.status === 'sent') {
    return `Outbox item ${item.id} was already sent and can no longer be cancelled`;
  }
  if (!CANCELLABLE.has(item.status)) {
    return `Outbox item ${item.id} cannot be cancelled from status ${item.status}`;
  }
  const next = await deps.cancel(item);
  return `Outbox item ${next.id} cancelled`;
}

export async function handleRetryOutboxItem(deps: OutboxRetryDeps, id: string): Promise<string> {
  const item = await deps.getItem(id);
  if (!item) return OUTBOX_NOT_FOUND;
  // Idempotent: an item already back in the queue is a no-op.
  if (item.status === 'queued' || item.status === 'generating') {
    return `Outbox item ${item.id} is already ${item.status}; retry is a no-op`;
  }
  if (item.status !== 'failed') {
    return `Outbox item ${item.id} can only be retried from status failed; current status ${item.status}`;
  }
  const next = await deps.retry(item);
  return `Outbox item ${next.id} re-queued for regeneration`;
}

// ---------------------------------------------------------------------------
// zod input schemas — single source shared by mcp.ts and the schema snapshot
// ---------------------------------------------------------------------------

export const draftRecipientSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
});

export type DraftRecipient = z.infer<typeof draftRecipientSchema>;

export const outboxStatusSchema = z.enum(
  draftOutboxStatuses as unknown as [DraftOutboxStatus, ...DraftOutboxStatus[]],
);

export const mcpToolSchemas = {
  getServerCapabilities: {},
  getConnections: {},
  getActiveConnection: {},
  setActiveConnection: {
    email: z.string().describe('Email address of an already-connected account to select'),
  },
  listThreads: {
    folder: z.string().default('inbox').describe('Mailbox folder to list (default inbox)'),
    query: z.string().optional().describe('Optional Gmail-style query filter'),
    maxResults: z.number().optional().default(20).describe('Max threads to return'),
    labelIds: z.array(z.string()).optional().describe('Restrict to threads carrying these labels'),
    pageToken: z.string().optional().describe('Opaque cursor from a previous page'),
  },
  searchThreads: {
    query: z.string().describe('Search text; matched against stored thread metadata'),
    folder: z.string().default('inbox').describe('Folder to search within (default inbox)'),
    maxResults: z.number().optional().default(20).describe('Max threads to return'),
    pageToken: z.string().optional().describe('Opaque cursor from a previous page'),
  },
  getThread: {
    threadId: z.string().describe('Thread id to fetch on demand'),
  },
  getThreadSummary: {
    id: z.string().describe('Thread id to summarize'),
  },
  getUserLabels: {},
  getLabel: {
    id: z.string().describe('Label id to fetch'),
  },
  getCurrentDate: {},
  composeEmail: {
    prompt: z.string().describe('Instruction or rough draft for the email body'),
    emailSubject: z.string().optional(),
    to: z.array(z.string()).optional(),
    cc: z.array(z.string()).optional(),
    threadMessages: z
      .array(
        z.object({
          from: z.string(),
          to: z.array(z.string()),
          cc: z.array(z.string()).optional(),
          subject: z.string(),
          body: z.string(),
        }),
      )
      .optional()
      .describe('Prior thread messages for context'),
  },
  createDraft: {
    to: z.array(draftRecipientSchema),
    subject: z.string(),
    message: z.string(),
    cc: z.array(draftRecipientSchema).optional(),
    bcc: z.array(draftRecipientSchema).optional(),
    threadId: z.string().optional().describe('Reply within an existing thread'),
    idempotencyKey: z
      .string()
      .optional()
      .describe('Stable key: repeat calls return the same draft instead of duplicating it'),
  },
  enqueueDraftJob: {
    threadId: z.string().optional(),
    mission: z.string().optional().describe('What the reviewable draft should accomplish'),
    subject: z.string().optional(),
    body: z.string().optional(),
  },
  listOutbox: {
    status: outboxStatusSchema.optional().describe('Filter to one outbox status'),
  },
  getOutboxItem: {
    id: z.string().describe('Outbox item id owned by the authenticated user'),
  },
  cancelOutboxItem: {
    id: z.string().describe('Outbox item id to cancel (idempotent)'),
  },
  retryOutboxItem: {
    id: z.string().describe('Failed outbox item id to re-queue (idempotent)'),
  },
} as const;

export type McpToolName = keyof typeof mcpToolSchemas;

// ---------------------------------------------------------------------------
// Descriptions — MUST state exactly what is stored and that sending is impossible
// ---------------------------------------------------------------------------

export const mcpToolDescriptions: Record<McpToolName, string> = {
  getServerCapabilities:
    'Report this MCP server health and capabilities as JSON: name/version, that it is ' +
    'draft-only, the registered tools, and the hard guarantees that no tool can send mail, ' +
    'permanently delete mail, report spam, or change account settings. Read-only; stores nothing.',
  getConnections:
    'List the email accounts (connections) linked to the authenticated user — email address ' +
    'and provider only. Read-only.',
  getActiveConnection:
    'Return the account currently selected for subsequent tools (email and provider). Read-only.',
  setActiveConnection:
    'Select which already-connected account subsequent tools act on, by email address. Changes ' +
    'only the in-session active-account selection; it does NOT modify any account setting and ' +
    'never sends mail. Unknown or other-user addresses are rejected without revealing existence.',
  listThreads:
    'List email threads as COMPACT metadata only: subject, thread id, latest date, sender, ' +
    'unread flag and label names. Never returns message bodies or attachments. Read-only.',
  searchThreads:
    'Search email threads and return COMPACT metadata only (subject, id, date, sender, unread, ' +
    'labels). Never returns message bodies or attachments. Read-only.',
  getThread:
    'Fetch one thread by id on demand: subject, latest date, sender, and the sanitized text of ' +
    'the latest message (hidden and remote content stripped). Read-only.',
  getThreadSummary:
    'Return a short AI summary plus subject/sender/date for one thread. Read-only; stores nothing.',
  getUserLabels: 'List all labels available to the user (name, id, color). Read-only.',
  getLabel: 'Get one label by id (name and id). Read-only.',
  getCurrentDate: 'Return the current server date and time. Read-only.',
  composeEmail:
    'Draft an email body with AI assistance and RETURN it to you as text. It only returns text: ' +
    'it does not create a draft, store anything, or send mail.',
  createDraft:
    'Create a Gmail draft stored in the user Gmail Drafts folder for later human review. Stores ' +
    'the given recipients, subject and body as an UNSENT draft. This NEVER sends the email — ' +
    'sending is a separate human action in Zero. Pass a stable idempotencyKey so retries return ' +
    'the same draft instead of creating duplicates.',
  enqueueDraftJob:
    'Store a reviewable draft job in the outbox with status "queued". The job holds the given ' +
    'mission/subject/body; a background step later turns it into a Gmail draft that a human must ' +
    'approve in Zero before anything is sent. This NEVER sends mail. Duplicate calls with ' +
    'identical fields return the same outbox item (idempotent).',
  listOutbox:
    'List the authenticated user outbox draft jobs (id, status, subject, thread, timestamps), ' +
    'optionally filtered by status. Read-only.',
  getOutboxItem:
    'Inspect one outbox draft job the user owns, by id. Ids that are missing or owned by another ' +
    'user return an identical not-found result without revealing which. Read-only.',
  cancelOutboxItem:
    'Cancel an outbox draft job the user owns while it is still queued, generating, draft_ready ' +
    'or approved. Idempotent: cancelling an already-cancelled item reports it as such. Never ' +
    'sends mail. Other-user or missing ids return not-found without revealing existence.',
  retryOutboxItem:
    'Re-queue a FAILED outbox draft job the user owns for another generation attempt. Idempotent: ' +
    'retrying an item already back in the queue reports it as such. Never sends mail; sending ' +
    'still requires human approval. Other-user or missing ids return not-found.',
};

// ---------------------------------------------------------------------------
// Tool catalogue — data consumed by mcp.ts (registration) + schema snapshot
// ---------------------------------------------------------------------------

export interface McpToolDefinition {
  name: McpToolName;
  category: 'read' | 'write';
  mutates: boolean;
  idempotent: boolean;
  description: string;
}

/**
 * The complete published surface. `category`/`mutates` classify each tool for the
 * security check: WRITE tools are limited to `createDraft` + reviewable outbox
 * create/inspect/cancel/retry (check §"Write tools are limited to ..."). `idempotent`
 * marks the mutation tools the spec requires to be idempotent.
 */
export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'getServerCapabilities',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getServerCapabilities,
  },
  {
    name: 'getConnections',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getConnections,
  },
  {
    name: 'getActiveConnection',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getActiveConnection,
  },
  {
    name: 'setActiveConnection',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.setActiveConnection,
  },
  {
    name: 'listThreads',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.listThreads,
  },
  {
    name: 'searchThreads',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.searchThreads,
  },
  {
    name: 'getThread',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getThread,
  },
  {
    name: 'getThreadSummary',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getThreadSummary,
  },
  {
    name: 'getUserLabels',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getUserLabels,
  },
  {
    name: 'getLabel',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getLabel,
  },
  {
    name: 'getCurrentDate',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getCurrentDate,
  },
  {
    name: 'composeEmail',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.composeEmail,
  },
  {
    name: 'listOutbox',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.listOutbox,
  },
  {
    name: 'getOutboxItem',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getOutboxItem,
  },
  {
    name: 'createDraft',
    category: 'write',
    mutates: true,
    idempotent: true,
    description: mcpToolDescriptions.createDraft,
  },
  {
    name: 'enqueueDraftJob',
    category: 'write',
    mutates: true,
    idempotent: true,
    description: mcpToolDescriptions.enqueueDraftJob,
  },
  {
    name: 'cancelOutboxItem',
    category: 'write',
    mutates: true,
    idempotent: true,
    description: mcpToolDescriptions.cancelOutboxItem,
  },
  {
    name: 'retryOutboxItem',
    category: 'write',
    mutates: true,
    idempotent: true,
    description: mcpToolDescriptions.retryOutboxItem,
  },
];

// ---------------------------------------------------------------------------
// JSON-Schema snapshot — deterministic, dependency-free, public zod v3 API only
// ---------------------------------------------------------------------------
//
// The server pins zod v3 while the MCP SDK renders each tool's inputSchema to JSON Schema
// on the wire. This mirror covers exactly the schema vocabulary used above (string / number
// / boolean / enum / array / object, with optional / default / describe) so the committed
// snapshot stays stable and reviewable without depending on a peer-mismatched converter.

export type JsonSchemaNode = Record<string, unknown>;

function jsonSchemaForType(schema: z.ZodTypeAny): { node: JsonSchemaNode; optional: boolean } {
  let optional = false;
  let inner: z.ZodTypeAny = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault) {
    optional = true;
    inner = inner instanceof z.ZodOptional ? inner.unwrap() : inner.removeDefault();
  }

  let node: JsonSchemaNode;
  if (inner instanceof z.ZodString) node = { type: 'string' };
  else if (inner instanceof z.ZodNumber) node = { type: 'number' };
  else if (inner instanceof z.ZodBoolean) node = { type: 'boolean' };
  else if (inner instanceof z.ZodEnum) node = { type: 'string', enum: [...inner.options] };
  else if (inner instanceof z.ZodArray)
    node = { type: 'array', items: jsonSchemaForType(inner.element).node };
  else if (inner instanceof z.ZodObject) node = jsonSchemaForShape(inner.shape);
  else node = {};

  const description = schema.description ?? inner.description;
  if (description) node.description = description;
  return { node, optional };
}

export function jsonSchemaForShape(shape: z.ZodRawShape): JsonSchemaNode {
  const properties: Record<string, JsonSchemaNode> = {};
  const required: string[] = [];
  for (const key of Object.keys(shape).sort()) {
    const { node, optional } = jsonSchemaForType(shape[key]);
    properties[key] = node;
    if (!optional) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

/** Build the committable JSON-schema snapshot of the whole surface (stable ordering). */
export function buildMcpSchemaSnapshot() {
  return {
    server: MCP_SERVER_INFO,
    draftOnly: true,
    ...MCP_SEND_GUARANTEES,
    statement: MCP_DRAFT_ONLY_STATEMENT,
    tools: MCP_TOOL_DEFINITIONS.map((def) => ({
      name: def.name,
      category: def.category,
      mutates: def.mutates,
      idempotent: def.idempotent,
      description: def.description,
      inputSchema: jsonSchemaForShape(mcpToolSchemas[def.name]),
    })),
  };
}
