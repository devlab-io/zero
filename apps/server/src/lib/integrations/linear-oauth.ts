/**
 * OAuth Linear (P18) — Authorization Code + PKCE (S256) + state, scopes
 * MINIMAUX `read,issues:create` (jamais write/admin : les webhooks sont
 * configurés côté application Linear, pas par scope admin). Access token ~24 h,
 * refresh token ROTATIF : chaque refresh renvoie un nouveau refresh_token qui
 * REMPLACE l'ancien. Tout accès réseau passe par `fetchImpl` injecté — aucun
 * appel Linear réel en implémentation/QA.
 */
import { LINEAR_OAUTH_SCOPES } from '../teams/team-integrations-shared';

export const LINEAR_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
export const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

/** Paire PKCE : verifier aléatoire 32 octets (base64url), challenge S256. */
export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(LINEAR_AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', LINEAR_OAUTH_SCOPES.join(','));
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export type LinearTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** ms epoch — calculé depuis expires_in à la réception. */
  expiresAtMs: number;
  scope: string;
};

async function tokenRequest(
  fetchImpl: typeof fetch,
  body: URLSearchParams,
): Promise<LinearTokenSet> {
  const response = await fetchImpl(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    // Jamais le corps en clair dans l'erreur (peut contenir des détails
    // sensibles) — statut seul.
    throw new Error(`linear_oauth_failed:${response.status}`);
  }
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) throw new Error('linear_oauth_failed:no_token');
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAtMs: Date.now() + Math.max(60, json.expires_in ?? 24 * 3600) * 1000,
    scope: json.scope ?? '',
  };
}

export async function exchangeAuthorizationCode(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<LinearTokenSet> {
  return await tokenRequest(
    input.fetchImpl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier,
    }),
  );
}

/** SHA-256 hex d'un state OAuth — seul le HASH est persisté, jamais le state brut. */
export async function hashOauthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Scopes EXACTEMENT read + issues:create — toute surprise (write/admin/…) est refusée. */
export function validateGrantedScopes(rawScope: string): boolean {
  const granted = new Set(rawScope.split(/[\s,]+/).filter(Boolean));
  return (
    granted.size === LINEAR_OAUTH_SCOPES.length &&
    LINEAR_OAUTH_SCOPES.every((scope) => granted.has(scope))
  );
}

/**
 * Révocation OFFICIELLE du token côté Linear (endpoint /oauth/revoke) — via
 * fetch injecté (jamais en QA). true = révocation distante confirmée.
 */
export async function revokeLinearToken(input: {
  fetchImpl: typeof fetch;
  accessToken: string;
}): Promise<boolean> {
  try {
    const response = await input.fetchImpl('https://api.linear.app/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Rotation : le refresh_token renvoyé REMPLACE l'ancien (l'ancien meurt). */
export async function refreshAccessToken(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<LinearTokenSet> {
  return await tokenRequest(
    input.fetchImpl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }),
  );
}
