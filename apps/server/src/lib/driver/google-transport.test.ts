import {
  buildMixedResponse,
  countSubRequests,
  instantBackoffDeps,
  makeCapturingBatchHttp,
  statusByPath,
} from './__fixtures__/batch-http-fake';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { BatchHttp } from './gmail-batch';
import type { ManagerConfig } from './types';

// --- Couture d'injection : le transport importe `../../env` (→ cloudflare:workers) et
// `./utils` (→ server-utils → dormroom → cloudflare:workers). On neutralise les DEUX ;
// aucune requête réseau ne part : `execute` reçoit un `fn` fourni par le test, et les
// méthodes batch passent par le `batchHttp` INJECTÉ. -----------------------------------
vi.mock('../../env', () => ({
  env: { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', NODE_ENV: 'test' },
}));
const loggerSpy = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('../logger', () => ({ logger: loggerSpy }));
const deleteActiveConnection = vi.fn();
vi.mock('./utils', () => ({
  deleteActiveConnection,
  FatalErrors: ['invalid_grant'],
  sanitizeContext: (c: unknown) => c,
  StandardizedError: class StandardizedError extends Error {
    constructor(
      public original: Error,
      public operation: string,
      public context?: unknown,
    ) {
      super(`standardized:${operation}:${original.message}`);
      this.name = 'StandardizedError';
    }
  },
}));

// Import APRÈS les mocks (hoistés par vitest de toute façon).
const { GmailTransport } = await import('./google-transport');
const { GmailBatchError } = await import('./gmail-batch');
const { GOOGLE_OAUTH_SCOPE_STRING } = await import('../google-scopes');

type Deps = ConstructorParameters<typeof GmailTransport>[1];

const authedConfig: ManagerConfig = {
  auth: { email: 'user@devlab.io', refreshToken: 'refresh-abc' },
} as unknown as ManagerConfig;

function make(config: ManagerConfig, deps: Deps = {}) {
  return new GmailTransport(config, {
    backoffDeps: instantBackoffDeps,
    boundaryId: () => 'BND',
    ...deps,
  });
}

beforeEach(() => {
  loggerSpy.info.mockClear();
  loggerSpy.error.mockClear();
  deleteActiveConnection.mockClear();
});

describe('GmailTransport — configuration auth', () => {
  it('getScope() = union minimale (jamais mail.google.com)', () => {
    const t = make(authedConfig);
    const scope = t.getScope();
    expect(scope).toBe(GOOGLE_OAUTH_SCOPE_STRING);
    expect(scope).toContain('gmail.modify');
    expect(scope).toContain('gmail.compose');
    expect(scope).toContain('userinfo.email');
    expect(scope).not.toContain('mail.google.com');
    expect(scope).not.toContain('gmail.readonly');
  });

  it('getQuotaUser() suffixe NODE_ENV quand un email est présent', () => {
    expect(make(authedConfig).getQuotaUser()).toBe('user@devlab.io-test');
  });

  it('getQuotaUser() = undefined sans email d’auth', () => {
    expect(make({} as ManagerConfig).getQuotaUser()).toBeUndefined();
    expect(
      make({ auth: { refreshToken: 'r' } } as unknown as ManagerConfig).getQuotaUser(),
    ).toBeUndefined();
  });
});

describe('GmailTransport.execute — dispatch unique + compteur (couture #31)', () => {
  it('compte chaque round-trip et renvoie le résultat de fn', async () => {
    const t = make(authedConfig);
    expect(t.getGmailCallCount()).toBe(0);
    const gmailArg: unknown[] = [];
    const r = await t.execute(async (g) => {
      gmailArg.push(g);
      return 'result';
    });
    expect(r).toBe('result');
    expect(t.getGmailCallCount()).toBe(1);
    expect(gmailArg[0]).toBe(t.gmail); // fn reçoit bien le client gmail du transport
    await t.execute(async () => 'again');
    expect(t.getGmailCallCount()).toBe(2);
  });

  it('sans retry : une erreur remonte immédiatement, 1 seul appel compté', async () => {
    const t = make(authedConfig);
    await expect(t.execute(async () => Promise.reject({ code: 429 }))).rejects.toEqual({
      code: 429,
    });
    expect(t.getGmailCallCount()).toBe(1);
  });

  it('retry (lecture idempotente) : backoff sur 429 puis succès, chaque tentative comptée', async () => {
    const t = make(authedConfig);
    let calls = 0;
    const r = await t.execute(
      async () => {
        calls += 1;
        if (calls <= 2) return Promise.reject({ code: 429 });
        return 'ok';
      },
      { retry: true },
    );
    expect(r).toBe('ok');
    expect(calls).toBe(3);
    expect(t.getGmailCallCount()).toBe(3);
  });

  it('retry : une erreur NON-retryable (400) n’est jamais rejouée', async () => {
    const t = make(authedConfig);
    let calls = 0;
    await expect(
      t.execute(
        async () => {
          calls += 1;
          return Promise.reject({ code: 400 });
        },
        { retry: true },
      ),
    ).rejects.toEqual({ code: 400 });
    expect(calls).toBe(1);
    expect(t.getGmailCallCount()).toBe(1);
  });
});

describe('GmailTransport — compteur de cycle', () => {
  it('logCycleCallCount logge via lib/logger, remet à zéro et retourne le total', async () => {
    const t = make(authedConfig);
    await t.execute(async () => 1);
    await t.execute(async () => 2);
    const total = t.logCycleCallCount('sync');
    expect(total).toBe(2);
    expect(t.getGmailCallCount()).toBe(0); // reset
    expect(loggerSpy.info).toHaveBeenCalledWith(
      '[GmailTransport] gmail api round-trips this cycle',
      expect.objectContaining({ calls: 2, label: 'sync', email: 'user@devlab.io' }),
    );
  });
});

describe('GmailTransport.batchThreadsGet — coalescing + complétude', () => {
  it('renvoie une Map COMPLÈTE (une entrée par id), 1 round-trip coalescé, format + quotaUser dans le path', async () => {
    const { http, capturedBodies } = makeCapturingBatchHttp();
    const t = make(authedConfig, { batchHttp: http });
    const ids = ['a', 'b', 'c'];
    const map = await t.batchThreadsGet(ids, 'full');
    expect(map.size).toBe(3);
    expect([...map.keys()]).toEqual(ids);
    expect(map.get('a')).toEqual({ i: 0 });
    expect(t.getGmailCallCount()).toBe(1); // ⌈3/50⌉ = 1 round-trip
    const body = capturedBodies[0];
    expect(body).toContain('/gmail/v1/users/me/threads/a?format=full');
    expect(body).toContain('quotaUser=user%40devlab.io-test');
    expect(body).toContain('batch_BND'); // boundaryId injecté
  });

  it('format par défaut = metadata', async () => {
    const { http, capturedBodies } = makeCapturingBatchHttp();
    const t = make(authedConfig, { batchHttp: http });
    await t.batchThreadsGet(['x']);
    expect(capturedBodies[0]).toContain('format=metadata');
  });

  it('sous-réponse 5xx exhaustée → GmailBatchError nommant l’id (jamais un sous-ensemble)', async () => {
    const http: BatchHttp = async (req) => ({
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildMixedResponse(statusByPath(req.body, 'bad', 503), 'r'),
    });
    const t = make(authedConfig, { batchHttp: http, backoff: { maxRetries: 1 } });
    let thrown: unknown;
    try {
      await t.batchThreadsGet(['good', 'bad']);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GmailBatchError);
    expect((thrown as InstanceType<typeof GmailBatchError>).failures).toEqual([
      { ref: 'bad', status: 503 },
    ]);
  });

  it('respecte batchSize : borne dure Gmail 100 (150 ids → 2 round-trips)', async () => {
    const { http } = makeCapturingBatchHttp();
    const t = make(authedConfig, { batchHttp: http, batchSize: 1000 });
    const ids = Array.from({ length: 150 }, (_, i) => `t${i}`);
    const map = await t.batchThreadsGet(ids);
    expect(map.size).toBe(150);
    expect(t.getGmailCallCount()).toBe(2); // clamp 100 → ⌈150/100⌉ = 2
  });

  it('batchSize plancher 1 (0 → 1 sous-requête par POST : 3 ids → 3 round-trips)', async () => {
    const { http } = makeCapturingBatchHttp();
    const t = make(authedConfig, { batchHttp: http, batchSize: 0 });
    await t.batchThreadsGet(['a', 'b', 'c']);
    expect(t.getGmailCallCount()).toBe(3);
  });
});

describe('GmailTransport.batchAttachmentsGet — données base64url ordonnées', () => {
  const attHttp: BatchHttp = async (req) => {
    const n = countSubRequests(req.body);
    const statuses = Array.from({ length: n }, () => 200);
    return {
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildMixedResponse(statuses, 'r', (i) => ({ data: `b64-${i}` })),
    };
  };

  it('renvoie les data dans l’ordre, path avec messageId/attachmentId + quotaUser', async () => {
    const capture: string[] = [];
    const wrapped: BatchHttp = async (req) => {
      capture.push(req.body);
      return attHttp(req);
    };
    const t = make(authedConfig, { batchHttp: wrapped });
    const out = await t.batchAttachmentsGet([
      { messageId: 'm1', attachmentId: 'att1' },
      { messageId: 'm2', attachmentId: 'att2' },
    ]);
    expect(out).toEqual(['b64-0', 'b64-1']);
    expect(t.getGmailCallCount()).toBe(1);
    expect(capture[0]).toContain('/gmail/v1/users/me/messages/m1/attachments/att1');
    expect(capture[0]).toContain('quotaUser=user%40devlab.io-test');
  });

  it('data absente → chaîne vide (jamais undefined)', async () => {
    const http: BatchHttp = async (_req) => ({
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildMixedResponse([200], 'r', () => ({})),
    });
    const t = make(authedConfig, { batchHttp: http });
    const out = await t.batchAttachmentsGet([{ messageId: 'm', attachmentId: 'a' }]);
    expect(out).toEqual(['']);
  });

  it('sous-réponse en échec → GmailBatchError (aucune PJ perdue en silence)', async () => {
    const http: BatchHttp = async (req) => ({
      status: 200,
      contentType: 'multipart/mixed; boundary=r',
      text: buildMixedResponse(statusByPath(req.body, 'bad', 500), 'r', (i) => ({ data: `b${i}` })),
    });
    const t = make(authedConfig, { batchHttp: http, backoff: { maxRetries: 0 } });
    await expect(
      t.batchAttachmentsGet([
        { messageId: 'ok', attachmentId: 'ok' },
        { messageId: 'bad', attachmentId: 'bad' },
      ]),
    ).rejects.toBeInstanceOf(GmailBatchError);
  });
});

describe('GmailTransport — error handlers (async & sync)', () => {
  it('withErrorHandler renvoie la valeur en cas de succès', async () => {
    const t = make(authedConfig);
    await expect(t.withErrorHandler('op', () => 'v')).resolves.toBe('v');
    expect(deleteActiveConnection).not.toHaveBeenCalled();
  });

  it('withErrorHandler : erreur NON fatale → wrap + rethrow, sans supprimer la connexion', async () => {
    const t = make(authedConfig);
    await expect(
      t.withErrorHandler('op', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow(/standardized:op:boom/);
    expect(deleteActiveConnection).not.toHaveBeenCalled();
  });

  it('withErrorHandler : erreur FATALE → supprime la connexion active puis rethrow', async () => {
    const t = make(authedConfig);
    await expect(
      t.withErrorHandler('op', () => {
        throw new Error('invalid_grant');
      }),
    ).rejects.toThrow(/standardized:op:invalid_grant/);
    expect(deleteActiveConnection).toHaveBeenCalledTimes(1);
  });

  it('withSyncErrorHandler : succès pass-through, erreur → wrap', () => {
    const t = make(authedConfig);
    expect(t.withSyncErrorHandler('sync', () => 42)).toBe(42);
    expect(() =>
      t.withSyncErrorHandler('sync', () => {
        throw new Error('nope');
      }),
    ).toThrow(/standardized:sync:nope/);
  });
});
