import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TRPCCallLog } from '../types/logging';
import { DatadogService } from './datadog-service';
import type { ZeroEnv } from '../env';

/**
 * Wire-contract proof of the fetch-based Datadog intake client that replaced
 * @datadog/datadog-api-client (9.2 MiB of the 25 MiB bundle — the startup-CPU
 * blocker behind Cloudflare error 10021 on staging, 2026-07-30). Locks the
 * endpoint, the DD-API-KEY auth header, and the flattened item shape the SDK
 * produced for v2.LogsApi.submitLog.
 */

const env = (over: Partial<ZeroEnv> = {}) =>
  ({ DD_API_KEY: 'api-key', DD_APP_KEY: 'app-key', DD_SITE: '', ...over }) as ZeroEnv;

const makeLog = (over: Partial<TRPCCallLog> = {}): TRPCCallLog => ({
  id: 'call-1',
  timestamp: 1_700_000_000_000,
  userId: 'user-1',
  sessionId: 'session-1',
  procedure: 'mail.listThreads',
  input: { folder: 'inbox' },
  duration: 42,
  metadata: { method: 'query', userAgent: 'Chrome/126.0 Mobile' },
  trace: {
    traceId: 'trace-1',
    requestStartTime: 1_700_000_000_000,
    spans: [],
    totalSpans: 0,
    completedSpans: 0,
    errorSpans: 0,
  },
  ...over,
});

describe('DatadogService', () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires both DD keys, like the SDK-backed constructor did', () => {
    expect(() => new DatadogService(env({ DD_API_KEY: ' ' }))).toThrow(/DD_API_KEY/);
    expect(() => new DatadogService(env({ DD_APP_KEY: '' }))).toThrow(/DD_APP_KEY/);
    expect(() => new DatadogService(undefined)).toThrow(/DD_API_KEY/);
  });

  it('POSTs to the http-intake endpoint with DD-API-KEY auth', async () => {
    await new DatadogService(env()).logSingleCall('session-1', 'user-1', makeLog());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://http-intake.logs.datadoghq.com/api/v2/logs');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('DD-API-KEY')).toBe('api-key');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('honors a custom DD_SITE', async () => {
    await new DatadogService(env({ DD_SITE: 'datadoghq.eu' })).logSingleCall(
      'session-1',
      'user-1',
      makeLog(),
    );
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://http-intake.logs.datadoghq.eu/api/v2/logs',
    );
  });

  it('sends one flattened item: HTTPLogItem fields + additionalProperties at top level', async () => {
    await new DatadogService(env()).logSingleCall('session-1', 'user-1', makeLog());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(Array.isArray(body)).toBe(true);
    const [item] = body;
    expect(item.message).toContain('mail.listThreads');
    expect(item.ddsource).toBe('trpc-logging');
    expect(item.service).toBe('zero-mail-app');
    expect(item.ddtags).toContain('procedure:mail.listThreads');
    // additionalProperties flattened, as ObjectSerializer did
    expect(item.procedure).toBe('mail.listThreads');
    expect(item.session_id).toBe('session-1');
    expect(item.duration).toBe(42);
    expect(item.browser).toBe('chrome');
    // reserved intake attributes the SDK dropped, now preserved
    expect(item.status).toBe('info');
    expect(item.dd.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('skips logging-related procedures without calling the intake', async () => {
    await new DatadogService(env()).logSingleCall(
      'session-1',
      'user-1',
      makeLog({ procedure: 'logging.exportToDatadog' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows intake failures (logSingleCall never throws)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 403 }));
    await expect(
      new DatadogService(env()).logSingleCall('session-1', 'user-1', makeLog()),
    ).resolves.toBeUndefined();
  });
});
