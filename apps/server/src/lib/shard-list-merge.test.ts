import {
  decodeCompositeShardCursor,
  encodeCompositeShardCursor,
  mergeShardListPages,
  SERVED_IDS_CAP,
  type ShardListPage,
} from './shard-list-merge';
import { describe, expect, it } from 'vitest';

type Row = { id: string; receivedOn?: string };

// Deux shards aux récences ENTRELACÉES : A porte les heures paires, B les
// heures impaires — un simple concat est garanti désordonné.
const at = (hoursAgo: number) => new Date(Date.UTC(2026, 6, 31, 23 - hoursAgo)).toISOString();
const rows = (prefix: string, hours: number[]): Row[] =>
  hours.map((h) => ({ id: `${prefix}${h}`, receivedOn: at(h) }));

const page = (
  shardId: string,
  threads: Row[],
  nextPageToken: string | null = null,
): ShardListPage<Row> => ({
  shardId,
  threads,
  nextPageToken,
});

describe('mergeShardListPages — top global trié, deux shards', () => {
  it('fusion triée par récence globale, jamais la concaténation', () => {
    const a = page('shard-a', rows('a', [0, 2, 4]));
    const b = page('shard-b', rows('b', [1, 3, 5]));

    const merged = mergeShardListPages([a, b], 50, null);

    expect(merged.threads.map((r) => r.id)).toEqual(['a0', 'b1', 'a2', 'b3', 'a4', 'b5']);
    // Tout tient dans la page et aucun shard n'a de suite → fin exacte.
    expect(merged.nextPageToken).toBeNull();
  });

  it('top-N global : la page se remplit avec les plus récents TOUS shards confondus', () => {
    const a = page('shard-a', rows('a', [0, 1, 2, 3]));
    const b = page('shard-b', rows('b', [10, 11, 12, 13]));

    const merged = mergeShardListPages([a, b], 4, null);

    // Les 4 plus récents sont tous du shard A — B n'entre pas encore.
    expect(merged.threads.map((r) => r.id)).toEqual(['a0', 'a1', 'a2', 'a3']);
    expect(merged.nextPageToken).not.toBeNull();
  });

  it('page 2 via curseur composite : AUCUN doublon, AUCUNE omission sur l’union des pages', () => {
    // 6 lignes par shard, pages globales de 4 : la page 1 consomme A en
    // entier ? Non — récences entrelacées, consommation partielle des deux.
    const aRows = rows('a', [0, 2, 4, 6, 8, 10]);
    const bRows = rows('b', [1, 3, 5, 7, 9, 11]);
    const shardPagesFor = (_cursor: ReturnType<typeof decodeCompositeShardCursor>) => [
      // Le shard re-sert la MÊME page pour le même token (déterminisme DO) ;
      // le merge applique lui-même le skip du curseur.
      page('shard-a', aRows),
      page('shard-b', bRows),
    ];

    const page1 = mergeShardListPages(shardPagesFor(null), 4, null);
    expect(page1.threads.map((r) => r.id)).toEqual(['a0', 'b1', 'a2', 'b3']);
    expect(page1.nextPageToken).not.toBeNull();

    const cursor1 = decodeCompositeShardCursor(page1.nextPageToken!);
    expect(cursor1).not.toBeNull();
    const page2 = mergeShardListPages(shardPagesFor(cursor1), 4, cursor1);
    expect(page2.threads.map((r) => r.id)).toEqual(['a4', 'b5', 'a6', 'b7']);

    const cursor2 = decodeCompositeShardCursor(page2.nextPageToken!);
    const page3 = mergeShardListPages(shardPagesFor(cursor2), 4, cursor2);
    expect(page3.threads.map((r) => r.id)).toEqual(['a8', 'b9', 'a10', 'b11']);
    expect(page3.nextPageToken).toBeNull();

    // Union des trois pages = exactement les 12 lignes, ordonnées, sans doublon.
    const union = [...page1.threads, ...page2.threads, ...page3.threads].map((r) => r.id);
    expect(new Set(union).size).toBe(12);
  });

  it('les tokens ENFANTS des shards sont conservés dans le curseur composite', () => {
    const a = page('shard-a', rows('a', [0, 1]), 'token-a-page2');
    const b = page('shard-b', rows('b', [2, 3]), null);

    const merged = mergeShardListPages([a, b], 4, null);

    const cursor = decodeCompositeShardCursor(merged.nextPageToken!);
    expect(cursor?.shards['shard-a']).toEqual({ token: 'token-a-page2', skip: 0 });
    // B épuisé : marqué done, jamais re-requêté depuis sa page 1.
    expect(cursor?.shards['shard-b']).toEqual({ token: null, skip: 0, done: true });
  });

  it('continuation EXACTE quand le total atteint pile la limite', () => {
    // 4 lignes exactement pour une page de 4, mais A a une page suivante :
    // le token ne doit PAS être null.
    const a = page('shard-a', rows('a', [0, 1]), 'token-a-page2');
    const b = page('shard-b', rows('b', [2, 3]), null);
    const exact = mergeShardListPages([a, b], 4, null);
    expect(exact.threads).toHaveLength(4);
    expect(exact.nextPageToken).not.toBeNull();

    // Même chose SANS aucune suite nulle part → fin de liste, token null.
    const aDone = page('shard-a', rows('a', [0, 1]), null);
    const bDone = page('shard-b', rows('b', [2, 3]), null);
    const finished = mergeShardListPages([aDone, bDone], 4, null);
    expect(finished.threads).toHaveLength(4);
    expect(finished.nextPageToken).toBeNull();
  });

  it('déduplique par id inter-shard sans casser la consommation par shard', () => {
    const a = page('shard-a', [{ id: 'dup', receivedOn: at(0) }, ...rows('a', [2])]);
    const b = page('shard-b', [{ id: 'dup', receivedOn: at(0) }, ...rows('b', [1])]);

    const merged = mergeShardListPages([a, b], 10, null);

    expect(merged.threads.map((r) => r.id)).toEqual(['dup', 'b1', 'a2']);
    expect(merged.nextPageToken).toBeNull();
  });

  it('lignes sans receivedOn : jamais exclues ; l’ordre INTRA-shard fait foi (sémantique de flux)', () => {
    // Le merge compare les TÊTES de flux : il ne réordonne jamais l'intérieur
    // d'un shard (le shard est la vérité de son propre tri — réordonner
    // casserait la sémantique skip du curseur). Une ligne non datée en fin de
    // flux atterrit en fin de fusion ; elle n'est jamais exclue.
    const a = page('shard-a', [...rows('a', [1]), { id: 'a-undated' }]);
    const b = page('shard-b', rows('b', [0]));

    const merged = mergeShardListPages([a, b], 10, null);
    expect(merged.threads.map((r) => r.id)).toEqual(['b0', 'a1', 'a-undated']);
    expect(merged.threads).toHaveLength(3);
  });
});

describe('curseur composite — encodage', () => {
  it('roundtrip encode/decode', () => {
    const cursor = {
      shards: {
        'shard-a': { token: 't1', skip: 3 },
        'shard-b': { token: null, skip: 0, done: true },
      },
      served: ['t-1', 't-2'],
    };
    expect(decodeCompositeShardCursor(encodeCompositeShardCursor(cursor))).toEqual(cursor);
  });

  it('un token legacy mono-shard n’est PAS un curseur composite (chemin historique préservé)', () => {
    expect(decodeCompositeShardCursor('opaque-do-token-123')).toBeNull();
    expect(decodeCompositeShardCursor('')).toBeNull();
    expect(decodeCompositeShardCursor(undefined)).toBeNull();
    expect(decodeCompositeShardCursor('msc1:not-base64-json!!!')).toBeNull();
  });
});

describe('dédoublonnage INTER-PAGES (r8b — doublon de part et d’autre d’une frontière)', () => {
  it('un id servi en page 1 par le shard A ne réapparaît JAMAIS via une copie plus ancienne du shard B', () => {
    // Shard A : dup très récent en tête. Shard B : b1/b3 d'abord, puis la MÊME
    // id=dup plus ancienne — elle n'émerge côté B qu'en page globale 3.
    const aRows: Row[] = [
      { id: 'dup', receivedOn: at(0) },
      { id: 'a2', receivedOn: at(2) },
      { id: 'a4', receivedOn: at(4) },
      { id: 'a6', receivedOn: at(6) },
    ];
    const bRows: Row[] = [
      { id: 'b1', receivedOn: at(1) },
      { id: 'b3', receivedOn: at(3) },
      { id: 'dup', receivedOn: at(5) }, // copie ancienne du même fil
      { id: 'b7', receivedOn: at(7) },
    ];
    const shardPages = () => [page('shard-a', aRows), page('shard-b', bRows)];

    const seen: string[] = [];
    let cursor: ReturnType<typeof decodeCompositeShardCursor> = null;
    let token: string | null = null;
    const pagesOut: string[][] = [];
    for (let i = 0; i < 4; i++) {
      const merged = mergeShardListPages(shardPages(), 2, cursor);
      pagesOut.push(merged.threads.map((r) => r.id));
      seen.push(...merged.threads.map((r) => r.id));
      token = merged.nextPageToken;
      if (!token) break;
      cursor = decodeCompositeShardCursor(token);
    }

    // Union pages 1..N : chaque id exactement une fois, aucune omission.
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(['a2', 'a4', 'a6', 'b1', 'b3', 'b7', 'dup'].sort());
    expect(token).toBeNull();
  });

  it('les tokens enfants restent conservés quand la dédup inter-page consomme une copie', () => {
    const a = page('shard-a', [{ id: 'dup', receivedOn: at(0) }], 'token-a-2');
    const b = page(
      'shard-b',
      [
        { id: 'b1', receivedOn: at(1) },
        { id: 'dup', receivedOn: at(2) },
      ],
      'token-b-2',
    );
    const page1 = mergeShardListPages([a, b], 2, null);
    expect(page1.threads.map((r) => r.id)).toEqual(['dup', 'b1']);
    const cursor = decodeCompositeShardCursor(page1.nextPageToken!);
    // B garde une ligne (la copie dup) puis son token enfant : rien n'est perdu.
    expect(cursor?.shards['shard-b']).toBeTruthy();
  });
});

describe('borne explicite de l’état de dédup (SERVED_IDS_CAP)', () => {
  it('le curseur n’accumule jamais plus de SERVED_IDS_CAP ids ; les plus anciens servis sont élagués', () => {
    const previous = {
      shards: {},
      served: Array.from({ length: SERVED_IDS_CAP }, (_, i) => `old-${i}`),
    };
    const a = page('shard-a', rows('a', [0, 1]), 'token-a-2');
    const merged = mergeShardListPages([a], 2, previous);
    const cursor = decodeCompositeShardCursor(merged.nextPageToken!);
    expect(cursor?.served).toHaveLength(SERVED_IDS_CAP);
    // FIFO : les nouveaux servis entrent, les plus anciens sortent.
    expect(cursor?.served.slice(-2)).toEqual(['a0', 'a1']);
    expect(cursor?.served).not.toContain('old-0');
    expect(cursor?.served).toContain('old-2');
  });
});
