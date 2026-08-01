/**
 * Cross-account routing proof for the ZeroMCP surface (audit 2026-08-01).
 *
 * The historical defect: init() captured a ZeroDriver stub for the FIRST connection of
 * the user; setActiveConnection() then only swapped `activeConnectionId`, so
 * listThreads / searchThreads / getUserLabels / getLabel / createDraft kept reading —
 * and writing drafts — into the first account. These tests drive the REAL tool
 * registration in mcp.ts (McpServer and the DO base class are replaced by recording
 * fakes) through an A → B → A switch and assert every mailbox call lands on the agent
 * of the connection that is active AT CALL TIME.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const harness = vi.hoisted(() => {
  type AnyFn = (...args: unknown[]) => unknown;
  const makeAgentStub = (connectionId: string) => ({
    connectionId,
    getThreadsFromDB: vi.fn(async () => ({
      threads: [
        {
          id: `thread-of-${connectionId}`,
          subject: `subject ${connectionId}`,
          sender: { name: 'Sender', email: `sender@${connectionId}.test` },
          receivedOn: '2026-08-01T00:00:00.000Z',
          unread: false,
          labels: [],
        },
      ],
      nextPageToken: null,
    })),
    getUserLabels: vi.fn(async () => [
      { id: `label-${connectionId}`, name: `Label of ${connectionId}`, color: null },
    ]),
    getLabel: vi.fn(async (id: string) => ({ id, name: `Label of ${connectionId}` })),
    createDraft: vi.fn(async () => ({ id: `draft-of-${connectionId}` })),
  });

  return {
    makeAgentStub,
    agents: new Map<string, ReturnType<typeof makeAgentStub>>(),
    getZeroAgent: vi.fn(),
    findFirst: vi.fn(),
    registered: new Map<string, AnyFn>(),
  };
});

vi.mock('agents/mcp', () => ({
  McpAgent: class {
    props: Record<string, unknown> = {};
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    constructor(_info: unknown) {}
    registerTool(name: string, _meta: unknown, handler: (...args: unknown[]) => unknown) {
      harness.registered.set(name, handler);
    }
  },
}));

vi.mock('cloudflare:workers', () => ({
  env: { HYPERDRIVE: { connectionString: 'postgres://fake' } },
}));

vi.mock('../../db', () => ({
  createDb: () => ({
    db: { query: { connection: { findFirst: harness.findFirst, findMany: vi.fn() } } },
    conn: { end: vi.fn(async () => {}) },
  }),
}));

vi.mock('../../lib/server-utils', () => ({
  getZeroAgent: harness.getZeroAgent,
  getThread: vi.fn(),
}));

// compose.ts drags the @ai-sdk/env graph; the compose tool is out of scope here.
vi.mock('../../trpc/routes/ai/compose', () => ({ composeEmail: vi.fn() }));

import { ZeroMCP } from './mcp';

const CONN_A = { id: 'conn-a', email: 'a@example.test', providerId: 'google' };
const CONN_B = { id: 'conn-b', email: 'b@example.test', providerId: 'google' };

const call = (name: string, args?: unknown) => {
  const handler = harness.registered.get(name);
  if (!handler) throw new Error(`tool ${name} not registered`);
  return handler(args);
};

async function bootMcp() {
  const storage = new Map<string, string>();
  const ctx = {
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: string) => void storage.set(key, value),
    },
    waitUntil: () => {},
  };
  const mcp = new (ZeroMCP as unknown as new (ctx: unknown, env: unknown) => ZeroMCP)(ctx, {});
  (mcp as unknown as { props: { userId: string } }).props = { userId: 'user-1' };
  harness.findFirst.mockResolvedValueOnce(CONN_A); // init: first connection of the user
  await mcp.init();
  return mcp;
}

beforeEach(() => {
  harness.registered.clear();
  harness.agents.clear();
  harness.agents.set(CONN_A.id, harness.makeAgentStub(CONN_A.id));
  harness.agents.set(CONN_B.id, harness.makeAgentStub(CONN_B.id));
  harness.findFirst.mockReset();
  harness.getZeroAgent.mockReset();
  harness.getZeroAgent.mockImplementation(async (connectionId: string) => {
    const stub = harness.agents.get(connectionId);
    if (!stub) throw new Error(`no agent for ${connectionId}`);
    return { stub };
  });
});

const agentOf = (conn: { id: string }) => harness.agents.get(conn.id)!;

describe('ZeroMCP — mailbox tools follow the ACTIVE connection (A → B → A)', () => {
  it('listThreads / searchThreads / labels re-resolve the agent at every call', async () => {
    await bootMcp();

    await call('listThreads', { folder: 'inbox' });
    expect(agentOf(CONN_A).getThreadsFromDB).toHaveBeenCalledTimes(1);
    expect(agentOf(CONN_B).getThreadsFromDB).not.toHaveBeenCalled();

    harness.findFirst.mockResolvedValueOnce(CONN_B);
    await call('setActiveConnection', { email: CONN_B.email });

    await call('listThreads', { folder: 'inbox' });
    await call('searchThreads', { query: 'invoice' });
    await call('getUserLabels', {});
    await call('getLabel', { id: 'IMPORTANT' });

    expect(agentOf(CONN_B).getThreadsFromDB).toHaveBeenCalledTimes(2);
    expect(agentOf(CONN_B).getUserLabels).toHaveBeenCalledTimes(1);
    expect(agentOf(CONN_B).getLabel).toHaveBeenCalledTimes(1);
    // A saw exactly the single pre-switch read — nothing since.
    expect(agentOf(CONN_A).getThreadsFromDB).toHaveBeenCalledTimes(1);
    expect(agentOf(CONN_A).getUserLabels).not.toHaveBeenCalled();
    expect(agentOf(CONN_A).getLabel).not.toHaveBeenCalled();

    harness.findFirst.mockResolvedValueOnce(CONN_A);
    await call('setActiveConnection', { email: CONN_A.email });
    await call('listThreads', { folder: 'inbox' });
    expect(agentOf(CONN_A).getThreadsFromDB).toHaveBeenCalledTimes(2);
    expect(agentOf(CONN_B).getThreadsFromDB).toHaveBeenCalledTimes(2);
  });

  it('createDraft writes into the account active at call time, never the init one', async () => {
    await bootMcp();

    harness.findFirst.mockResolvedValueOnce(CONN_B);
    await call('setActiveConnection', { email: CONN_B.email });

    const result = (await call('createDraft', {
      to: [{ email: 'client@example.test', name: 'Client' }],
      subject: 'Re: facture',
      message: 'Ia ora na,',
      idempotencyKey: 'key-1',
    })) as { content: Array<{ text: string }> };

    expect(agentOf(CONN_B).createDraft).toHaveBeenCalledTimes(1);
    expect(agentOf(CONN_A).createDraft).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toContain('draft-of-conn-b');

    // Same idempotency key on the same connection: no second write.
    await call('createDraft', {
      to: [{ email: 'client@example.test' }],
      subject: 'Re: facture',
      message: 'Ia ora na,',
      idempotencyKey: 'key-1',
    });
    expect(agentOf(CONN_B).createDraft).toHaveBeenCalledTimes(1);
  });

  it('setActiveConnection never reveals other-user connections', async () => {
    await bootMcp();
    harness.findFirst.mockResolvedValueOnce(undefined); // ownership scoped: not found
    await expect(call('setActiveConnection', { email: 'victim@other.test' })).rejects.toThrow(
      'Connection not found',
    );
    // The active mailbox is unchanged: reads still hit A.
    await call('listThreads', { folder: 'inbox' });
    expect(agentOf(CONN_A).getThreadsFromDB).toHaveBeenCalledTimes(1);
  });
});
