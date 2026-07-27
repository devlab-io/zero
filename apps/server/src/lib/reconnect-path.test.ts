import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P2 — LE PARCOURS DE RECONNEXION ÉTAIT PERDU. Preuve de bout en bout.
 *
 * Chaîne RÉELLE, telle qu'un utilisateur la déclenche : une requête HTTP sur une procédure
 * `activeDriverProcedure` (`mail.listThreads`, `labels.list`, …) dont le resolver appelle
 * `getZeroAgent(connectionId)` → `getShardClient` → `stub.setName` → `ZeroDriver.setupAuth`
 * → `connectionToDriver`. Quand la connexion a perdu ses jetons OAuth, `connectionToDriver`
 * lève `AppError.connectionExpired('Invalid connection …')`.
 *
 * CE QUI ÉTAIT CASSÉ. L'erreur était JETÉE depuis le Durable Object : la frontière RPC la
 * réduisait à une `Error` nue (mesure workerd : propriétés propres `stack/message/remote`),
 * `getShardClient` la ré-emballait en `new Error('Shard initialization failed: …')`,
 * `resolveErrorCode` rendait donc `INTERNAL`, et `classifyDriverFailure` — dont les
 * marqueurs sont 'precondition check' / 'insufficient permission' / 'invalid credentials' /
 * 'invalid_grant' — ne reconnaissait rien. Aucun `X-Zero-Redirect`, `appCode: INTERNAL` sur
 * le fil : l'utilisateur n'avait plus AUCUN moyen de se reconnecter, là où l'ancien
 * `err.message.includes('Invalid connection')` le lui proposait.
 *
 * CORRIGÉ À LA SOURCE. `setupAuth`/`setName` rendent un VERDICT sérialisable au lieu de
 * jeter ; `getShardClient` reconstruit l'`AppError` typée côté Worker ; `classifyDriverFailure`
 * lit le CODE avant tout marqueur de texte.
 *
 * Doubles limités à la frontière réseau (client Durable Object `dormroom`, environnement
 * Workers). Le producteur d'erreur (`connectionToDriver`), le classement du verdict
 * (`toDriverSetupResult`), sa rehausse (`fromDriverSetupResult`), le garde
 * (`classifyDriverFailure`), le formateur (`withAppCode`) et l'enveloppe HTTP tRPC sont le
 * code de PRODUCTION.
 */

/** Connexion dont l'octroi OAuth a perdu ses jetons : le cas vécu. */
const connectionSansJetons = {
  id: 'conn-1',
  userId: 'user-1',
  email: 'thomas@devlab.io',
  name: 'Thomas',
  picture: null,
  accessToken: null,
  refreshToken: null,
  scope: null,
  providerId: 'google',
  expiresAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

/**
 * Le stub de shard REPRODUIT `ZeroDriver.setupAuth` : il appelle le VRAI
 * `connectionToDriver` sur la ligne lue en base, et classe l'échec avec le VRAI
 * `toDriverSetupResult` — exactement les deux appels que fait la méthode du Durable Object.
 * Ce qui reste simulé est uniquement la traversée RPC elle-même.
 */
let ligneConnexion: typeof connectionSansJetons | null = connectionSansJetons;

const shardStub = {
  setName: vi.fn(async () => {
    if (!ligneConnexion) return { ok: true, code: null, message: null };
    try {
      connectionToDriver(ligneConnexion as never);
      return { ok: true, code: null, message: null };
    } catch (error) {
      return toDriverSetupResult(error);
    }
  }),
  getDatabaseSize: vi.fn(async () => 1),
  getUserLabels: vi.fn(async () => []),
};

vi.mock('dormroom', () => ({
  createClient: () => ({
    exec: async () => ({ array: [{ shard_id: 's1' }] }),
    stub: shardStub,
  }),
}));
vi.mock('../env', () => ({
  env: {
    SHARD_REGISTRY: {},
    ZERO_DRIVER: {},
    ZERO_AGENT: { get: () => ({}), idFromName: (name: string) => name },
    HYPERDRIVE: { connectionString: 'postgres://x' },
  },
}));
vi.mock('./driver', () => ({ createDriver: vi.fn(() => ({})) }));
vi.mock('./connection-context', () => ({ getActiveConnection: vi.fn(), getZeroDB: vi.fn() }));
vi.mock('./pubsub-auth', () => ({
  resolvePubSubTokenPolicy: vi.fn(),
  verifyPubSubToken: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../db', () => ({ withDb: vi.fn() }));
vi.mock('./logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { connectionToDriver, getZeroAgent } = await import('./server-utils');
const { toDriverSetupResult, withAppCode, AppError, resolveErrorCode } = await import('./errors');
const { classifyDriverFailure } = await import('./trpc-guards');
const { initTRPC } = await import('@trpc/server');
const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');

// --- Réplique MINIMALE de la chaîne de procédures de trpc/trpc.ts ----------------------
// `activeDriverProcedure` y est entrelacé avec le contexte hono (AsyncLocalStorage) et le
// rate limiter Redis ; on remonte ici la seule composition qui décide — `next()`, puis le
// VRAI `classifyDriverFailure` sur `res.error` — avec le VRAI `errorFormatter`.

type Deps = { clearTokens: () => Promise<unknown>; setReconnectHeader: (id: string) => void };

const construireApp = (deps: Deps) => {
  const t = initTRPC.create({
    errorFormatter({ shape, error }) {
      return withAppCode(shape, error);
    },
  });

  const activeDriverProcedure = t.procedure.use(async ({ next }) => {
    const res = await next();
    if (!res.ok) {
      const failure = await classifyDriverFailure(res.error, 'conn-1', deps);
      if (failure) throw failure;
    }
    return res;
  });

  return t.router({
    listThreads: activeDriverProcedure.query(async () => {
      // Le resolver RÉEL de mail.listThreads / labels.list commence exactement ici.
      const { stub } = await getZeroAgent('conn-1');
      return stub.getUserLabels();
    }),
  });
};

type ReponseTrpc = {
  error?: { message: string; code: number; data: { appCode?: string; code?: string } };
  result?: unknown;
};

const appeler = async (deps: Deps) => {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request('http://zero.test/api/trpc/listThreads'),
    router: construireApp(deps),
    createContext: () => ({}),
    onError: () => {},
  });
  return { response, body: (await response.json()) as ReponseTrpc };
};

beforeEach(() => {
  ligneConnexion = connectionSansJetons;
  shardStub.setName.mockClear();
});

describe('reconnexion — chaîne complète depuis une requête tRPC', () => {
  it('connectionToDriver refuse une connexion sans jetons avec un code TYPÉ', () => {
    // Le producteur, tel quel. C'est ce code que la frontière RPC aplatissait.
    let capturee: unknown;
    try {
      connectionToDriver(connectionSansJetons as never);
    } catch (error) {
      capturee = error;
    }
    expect(capturee).toBeInstanceOf(AppError);
    expect(resolveErrorCode(capturee)).toBe('CONNECTION_EXPIRED');
    expect((capturee as Error).message).toContain('Invalid connection');
  });

  it('setupAuth rend un verdict transportable au lieu de jeter à travers le RPC', async () => {
    const verdict = await shardStub.setName();
    expect(verdict).toEqual({
      ok: false,
      code: 'CONNECTION_EXPIRED',
      message: expect.stringContaining('Invalid connection'),
    });
  });

  it('getZeroAgent rejette avec une AppError CONNECTION_EXPIRED, pas une enveloppe opaque', async () => {
    let capturee: unknown;
    try {
      await getZeroAgent('conn-1');
    } catch (error) {
      capturee = error;
    }
    // AVANT : `Error('Shard initialization failed: Error: Invalid connection "conn-1"')`
    // → resolveErrorCode = INTERNAL.
    expect(resolveErrorCode(capturee)).toBe('CONNECTION_EXPIRED');
    expect((capturee as Error).message).not.toContain('Shard initialization failed');
  });

  it('la requête HTTP pose X-Zero-Redirect, efface les jetons et publie CONNECTION_EXPIRED', async () => {
    const clearTokens = vi.fn(async () => undefined);
    const redirections: string[] = [];
    const { body } = await appeler({
      clearTokens,
      setReconnectHeader: (id) => void redirections.push(id),
    });

    // Les trois effets que l'utilisateur voyait disparaître.
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(redirections).toEqual(['conn-1']);
    expect(body.error?.data.appCode).toBe('CONNECTION_EXPIRED');
    // `apps/mail/lib/error-codes.ts` ne lit QUE ce champ : c'est ce qui rouvre le parcours.
  });

  it('une panne d’infrastructure ne déclenche RIEN de tout cela (aucun élargissement)', async () => {
    // Le shard répond, mais l'opération du resolver échoue : rien ne prouve que l'octroi
    // OAuth soit en cause. Ni jetons effacés, ni redirection, ni code de réautorisation.
    ligneConnexion = null;
    shardStub.getUserLabels.mockRejectedValueOnce(new Error('Durable Object is overloaded'));

    const clearTokens = vi.fn(async () => undefined);
    const redirections: string[] = [];
    const { body } = await appeler({
      clearTokens,
      setReconnectHeader: (id) => void redirections.push(id),
    });

    expect(clearTokens).not.toHaveBeenCalled();
    expect(redirections).toEqual([]);
    expect(body.error?.data.appCode).toBe('INTERNAL');
  });

  it('un octroi révoqué par Google (invalid_grant) reste reconnu par son libellé', async () => {
    // Cette chaîne-là vient de GOOGLEAPIS, pas de nous : elle n'a pas de code stable en
    // amont, et le repli sur marqueurs doit continuer de la traiter.
    ligneConnexion = null;
    shardStub.getUserLabels.mockRejectedValueOnce(new Error('invalid_grant: token revoked'));

    const clearTokens = vi.fn(async () => undefined);
    const redirections: string[] = [];
    const { body } = await appeler({
      clearTokens,
      setReconnectHeader: (id) => void redirections.push(id),
    });

    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(redirections).toEqual(['conn-1']);
    expect(body.error?.data.appCode).toBe('CONNECTION_EXPIRED');
  });
});
