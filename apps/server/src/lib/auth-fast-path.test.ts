import { handleGetSessionFast } from './auth-fast-path';
import { describe, expect, it, vi } from 'vitest';

// r14 : GET /api/auth/get-session résout la session EXACTEMENT une fois — le
// handler better-auth seul, jamais la pré-résolution du middleware global.

const request = new Request('https://api.example.com/api/auth/get-session', {
  headers: { cookie: 'better-auth.session_token=abc' },
});

describe('handleGetSessionFast', () => {
  it('appelle le handler better-auth EXACTEMENT une fois et JAMAIS api.getSession', async () => {
    const handler = vi.fn(async () => new Response('{"user":null}', { status: 200 }));
    const getSession = vi.fn();
    const createAuthFn = vi.fn(async () => ({ handler, api: { getSession } }));

    await handleGetSessionFast(createAuthFn, request);

    expect(createAuthFn).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(request);
    // La pré-résolution redondante n'existe plus sur ce chemin.
    expect(getSession).not.toHaveBeenCalled();
  });

  it('préserve status, corps, headers et Set-Cookie du handler — réponse identique', async () => {
    const upstream = new Response('{"session":{"id":"s1"}}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'better-auth.session_data=xyz; Path=/; HttpOnly',
      },
    });
    const response = await handleGetSessionFast(
      async () => ({ handler: async () => upstream }),
      request,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"session":{"id":"s1"}}');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_data=xyz');
  });

  it('ajoute Server-Timing (create-auth / handler / total) — durées seules, aucune donnée', async () => {
    const response = await handleGetSessionFast(
      async () => ({ handler: async () => new Response('ok') }),
      request,
    );
    const timing = response.headers.get('Server-Timing') ?? '';
    expect(timing).toMatch(/create-auth;dur=\d+, handler;dur=\d+, total;dur=\d+/);
  });

  it('les erreurs du handler remontent telles quelles (401/500 jamais masqués)', async () => {
    const unauthorized = await handleGetSessionFast(
      async () => ({ handler: async () => new Response('unauthorized', { status: 401 }) }),
      request,
    );
    expect(unauthorized.status).toBe(401);

    await expect(
      handleGetSessionFast(
        async () => ({
          handler: async () => {
            throw new Error('db down');
          },
        }),
        request,
      ),
    ).rejects.toThrow('db down');
  });
});
