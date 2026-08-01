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
 * MCP tool surface — single source of truth for the draft-first "Claude and Codex API"
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
 * Hard guarantees, asserted by `scripts/security/check-agent-surface.mjs` and surfaced
 * verbatim to agents by `getServerCapabilities`. P9 élargi : la SEULE exception
 * d'envoi est `sendConfirmedDraft`, et son contrat d'elicitation (confirmation
 * humaine DANS l'outil, au moment de l'appel) est NON contournable — un client
 * sans elicitation, un decline, un cancel ou un confirm≠true = zéro envoi.
 */
export const MCP_SEND_GUARANTEES = {
  canSendMailWithoutHumanConfirmation: false,
  canPermanentlyDeleteMail: false,
  canReportSpam: false,
  canChangeAccountSettings: false,
} as const;

export const MCP_SEND_EXCEPTION = {
  tool: 'sendConfirmedDraft',
  humanConfirmation: 'elicitation',
  transport: 'durable-outbox',
} as const;

export const MCP_DRAFT_ONLY_STATEMENT =
  'This MCP server is draft-first. No tool can permanently delete mail, report spam, or ' +
  'change account settings, and no tool can send mail EXCEPT sendConfirmedDraft — which ' +
  'sends an EXISTING draft only after an explicit in-tool human confirmation (MCP ' +
  'elicitation) at call time. Declined, cancelled or unavailable confirmation means ' +
  'nothing is sent. A confirmed send goes through the idempotent durable outbox ' +
  '(send_job + Queue + sendStoredDraft), never a direct provider call.';

export interface McpCapabilities {
  server: typeof MCP_SERVER_INFO;
  draftFirst: true;
  humanReviewIsTheSendBoundary: true;
  sendException: typeof MCP_SEND_EXCEPTION;
  canSendMailWithoutHumanConfirmation: false;
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
    draftFirst: true,
    humanReviewIsTheSendBoundary: true,
    sendException: MCP_SEND_EXCEPTION,
    ...MCP_SEND_GUARANTEES,
    statement: MCP_DRAFT_ONLY_STATEMENT,
    toolCount: tools.length,
    tools,
  };
}

// ---------------------------------------------------------------------------
// Pure formatters (safe against the historical "sender undefined" MCP crash)
// ---------------------------------------------------------------------------

/** Render a sender safely — never dereferences a missing name/email (bug #36). */
export function formatSender(sender?: Partial<Sender> | null): string {
  const email = sender?.email?.trim();
  const name = sender?.name?.replace(/[<>]/g, '').trim();
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
    `Subject: ${thread.subject ?? '(no subject)'}`,
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
 *
 * Concurrency (revue Codex 2026-08-01): the plain get→create→put sequence lets two
 * CONCURRENT calls with the same key both miss the stored id and create two drafts.
 * With `inflight`, the first call registers its promise SYNCHRONOUSLY (the DO event
 * loop is single-threaded, so check-and-set cannot interleave) and every concurrent
 * same-key call awaits that same creation — exactly one Gmail draft. A failed
 * creation clears the slot so a retry is possible; failures are never cached.
 */
export async function resolveIdempotentDraft(
  connectionId: string,
  idempotencyKey: string | undefined,
  store: DraftIdempotencyStore | undefined,
  create: () => Promise<{ id?: string | null; error?: string | null }>,
  inflight?: Map<string, Promise<CreateDraftResult>>,
): Promise<CreateDraftResult> {
  const runCreate = async (): Promise<CreateDraftResult> => {
    const created = await create();
    if (created?.error) throw new Error(`Failed to create draft: ${created.error}`);
    return { id: created?.id ?? null, deduped: false };
  };

  const key = idempotencyKey?.trim();
  if (!key || !store) return runCreate();

  const storageKey = draftIdempotencyStorageKey(connectionId, key);

  const pending = inflight?.get(storageKey);
  if (pending) {
    const result = await pending;
    return { ...result, deduped: true };
  }

  const task = (async (): Promise<CreateDraftResult> => {
    const existing = await store.get(storageKey);
    if (existing) return { id: existing, deduped: true };
    const created = await runCreate();
    if (created.id) await store.put(storageKey, created.id);
    return created;
  })();

  if (inflight) {
    inflight.set(storageKey, task);
    try {
      return await task;
    } finally {
      inflight.delete(storageKey);
    }
  }
  return task;
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
// Draft preview / update / citations (P9 API-first) — pure, DI'd handlers
// ---------------------------------------------------------------------------

const MAX_PREVIEW_BODY_CHARS = 2000;
const MAX_CITATION_QUOTE_CHARS = 280;

/** Minimal HTML→text for previews/citations — no DOM, deterministic. */
export function stripMailHtml(value: string): string {
  return value
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

export type PreviewableDraft = {
  id: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  content?: string;
};

/** Uniform not-found: missing and other-user drafts are indistinguishable. */
export const DRAFT_NOT_FOUND_MESSAGE = 'Draft not found';

export function formatDraftPreview(draft: PreviewableDraft | null): string {
  if (!draft) return DRAFT_NOT_FOUND_MESSAGE;
  return JSON.stringify({
    id: draft.id,
    to: draft.to ?? [],
    cc: draft.cc ?? [],
    bcc: draft.bcc ?? [],
    subject: draft.subject ?? '',
    bodyText: stripMailHtml(draft.content ?? '').slice(0, MAX_PREVIEW_BODY_CHARS),
    unsent: true,
  });
}

export interface UpdateDraftDeps {
  /** Draft du COMPTE ACTIF uniquement (le stub agent est déjà scopé connexion). */
  getDraft: (draftId: string) => Promise<PreviewableDraft | null>;
  saveDraft: (data: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    message: string;
    id: string;
    threadId: string | null;
  }) => Promise<{ id?: string | null }>;
}

export type UpdateDraftInput = {
  draftId: string;
  to?: DraftRecipient[];
  cc?: DraftRecipient[];
  bcc?: DraftRecipient[];
  subject?: string;
  message?: string;
  threadId?: string;
};

const joinRecipients = (recipients: DraftRecipient[]) =>
  recipients.map((recipient) => recipient.email).join(', ');

/**
 * Update in place: the existing draft is LOADED first (uniform not-found),
 * omitted fields keep their stored value, and the result stays an UNSENT
 * draft. Naturally idempotent — replaying the same update rewrites the same
 * stored content.
 */
export async function handleUpdateDraft(
  deps: UpdateDraftDeps,
  input: UpdateDraftInput,
): Promise<string> {
  const existing = await deps.getDraft(input.draftId).catch(() => null);
  if (!existing) return DRAFT_NOT_FOUND_MESSAGE;
  await deps.saveDraft({
    to: input.to ? joinRecipients(input.to) : (existing.to ?? []).join(', '),
    cc: input.cc ? joinRecipients(input.cc) : (existing.cc ?? []).join(', ') || undefined,
    bcc: input.bcc ? joinRecipients(input.bcc) : (existing.bcc ?? []).join(', ') || undefined,
    subject: input.subject ?? existing.subject ?? '',
    message: input.message ?? existing.content ?? '',
    id: input.draftId,
    threadId: input.threadId ?? null,
  });
  return `Draft ${input.draftId} updated — still an UNSENT draft; sending remains a human action in Zero`;
}

export type CitableMessage = {
  id: string;
  sender: { name?: string; email: string };
  receivedOn: string;
  subject: string;
  decodedBody?: string;
  body?: string;
};

export type ThreadCitation = {
  kind: 'message';
  messageId: string;
  threadId: string;
  senderEmail: string;
  senderName?: string;
  receivedOn: string;
  subject: string;
  /** Extrait VERBATIM (détaggé, borné) du corps — jamais du texte de modèle. */
  quote: string;
};

/** Citations structurées, plus récentes d'abord, quote verbatim bornée. */
export function buildThreadCitations(
  threadId: string,
  messages: CitableMessage[],
  maxCitations: number,
): ThreadCitation[] {
  const max = Math.min(Math.max(maxCitations, 1), 6);
  return [...messages]
    .reverse()
    .slice(0, max)
    .map((message) => ({
      kind: 'message' as const,
      messageId: message.id,
      threadId,
      senderEmail: message.sender.email,
      senderName: message.sender.name,
      receivedOn: message.receivedOn,
      subject: message.subject,
      quote: stripMailHtml(message.decodedBody || message.body || '').slice(
        0,
        MAX_CITATION_QUOTE_CHARS,
      ),
    }))
    .filter((citation) => citation.quote.length > 0);
}

// ---------------------------------------------------------------------------
// sendConfirmedDraft (P9 élargi) — l'UNIQUE exception d'envoi, gardée par une
// confirmation humaine DANS l'outil (MCP elicitation), fail-closed partout.
// ---------------------------------------------------------------------------

export const SEND_NOT_CONFIRMED_MESSAGE = 'Send NOT confirmed by the human — nothing was sent';
export const SEND_CONFIRMATION_UNAVAILABLE_MESSAGE =
  'Human confirmation unavailable (client does not support MCP elicitation) — nothing was sent';
export const SEND_NO_RECIPIENT_MESSAGE = 'Draft has no recipients — nothing was sent';

/**
 * Clé de soumission STABLE par brouillon : double appel, retry réseau et
 * relivraison convergent vers LE MÊME send_job (contrainte unique
 * connection_id + client_submission_key — le scope connexion vient de la DB).
 */
export const confirmedSendSubmissionKey = (draftId: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < draftId.length; index += 1) {
    hash ^= BigInt(draftId.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `mcp-confirmed-send-${hash.toString(36)}`;
};

/** Schéma d'elicitation EXACT : un unique booléen `confirm`, requis. */
export const CONFIRM_SEND_REQUESTED_SCHEMA: {
  type: 'object';
  properties: {
    confirm: { type: 'boolean'; title: string; description: string };
  };
  required: string[];
} = {
  type: 'object',
  properties: {
    confirm: {
      type: 'boolean',
      title: 'Send this draft now',
      description: 'Check to confirm sending this exact draft. Leave unchecked to abort.',
    },
  },
  required: ['confirm'],
};

/** Message d'elicitation : destinataires + sujet EXACTS, rien d'autre à deviner. */
export function buildConfirmSendMessage(draft: PreviewableDraft): string {
  const lines = [
    'Confirm sending this EXISTING draft now (attachments, threading and signature are',
    'preserved — it is sent exactly as stored).',
    `To: ${(draft.to ?? []).join(', ') || '(none)'}`,
  ];
  if (draft.cc?.length) lines.push(`Cc: ${draft.cc.join(', ')}`);
  if (draft.bcc?.length) lines.push(`Bcc: ${draft.bcc.join(', ')}`);
  lines.push(`Subject: ${draft.subject ?? '(no subject)'}`);
  return lines.join('\n');
}

export type SendElicitOutcome = {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
};

export type ConfirmedSendAuditEvent = {
  draftId: string;
  outcome:
    | 'not_found'
    | 'no_recipient'
    | 'confirmation_unavailable'
    | 'declined'
    | 'cancelled'
    | 'not_confirmed'
    | 'enqueue_failed'
    | 'accepted'
    | 'accepted_duplicate';
};

export interface SendConfirmedDraftDeps {
  /** Draft du COMPTE ACTIF uniquement (stub agent scopé connexion). */
  getDraft: (draftId: string) => Promise<PreviewableDraft | null>;
  /**
   * MCP elicitation vers le client — DOIT lever si le client ne déclare pas
   * la capability (le SDK l'assure) : toute erreur = fail closed, zéro envoi.
   */
  elicit: (params: {
    mode: 'form';
    message: string;
    requestedSchema: typeof CONFIRM_SEND_REQUESTED_SCHEMA;
  }) => Promise<SendElicitOutcome>;
  /**
   * Enqueue outbox durable (send_job + Queue) — JAMAIS d'appel fournisseur
   * direct ici ; le consumer enverra via sendStoredDraft (draft tel que
   * stocké : PJ/threading/signature préservés par le fournisseur).
   */
  enqueueSend: (input: {
    draftId: string;
    clientSubmissionKey: string;
    subject: string;
  }) => Promise<{ queued: boolean; duplicate?: boolean; error?: string }>;
  /** Trace d'audit structurée (en plus de la ligne send_job durable). */
  audit: (event: ConfirmedSendAuditEvent) => void;
}

/**
 * L'ORDRE est le contrat : (1) charger le brouillon RÉEL (not-found uniforme,
 * cross-account structurellement impossible via le stub scopé) ; (2) preview
 * exacte ; (3) elicitation humaine ; (4) n'enqueuer QUE sur action==='accept'
 * ET content.confirm===true ; tout autre chemin — decline, cancel, confirm
 * absent/faux, elicitation indisponible, erreur — est fail-closed : ZÉRO envoi.
 */
export async function handleSendConfirmedDraft(
  deps: SendConfirmedDraftDeps,
  input: { draftId: string },
): Promise<string> {
  const draft = await deps.getDraft(input.draftId).catch(() => null);
  if (!draft) {
    deps.audit({ draftId: input.draftId, outcome: 'not_found' });
    return DRAFT_NOT_FOUND_MESSAGE;
  }
  if ((draft.to ?? []).length + (draft.cc ?? []).length + (draft.bcc ?? []).length === 0) {
    deps.audit({ draftId: input.draftId, outcome: 'no_recipient' });
    return SEND_NO_RECIPIENT_MESSAGE;
  }

  const preview = formatDraftPreview(draft);
  let outcome: SendElicitOutcome;
  try {
    outcome = await deps.elicit({
      mode: 'form',
      message: buildConfirmSendMessage(draft),
      requestedSchema: CONFIRM_SEND_REQUESTED_SCHEMA,
    });
  } catch {
    deps.audit({ draftId: input.draftId, outcome: 'confirmation_unavailable' });
    return SEND_CONFIRMATION_UNAVAILABLE_MESSAGE;
  }

  if (outcome.action !== 'accept' || outcome.content?.['confirm'] !== true) {
    deps.audit({
      draftId: input.draftId,
      outcome:
        outcome.action === 'decline'
          ? 'declined'
          : outcome.action === 'cancel'
            ? 'cancelled'
            : 'not_confirmed',
    });
    return SEND_NOT_CONFIRMED_MESSAGE;
  }

  const enqueue = await deps
    .enqueueSend({
      draftId: input.draftId,
      clientSubmissionKey: confirmedSendSubmissionKey(input.draftId),
      subject: draft.subject ?? '',
    })
    .catch((error: unknown) => ({
      queued: false as const,
      error: error instanceof Error ? error.message : 'enqueue failed',
    }));
  if (!enqueue.queued) {
    deps.audit({ draftId: input.draftId, outcome: 'enqueue_failed' });
    return `Send failed to enqueue — nothing was sent (${enqueue.error ?? 'unknown error'})`;
  }

  deps.audit({
    draftId: input.draftId,
    outcome: enqueue.duplicate ? 'accepted_duplicate' : 'accepted',
  });
  const suffix = enqueue.duplicate ? ' (idempotent: this confirmed send was already queued)' : '';
  return (
    `Draft ${input.draftId} CONFIRMED by the human and queued in the durable outbox — it will be ` +
    `sent exactly as stored (sendStoredDraft)${suffix}. Preview: ${preview}`
  );
}

export type ConfirmedSendJobState = {
  id: string;
  status: 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed';
  enqueuedAt: Date | null;
  error?: string | null;
};

/**
 * Durable enqueue contract shared by the MCP handler and its tests. A DB row
 * created before a Queue outage remains retriable: a deduped `queued` row
 * without `enqueuedAt` MUST be published again, never reported as delivered.
 */
export async function enqueueConfirmedStoredDraft(deps: {
  createJob: () => Promise<{ job: ConfirmedSendJobState; deduped: boolean }>;
  publish: (jobId: string) => Promise<void>;
  markEnqueued: (jobId: string) => Promise<void>;
}): Promise<{ queued: boolean; duplicate?: boolean; error?: string }> {
  const { job, deduped } = await deps.createJob();

  if (deduped) {
    if (job.status === 'cancelled') return { queued: false, error: 'existing job is cancelled' };
    if (job.status === 'failed') {
      return { queued: false, error: job.error ?? 'existing job is failed' };
    }
    if (job.status === 'sending' || job.status === 'sent' || job.enqueuedAt) {
      return { queued: true, duplicate: true };
    }
  }

  try {
    await deps.publish(job.id);
  } catch {
    return { queued: false, error: 'queue publication failed' };
  }
  await deps.markEnqueued(job.id).catch(() => {});
  return { queued: true, ...(deduped ? { duplicate: true } : {}) };
}

// ---------------------------------------------------------------------------
// Structured output + embedded citation resources (SDK 1.29)
// ---------------------------------------------------------------------------

export function buildDraftPreviewObject(draft: PreviewableDraft) {
  return {
    id: draft.id,
    to: draft.to ?? [],
    cc: draft.cc ?? [],
    bcc: draft.bcc ?? [],
    subject: draft.subject ?? '',
    bodyText: stripMailHtml(draft.content ?? '').slice(0, MAX_PREVIEW_BODY_CHARS),
    unsent: true as const,
  };
}

/** URI stable d'une citation — résolue DANS la connexion active (ACL au read). */
export const citationResourceUri = (citation: ThreadCitation): string =>
  `mail://thread/${encodeURIComponent(citation.threadId)}/message/${encodeURIComponent(citation.messageId)}#quote`;

/**
 * Ressources EMBARQUÉES (embedded resources MCP) : un aperçu texte exact par
 * message cité. Produites uniquement à l'intérieur du handler scopé à la
 * connexion active — l'ACL s'applique donc AU READ, jamais après coup.
 */
export function buildCitationResources(citations: ThreadCitation[]) {
  return citations.map((citation) => ({
    type: 'resource' as const,
    resource: {
      uri: citationResourceUri(citation),
      mimeType: 'text/plain' as const,
      text:
        `From: ${citation.senderName ? `${citation.senderName} <${citation.senderEmail}>` : citation.senderEmail}\n` +
        `Date: ${citation.receivedOn}\nSubject: ${citation.subject}\n\n${citation.quote}`,
    },
  }));
}

export const draftPreviewOutputSchema = {
  id: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  bodyText: z.string(),
  unsent: z.literal(true),
};

export const threadCitationsOutputSchema = {
  threadId: z.string(),
  citations: z.array(
    z.object({
      kind: z.literal('message'),
      messageId: z.string(),
      threadId: z.string(),
      senderEmail: z.string(),
      senderName: z.string().optional(),
      receivedOn: z.string(),
      subject: z.string(),
      quote: z.string(),
      resourceUri: z.string(),
    }),
  ),
};

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
  previewDraft: {
    draftId: z.string().describe('Gmail draft id to preview before any human review or edit'),
  },
  updateDraft: {
    draftId: z.string().describe('Existing Gmail draft id to update in place'),
    to: z.array(draftRecipientSchema).optional().describe('Replacement To recipients'),
    cc: z.array(draftRecipientSchema).optional(),
    bcc: z.array(draftRecipientSchema).optional(),
    subject: z.string().optional().describe('Replacement subject (omitted = keep current)'),
    message: z.string().optional().describe('Replacement body (omitted = keep current)'),
    threadId: z
      .string()
      .optional()
      .describe('Thread to stay attached to — omit ONLY for a standalone (non-reply) draft'),
  },
  sendConfirmedDraft: {
    draftId: z
      .string()
      .describe(
        'EXISTING Gmail draft id to send — only after the human explicitly confirms in the ' +
          'elicitation prompt this tool raises',
      ),
  },
  getThreadCitations: {
    threadId: z.string().describe('Thread id to extract structured citations from'),
    maxCitations: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .default(3)
      .describe('How many messages to cite, newest first (max 6)'),
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
// Descriptions — MUST state exactly what is stored and the single send exception
// ---------------------------------------------------------------------------

export const mcpToolDescriptions: Record<McpToolName, string> = {
  getServerCapabilities:
    'Report this MCP server health and capabilities as JSON: name/version, that it is ' +
    'draft-first, the registered tools, and the hard guarantees that only sendConfirmedDraft ' +
    'can send after MCP elicitation; no tool can permanently delete mail, report spam, or change ' +
    'account settings. Read-only; stores nothing.',
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
  previewDraft:
    'Preview one Gmail draft the user owns: recipients, subject and the SANITIZED text of its ' +
    'body (bounded). Read-only; stores nothing; never sends. Missing or other-user drafts return ' +
    'an identical not-found result without revealing which.',
  updateDraft:
    'Update an EXISTING Gmail draft in place (recipients, subject, body). The result is still an ' +
    'UNSENT draft in the user Gmail Drafts folder — this NEVER sends the email; sending remains ' +
    'a human action in Zero. Omitted fields keep their current value. Idempotent: repeating the ' +
    'same update leaves the same stored draft. Pass threadId to keep a reply attached to its thread.',
  sendConfirmedDraft:
    'THE ONLY send-capable tool. Sends an EXISTING Gmail draft — but ONLY after an explicit ' +
    'in-tool human confirmation: the tool raises an MCP elicitation showing the exact ' +
    'recipients and subject, and proceeds ONLY if the human accepts AND checks confirm=true. ' +
    'Decline, cancel, an unchecked box, or a client without elicitation support = NOTHING is ' +
    'sent (fail closed). A confirmed send is enqueued in the idempotent durable outbox ' +
    '(send_job + Queue) and delivered via sendStoredDraft — the draft goes out exactly as ' +
    'stored (attachments, threading, signature preserved), never a direct provider call. ' +
    'Repeat calls for the same draft reuse the same stable submission key (no double send).',
  getThreadCitations:
    'Extract STRUCTURED citations from one thread: for each cited message, its exact messageId, ' +
    'threadId, sender, date, subject and a bounded sanitized quote taken VERBATIM from the ' +
    'message body — never model-generated text. Read-only; stores nothing.',
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
  /** SEUL sendConfirmedDraft peut le porter — asserté par le check sécurité. */
  sendCapable?: true;
  humanConfirmation?: 'elicitation';
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
    name: 'previewDraft',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.previewDraft,
  },
  {
    name: 'updateDraft',
    category: 'write',
    mutates: true,
    idempotent: true,
    description: mcpToolDescriptions.updateDraft,
  },
  {
    name: 'sendConfirmedDraft',
    category: 'write',
    mutates: true,
    idempotent: true,
    sendCapable: true,
    humanConfirmation: 'elicitation',
    description: mcpToolDescriptions.sendConfirmedDraft,
  },
  {
    name: 'getThreadCitations',
    category: 'read',
    mutates: false,
    idempotent: true,
    description: mcpToolDescriptions.getThreadCitations,
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
    draftFirst: true,
    sendException: MCP_SEND_EXCEPTION,
    ...MCP_SEND_GUARANTEES,
    statement: MCP_DRAFT_ONLY_STATEMENT,
    tools: MCP_TOOL_DEFINITIONS.map((def) => ({
      name: def.name,
      category: def.category,
      mutates: def.mutates,
      idempotent: def.idempotent,
      ...(def.sendCapable ? { sendCapable: true, humanConfirmation: def.humanConfirmation } : {}),
      description: def.description,
      inputSchema: jsonSchemaForShape(mcpToolSchemas[def.name]),
    })),
  };
}
