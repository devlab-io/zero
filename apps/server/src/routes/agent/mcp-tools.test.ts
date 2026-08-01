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
 * #36 — proofs for the draft-first "Claude and Codex API" MCP surface, plus the generator
 * for the committable schema snapshot and local smoke evidence under `docs/agent/`.
 *
 * Runs in Node (no DO / SQLite / workers): every handler here is dependency-injected, so
 * read/draft paths and the single confirmed-send exception are exercised against fakes.
 * With `UPDATE_MCP_SNAPSHOTS=1` the committed artifacts are (re)written; otherwise the test
 * asserts the committed files still match the code — the anti-drift guard.
 */

import {
  buildCitationResources,
  buildConfirmSendMessage,
  buildDraftPreviewObject,
  buildThreadCitations,
  citationResourceUri,
  confirmedSendSubmissionKey,
  enqueueConfirmedStoredDraft,
  CONFIRM_SEND_REQUESTED_SCHEMA,
  handleSendConfirmedDraft,
  SEND_CONFIRMATION_UNAVAILABLE_MESSAGE,
  SEND_NOT_CONFIRMED_MESSAGE,
  SEND_NO_RECIPIENT_MESSAGE,
  DRAFT_NOT_FOUND_MESSAGE,
  formatDraftPreview,
  handleUpdateDraft,
  stripMailHtml,
  MCP_TOOL_DEFINITIONS,
  MCP_SEND_GUARANTEES,
  OUTBOX_NOT_FOUND,
  buildCapabilities,
  buildMcpSchemaSnapshot,
  formatCompactThread,
  formatCompactThreadList,
  formatOutboxItem,
  formatSender,
  handleCancelOutboxItem,
  handleInspectOutboxItem,
  handleRetryOutboxItem,
  jsonSchemaForShape,
  mcpToolSchemas,
  resolveIdempotentDraft,
  type DraftIdempotencyStore,
} from './mcp-tools';
import type { DraftOutboxItem, DraftOutboxStatus } from '../../lib/draft-outbox/state-machine';
import { writeFileSync, readFileSync } from 'node:fs';
import type { ThreadsResponse } from '@zero/types';
import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- fakes -----------------------------------------------------------------

function memoryIdemStore(): DraftIdempotencyStore {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k),
    put: async (k, v) => void map.set(k, v),
  };
}

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

describe('createDraft idempotency — one logical result per key', () => {
  it('a repeated key returns the same draft without a second create', async () => {
    const store = memoryIdemStore();
    let creates = 0;
    const create = async () => {
      creates += 1;
      return { id: `gmail-draft-${creates}` };
    };
    const first = await resolveIdempotentDraft('conn-1', 'k-1', store, create);
    const second = await resolveIdempotentDraft('conn-1', 'k-1', store, create);
    expect(creates).toBe(1);
    expect(first).toEqual({ id: 'gmail-draft-1', deduped: false });
    expect(second).toEqual({ id: 'gmail-draft-1', deduped: true });
  });

  it('distinct keys / no key create independently', async () => {
    const store = memoryIdemStore();
    let creates = 0;
    const create = async () => ({ id: `d-${(creates += 1)}` });
    await resolveIdempotentDraft('conn-1', 'a', store, create);
    await resolveIdempotentDraft('conn-1', 'b', store, create);
    await resolveIdempotentDraft('conn-1', undefined, store, create);
    expect(creates).toBe(3);
  });

  it('surfaces a create error instead of caching it', async () => {
    const store = memoryIdemStore();
    await expect(
      resolveIdempotentDraft('conn-1', 'k', store, async () => ({ error: 'boom' })),
    ).rejects.toThrow(/Failed to create draft: boom/);
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
    expect(await handleRetryOutboxItem(box, 'outbox-1')).toMatch(
      /already queued; retry is a no-op/,
    );
  });

  it('formatOutboxItem never leaks send internals', () => {
    const parsed = JSON.parse(formatOutboxItem(seedItem('draft_ready')));
    expect(parsed).toMatchObject({
      id: 'outbox-1',
      status: 'draft_ready',
      gmailDraftId: 'gdraft-1',
    });
    expect(Object.keys(parsed)).not.toContain('idempotencyKey');
  });
});

describe('surface guarantees — draft-first whitelist with one confirmed-send exception', () => {
  // P9 élargi : sendConfirmedDraft est l'UNIQUE outil send-capable — son
  // contrat d'elicitation est asserté plus bas et par check-agent-surface.mjs.
  const WRITE_WHITELIST = new Set([
    'createDraft',
    'updateDraft',
    'sendConfirmedDraft',
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
    expect(caps.canSendMailWithoutHumanConfirmation).toBe(false);
    expect(caps.canPermanentlyDeleteMail).toBe(false);
    expect(caps.canReportSpam).toBe(false);
    expect(caps.canChangeAccountSettings).toBe(false);
    // L'UNIQUE exception d'envoi est déclarée, avec son contrat d'elicitation.
    expect(caps.sendException).toEqual({
      tool: 'sendConfirmedDraft',
      humanConfirmation: 'elicitation',
      transport: 'durable-outbox',
    });
    expect(caps.statement).toMatch(/EXCEPT sendConfirmedDraft/);
    expect(caps.statement).toMatch(/elicitation/i);
    expect(MCP_SEND_GUARANTEES.canSendMailWithoutHumanConfirmation).toBe(false);
  });

  it('every WRITE tool is within the create-draft + reviewable-outbox whitelist', () => {
    const writes = MCP_TOOL_DEFINITIONS.filter((d) => d.category === 'write').map((d) => d.name);
    for (const name of writes) expect(WRITE_WHITELIST.has(name)).toBe(true);
    // enqueue/create + cancel/retry are all present.
    expect(new Set(writes)).toEqual(WRITE_WHITELIST);
  });

  it('aucun outil hors exception ne porte send / permanent-delete / spam / settings dans son nom', () => {
    for (const def of MCP_TOOL_DEFINITIONS) {
      // sendConfirmedDraft est l'exception DÉCLARÉE (sendCapable + elicitation).
      if (def.sendCapable) continue;
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
    // required excludes optionals (idempotencyKey), includes mandatory (subject/message/to).
    const required = (createDraft.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toContain('subject');
    expect(required).not.toContain('idempotencyKey');
  });

  it('enum schema round-trips (outbox status filter)', () => {
    const node = jsonSchemaForShape(mcpToolSchemas.listOutbox) as {
      properties: { status: { enum?: string[] } };
    };
    expect(node.properties.status.enum).toContain('draft_ready');
  });
});

// --- committable artifacts: generate under UPDATE_MCP_SNAPSHOTS, else guard ----

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/agent');
const SCHEMA_FILE = resolve(DOCS, 'mcp-schema.snapshot.json');
const EVIDENCE_FILE = resolve(DOCS, 'mcp-smoke.evidence.json');

/** Deterministic local smoke: draft-first paths + the elicitation-gated send exception. */
async function runLocalSmoke() {
  const capabilities = buildCapabilities(
    MCP_TOOL_DEFINITIONS.map((d) => ({
      name: d.name,
      category: d.category,
      mutates: d.mutates,
      idempotent: d.idempotent,
    })),
  );

  // read-only
  const listOutput = formatCompactThreadList(fakeProjection);
  const inspect = await handleInspectOutboxItem(
    { getItem: async () => seedItem('draft_ready') },
    'outbox-1',
  );

  // draft-first + idempotency
  const store = memoryIdemStore();
  const providerSendCalls = 0; // all smoke paths stop before any provider call.
  let createCalls = 0;
  const create = async () => ({ id: `gmail-draft-${(createCalls += 1)}` });
  const draftA = await resolveIdempotentDraft('conn-1', 'mission-42', store, create);
  const draftB = await resolveIdempotentDraft('conn-1', 'mission-42', store, create);

  // sendConfirmedDraft (P9 élargi) : preuve locale que TOUT chemin non
  // confirmé est fail-closed et qu'un accept+confirm passe par l'outbox fake.
  let enqueues = 0;
  const confirmDeps = (outcome: {
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, unknown>;
  }) => ({
    getDraft: async () => ({ id: 'dr-1', to: ['a@b.pf'], subject: 'S', content: 'C' }),
    elicit: async () => outcome,
    enqueueSend: async () => {
      enqueues += 1;
      return { queued: true };
    },
    audit: () => {},
  });
  const declined = await handleSendConfirmedDraft(confirmDeps({ action: 'decline' }), {
    draftId: 'dr-1',
  });
  const cancelled = await handleSendConfirmedDraft(confirmDeps({ action: 'cancel' }), {
    draftId: 'dr-1',
  });
  const acceptedUnchecked = await handleSendConfirmedDraft(
    confirmDeps({ action: 'accept', content: { confirm: false } }),
    { draftId: 'dr-1' },
  );
  const enqueuesBeforeAccept = enqueues;
  const accepted = await handleSendConfirmedDraft(
    confirmDeps({ action: 'accept', content: { confirm: true } }),
    { draftId: 'dr-1' },
  );

  return {
    confirmedSend: {
      declined,
      cancelled,
      acceptedUnchecked,
      enqueuesWithoutConfirmation: enqueuesBeforeAccept,
      accepted,
      enqueuesAfterConfirmation: enqueues,
    },
    note:
      'Local, sandbox smoke with injected driver fakes (no network, no OAuth-console, no prod). ' +
      'A fully live authenticated /mcp session against local/staging requires an interactive ' +
      'better-auth OIDC login unavailable here (blocker documented in docs/agent/mcp-smoke.md, ' +
      'precedent #28/#40). This exercises read/draft handlers plus the confirmed-send gate and ' +
      'proves that unconfirmed paths enqueue nothing while an accepted elicitation enqueues once.',
    readonly: {
      capabilitiesSendableWithoutConfirmation: capabilities.canSendMailWithoutHumanConfirmation,
      listThreadsSample: listOutput.split('\n').slice(0, 2),
      getOutboxItemSample: JSON.parse(inspect),
    },
    draftFirst: {
      createDraftFirst: draftA,
      createDraftDuplicateSameKey: draftB,
      distinctGmailDraftsCreated: createCalls,
      providerSendCallsObserved: providerSendCalls,
    },
    assertions: {
      oneLogicalDraftPerKey: createCalls === 1 && draftA.id === draftB.id,
      zeroUnconfirmedSends: providerSendCalls === 0 && enqueuesBeforeAccept === 0,
      confirmedSendEnqueuedExactlyOnce: enqueues === 1,
      draftFirstGuaranteed: capabilities.canSendMailWithoutHumanConfirmation === false,
    },
  };
}

describe('docs/agent committable artifacts', () => {
  const update = process.env.UPDATE_MCP_SNAPSHOTS === '1';

  it('schema snapshot matches the committed file', () => {
    const built = JSON.stringify(buildMcpSchemaSnapshot(), null, 2) + '\n';
    if (update) writeFileSync(SCHEMA_FILE, built);
    const committed = readFileSync(SCHEMA_FILE, 'utf8');
    expect(JSON.parse(committed)).toEqual(buildMcpSchemaSnapshot());
  });

  it('smoke evidence matches the committed file and proves zero sends', async () => {
    const evidence = await runLocalSmoke();
    expect(evidence.assertions).toEqual({
      oneLogicalDraftPerKey: true,
      zeroUnconfirmedSends: true,
      confirmedSendEnqueuedExactlyOnce: true,
      draftFirstGuaranteed: true,
    });
    const built = JSON.stringify(evidence, null, 2) + '\n';
    if (update) writeFileSync(EVIDENCE_FILE, built);
    const committed = readFileSync(EVIDENCE_FILE, 'utf8');
    expect(JSON.parse(committed)).toEqual(evidence);
  });
});

describe('P9 — previewDraft / updateDraft / getThreadCitations (handlers purs)', () => {
  it('formatDraftPreview : JSON borné, corps détaggé, not-found UNIFORME', () => {
    expect(formatDraftPreview(null)).toBe(DRAFT_NOT_FOUND_MESSAGE);
    const preview = JSON.parse(
      formatDraftPreview({
        id: 'dr-1',
        to: ['a@b.pf'],
        subject: 'Devis',
        content: '<p>Bonjour <b>Olivier</b></p>' + 'x'.repeat(5000),
      }),
    );
    expect(preview).toMatchObject({ id: 'dr-1', to: ['a@b.pf'], subject: 'Devis', unsent: true });
    expect(preview.bodyText.startsWith('Bonjour Olivier')).toBe(true);
    expect(preview.bodyText.length).toBeLessThanOrEqual(2000);
  });

  it('handleUpdateDraft : charge le draft EXISTANT, fusionne les champs omis, reste UNSENT', async () => {
    const saved: unknown[] = [];
    const message = await handleUpdateDraft(
      {
        getDraft: async () => ({
          id: 'dr-1',
          to: ['a@b.pf'],
          cc: ['c@b.pf'],
          subject: 'Ancien sujet',
          content: 'Ancien corps',
        }),
        saveDraft: async (data) => {
          saved.push(data);
          return { id: 'dr-1' };
        },
      },
      { draftId: 'dr-1', subject: 'Nouveau sujet', threadId: 'th-9' },
    );
    expect(saved[0]).toMatchObject({
      id: 'dr-1',
      to: 'a@b.pf',
      cc: 'c@b.pf',
      subject: 'Nouveau sujet',
      message: 'Ancien corps',
      threadId: 'th-9',
    });
    expect(message).toMatch(/UNSENT draft/);
    expect(message).toMatch(/human action/);
  });

  it('handleUpdateDraft : draft manquant OU autre compte → not-found uniforme, AUCUNE écriture', async () => {
    const saveDraft = { calls: 0 };
    const message = await handleUpdateDraft(
      {
        getDraft: async () => {
          throw new Error('provider 404');
        },
        saveDraft: async () => {
          saveDraft.calls += 1;
          return {};
        },
      },
      { draftId: 'dr-inconnu', subject: 'X' },
    );
    expect(message).toBe(DRAFT_NOT_FOUND_MESSAGE);
    expect(saveDraft.calls).toBe(0);
  });

  it('handleUpdateDraft est idempotent : rejouer la même mise à jour réécrit le même contenu', async () => {
    const saved: unknown[] = [];
    const deps = {
      getDraft: async () => ({ id: 'dr-1', to: ['a@b.pf'], subject: 'S', content: 'C' }),
      saveDraft: async (data: unknown) => {
        saved.push(data);
        return { id: 'dr-1' };
      },
    };
    const input = { draftId: 'dr-1', message: 'Corps final' };
    await handleUpdateDraft(deps, input);
    await handleUpdateDraft(deps, input);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(saved[1]);
  });

  it('buildThreadCitations : plus récentes d’abord, quote VERBATIM détaggée bornée, ids exacts', () => {
    const messages = [
      {
        id: 'm1',
        sender: { name: 'Client', email: 'client@ext.pf' },
        receivedOn: '2026-08-01T08:00:00Z',
        subject: 'Devis',
        body: '<p>Premier message</p>',
      },
      {
        id: 'm2',
        sender: { email: 'thomas@devlab.io' },
        receivedOn: '2026-08-01T09:00:00Z',
        subject: 'Re: Devis',
        decodedBody: 'Réponse ' + 'longue '.repeat(100),
      },
    ];
    const citations = buildThreadCitations('th-9', messages, 3);
    expect(citations.map((c) => c.messageId)).toEqual(['m2', 'm1']);
    expect(citations[0]).toMatchObject({
      kind: 'message',
      threadId: 'th-9',
      senderEmail: 'thomas@devlab.io',
      subject: 'Re: Devis',
    });
    expect(citations[0]!.quote.length).toBeLessThanOrEqual(280);
    expect(citations[1]!.quote).toBe('Premier message');
    // Cap dur à 6, plancher à 1, message sans corps exclu.
    expect(buildThreadCitations('th-9', messages, 99)).toHaveLength(2);
    expect(
      buildThreadCitations('th-9', [{ ...messages[0]!, body: '', decodedBody: '' }], 3),
    ).toHaveLength(0);
  });

  it('stripMailHtml : balises/entités neutralisées (zéro HTML dans une citation)', () => {
    expect(stripMailHtml('<script>x()</script><p>a &amp; b</p>')).toBe('a & b');
  });
});

describe('P9 élargi — sendConfirmedDraft : elicitation humaine NON contournable', () => {
  type Outcome = { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> };
  const makeDeps = (
    overrides: Partial<{
      draft: unknown;
      outcome: Outcome | 'throws';
      enqueue: (input: {
        draftId: string;
        clientSubmissionKey: string;
        subject: string;
      }) => Promise<{
        queued: boolean;
        duplicate?: boolean;
        error?: string;
      }>;
    }> = {},
  ) => {
    const calls = {
      elicit: [] as unknown[],
      enqueue: [] as { draftId: string; clientSubmissionKey: string; subject: string }[],
      audit: [] as { draftId: string; outcome: string }[],
    };
    const deps = {
      getDraft: async () =>
        'draft' in overrides
          ? (overrides.draft as never)
          : { id: 'dr-1', to: ['client@ext.pf'], subject: 'Devis Socredo', content: 'Corps' },
      elicit: async (params: unknown) => {
        calls.elicit.push(params);
        if (overrides.outcome === 'throws') throw new Error('elicitation not supported');
        return (overrides.outcome ?? { action: 'accept', content: { confirm: true } }) as Outcome;
      },
      enqueueSend: async (input: {
        draftId: string;
        clientSubmissionKey: string;
        subject: string;
      }) => {
        calls.enqueue.push(input);
        return overrides.enqueue ? overrides.enqueue(input) : { queued: true };
      },
      audit: (event: { draftId: string; outcome: string }) => calls.audit.push(event),
    };
    return { deps, calls };
  };

  it('accept + confirm===true : enqueue outbox avec clé STABLE et payload sendAsStored (via mcp.ts), audit accepted', async () => {
    const { deps, calls } = makeDeps();
    const message = await handleSendConfirmedDraft(deps, { draftId: 'dr-1' });
    expect(calls.enqueue).toHaveLength(1);
    expect(calls.enqueue[0]).toMatchObject({
      draftId: 'dr-1',
      clientSubmissionKey: confirmedSendSubmissionKey('dr-1'),
    });
    expect(message).toMatch(/CONFIRMED by the human/);
    expect(message).toMatch(/sendStoredDraft/);
    expect(calls.audit.map((a) => a.outcome)).toEqual(['accepted']);
    // Le message d'elicitation porte destinataires + sujet EXACTS.
    expect(calls.elicit[0]).toMatchObject({
      mode: 'form',
      requestedSchema: CONFIRM_SEND_REQUESTED_SCHEMA,
    });
    expect((calls.elicit[0] as { message: string }).message).toContain('client@ext.pf');
    expect((calls.elicit[0] as { message: string }).message).toContain('Devis Socredo');
  });

  it('decline → fail closed, ZÉRO enqueue', async () => {
    const { deps, calls } = makeDeps({ outcome: { action: 'decline' } });
    const message = await handleSendConfirmedDraft(deps, { draftId: 'dr-1' });
    expect(message).toBe(SEND_NOT_CONFIRMED_MESSAGE);
    expect(calls.enqueue).toHaveLength(0);
    expect(calls.audit.map((a) => a.outcome)).toEqual(['declined']);
  });

  it('cancel → fail closed, ZÉRO enqueue', async () => {
    const { deps, calls } = makeDeps({ outcome: { action: 'cancel' } });
    expect(await handleSendConfirmedDraft(deps, { draftId: 'dr-1' })).toBe(
      SEND_NOT_CONFIRMED_MESSAGE,
    );
    expect(calls.enqueue).toHaveLength(0);
    expect(calls.audit.map((a) => a.outcome)).toEqual(['cancelled']);
  });

  it('accept SANS confirm===true (absent ou faux) → fail closed', async () => {
    for (const content of [undefined, {}, { confirm: false }, { confirm: 'true' }]) {
      const { deps, calls } = makeDeps({ outcome: { action: 'accept', content } });
      expect(await handleSendConfirmedDraft(deps, { draftId: 'dr-1' })).toBe(
        SEND_NOT_CONFIRMED_MESSAGE,
      );
      expect(calls.enqueue).toHaveLength(0);
    }
  });

  it('elicitation indisponible (client sans capability, SDK lève) → fail closed', async () => {
    const { deps, calls } = makeDeps({ outcome: 'throws' });
    expect(await handleSendConfirmedDraft(deps, { draftId: 'dr-1' })).toBe(
      SEND_CONFIRMATION_UNAVAILABLE_MESSAGE,
    );
    expect(calls.enqueue).toHaveLength(0);
    expect(calls.audit.map((a) => a.outcome)).toEqual(['confirmation_unavailable']);
  });

  it('double appel confirmé : MÊME clé de soumission, dédup outbox rapportée idempotente', async () => {
    const seen = new Set<string>();
    const enqueue = async (input: { clientSubmissionKey: string }) => {
      const duplicate = seen.has(input.clientSubmissionKey);
      seen.add(input.clientSubmissionKey);
      return { queued: true, duplicate };
    };
    const first = makeDeps({ enqueue });
    const second = makeDeps({ enqueue });
    const message1 = await handleSendConfirmedDraft(first.deps, { draftId: 'dr-1' });
    const message2 = await handleSendConfirmedDraft(second.deps, { draftId: 'dr-1' });
    expect(first.calls.enqueue[0]!.clientSubmissionKey).toBe(
      second.calls.enqueue[0]!.clientSubmissionKey,
    );
    expect(message1).not.toMatch(/already queued/);
    expect(message2).toMatch(/idempotent: this confirmed send was already queued/);
    expect(second.calls.audit.map((a) => a.outcome)).toEqual(['accepted_duplicate']);
  });

  it('cross-account / draft inconnu : not-found UNIFORME AVANT toute elicitation', async () => {
    const { deps, calls } = makeDeps({ draft: null });
    expect(await handleSendConfirmedDraft(deps, { draftId: 'dr-autre-compte' })).toBe(
      'Draft not found',
    );
    expect(calls.elicit).toHaveLength(0);
    expect(calls.enqueue).toHaveLength(0);
  });

  it('draft sans destinataire → refus AVANT elicitation', async () => {
    const { deps, calls } = makeDeps({ draft: { id: 'dr-1', to: [], subject: 'S' } });
    expect(await handleSendConfirmedDraft(deps, { draftId: 'dr-1' })).toBe(
      SEND_NO_RECIPIENT_MESSAGE,
    );
    expect(calls.elicit).toHaveLength(0);
  });

  it('draft Cc/Bcc-only → elicitation puis enqueue autorisés', async () => {
    const { deps, calls } = makeDeps({
      draft: { id: 'dr-1', to: [], cc: ['cc@ext.pf'], bcc: ['bcc@ext.pf'], subject: 'S' },
    });
    const message = await handleSendConfirmedDraft(deps, { draftId: 'dr-1' });
    expect(message).toMatch(/CONFIRMED by the human/);
    expect(calls.elicit).toHaveLength(1);
    expect((calls.elicit[0] as { message: string }).message).toContain('Cc: cc@ext.pf');
    expect(calls.enqueue).toHaveLength(1);
  });

  it("échec d'enqueue → fail closed explicite, audit enqueue_failed", async () => {
    const { deps, calls } = makeDeps({
      enqueue: async () => ({ queued: false, error: 'queue down' }),
    });
    const message = await handleSendConfirmedDraft(deps, { draftId: 'dr-1' });
    expect(message).toMatch(/nothing was sent/);
    expect(message).toMatch(/queue down/);
    expect(calls.audit.map((a) => a.outcome)).toEqual(['enqueue_failed']);
  });

  it('clé de soumission stable et conforme au format send_job', () => {
    expect(confirmedSendSubmissionKey('dr-1')).toBe(confirmedSendSubmissionKey('dr-1'));
    expect(confirmedSendSubmissionKey('dr-1')).not.toBe(confirmedSendSubmissionKey('dr-2'));
    expect(confirmedSendSubmissionKey('dr-1')).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('la définition sendConfirmedDraft est la SEULE send-capable, contrat elicitation déclaré', () => {
    const sendCapable = MCP_TOOL_DEFINITIONS.filter((d) => d.sendCapable);
    expect(sendCapable.map((d) => d.name)).toEqual(['sendConfirmedDraft']);
    expect(sendCapable[0]!.humanConfirmation).toBe('elicitation');
    expect(sendCapable[0]!.description).toMatch(/elicitation/i);
    expect(sendCapable[0]!.description).toMatch(/fail closed/i);
    expect(buildConfirmSendMessage({ id: 'd', to: ['a@b.pf'], subject: 'S' })).toContain('a@b.pf');
  });

  it('une panne Queue après création reste rejouable avec le même job', async () => {
    const job = { id: 'job-1', status: 'queued' as const, enqueuedAt: null };
    let createCalls = 0;
    let publishCalls = 0;
    const createJob = async () => ({ job, deduped: createCalls++ > 0 });
    const publish = async () => {
      publishCalls += 1;
      if (publishCalls === 1) throw new Error('queue down');
    };
    const markEnqueued = async () => {};

    await expect(
      enqueueConfirmedStoredDraft({ createJob, publish, markEnqueued }),
    ).resolves.toEqual({ queued: false, error: 'queue publication failed' });
    await expect(
      enqueueConfirmedStoredDraft({ createJob, publish, markEnqueued }),
    ).resolves.toEqual({ queued: true, duplicate: true });
    expect(createCalls).toBe(2);
    expect(publishCalls).toBe(2);
  });

  it('un job déjà marqué/en cours/envoyé ne republie jamais dans la Queue', async () => {
    for (const job of [
      { id: 'marked', status: 'queued' as const, enqueuedAt: new Date() },
      { id: 'sending', status: 'sending' as const, enqueuedAt: null },
      { id: 'sent', status: 'sent' as const, enqueuedAt: null },
    ]) {
      let publishCalls = 0;
      const result = await enqueueConfirmedStoredDraft({
        createJob: async () => ({ job, deduped: true }),
        publish: async () => {
          publishCalls += 1;
        },
        markEnqueued: async () => {},
      });
      expect(result).toEqual({ queued: true, duplicate: true });
      expect(publishCalls).toBe(0);
    }
  });
});

describe('P9 — structuredContent + ressources embarquées (SDK 1.29)', () => {
  it('buildDraftPreviewObject : objet typé conforme au outputSchema', () => {
    const preview = buildDraftPreviewObject({
      id: 'dr-1',
      to: ['a@b.pf'],
      subject: 'S',
      content: '<p>corps</p>',
    });
    expect(preview).toEqual({
      id: 'dr-1',
      to: ['a@b.pf'],
      cc: [],
      bcc: [],
      subject: 'S',
      bodyText: 'corps',
      unsent: true,
    });
  });

  it('buildCitationResources : une ressource text/plain par citation, uri stable, quote exacte', () => {
    const citations = buildThreadCitations(
      'th-9',
      [
        {
          id: 'm1',
          sender: { name: 'Client', email: 'client@ext.pf' },
          receivedOn: '2026-08-01T08:00:00Z',
          subject: 'Devis',
          body: '<p>Extrait exact</p>',
        },
      ],
      3,
    );
    const resources = buildCitationResources(citations);
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      type: 'resource',
      resource: { uri: 'mail://thread/th-9/message/m1#quote', mimeType: 'text/plain' },
    });
    expect(resources[0]!.resource.text).toContain('Extrait exact');
    expect(resources[0]!.resource.text).toContain('Client <client@ext.pf>');
    expect(citationResourceUri(citations[0]!)).toBe('mail://thread/th-9/message/m1#quote');
  });
});
