import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKOFF, type BackoffDeps } from './gmail-backoff';
import {
  alignBatchResults,
  assertBatchComplete,
  buildBatchBody,
  chunk,
  extractBoundary,
  GmailBatchError,
  parseBatchResponse,
  runBatched,
  type BatchHttp,
  type BatchSubRequest,
} from './gmail-batch';

const instantDeps: BackoffDeps = { sleep: async () => {}, random: () => 0.5 };

// Réponse multipart synthétique : n parties, toutes 200, corps JSON `{"i":k}`.
function buildFakeResponse(n: number, boundary: string): string {
  const parts = Array.from({ length: n }, (_, i) =>
    [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <response-item-${i}>`,
      '',
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      '',
      JSON.stringify({ i }),
    ].join('\r\n'),
  );
  return parts.join('\r\n') + `\r\n--${boundary}--\r\n`;
}

const countSubRequests = (body: string) => (body.match(/Content-ID:/g) || []).length;

// Réponse multipart 200 avec un status PAR sous-partie (pour tester les sous-réponses).
function buildMixedResponse(statuses: number[], boundary: string): string {
  const parts = statuses.map((status, i) => {
    const ok = status >= 200 && status < 300;
    const body = ok ? JSON.stringify({ i }) : JSON.stringify({ error: { code: status } });
    return [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <response-item-${i}>`,
      '',
      `HTTP/1.1 ${status} X`,
      'Content-Type: application/json',
      '',
      body,
    ].join('\r\n');
  });
  return parts.join('\r\n') + `\r\n--${boundary}--\r\n`;
}

// Status par sous-requête selon son path : contient 'bad' → `badStatus`, sinon 200.
const statusByPath = (body: string, badStatus: number): number[] =>
  [...body.matchAll(/(?:GET|POST) (\S+)/g)].map((m) => (m[1].includes('bad') ? badStatus : 200));

describe('chunk', () => {
  it('splits into slices of at most size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('buildBatchBody', () => {
  it('emits one indexed part per sub-request and a closing delimiter', () => {
    const subs: BatchSubRequest[] = [
      { method: 'GET', path: '/gmail/v1/users/me/threads/a?format=metadata' },
      { method: 'GET', path: '/gmail/v1/users/me/threads/b?format=metadata' },
    ];
    const body = buildBatchBody(subs, 'BND');
    expect(body).toContain('--BND');
    expect(body).toContain('Content-ID: <item-0>');
    expect(body).toContain('Content-ID: <item-1>');
    expect(body).toContain('GET /gmail/v1/users/me/threads/a?format=metadata');
    expect(body.endsWith('--BND--\r\n')).toBe(true);
    expect(countSubRequests(body)).toBe(2);
  });
});

describe('extractBoundary', () => {
  it('reads the boundary token, quoted or bare', () => {
    expect(extractBoundary('multipart/mixed; boundary=abc123')).toBe('abc123');
    expect(extractBoundary('multipart/mixed; boundary="q-1"')).toBe('q-1');
    expect(extractBoundary(undefined)).toBeUndefined();
    expect(extractBoundary('application/json')).toBeUndefined();
  });
});

describe('parseBatchResponse', () => {
  it('extracts status, JSON body and content-id per part, in order', () => {
    const text = buildFakeResponse(2, 'B');
    const parts = parseBatchResponse(text, 'B');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ status: 200, body: { i: 0 }, contentId: 'item-0' });
    expect(parts[1]).toMatchObject({ status: 200, body: { i: 1 }, contentId: 'item-1' });
  });

  it('is tolerant of a non-2xx part with no body', () => {
    const text =
      '--B\r\nContent-Type: application/http\r\nContent-ID: <response-item-0>\r\n\r\n' +
      'HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\n\r\n{"error":"nope"}\r\n--B--\r\n';
    const parts = parseBatchResponse(text, 'B');
    expect(parts[0].status).toBe(404);
    expect(parts[0].body).toEqual({ error: 'nope' });
  });
});

describe('alignBatchResults', () => {
  it('reorders by content-id and fills gaps', () => {
    const out = alignBatchResults(
      [
        { status: 200, body: { i: 1 }, contentId: 'item-1' },
        { status: 200, body: { i: 0 }, contentId: 'item-0' },
      ],
      3,
    );
    expect(out[0]).toMatchObject({ body: { i: 0 } });
    expect(out[1]).toMatchObject({ body: { i: 1 } });
    expect(out[2]).toEqual({ status: 0, body: undefined }); // gap filled
  });
});

describe('runBatched — coalescing du chemin chaud (issue #31)', () => {
  it('collapses 2000 gets into <=100 round-trips (40 POST @ 50)', async () => {
    let roundTrips = 0;
    const subRequestCounts: number[] = [];
    const fake: BatchHttp = async (req) => {
      const n = countSubRequests(req.body);
      subRequestCounts.push(n);
      return {
        status: 200,
        contentType: 'multipart/mixed; boundary=resp',
        text: buildFakeResponse(n, 'resp'),
      };
    };

    const subs: BatchSubRequest[] = Array.from({ length: 2000 }, (_, i) => ({
      method: 'GET',
      path: `/gmail/v1/users/me/threads/t${i}?format=metadata`,
    }));

    const results = await runBatched(subs, {
      batchHttp: fake,
      boundaryId: () => 'b',
      onRoundTrip: () => (roundTrips += 1),
      backoff: DEFAULT_BACKOFF,
      backoffDeps: instantDeps,
      batchSize: 50,
      concurrency: 5,
    });

    expect(roundTrips).toBe(40);
    expect(roundTrips).toBeLessThanOrEqual(100); // acceptation A8
    expect(subRequestCounts).toHaveLength(40);
    expect(Math.max(...subRequestCounts)).toBeLessThanOrEqual(50); // ≤50 recommandé
    expect(results).toHaveLength(2000);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('bounds POST concurrency to the configured limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fake: BatchHttp = async (req) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      const n = countSubRequests(req.body);
      return {
        status: 200,
        contentType: 'multipart/mixed; boundary=r',
        text: buildFakeResponse(n, 'r'),
      };
    };
    const subs: BatchSubRequest[] = Array.from({ length: 500 }, (_, i) => ({
      method: 'GET',
      path: `/gmail/v1/users/me/messages/m${i}`,
    }));

    await runBatched(subs, {
      batchHttp: fake,
      boundaryId: () => 'r',
      onRoundTrip: () => {},
      backoff: DEFAULT_BACKOFF,
      backoffDeps: instantDeps,
      batchSize: 50,
      concurrency: 5,
    });

    expect(maxInFlight).toBe(5);
  });

  it('applies exponential backoff on a 429 chunk, then succeeds (no flat 60s)', async () => {
    let attempts = 0;
    let roundTrips = 0;
    const delays: number[] = [];
    const fake: BatchHttp = async (req) => {
      attempts += 1;
      if (attempts === 1) return { status: 429, contentType: undefined, text: '' };
      const n = countSubRequests(req.body);
      return {
        status: 200,
        contentType: 'multipart/mixed; boundary=r',
        text: buildFakeResponse(n, 'r'),
      };
    };
    const subs: BatchSubRequest[] = [
      { method: 'GET', path: '/gmail/v1/users/me/threads/x' },
      { method: 'GET', path: '/gmail/v1/users/me/threads/y' },
    ];

    const results = await runBatched(subs, {
      batchHttp: fake,
      boundaryId: () => 'r',
      onRoundTrip: () => (roundTrips += 1),
      backoff: DEFAULT_BACKOFF,
      backoffDeps: { sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
      batchSize: 50,
      concurrency: 1,
    });

    expect(attempts).toBe(2); // 429 puis 200
    expect(roundTrips).toBe(2); // les deux round-trips comptés
    expect(delays).toEqual([375]); // backoff expo, pas 60000
    expect(results).toHaveLength(2);
  });

  it('returns an empty result for no sub-requests (no round-trip)', async () => {
    let roundTrips = 0;
    const fake: BatchHttp = async () => ({ status: 200, contentType: undefined, text: '' });
    const results = await runBatched([], {
      batchHttp: fake,
      boundaryId: () => 'r',
      onRoundTrip: () => (roundTrips += 1),
      backoff: DEFAULT_BACKOFF,
      backoffDeps: instantDeps,
      batchSize: 50,
      concurrency: 5,
    });
    expect(results).toEqual([]);
    expect(roundTrips).toBe(0);
  });
});

describe('runBatched — sous-réponses (Gmail 200 avec parties en échec)', () => {
  const twoThreads: BatchSubRequest[] = [
    { method: 'GET', path: '/gmail/v1/users/me/threads/good' },
    { method: 'GET', path: '/gmail/v1/users/me/threads/bad' },
  ];

  it('retry UNIQUEMENT la sous-partie 429, puis succès (aucune perte)', async () => {
    let call = 0;
    let roundTrips = 0;
    const delays: number[] = [];
    const fake: BatchHttp = async (req) => {
      call += 1;
      const n = countSubRequests(req.body);
      // 1er POST : 2 sous-parties [200, 429] ; retry : seule 'bad' re-batchée → 200.
      const statuses = call === 1 ? [200, 429] : new Array(n).fill(200);
      return {
        status: 200,
        contentType: 'multipart/mixed; boundary=r',
        text: buildMixedResponse(statuses, 'r'),
      };
    };
    const results = await runBatched(twoThreads, {
      batchHttp: fake,
      boundaryId: () => 'r',
      onRoundTrip: () => (roundTrips += 1),
      backoff: DEFAULT_BACKOFF,
      backoffDeps: { sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
      batchSize: 50,
      concurrency: 1,
    });
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(roundTrips).toBe(2); // POST initial + re-batch de la seule sous-partie 429
    expect(delays).toEqual([375]); // backoff expo entre tentatives
    // aucune perte : assertBatchComplete ne lève pas
    expect(() => assertBatchComplete('threads.get', results, ['good', 'bad'])).not.toThrow();
  });

  it('sous-partie 5xx exhaustée → échec VISIBLE (GmailBatchError), jamais un sous-ensemble', async () => {
    let roundTrips = 0;
    const fake: BatchHttp = async (req) => ({
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildMixedResponse(statusByPath(req.body, 503), 'r'),
    });
    const results = await runBatched(twoThreads, {
      batchHttp: fake,
      boundaryId: () => 'r',
      onRoundTrip: () => (roundTrips += 1),
      backoff: { ...DEFAULT_BACKOFF, maxRetries: 2 },
      backoffDeps: instantDeps,
      batchSize: 50,
      concurrency: 1,
    });
    expect(results.map((r) => r.status)).toEqual([200, 503]);
    expect(roundTrips).toBe(3); // POST initial + 2 retries de 'bad'
    let thrown: unknown;
    try {
      assertBatchComplete('threads.get', results, ['good', 'bad']);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GmailBatchError);
    expect((thrown as GmailBatchError).failures).toEqual([{ ref: 'bad', status: 503 }]);
  });

  it('sous-partie non-retryable (400) → PAS de retry, échec visible immédiat', async () => {
    let roundTrips = 0;
    const fake: BatchHttp = async (req) => ({
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildMixedResponse(statusByPath(req.body, 400), 'r'),
    });
    const results = await runBatched(twoThreads, {
      batchHttp: fake,
      boundaryId: () => 'r',
      onRoundTrip: () => (roundTrips += 1),
      backoff: DEFAULT_BACKOFF,
      backoffDeps: instantDeps,
      batchSize: 50,
      concurrency: 1,
    });
    expect(results.map((r) => r.status)).toEqual([200, 400]);
    expect(roundTrips).toBe(1); // 400 non retryé
    expect(() => assertBatchComplete('threads.get', results, ['good', 'bad'])).toThrow(
      GmailBatchError,
    );
  });

  it('erreur HTTP externe non-retryable → propagation (pas de perte silencieuse)', async () => {
    const fake: BatchHttp = async () => {
      throw { code: 400 };
    };
    await expect(
      runBatched([{ method: 'GET', path: '/gmail/v1/users/me/threads/x' }], {
        batchHttp: fake,
        boundaryId: () => 'r',
        onRoundTrip: () => {},
        backoff: DEFAULT_BACKOFF,
        backoffDeps: instantDeps,
        batchSize: 50,
        concurrency: 1,
      }),
    ).rejects.toEqual({ code: 400 });
  });
});

describe('cycle de sync complet (fake) — issue #31', () => {
  it('sync ~2000 threads paginé (pages de 60) → total round-trips Gmail ≤100', async () => {
    const TOTAL = 2000;
    const PAGE = 60; // THREAD_SYNC_MAX_COUNT observé (env local)
    let totalRoundTrips = 0;
    const fake: BatchHttp = async (req) => ({
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildFakeResponse(countSubRequests(req.body), 'r'),
    });

    // Modélise le workflow réel : le coordinator boucle les pages, chaque page batch-fetch
    // via runBatched sur un driver de page. Le compteur agrège tout le cycle de sync.
    let pages = 0;
    for (let offset = 0; offset < TOTAL; offset += PAGE) {
      const pageIds: BatchSubRequest[] = Array.from(
        { length: Math.min(PAGE, TOTAL - offset) },
        (_, i) => ({ method: 'GET', path: `/gmail/v1/users/me/threads/t${offset + i}?format=full` }),
      );
      const results = await runBatched(pageIds, {
        batchHttp: fake,
        boundaryId: () => 'r',
        onRoundTrip: () => (totalRoundTrips += 1),
        backoff: DEFAULT_BACKOFF,
        backoffDeps: instantDeps,
        batchSize: 50,
        concurrency: 5,
      });
      expect(results).toHaveLength(pageIds.length);
      pages += 1;
    }

    expect(pages).toBe(34); // 33 pages de 60 + 1 page de 20
    expect(totalRoundTrips).toBe(67); // 33×⌈60/50⌉ + 1×⌈20/50⌉
    expect(totalRoundTrips).toBeLessThanOrEqual(100); // acceptation A8, cycle complet
  });
});

describe('assertBatchComplete', () => {
  it('ne lève pas quand tout est 2xx', () => {
    expect(() =>
      assertBatchComplete('op', [{ status: 200, body: {} }], ['a']),
    ).not.toThrow();
  });
  it('lève et nomme chaque sous-requête en échec', () => {
    let err: unknown;
    try {
      assertBatchComplete(
        'op',
        [
          { status: 200, body: {} },
          { status: 500, body: undefined },
          { status: 404, body: undefined },
        ],
        ['a', 'b', 'c'],
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GmailBatchError);
    expect((err as GmailBatchError).failures).toEqual([
      { ref: 'b', status: 500 },
      { ref: 'c', status: 404 },
    ]);
  });
});
