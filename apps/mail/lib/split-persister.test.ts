import {
  createSplitIDBPersister,
  splitPersistedQueries,
  DETAILS_KEY_SUFFIX,
} from './split-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { hydrate, QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

// r10 : le restore bloquant ne porte que les listes ; les corps s'hydratent
// après le premier paint, sous les MÊMES gardes buster/âge que le blob
// principal (contre-revue P0 : sans enveloppe propre, un blob détails périmé
// ou d'un ancien build contournerait maxAge/CACHE_BURST_KEY).

const BUSTER = 'test-buster';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAIN_KEY = 'zero-query-cache-user-1-conn-a';

function makeStorage(initial: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    map,
    get: async (key: string) => map.get(key),
    set: async (key: string, value: unknown) => void map.set(key, value),
    del: async (key: string) => void map.delete(key),
  };
}

const listQuery = {
  queryKey: [['mail', 'listThreads'], { type: 'infinite' }],
  queryHash: 'list',
  state: { data: { pages: [] }, dataUpdatedAt: Date.now(), status: 'success' },
};
const detailQuery = {
  queryKey: [['mail', 'get'], { input: { id: 't1' } }],
  queryHash: 'detail',
  state: { data: { messages: [] }, dataUpdatedAt: Date.now(), status: 'success' },
};
const contentQuery = {
  queryKey: ['email-content', 'm1', false, 'dark'],
  queryHash: 'content',
  state: { data: { html: '<p>x</p>' }, dataUpdatedAt: Date.now(), status: 'success' },
};

const client = (queries: unknown[]): PersistedClient => ({
  timestamp: Date.now(),
  buster: BUSTER,
  clientState: { mutations: [], queries: queries as PersistedClient['clientState']['queries'] },
});

const makePersister = (storage: ReturnType<typeof makeStorage>) =>
  createSplitIDBPersister(storage, MAIN_KEY, { buster: BUSTER, maxAgeMs: MAX_AGE });

describe('splitPersistedQueries', () => {
  it('sépare listes/état (critiques) des corps (mail.get + email-content)', () => {
    const [critical, details] = splitPersistedQueries([
      listQuery,
      detailQuery,
      contentQuery,
    ] as never[]);
    expect(critical).toEqual([listQuery]);
    expect(details).toEqual([detailQuery, contentQuery]);
  });
});

describe('createSplitIDBPersister — persist/restore scindés', () => {
  it('persiste les listes sous la clé principale et les corps sous ::details AVEC enveloppe', async () => {
    const storage = makeStorage();
    const { persister } = makePersister(storage);

    await persister.persistClient(client([listQuery, detailQuery, contentQuery]));

    const main = storage.map.get(MAIN_KEY) as PersistedClient;
    expect(main.clientState.queries).toEqual([listQuery]);
    const details = storage.map.get(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`) as PersistedClient;
    // Enveloppe complète : timestamp + buster + mutations vides + queries détails.
    expect(typeof details.timestamp).toBe('number');
    expect(details.buster).toBe(BUSTER);
    expect(details.clientState.mutations).toEqual([]);
    expect(details.clientState.queries).toEqual([detailQuery, contentQuery]);
  });

  it('le restore BLOQUANT ne rend que la clé principale (les corps ne bloquent plus le paint)', async () => {
    const storage = makeStorage();
    const { persister } = makePersister(storage);
    await persister.persistClient(client([listQuery, detailQuery]));

    const restored = (await persister.restoreClient()) as PersistedClient;
    expect(restored.clientState.queries).toEqual([listQuery]);
  });

  it('blob legacy (pré-scission) sous la clé principale : restauré tel quel — migration sans perte', async () => {
    const legacy = client([listQuery, detailQuery]);
    const storage = makeStorage({ [MAIN_KEY]: legacy });
    const { persister } = makePersister(storage);
    expect(await persister.restoreClient()).toEqual(legacy);
  });

  it('removeClient supprime les DEUX clés', async () => {
    const storage = makeStorage();
    const { persister } = makePersister(storage);
    await persister.persistClient(client([listQuery, detailQuery]));
    await persister.removeClient();
    expect(storage.map.size).toBe(0);
  });
});

describe('restoreDetails — gardes buster/âge (contre-revue P0)', () => {
  it('blob valide → queries détails', async () => {
    const storage = makeStorage();
    const split = makePersister(storage);
    await split.persister.persistClient(client([listQuery, detailQuery]));
    expect(await split.restoreDetails()).toEqual([detailQuery]);
  });

  it('blob PÉRIMÉ (> maxAge) → null ET ::details supprimé', async () => {
    const storage = makeStorage({
      [`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`]: {
        timestamp: Date.now() - MAX_AGE - 1,
        buster: BUSTER,
        clientState: { mutations: [], queries: [detailQuery] },
      },
    });
    const split = makePersister(storage);
    expect(await split.restoreDetails()).toBeNull();
    expect(storage.map.has(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`)).toBe(false);
  });

  it('buster d’un AUTRE build → null ET ::details supprimé', async () => {
    const storage = makeStorage({
      [`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`]: {
        timestamp: Date.now(),
        buster: 'other-build',
        clientState: { mutations: [], queries: [detailQuery] },
      },
    });
    const split = makePersister(storage);
    expect(await split.restoreDetails()).toBeNull();
    expect(storage.map.has(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`)).toBe(false);
  });

  it('forme legacy (tableau nu, sans enveloppe) → null ET supprimé — jamais hydraté sans gardes', async () => {
    const storage = makeStorage({
      [`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`]: [detailQuery],
    });
    const split = makePersister(storage);
    expect(await split.restoreDetails()).toBeNull();
    expect(storage.map.has(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`)).toBe(false);
  });

  it('absent ou vide → null, rien à supprimer', async () => {
    const split = makePersister(makeStorage());
    expect(await split.restoreDetails()).toBeNull();
  });
});

describe('hydratation différée — ne remplace JAMAIS une réponse réseau plus fraîche', () => {
  const KEY = [['mail', 'get'], { input: { id: 't1' } }];

  it('hydrate (vraie lib) garde la donnée en cache si elle est plus récente que le blob', () => {
    const queryClient = new QueryClient();
    // Réponse réseau fraîche déjà en cache (arrivée pendant le restore différé).
    queryClient.setQueryData(KEY, { body: 'fresh-network' }, { updatedAt: Date.now() });

    hydrate(queryClient, {
      queries: [
        {
          queryKey: KEY,
          queryHash: JSON.stringify(KEY),
          state: {
            data: { body: 'stale-disk' },
            dataUpdatedAt: Date.now() - 60_000,
            status: 'success',
          },
        },
      ],
    } as never);

    expect(queryClient.getQueryData(KEY)).toEqual({ body: 'fresh-network' });
  });

  it('hydrate applique bien un blob plus récent que le cache (sémantique dataUpdatedAt)', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(KEY, { body: 'older-cache' }, { updatedAt: Date.now() - 120_000 });

    hydrate(queryClient, {
      queries: [
        {
          queryKey: KEY,
          queryHash: JSON.stringify(KEY),
          state: {
            data: { body: 'newer-disk' },
            dataUpdatedAt: Date.now() - 1_000,
            status: 'success',
          },
        },
      ],
    } as never);

    expect(queryClient.getQueryData(KEY)).toEqual({ body: 'newer-disk' });
  });
});
