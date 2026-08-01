import { describe, expect, it, vi, beforeEach } from 'vitest';

// Couture mail.test.ts : on invoque le VRAI resolver de copilot.ask avec un ctx
// fabriqué ; réseau/DB/modèle remplacés par des fakes déterministes.

const harness = vi.hoisted(() => ({
  aiResponses: [] as string[],
  aiCalls: 0,
  aiRun: vi.fn(),
  agent: {
    getThreadsFromDB: vi.fn(),
    getThreadFromDB: vi.fn(),
    getMailboxCounts: vi.fn(async () => ({ inbox: 1, drafts: 0, sent: 0 })),
  },
  getZeroAgent: vi.fn(),
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

beforeEach(() => {
  harness.aiRun.mockReset();
  harness.aiRun.mockImplementation(async () => {
    const response =
      harness.aiResponses[harness.aiCalls] ?? harness.aiResponses[harness.aiResponses.length - 1];
    harness.aiCalls += 1;
    return { response };
  });
  harness.agent.getThreadsFromDB.mockReset();
  harness.agent.getThreadsFromDB.mockResolvedValue({
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
  harness.agent.getThreadFromDB.mockReset();
  harness.agent.getThreadFromDB.mockResolvedValue({ messages: [] });
  harness.getZeroAgent.mockReset();
  harness.getZeroAgent.mockImplementation(async () => ({ stub: harness.agent }));
});

describe('copilot.ask — whole active mailbox, connection-scoped, body-free citations', () => {
  it('a global question searches with folder undefined (cross-folder), scoped to the active connection', async () => {
    script(
      JSON.stringify({ actions: [{ type: 'search', query: 'facture socredo' }] }),
      JSON.stringify({ answer: 'Une relance Socredo est en attente.', cites: ['s1'] }),
    );

    const result = await ask({ question: 'Où en est la facture Socredo ?' });

    expect(harness.getZeroAgent).toHaveBeenCalledWith('conn-active', expect.anything());
    expect(harness.agent.getThreadsFromDB).toHaveBeenCalledWith({
      q: 'facture socredo',
      folder: undefined,
      maxResults: 10,
    });
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ ref: 's1', threadId: 'thread-1' });
    // Citations expose metadata + hash only — never mail body content.
    expect(result.citations[0]).not.toHaveProperty('excerpt');
    expect(JSON.stringify(result.citations)).not.toContain('body');
    expect(result.model).toBe('llama-4-scout');
  });

  it('keeps the planner folder when one was explicitly chosen', async () => {
    script(
      JSON.stringify({ actions: [{ type: 'search', query: 'devis', folder: 'sent' }] }),
      JSON.stringify({ answer: 'ok', cites: [] }),
    );
    await ask({ question: 'Quels devis ai-je envoyés ?' });
    expect(harness.agent.getThreadsFromDB).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'sent' }),
    );
  });

  it('a forged open threadId yields zero sources and zero citations', async () => {
    script(
      JSON.stringify({ actions: [{ type: 'read_thread', target: 'open' }] }),
      JSON.stringify({ answer: 'Rien à citer.', cites: ['s1', 's2'] }),
    );

    const result = await ask({
      question: 'Résume le fil ouvert',
      context: { threadId: 'forged-thread-from-another-account' },
    });

    // The DO is scoped to the active connection: the forged id resolves to nothing.
    expect(harness.agent.getThreadFromDB).toHaveBeenCalledWith(
      'forged-thread-from-another-account',
    );
    expect(result.citations).toEqual([]);
    expect(
      result.steps.find((s: { kind: string }) => s.kind === 'read_thread')?.sourceRefs,
    ).toEqual([]);
  });

  it('reads the user model choice from settings', async () => {
    harness.findUserSettings.mockResolvedValueOnce({
      settings: { askRetaModel: 'llama-3.3-70b' },
    } as never);
    script(
      JSON.stringify({ actions: [{ type: 'search', query: 'x' }] }),
      JSON.stringify({ answer: 'ok', cites: [] }),
    );
    const result = await ask({ question: 'test modèle' });
    expect(result.model).toBe('llama-3.3-70b');
    expect(harness.aiRun).toHaveBeenCalledWith(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.anything(),
    );
  });
});
