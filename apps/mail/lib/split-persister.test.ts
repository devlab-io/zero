import {
  createSplitIDBPersister,
  readPriorityThreadIdFromSearch,
  selectPriorityDetailQueries,
  splitPersistedQueries,
  DETAILS_KEY_SUFFIX,
} from './split-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { hashKey, hydrate, QueryClient } from '@tanstack/react-query';
import { hasCompleteThreadBodies } from './thread-detail-cache';
import { emailContentQueryKey } from './email-content-query';
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

describe('garde anti-réécriture des détails (r11 — empreinte bon marché)', () => {
  it('empreinte inchangée → AUCUNE lecture/sérialisation de state.data détail et AUCUN write ::details', async () => {
    const storage = makeStorage();
    const split = makePersister(storage);
    const at = Date.now();
    const stableDetail = {
      queryKey: [['mail', 'get'], { input: { id: 't1' } }],
      queryHash: 'detail',
      state: { data: { messages: ['body'] }, dataUpdatedAt: at, status: 'success' },
    };

    await split.persister.persistClient(client([listQuery, stableDetail]));
    const detailWritesAfterFirst = [...storage.map.keys()].filter((k) =>
      k.endsWith(DETAILS_KEY_SUFFIX),
    ).length;
    expect(detailWritesAfterFirst).toBe(1);
    const firstBlob = storage.map.get(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`);

    // Second persist : MÊME empreinte (longueur + dataUpdatedAt identiques)
    // mais state.data PIÉGÉ — toute lecture/sérialisation du corps jetterait.
    const trappedDetail = {
      queryKey: [['mail', 'get'], { input: { id: 't1' } }],
      queryHash: 'detail',
      state: {
        get data(): unknown {
          throw new Error('state.data détail lu alors que l’empreinte est inchangée');
        },
        dataUpdatedAt: at,
        status: 'success',
      },
    };
    await split.persister.persistClient(client([listQuery, trappedDetail]));

    // Ni sérialisé (pas de throw), ni réécrit : le blob détails est intact.
    expect(storage.map.get(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`)).toBe(firstBlob);
  });

  it('empreinte changée (corps modifié → dataUpdatedAt bumpé) → budget appliqué et ::details réécrit', async () => {
    const storage = makeStorage();
    const split = makePersister(storage);
    await split.persister.persistClient(client([listQuery, detailQuery]));
    const before = storage.map.get(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`);

    const newer = {
      ...detailQuery,
      state: { ...detailQuery.state, dataUpdatedAt: Date.now() + 5_000 },
    };
    await split.persister.persistClient(client([listQuery, newer]));
    expect(storage.map.get(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`)).not.toBe(before);
  });
});

// ————————————————————————————————————————————————————————————————————————
// r16 : restore PRIORITAIRE du fil de l'URL. Preuve CUA staging (4e730554) :
// reload sur un fil déjà lu → data-ready 6499 ms — le corps persisté n'était
// hydraté qu'après paint+idle, APRÈS le départ réseau du lecteur. Le fil de
// ?threadId est désormais fusionné dans le restore BLOQUANT.
// ————————————————————————————————————————————————————————————————————————

const T1_KEY = [['mail', 'get'], { input: { id: 't1' }, type: 'query' }];
const bigBody = 'x'.repeat(1_500_000);
const threadT1 = {
  queryKey: T1_KEY,
  queryHash: hashKey(T1_KEY),
  state: {
    data: {
      messages: [
        { id: 'm1', decodedBody: '<p>un</p>' },
        { id: 'm2', decodedBody: bigBody },
      ],
      latest: { id: 'm2' },
    },
    dataUpdatedAt: Date.now(),
    status: 'success',
  },
};
const contentM1 = {
  queryKey: emailContentQueryKey('m1', true, 'light'),
  queryHash: hashKey(emailContentQueryKey('m1', true, 'light')),
  state: { data: { html: '<p>un</p>' }, dataUpdatedAt: Date.now(), status: 'success' },
};
const contentM2 = {
  queryKey: emailContentQueryKey('m2', true, 'light'),
  queryHash: hashKey(emailContentQueryKey('m2', true, 'light')),
  state: { data: { html: bigBody }, dataUpdatedAt: Date.now(), status: 'success' },
};
const threadT2 = {
  queryKey: [['mail', 'get'], { input: { id: 't2' }, type: 'query' }],
  queryHash: 'thread-t2',
  state: {
    data: { messages: [{ id: 'm9', decodedBody: '<p>autre</p>' }], latest: { id: 'm9' } },
    dataUpdatedAt: Date.now(),
    status: 'success',
  },
};
const contentM9 = {
  queryKey: emailContentQueryKey('m9', true, 'light'),
  queryHash: 'content-m9',
  state: { data: { html: '<p>autre</p>' }, dataUpdatedAt: Date.now(), status: 'success' },
};

function makeSpyStorage(initial: Record<string, unknown> = {}) {
  const base = makeStorage(initial);
  const reads: string[] = [];
  return {
    ...base,
    reads,
    get: async (key: string) => {
      reads.push(key);
      return base.get(key);
    },
  };
}

const makePriorityPersister = (
  storage: ReturnType<typeof makeStorage>,
  priorityThreadId: string | null,
  mainKey = MAIN_KEY,
) =>
  createSplitIDBPersister(storage, mainKey, {
    buster: BUSTER,
    maxAgeMs: MAX_AGE,
    getPriorityThreadId: () => priorityThreadId,
  });

describe('readPriorityThreadIdFromSearch — ?threadId de l’URL', () => {
  it('extrait le threadId, ignore le bruit, null sans paramètre ou vide', () => {
    expect(readPriorityThreadIdFromSearch('?threadId=19f9552d11a099e5&mode=reply')).toBe(
      '19f9552d11a099e5',
    );
    expect(readPriorityThreadIdFromSearch('')).toBeNull();
    expect(readPriorityThreadIdFromSearch('?folder=inbox')).toBeNull();
    expect(readPriorityThreadIdFromSearch('?threadId=')).toBeNull();
    expect(readPriorityThreadIdFromSearch('?threadId=%20')).toBeNull();
  });
});

describe('selectPriorityDetailQueries — sélection pure du fil + SES corps', () => {
  it('rend mail.get du fil et les email-content de ses messages, rien d’autre', () => {
    const selected = selectPriorityDetailQueries(
      [threadT2, contentM9, threadT1, contentM1, contentM2] as never[],
      't1',
    );
    expect(selected).toEqual([threadT1, contentM1, contentM2]);
  });

  it('fil absent du blob → vide (le lecteur retombe sur le réseau, cache froid honnête)', () => {
    expect(selectPriorityDetailQueries([threadT2, contentM9] as never[], 't1')).toEqual([]);
  });

  it('fil sans messages exploitables → la seule entrée mail.get', () => {
    const bare = {
      queryKey: [['mail', 'get'], { input: { id: 't3' }, type: 'query' }],
      queryHash: 'thread-t3',
      state: { data: { messages: [] }, dataUpdatedAt: Date.now(), status: 'success' },
    };
    expect(selectPriorityDetailQueries([bare, contentM1] as never[], 't3')).toEqual([bare]);
  });
});

describe('restore prioritaire BLOQUANT (r16)', () => {
  it('corps de 1,5 Mo persisté puis restauré AVANT le réseau : entrée intacte, politique zéro-refetch', async () => {
    const storage = makeStorage();
    const split = makePriorityPersister(storage, 't1');
    await split.persister.persistClient(
      client([listQuery, threadT1, contentM1, contentM2, threadT2, contentM9]),
    );

    const restored = (await split.persister.restoreClient()) as PersistedClient;
    // Restore bloquant = listes + LE fil demandé et SES corps ; les autres
    // corps (t2/m9) restent à l'hydratation idle.
    expect(restored.clientState.queries).toEqual([listQuery, threadT1, contentM1, contentM2]);

    // L'entrée lourde n'est ni tronquée ni écrasée…
    const queryClient = new QueryClient();
    hydrate(queryClient, restored.clientState);
    const data = queryClient.getQueryData(T1_KEY) as {
      messages: { decodedBody: string }[];
    };
    expect(data.messages[1].decodedBody).toHaveLength(1_500_000);
    // …et satisfait le contrat zéro-réseau du lecteur : corps complets →
    // staleTime 1 h + refetchOnMount false (useOpenThreadQueryOptions dérive
    // les deux de hasCompleteThreadBodies).
    expect(hasCompleteThreadBodies(data)).toBe(true);
  });

  it('sans threadId dans l’URL : clé principale seule, le blob détails n’est PAS lu', async () => {
    const storage = makeSpyStorage();
    const split = makePriorityPersister(storage, null);
    await split.persister.persistClient(client([listQuery, threadT1]));
    storage.reads.length = 0;

    const restored = (await split.persister.restoreClient()) as PersistedClient;
    expect(restored.clientState.queries).toEqual([listQuery]);
    expect(storage.reads).toEqual([MAIN_KEY]);
  });

  it('blob détails corrompu/périmé avec threadId demandé : listes seules, blob supprimé — fallback réseau', async () => {
    const storage = makeStorage();
    const split = makePriorityPersister(storage, 't1');
    await split.persister.persistClient(client([listQuery, threadT1]));
    storage.map.set(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`, {
      timestamp: Date.now() - MAX_AGE - 1,
      buster: BUSTER,
      clientState: { mutations: [], queries: [threadT1] },
    });

    const restored = (await split.persister.restoreClient()) as PersistedClient;
    expect(restored.clientState.queries).toEqual([listQuery]);
    expect(storage.map.has(`${MAIN_KEY}${DETAILS_KEY_SUFFIX}`)).toBe(false);
  });

  it('listes absentes mais fil demandé présent : enveloppe détails validée portant le fil seul', async () => {
    const storage = makeStorage();
    const split = makePriorityPersister(storage, 't1');
    await split.persister.persistClient(client([listQuery, threadT1, contentM2]));
    storage.map.delete(MAIN_KEY);

    const restored = (await split.persister.restoreClient()) as PersistedClient;
    expect(restored.buster).toBe(BUSTER);
    expect(typeof restored.timestamp).toBe('number');
    expect(restored.clientState.queries).toEqual([threadT1, contentM2]);
  });

  it('isolation A→B→A : le restore prioritaire de B ne lit ni ne rend JAMAIS les clés de A', async () => {
    const storage = makeSpyStorage();
    const splitA = makePriorityPersister(storage, 't1');
    await splitA.persister.persistClient(client([listQuery, threadT1, contentM2]));

    const B_KEY = 'zero-query-cache-user-2-conn-b';
    const splitB = makePriorityPersister(storage, 't1', B_KEY);
    storage.reads.length = 0;
    const restoredB = await splitB.persister.restoreClient();

    // B n'a rien : aucun fil de A ne fuit, et seules les clés de B sont lues.
    expect(restoredB).toBeUndefined();
    expect(storage.reads).toEqual([B_KEY, `${B_KEY}${DETAILS_KEY_SUFFIX}`]);

    // Retour sur A : son cache est intact, fil prioritaire compris.
    const restoredA = (await splitA.persister.restoreClient()) as PersistedClient;
    expect(restoredA.clientState.queries).toEqual([listQuery, threadT1, contentM2]);
  });
});
