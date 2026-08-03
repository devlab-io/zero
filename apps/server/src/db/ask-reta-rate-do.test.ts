import { DbRpcDO, ZeroDB } from './durable-objects';
import { describe, expect, it, vi } from 'vitest';

// Prod fix 2026-08-01 : fallback durable du rate limit Ask Reta. Le bucket
// vit dans le storage du DO PAR UTILISATEUR (idFromName(userId)) sous une
// clé fixe sans PII, consommé dans une transaction — les appels concurrents
// se sérialisent, jamais de lost update.

const WINDOW_MS = 5 * 60 * 1000;

/** Fake DurableObjectState : transactions RÉELLEMENT sérialisées (file). */
const makeCtx = () => {
  const map = new Map<string, unknown>();
  let queue: Promise<unknown> = Promise.resolve();
  const txn = {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async (key: string, value: unknown) => void map.set(key, value),
  };
  return {
    map,
    ctx: {
      storage: {
        transaction: <T>(fn: (t: typeof txn) => Promise<T>): Promise<T> => {
          const run = queue.then(() => fn(txn));
          queue = run.catch(() => {});
          return run;
        },
      },
    },
  };
};

const makeDo = () => {
  const { map, ctx } = makeCtx();
  const zeroDb = new ZeroDB(
    ctx as never,
    { HYPERDRIVE: { connectionString: 'postgres://fake' } } as never,
  );
  return { map, zeroDb };
};

describe('ZeroDB.consumeAskRetaRateLimit — fenêtre exacte 20/5 min durable', () => {
  it('autorise 20 appels puis refuse le 21e (429 à la surface) avec un reset honnête', async () => {
    const { map, zeroDb } = makeDo();
    for (let i = 0; i < 20; i += 1) {
      const result = await zeroDb.consumeAskRetaRateLimit();
      expect(result.allowed, `appel ${i + 1}`).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(20 - (i + 1));
    }
    const denied = await zeroDb.consumeAskRetaRateLimit();
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.reset).toBeGreaterThan(Date.now());
    expect(denied.reset).toBeLessThanOrEqual(Date.now() + WINDOW_MS);
    // Clé de storage FIXE, sans PII (pas d'userId, pas de contenu).
    expect([...map.keys()]).toEqual(['reta:ask-rate:v1']);
  });

  it('25 appels CONCURRENTS : exactement 20 accordés, 5 refusés (transactions sérialisées)', async () => {
    const { zeroDb } = makeDo();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => zeroDb.consumeAskRetaRateLimit()),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    expect(results.filter((r) => !r.allowed)).toHaveLength(5);
  });

  it('purge les timestamps expirés : un bucket plein redevient disponible après la fenêtre', async () => {
    const { map, zeroDb } = makeDo();
    const stale = Array.from({ length: 20 }, (_, i) => Date.now() - WINDOW_MS - 1_000 - i);
    map.set('reta:ask-rate:v1', stale);
    const result = await zeroDb.consumeAskRetaRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
    // Le storage ne garde que les entrées vivantes (purge persistée).
    expect((map.get('reta:ask-rate:v1') as number[]).length).toBe(1);
  });

  it('ISOLATION par utilisateur : le bucket épuisé de A ne touche jamais B (DO distincts)', async () => {
    const a = makeDo();
    const b = makeDo();
    for (let i = 0; i < 20; i += 1) await a.zeroDb.consumeAskRetaRateLimit();
    expect((await a.zeroDb.consumeAskRetaRateLimit()).allowed).toBe(false);
    expect((await b.zeroDb.consumeAskRetaRateLimit()).allowed).toBe(true);
  });
});

describe('DbRpcDO.consumeAskRetaRateLimit — façade structurellement scopée', () => {
  it("délègue SANS aucun identifiant : aucune route ne peut viser le bucket d'un autre utilisateur", async () => {
    const mainDo = {
      consumeAskRetaRateLimit: vi.fn(async () => ({
        allowed: true,
        limit: 20,
        remaining: 19,
        reset: 1,
      })),
    };
    const facade = new DbRpcDO(mainDo as never, 'user-a');
    await expect(facade.consumeAskRetaRateLimit()).resolves.toMatchObject({ allowed: true });
    // Pas de paramètre : le scoping est le DO lui-même, pas un argument.
    expect(mainDo.consumeAskRetaRateLimit).toHaveBeenCalledWith();
  });
});

describe('ZeroDB.consumeCopilotControlRateLimit — buckets BYOK séparés par utilisateur', () => {
  it('applique 10/5 min aux écritures et 30/5 min à la sélection, avec des clés sans PII', async () => {
    const { map, zeroDb } = makeDo();
    expect(await zeroDb.consumeCopilotControlRateLimit('byok-set')).toMatchObject({
      allowed: true,
      limit: 10,
      remaining: 9,
    });
    expect(await zeroDb.consumeCopilotControlRateLimit('byok-delete')).toMatchObject({
      allowed: true,
      limit: 10,
      remaining: 9,
    });
    expect(await zeroDb.consumeCopilotControlRateLimit('byok-select')).toMatchObject({
      allowed: true,
      limit: 30,
      remaining: 29,
    });
    expect([...map.keys()].sort()).toEqual([
      'reta:control-rate:byok-delete:v1',
      'reta:control-rate:byok-select:v1',
      'reta:control-rate:byok-set:v1',
    ]);
  });

  it("épuiser l'enregistrement ne bloque ni la suppression ni la sélection", async () => {
    const { zeroDb } = makeDo();
    for (let i = 0; i < 10; i += 1) {
      expect((await zeroDb.consumeCopilotControlRateLimit('byok-set')).allowed).toBe(true);
    }
    expect((await zeroDb.consumeCopilotControlRateLimit('byok-set')).allowed).toBe(false);
    expect((await zeroDb.consumeCopilotControlRateLimit('byok-delete')).allowed).toBe(true);
    expect((await zeroDb.consumeCopilotControlRateLimit('byok-select')).allowed).toBe(true);
  });
});

describe('DbRpcDO.consumeCopilotControlRateLimit — façade structurellement scopée', () => {
  it("délègue uniquement le type d'opération, jamais un identifiant utilisateur", async () => {
    const mainDo = {
      consumeCopilotControlRateLimit: vi.fn(async () => ({
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: 1,
      })),
    };
    const facade = new DbRpcDO(mainDo as never, 'user-a');
    await expect(facade.consumeCopilotControlRateLimit('byok-set')).resolves.toMatchObject({
      allowed: true,
    });
    expect(mainDo.consumeCopilotControlRateLimit).toHaveBeenCalledWith('byok-set');
  });
});
