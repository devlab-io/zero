import { beforeEach, describe, expect, it, vi } from 'vitest';

// Couture mail.test.ts : on invoque le VRAI resolver de copilot.ask avec un ctx
// fabriqué ; réseau/DB/modèle remplacés par des fakes déterministes.

const harness = vi.hoisted(() => ({
  aiResponses: [] as string[],
  aiCalls: 0,
  aiRun: vi.fn(),
  agent: { getMailboxCounts: vi.fn(async () => ({ inbox: 1, drafts: 0, sent: 0 })) },
  getZeroAgent: vi.fn(),
  // Multi-shard helpers (the ONLY mailbox read path of copilot.ask).
  getThreadsFromDB: vi.fn(),
  getThread: vi.fn(),
  findUserSettings: vi.fn(async () => null),
}));

const procBuild = vi.hoisted(() => {
  const build = (partial: Record<string, unknown> = {}): any => ({
    use: () => build(partial),
    input: (inputSchema: unknown) => build({ ...partial, inputSchema }),
    query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
    mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
  });
  return build;
});

vi.mock('../trpc', () => ({
  router: (defs: unknown) => defs,
  activeDriverProcedure: procBuild(),
  createRateLimiterMiddleware: vi.fn(() => 'rate-limiter-middleware'),
}));

vi.mock('cloudflare:workers', () => ({
  env: {
    AI: { run: harness.aiRun },
    HYPERDRIVE: { connectionString: 'postgres://fake' },
  },
}));

vi.mock('hono/context-storage', () => ({
  getContext: () => ({ executionCtx: { waitUntil: () => {} } }),
}));

vi.mock('../../lib/server-utils', () => ({
  getZeroAgent: harness.getZeroAgent,
  getThreadsFromDB: harness.getThreadsFromDB,
  getThread: harness.getThread,
  getZeroDB: vi.fn(async () => ({ findUserSettings: harness.findUserSettings })),
}));

vi.mock('../../db', () => ({
  createDb: () => ({ db: {}, conn: { end: vi.fn(async () => {}) } }),
}));

import { copilotRouter } from './copilot';

const makeCtx = () => ({
  activeConnection: { id: 'conn-active' },
  sessionUser: { id: 'user-1' },
  c: { req: { raw: { signal: undefined } } },
});

const ask = (input: unknown) => {
  const procedure = (
    copilotRouter as unknown as {
      ask: { resolver: Function; inputSchema: { parse: (value: unknown) => unknown } };
    }
  ).ask;
  // Miroir du runtime tRPC : l'input passe par le schéma zod avant le resolver.
  return procedure.resolver({ ctx: makeCtx(), input: procedure.inputSchema.parse(input) });
};

const script = (...responses: string[]) => {
  harness.aiResponses = responses;
  harness.aiCalls = 0;
};

const searchOnlyPlan = JSON.stringify({ actions: [{ type: 'search', query: 'socredo' }] });
const searchAndReadPlan = JSON.stringify({
  actions: [
    { type: 'search', query: 'socredo' },
    { type: 'read_thread', target: 'top_results' },
  ],
});

beforeEach(() => {
  harness.aiRun.mockReset();
  harness.aiRun.mockImplementation(async () => {
    const response =
      harness.aiResponses[harness.aiCalls] ?? harness.aiResponses[harness.aiResponses.length - 1];
    harness.aiCalls += 1;
    return { response };
  });
  harness.getThreadsFromDB.mockReset();
  harness.getThreadsFromDB.mockResolvedValue({
    threads: [
      {
        id: 'thread-1',
        historyId: null,
        subject: 'Relance facture Socredo',
        sender: { name: 'Compta', email: 'compta@socredo.test' },
        receivedOn: '2026-07-30T10:00:00.000Z',
        unread: true,
        labels: [],
      },
    ],
    nextPageToken: null,
  });
  harness.getThread.mockReset();
  harness.getThread.mockResolvedValue({
    shardId: 'shard-1',
    result: {
      messages: [
        {
          id: 'msg-1',
          subject: 'Relance facture Socredo',
          sender: { name: 'Compta', email: 'compta@socredo.test' },
          receivedOn: '2026-07-30T10:00:00.000Z',
          decodedBody: '<p>La facture Socredo est en attente de paiement.</p>',
          isDraft: false,
        },
      ],
    },
  });
  harness.getZeroAgent.mockReset();
  harness.getZeroAgent.mockImplementation(async () => ({ stub: harness.agent }));
  harness.findUserSettings.mockReset();
  harness.findUserSettings.mockResolvedValue(null as never);
});

describe('copilot.ask — multi-shard reads, connection-scoped, strict citations', () => {
  it('searches through the MULTI-SHARD helper, cross-folder, scoped to the active connection', async () => {
    script(
      searchAndReadPlan,
      JSON.stringify({
        answer: 'Une relance Socredo est en attente.',
        cites: [{ ref: 's2', quote: 'facture Socredo est en attente' }],
      }),
    );

    const result = await ask({ question: 'Où en est la facture Socredo ?' });

    // The whole mailbox: helper (all shards), folder undefined, hard cap 10.
    expect(harness.getThreadsFromDB).toHaveBeenCalledWith('conn-active', {
      q: 'socredo',
      folder: undefined,
      maxResults: 10,
    });
    expect(harness.getThread).toHaveBeenCalledWith('conn-active', 'thread-1');
    // s1 = metadata row, s2 = message source — only s2 can carry the citation.
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      ref: 's2',
      kind: 'message',
      threadId: 'thread-1',
      messageId: 'msg-1',
      quote: 'facture Socredo est en attente',
    });
    expect(result.citations[0]).not.toHaveProperty('excerpt');
    expect(JSON.stringify(result.citations)).not.toContain('en attente de paiement.</p>');
    expect(result.model).toBe('llama-4-scout');
  });

  it('metadata-only retrieval yields ZERO citations even when the model cites it', async () => {
    script(
      searchOnlyPlan,
      JSON.stringify({
        answer: 'La facture réclame 120 000 XPF.',
        cites: [{ ref: 's1', quote: 'Relance facture Socredo' }, 's1'],
      }),
    );
    const result = await ask({ question: 'Combien réclame Socredo ?' });
    expect(result.citations).toEqual([]);
  });

  it('keeps the planner folder when one was explicitly chosen', async () => {
    script(
      JSON.stringify({ actions: [{ type: 'search', query: 'devis', folder: 'sent' }] }),
      JSON.stringify({ answer: 'ok', cites: [] }),
    );
    await ask({ question: 'Quels devis ai-je envoyés ?' });
    expect(harness.getThreadsFromDB).toHaveBeenCalledWith(
      'conn-active',
      expect.objectContaining({ folder: 'sent' }),
    );
  });

  it('a forged open threadId yields zero sources, zero citations, and no reply proposal', async () => {
    harness.getThread.mockRejectedValue(new Error('Thread forged-thread not found'));
    script(
      JSON.stringify({ actions: [{ type: 'read_thread', target: 'open' }] }),
      JSON.stringify({
        answer: 'Rien à citer.',
        cites: [{ ref: 's1', quote: 'x' }],
        proposal: { kind: 'reply', body: 'Réponse proposée.' },
      }),
    );

    const result = await ask({
      question: 'Résume le fil ouvert',
      context: { threadId: 'forged-thread-from-another-account' },
    });

    expect(harness.getThread).toHaveBeenCalledWith(
      'conn-active',
      'forged-thread-from-another-account',
    );
    expect(result.citations).toEqual([]);
    expect(
      result.steps.find((s: { kind: string }) => s.kind === 'read_thread')?.sourceRefs,
    ).toEqual([]);
    // Unvalidated open thread → the reply proposal is downgraded, no thread id.
    expect(result.proposal?.kind).toBe('new');
    expect(result.proposal?.threadId).toBeUndefined();
  });

  it('reads the user model choice from settings', async () => {
    harness.findUserSettings.mockResolvedValueOnce({
      settings: { askRetaModel: 'llama-3.3-70b' },
    } as never);
    script(searchOnlyPlan, JSON.stringify({ answer: 'ok', cites: [] }));
    const result = await ask({ question: 'test modèle' });
    expect(result.model).toBe('llama-3.3-70b');
    expect(harness.aiRun).toHaveBeenCalledWith(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.anything(),
    );
  });
});
