import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generatePkcePair,
  refreshAccessToken,
  LINEAR_TOKEN_URL,
} from './linear-oauth';
import { describe, expect, it, vi } from 'vitest';

describe('OAuth Linear — PKCE S256, state, scopes minimaux, refresh rotatif', () => {
  it('la paire PKCE est S256 : challenge = base64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const expected = Buffer.from(new Uint8Array(digest)).toString('base64url');
    expect(challenge).toBe(expected);
    // Deux paires ne se répètent pas.
    const second = await generatePkcePair();
    expect(second.verifier).not.toBe(verifier);
  });

  it('l’URL d’autorisation porte scopes read,issues:create + state + S256 — jamais admin/write', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-1',
        redirectUri: 'https://app.test/integrations/linear/callback',
        state: 'state-1',
        codeChallenge: 'challenge-1',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://linear.app/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('read,issues:create');
    expect(url.searchParams.get('scope')).not.toMatch(/admin|write/);
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('échange code→tokens via fetch INJECTÉ (aucun réseau réel), expiration calculée', async () => {
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe(LINEAR_TOKEN_URL);
      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code_verifier')).toBe('verif-1');
      return new Response(
        JSON.stringify({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 86_400,
          scope: 'read issues:create',
        }),
        { status: 200 },
      );
    });
    const before = Date.now();
    const tokens = await exchangeAuthorizationCode({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      clientId: 'c',
      clientSecret: 's',
      redirectUri: 'https://app.test/cb',
      code: 'code-1',
      codeVerifier: 'verif-1',
    });
    expect(tokens.accessToken).toBe('at-1');
    expect(tokens.refreshToken).toBe('rt-1');
    expect(tokens.expiresAtMs).toBeGreaterThanOrEqual(before + 86_000_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refresh ROTATIF : le nouveau refresh_token remplace l’ancien ; un échec HTTP ne fuit pas le corps', async () => {
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('rt-old');
      return new Response(
        JSON.stringify({ access_token: 'at-2', refresh_token: 'rt-NEW', expires_in: 3600 }),
        { status: 200 },
      );
    });
    const tokens = await refreshAccessToken({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'rt-old',
    });
    expect(tokens.refreshToken).toBe('rt-NEW');

    const failing = vi.fn(async () => new Response('{"secret":"leaky"}', { status: 401 }));
    await expect(
      refreshAccessToken({
        fetchImpl: failing as unknown as typeof fetch,
        clientId: 'c',
        clientSecret: 's',
        refreshToken: 'rt-old',
      }),
    ).rejects.toThrow('linear_oauth_failed:401');
  });
});
