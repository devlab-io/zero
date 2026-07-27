import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * P1 — LA SURFACE MCP DE BOÎTE D'ENVOI ÉTAIT ENTIÈREMENT MORTE.
 *
 * `init()` ouvrait UNE connexion Postgres, la faisait capturer par les closures de tous les
 * outils enregistrés, puis la fermait avant de rendre la main
 * (`this.ctx.waitUntil(conn.end())`, dernière ligne). Or `agents` 0.0.106 n'exécute `init()`
 * qu'une fois par instance de Durable Object — `dist/mcp/index.js:187`, garde `initRun` —,
 * donc TOUT appel d'outil ultérieur interrogeait un pool déjà terminé, que postgres-js 3.4.5
 * rejette avec `CONNECTION_ENDED` (`src/index.js:330`, `handler()` : `if (ending) return
 * query.reject(Errors.connection('CONNECTION_ENDED', …))`).
 *
 * CE QUE CE TEST EXERCE — la chaîne réelle, pas une closure isolée :
 *   1. `init()` est appelé comme le runtime l'appelle (`_init` → `init`, une seule fois) ;
 *   2. le VRAI `McpServer` du SDK est ensuite connecté à un VRAI `Client` MCP par un couple
 *      `InMemoryTransport`, c'est-à-dire le même chemin que `/sse` et `/mcp`
 *      (routes/index.ts) : `tools/call` en JSON-RPC, pas un handler appelé à la main ;
 *   3. les outils exécutent le VRAI code de `lib/draft-outbox` (SQL drizzle réel) contre le
 *      VRAI `createDb`/`withDb` de `db/index.ts`.
 *
 * Le SEUL élément simulé est la socket : `postgres` est remplacé par un client qui répond
 * aux requêtes tant qu'il vit et qui, après `end()`, rejette avec l'erreur EXACTE que
 * postgres-js construit dans ce cas (message, `code`, `errno`, `address`). C'est la sonde
 * de l'auditeur, rejouée à l'identique.
 */

// --- socket Postgres simulée, fidèle au comportement post-`end()` de postgres-js 3.4.5 ---

type FakePool = {
  ended: boolean;
  queries: string[];
};

const pools: FakePool[] = [];
/** Réponses positionnelles servies aux requêtes, par ordre d'arrivée sur un pool VIVANT. */
let cannedRows: Array<unknown[][]> = [];

const connectionEnded = () =>
  Object.assign(new Error('write CONNECTION_ENDED 127.0.0.1:5432'), {
    code: 'CONNECTION_ENDED',
    errno: 'CONNECTION_ENDED',
    address: '127.0.0.1',
    port: 5432,
  });

vi.mock('postgres', () => ({
  default: () => {
    const pool: FakePool = { ended: false, queries: [] };
    pools.push(pool);
    const answer = (sql: string) => {
      if (pool.ended) return Promise.reject(connectionEnded());
      pool.queries.push(sql);
      return Promise.resolve(cannedRows.shift() ?? []);
    };
    // `drizzle(client, …)` ne touche que `client.options` à la construction, puis
    // `client.unsafe(...)` à chaque requête : c'est toute la surface à fournir.
    return {
      options: {
        parsers: {} as Record<string, unknown>,
        serializers: {} as Record<string, unknown>,
      },
      // drizzle-orm/postgres-js consomme soit `await client.unsafe(q, p)` (aucun champ
      // projeté), soit `await client.unsafe(q, p).values()` (projection ou mapper
      // relationnel). UNE seule exécution doit servir les deux formes.
      unsafe: (query: string) => {
        // UNE seule exécution sert les deux formes : la promesse elle-même porte `values`.
        const result = answer(query);
        return Object.assign(result, { values: () => result });
      },
      end: async () => {
        pool.ended = true;
      },
    };
  },
}));

// --- environnement Workers ------------------------------------------------------------

const fakeEnv = {
  HYPERDRIVE: { connectionString: 'postgres://probe/zero' },
  VECTORIZE: { getByIds: vi.fn(async () => []) },
  AI: { run: vi.fn(async () => ({ summary: 'x' })) },
};
vi.mock('cloudflare:workers', () => ({ env: fakeEnv, tracing: undefined }));

// `agents/mcp` fait des imports `cloudflare:` en profondeur, hors de portée de l'alias de
// vitest. On ne garde de la classe de base que ce que `ZeroMCP` en consomme : `ctx`, `env`,
// `props`. `init()` reste la méthode réelle, et c'est elle qui est éprouvée.
vi.mock('agents/mcp', () => ({
  McpAgent: class {
    props: { userId: string } = { userId: '' };
    constructor(
      public ctx: {
        storage: {
          get: (k: string) => Promise<unknown>;
          put: (k: string, v: unknown) => Promise<void>;
        };
        waitUntil: (p: Promise<unknown>) => void;
      },
      public env: unknown,
    ) {}
  },
}));

vi.mock('../../lib/server-utils', () => ({
  getZeroAgent: vi.fn(async () => ({ stub: {} })),
  getThread: vi.fn(async () => ({ result: { latest: {} } })),
}));
vi.mock('../../services/compose-service', () => ({ composeEmail: vi.fn(async () => 'body') }));
vi.mock('../../lib/prompts', () => ({ getCurrentDateContext: () => '2026-07-27' }));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ZeroMCP } = await import('./mcp');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

// --- lignes servies, dans l'ordre des colonnes réel de chaque table --------------------

/** `mail0_connection`, ordre de `getTableColumns` (vérifié par sonde sur drizzle 0.45.2). */
const connectionRow = [
  'conn-1',
  'user-1',
  'thomas@devlab.io',
  'Thomas',
  null,
  'access',
  'refresh',
  'scope',
  'google',
  null,
  new Date(0),
  new Date(0),
];

/** `mail0_draft_outbox`, même ordre. */
const outboxRow = [
  'outbox-1',
  'conn-1',
  null,
  'relancer BOM',
  'queued',
  null,
  'Relance',
  'Bonjour',
  'idem-1',
  null,
  null,
  new Date(0),
  new Date(0),
];

function makeCtx() {
  const storage = new Map<string, unknown>();
  return {
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => void storage.set(key, value),
    },
    waitUntil: (promise: Promise<unknown>) => void promise.catch(() => {}),
  };
}

// `McpAgent` déclare son constructeur `protected` (il n'est appelé que par le runtime
// Durable Object) : on l'atteint par la même porte que le runtime, sans changer la classe.
type ZeroMcpInstance = {
  init(): Promise<void>;
  server: { connect: (transport: unknown) => Promise<void> };
};
const AgentCtor = ZeroMCP as unknown as new (ctx: unknown, env: unknown) => ZeroMcpInstance;

/** Monte l'agent comme le runtime : `init()` une seule fois, puis transport MCP réel. */
async function bootAgent() {
  const agent = new AgentCtor(makeCtx(), fakeEnv);
  (agent as unknown as { props: { userId: string } }).props = { userId: 'user-1' };

  cannedRows = [[connectionRow]]; // la lecture de connexion faite par init()
  await agent.init();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'probe', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), agent.server.connect(serverTransport)]);
  return { agent, client };
}

beforeEach(() => {
  pools.length = 0;
  cannedRows = [];
});

describe('ZeroMCP — la surface base de données survit à la fin de init()', () => {
  it('la connexion ouverte par init() est bien relâchée avant le premier appel d’outil', async () => {
    await bootAgent();
    expect(pools).toHaveLength(1);
    expect(pools[0].ended).toBe(true);
  });

  it('listOutbox répond APRÈS init(), par un vrai tools/call JSON-RPC', async () => {
    const { client } = await bootAgent();

    cannedRows = [[outboxRow]];
    const result = (await client.callTool({ name: 'listOutbox', arguments: {} })) as {
      content: { type: string; text: string }[];
      isError?: boolean;
    };

    // AVANT correction : le handler tapait dans le pool fermé par init() et le SDK rendait
    // `isError: true` avec « write CONNECTION_ENDED … », sans le moindre diagnostic utile.
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('outbox-1');
    expect(result.content[0].text).toContain('queued');

    // La preuve structurelle : un SECOND pool a été ouvert pour l'appel, et il est refermé.
    expect(pools).toHaveLength(2);
    expect(pools[1].queries.some((q) => q.includes('mail0_draft_outbox'))).toBe(true);
    expect(pools.every((pool) => pool.ended)).toBe(true);
  });

  it('getOutboxItem, cancelOutboxItem, getConnections répondent aussi après init()', async () => {
    const { client } = await bootAgent();

    cannedRows = [[outboxRow]];
    const item = (await client.callTool({
      name: 'getOutboxItem',
      arguments: { id: 'outbox-1' },
    })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    expect(item.isError).toBeFalsy();
    expect(item.content[0].text).toContain('outbox-1');

    // `cancelOutboxItem` fait DEUX requêtes (lecture puis transition) : elles doivent voir
    // la MÊME connexion vivante, sinon la garde d'appartenance ne garderait rien.
    cannedRows = [[outboxRow], [[...outboxRow.slice(0, 4), 'cancelled', ...outboxRow.slice(5)]]];
    const cancelled = (await client.callTool({
      name: 'cancelOutboxItem',
      arguments: { id: 'outbox-1' },
    })) as { content: { text: string }[]; isError?: boolean };
    expect(cancelled.isError).toBeFalsy();
    expect(cancelled.content[0].text.toLowerCase()).toContain('cancel');

    cannedRows = [[connectionRow]];
    const connections = (await client.callTool({ name: 'getConnections', arguments: {} })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    expect(connections.isError).toBeFalsy();
    expect(connections.content[0].text).toContain('thomas@devlab.io');

    expect(pools.every((pool) => pool.ended)).toBe(true);
  });

  it('un pool déjà terminé rejette bien avec CONNECTION_ENDED (fidélité de la sonde)', async () => {
    await bootAgent();
    const dead = pools[0];
    expect(dead.ended).toBe(true);
    // Le comportement que la version fautive rencontrait à CHAQUE appel d'outil.
    await expect(
      (async () => {
        if (dead.ended) throw connectionEnded();
      })(),
    ).rejects.toMatchObject({ code: 'CONNECTION_ENDED' });
  });
});
