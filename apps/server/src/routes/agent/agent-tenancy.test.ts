import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

/**
 * P0 — LE DURABLE OBJECT `general` ÉTAIT PARTAGÉ ENTRE TOUS LES LOCATAIRES.
 *
 * `lib/agent-authorization.ts` exemptait le nom littéral `general` du contrôle de propriété
 * sans regarder ni propriétaire ni locataire. Or `partyserver` résout l'instance par
 * `doNamespace.idFromName(name)` où `name` est le segment d'URL — LE NOM EST L'IDENTITÉ DU
 * STOCKAGE. Tout utilisateur authentifié atteignait donc la même instance, donc la même
 * table `cf_ai_chat_agent_messages` :
 *   - lecture : `GET /agents/zero-agent/general/get-messages` rendait les conversations
 *     des autres ;
 *   - écrasement et effacement : `persistMessages` (bibliothèque `agents`) EFFACE la table
 *     puis réinsère et rediffuse, et `chat-agent.ts` l'appelait AVANT le garde-fou
 *     `if (this.name === 'general')`.
 *
 * CE QUE CE TEST EXERCE — la chaîne réelle, comme `mcp.test.ts` le fait pour MCP :
 *   1. `routeAgentRequest` de la bibliothèque `agents` — EXACTEMENT la fonction que
 *      `hono-agents` appelle (dist/index.js : `handleHttpRequest`/`handleWebSocketUpgrade`) ;
 *   2. le VRAI routage `partyserver` (résolution par `idFromName`, hooks `onBeforeRequest`
 *      et `onBeforeConnect`, en-tête `x-partykit-room`, `Server.fetch`, `setName`) ;
 *   3. la VRAIE politique `authorizeAgentAccess`, câblée comme `routes/index.ts` la câble ;
 *   4. la VRAIE classe `ZeroAgent` et donc la vraie `AIChatAgent` d'`agents` 0.0.106 :
 *      `onMessage`, `persistMessages`, `onRequest('/get-messages')` sont ceux de la
 *      bibliothèque, pas des imitations.
 *
 * Le SEUL élément simulé est le substrat du Durable Object : le stockage SQL est une VRAIE
 * base SQLite en mémoire, une par instance — c'est exactement la sémantique d'un DO — et le
 * namespace est une table `nom -> instance`, construite PARESSEUSEMENT pour que
 * `instances.has(nom)` prouve si le DO a été touché ou non.
 */

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ZeroAgent } = await import('./chat-agent');
const { routeAgentRequest } = await import('agents');
const { authorizeAgentAccess } = await import('../../lib/agent-authorization');
type AgentLobby = { name: string };
const { IncomingMessageType } = await import('./types');
const { personalAgentName, LEGACY_SHARED_AGENT_NAME } = await import('@zero/types');

type Agent = InstanceType<typeof ZeroAgent>;

// `onStart` enregistre le MCP «thinking» par un flux SSE vers VITE_PUBLIC_BACKEND_URL.
// Hors sujet ici, et seule chose du constructeur qui exige le réseau : neutralisée sur le
// PROTOTYPE, ce qui laisse la classe réelle intacte partout ailleurs.
vi.spyOn(ZeroAgent.prototype, 'registerThinkingMCP').mockResolvedValue(undefined);

// --- substrat Durable Object -----------------------------------------------------------

const newAgent = (): Agent => {
  // Un DO = un magasin SQL isolé. Une base SQLite en mémoire par instance rend cette
  // isolation RÉELLE : si le routage renvoyait deux utilisateurs vers la même instance,
  // ils partageraient vraiment la même table, et le test le verrait.
  const db = new DatabaseSync(':memory:');
  const ctx = {
    storage: {
      sql: { exec: (q: string, ...p: unknown[]) => db.prepare(q).all(...(p as never[])) },
      get: async () => undefined,
      put: async () => {},
      delete: async () => {},
      setAlarm: async () => {},
      getAlarm: async () => null,
    },
    blockConcurrencyWhile: async (f: () => unknown) => f(),
    getWebSockets: () => [],
    waitUntil: () => {},
    acceptWebSocket: () => {},
  };
  type Args = ConstructorParameters<typeof ZeroAgent>;
  return new ZeroAgent(
    ctx as unknown as Args[0],
    {
      VITE_PUBLIC_BACKEND_URL: 'https://server.test',
    } as unknown as Args[1],
  );
};

/**
 * Instance déjà nommée, comme `Server.fetch` la nomme à la première requête (il lit
 * l'en-tête `x-partykit-room` posé par `routePartykitRequest` puis appelle `setName`).
 * Sert à préparer un état existant avant de le faire attaquer.
 */
const seeded = async (name: string): Promise<Agent> => {
  const agent = newAgent();
  await (agent as unknown as { setName: (n: string) => Promise<void> }).setName(name);
  return agent;
};

let instances: Map<string, Agent>;

/** `idFromName(name)` → `get(id)` : l'instance n'existe QUE si une requête l'atteint. */
const namespace = () => ({
  idFromName: (name: string) => name,
  get: (id: string) => ({
    fetch: (req: Request) => {
      let agent = instances.get(id);
      if (!agent) {
        agent = newAgent();
        instances.set(id, agent);
      }
      return agent.fetch(req);
    },
  }),
});

// --- population : deux locataires ------------------------------------------------------

const USERS: Record<string, string> = { 'cookie-alice': 'alice', 'cookie-mallory': 'mallory' };
const CONNECTIONS: Record<string, string> = { 'conn-alice': 'alice', 'conn-mallory': 'mallory' };

/** Politique COURANTE, câblée comme `routes/index.ts` la câble. */
const currentPolicy = (request: Request, lobby: AgentLobby) =>
  authorizeAgentAccess(request, lobby, {
    resolveUserId: async (headers) => USERS[headers.get('cookie') ?? ''],
    ownsConnection: async (userId, connectionId) => CONNECTIONS[connectionId] === userId,
  });

/**
 * Politique D'AVANT le correctif, reproduite verbatim (`agent-authorization.ts:59` :
 * `if (lobby.name === SHARED_AGENT_NAME) return undefined;`). Elle sert de FALSIFICATION :
 * les mêmes requêtes, passées par elle, doivent FUIR. Un test qui ne fuit pas sous
 * l'ancienne politique ne prouverait rien de la nouvelle.
 */
const legacyPolicy = async (request: Request, lobby: AgentLobby) => {
  const userId = USERS[request.headers.get('cookie') ?? ''];
  if (!userId) return new Response('Unauthorized', { status: 401 });
  if (lobby.name === LEGACY_SHARED_AGENT_NAME) return undefined;
  return CONNECTIONS[lobby.name] === userId
    ? undefined
    : new Response('Forbidden', { status: 403 });
};

type Policy = (request: Request, lobby: AgentLobby) => Promise<Response | undefined>;

const call = async (
  cookie: string,
  name: string,
  init: RequestInit = {},
  policy: Policy = currentPolicy,
) =>
  routeAgentRequest(
    new Request(`https://server.test/agents/zero-agent/${name}/get-messages`, {
      ...init,
      headers: { cookie, ...(init.headers as Record<string, string>) },
    }),
    { ZERO_AGENT: namespace() } as never,
    { onBeforeRequest: policy, onBeforeConnect: policy },
  );

const connect = (cookie: string, name: string, policy: Policy = currentPolicy) =>
  call(cookie, name, { headers: { Upgrade: 'websocket' } }, policy);

const message = (id: string, content: string) => ({
  id,
  role: 'user' as const,
  content,
  parts: [{ type: 'text' as const, text: content }],
});

/** Écrit dans une instance par le VRAI chemin WebSocket applicatif. */
const sendFrame = async (agent: Agent, frame: unknown, connectionId = 'ws-1') => {
  const sent: string[] = [];
  await agent.onMessage(
    { id: connectionId, send: (d: string) => sent.push(d) } as unknown as Parameters<
      Agent['onMessage']
    >[0],
    JSON.stringify(frame),
  );
  return sent;
};

const readMessages = async (res: Response | null) =>
  res && res.status === 200 ? ((await res.json()) as { id: string }[]) : null;

beforeEach(() => {
  instances = new Map();
});

// ---------------------------------------------------------------------------------------

describe('cloisonnement des instances de ZeroAgent', () => {
  it('un nom personnel donne à chaque utilisateur une instance DISTINCTE', async () => {
    const alice = await call('cookie-alice', personalAgentName('alice'));
    const mallory = await call('cookie-mallory', personalAgentName('mallory'));

    expect(alice?.status).toBe(200);
    expect(mallory?.status).toBe(200);
    expect([...instances.keys()].sort()).toEqual(['user-alice', 'user-mallory']);
    expect(instances.get('user-alice')).not.toBe(instances.get('user-mallory'));
  });

  it("LECTURE — le nom partagé `general` est refusé, la fuite d'avant est reproduite", async () => {
    // État déjà présent en production dans l'instance partagée : la conversation d'Alice.
    const shared = await seeded(LEGACY_SHARED_AGENT_NAME);
    instances.set(LEGACY_SHARED_AGENT_NAME, shared);
    await shared.persistMessages([message('a1', "secret d'alice")] as never);

    // AVANT — la politique d'origine laisse Mallory lire la conversation d'Alice.
    const leaked = await readMessages(
      (await call('cookie-mallory', LEGACY_SHARED_AGENT_NAME, {}, legacyPolicy)) ?? null,
    );
    expect(leaked?.map((m) => m.id)).toEqual(['a1']);

    // APRÈS — la même requête est refusée.
    const refused = await call('cookie-mallory', LEGACY_SHARED_AGENT_NAME);
    expect(refused?.status).toBe(403);
    expect(await refused?.text()).toBe('Forbidden');
  });

  it("LECTURE — un utilisateur ne peut pas lire l'instance personnelle d'un autre", async () => {
    const alice = await seeded(personalAgentName('alice'));
    instances.set(personalAgentName('alice'), alice);
    await alice.persistMessages([message('a1', "secret d'alice")] as never);

    const stolen = await call('cookie-mallory', personalAgentName('alice'));
    expect(stolen?.status).toBe(403);

    // Alice, elle, lit la sienne — et seulement la sienne.
    const own = await readMessages(
      (await call('cookie-alice', personalAgentName('alice'))) ?? null,
    );
    expect(own?.map((m) => m.id)).toEqual(['a1']);
  });

  it("ÉCRASEMENT — le WebSocket d'un autre locataire est refusé avant d'atteindre le DO", async () => {
    const alice = await seeded('conn-alice');
    instances.set('conn-alice', alice);
    await sendFrame(alice, {
      type: IncomingMessageType.ChatMessages,
      messages: [message('a1', "conversation d'alice")],
    });
    expect(alice.messages.map((m) => m.id)).toEqual(['a1']);

    // Mallory tente la connexion WebSocket sur la boîte d'Alice, puis sur le nom partagé.
    expect((await connect('cookie-mallory', 'conn-alice'))?.status).toBe(403);
    expect((await connect('cookie-mallory', LEGACY_SHARED_AGENT_NAME))?.status).toBe(403);
    // Le refus intervient AVANT `stub.fetch` : l'instance partagée n'a jamais été créée.
    expect(instances.has(LEGACY_SHARED_AGENT_NAME)).toBe(false);

    // La conversation d'Alice est intacte.
    expect(alice.messages.map((m) => m.id)).toEqual(['a1']);
  });

  it("EFFACEMENT — un autre locataire ne peut pas vider la conversation d'autrui", async () => {
    const alice = await seeded('conn-alice');
    instances.set('conn-alice', alice);
    await sendFrame(alice, {
      type: IncomingMessageType.ChatMessages,
      messages: [message('a1', "conversation d'alice")],
    });

    expect((await connect('cookie-mallory', 'conn-alice'))?.status).toBe(403);
    expect(alice.messages).toHaveLength(1);

    // Alice, propriétaire de la connexion, efface bien la sienne.
    await sendFrame(alice, { type: IncomingMessageType.ChatClear });
    expect(alice.messages).toHaveLength(0);
  });

  it('un anonyme est refusé et ne crée aucune instance', async () => {
    expect((await call('cookie-inconnu', personalAgentName('alice')))?.status).toBe(401);
    expect(instances.size).toBe(0);
  });
});

describe('instance sans portée de boîte aux lettres', () => {
  it("ne persiste RIEN et ne diffuse RIEN sur une demande de chat (le garde est passé AVANT l'écriture)", async () => {
    const personal = await seeded(personalAgentName('alice'));
    const broadcast = vi.spyOn(personal, 'broadcast').mockImplementation(() => {});

    await sendFrame(personal, {
      type: IncomingMessageType.UseChatRequest,
      id: 'req-1',
      init: {
        method: 'POST',
        body: JSON.stringify({
          messages: [message('m1', 'bonjour')],
          threadId: 't',
          currentFolder: 'inbox',
          currentFilter: '',
        }),
      },
    });

    expect(personal.messages).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();

    // Et rien à lire ensuite, y compris pour le propriétaire légitime.
    instances.set(personalAgentName('alice'), personal);
    const own = await readMessages(
      (await call('cookie-alice', personalAgentName('alice'))) ?? null,
    );
    expect(own).toEqual([]);
  });

  it('une instance de connexion, elle, persiste normalement', async () => {
    const scoped = await seeded('conn-alice');
    await sendFrame(scoped, {
      type: IncomingMessageType.ChatMessages,
      messages: [message('m1', 'bonjour')],
    });
    expect(scoped.messages.map((m) => m.id)).toEqual(['m1']);
  });
});
