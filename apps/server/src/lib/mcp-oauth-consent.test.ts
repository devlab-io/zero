import { getTestInstance } from 'better-auth/test';
import { describe, expect, it, vi } from 'vitest';
import { mcp } from 'better-auth/plugins';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';

import {
  handleConsentGatedMcpToken,
  isPendingMcpConsent,
  isSameOriginMcpConsentSubmission,
  MCP_CONSENT_SCRIPT_CSP_HASH,
  MCP_CONSENT_SUBMISSION_SCRIPT,
  renderMcpConsentPage,
  requireExplicitMcpConsent,
} from './mcp-oauth-consent';

const BASE_URL = 'http://localhost:3047';
const CALLBACK_URL = 'http://127.0.0.1:51234/callback/reta-codex-test';

describe('MCP OAuth explicit consent boundary', () => {
  it('accepts a strict same-origin form POST, including Dia Origin redaction', () => {
    const submission = (headers: HeadersInit) =>
      new Request(`${BASE_URL}/api/oauth/mcp/consent`, { method: 'POST', headers });

    expect(
      isSameOriginMcpConsentSubmission(
        submission({ Origin: BASE_URL, 'Sec-Fetch-Site': 'same-origin' }),
        BASE_URL,
      ),
    ).toBe(true);
    expect(
      isSameOriginMcpConsentSubmission(submission({ 'Sec-Fetch-Site': 'same-origin' }), BASE_URL),
    ).toBe(true);
    expect(
      isSameOriginMcpConsentSubmission(
        submission({ Origin: 'null', 'Sec-Fetch-Site': 'same-origin' }),
        BASE_URL,
      ),
    ).toBe(true);
  });

  it('rejects cross-site, wrong-origin and signal-less consent submissions', () => {
    const submission = (headers: HeadersInit, url = `${BASE_URL}/api/oauth/mcp/consent`) =>
      new Request(url, { method: 'POST', headers });

    expect(
      isSameOriginMcpConsentSubmission(
        submission({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }),
        BASE_URL,
      ),
    ).toBe(false);
    expect(
      isSameOriginMcpConsentSubmission(
        submission({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' }),
        BASE_URL,
      ),
    ).toBe(false);
    expect(isSameOriginMcpConsentSubmission(submission({}), BASE_URL)).toBe(false);
    expect(
      isSameOriginMcpConsentSubmission(
        submission({ 'Sec-Fetch-Site': 'same-origin' }, 'https://evil.example/consent'),
        BASE_URL,
      ),
    ).toBe(false);
  });

  it('forces prompt=consent without changing the client callback or PKCE request', () => {
    const source = new Request(
      `${BASE_URL}/api/auth/mcp/authorize?response_type=code&client_id=dynamic-client&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=openid+profile+email+offline_access&state=state-1&code_challenge=challenge&code_challenge_method=S256`,
    );

    const guarded = requireExplicitMcpConsent(source);
    const url = new URL(guarded.url);

    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('code_challenge')).toBe('challenge');
  });

  it('renders the account, dynamic-client warning and every requested scope', () => {
    const html = renderMcpConsentPage({
      consentCode: 'consent-code',
      clientId: 'client-id-123456',
      clientName: 'Codex <unsafe>',
      callbackOrigin: 'http://127.0.0.1:51234',
      isDynamicClient: true,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      accountEmail: 'thomas@example.com',
    });

    expect(html).toContain('Authorize Codex &lt;unsafe&gt;?');
    expect(html).toContain('thomas@example.com');
    expect(html).toContain('Dynamically registered · not trusted');
    expect(html).toContain('openid');
    expect(html).toContain('profile');
    expect(html).toContain('email');
    expect(html).toContain('offline_access');
    expect(html).toContain('Issues a refresh token');
    expect(html).toContain('name="decision" value=""');
    expect(html).toContain('data-decision="deny"');
    expect(html).toContain('data-decision="accept"');
    expect(html).toContain(MCP_CONSENT_SUBMISSION_SCRIPT);
    expect(MCP_CONSENT_SUBMISSION_SCRIPT).toContain("form.dataset.submitting === 'true'");
    expect(MCP_CONSENT_SUBMISSION_SCRIPT).toContain('event.preventDefault()');
    expect(html).not.toContain('Codex <unsafe>');
  });

  it('pins the one-submit consent script to its CSP hash', () => {
    const hash = createHash('sha256').update(MCP_CONSENT_SUBMISSION_SCRIPT).digest('base64');
    expect(MCP_CONSENT_SCRIPT_CSP_HASH).toBe(`'sha256-${hash}'`);
  });

  it('allows the first explicit decision and blocks a double activation', () => {
    let submit: ((event: Record<string, unknown>) => void) | undefined;
    const buttons = [
      { attributes: {} as Record<string, string> },
      { attributes: {} as Record<string, string> },
    ].map((button) => ({
      ...button,
      setAttribute: (name: string, value: string) => {
        button.attributes[name] = value;
      },
    }));
    const form = {
      dataset: {} as Record<string, string>,
      submit: vi.fn(),
      addEventListener: (_type: string, listener: typeof submit) => {
        submit = listener;
      },
      querySelectorAll: () => buttons,
    };
    const decision = { value: '' };
    const document = {
      querySelector: (selector: string) => (selector === 'form' ? form : decision),
    };
    runInNewContext(MCP_CONSENT_SUBMISSION_SCRIPT, { document });

    const first = {
      submitter: { dataset: { decision: 'accept' } },
      preventDefault: vi.fn(),
    };
    submit?.(first);
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(decision.value).toBe('accept');
    expect(form.dataset.submitting).toBe('true');
    expect(buttons.every((button) => button.attributes['aria-disabled'] === 'true')).toBe(true);
    expect(form.submit).toHaveBeenCalledOnce();

    const duplicate = {
      submitter: { dataset: { decision: 'accept' } },
      preventDefault: vi.fn(),
    };
    submit?.(duplicate);
    expect(duplicate.preventDefault).toHaveBeenCalledOnce();
    expect(form.submit).toHaveBeenCalledOnce();
  });

  it('blocks callback and token exchange until the signed-in user explicitly consents', async () => {
    const instance = await getTestInstance(
      {
        baseURL: BASE_URL,
        plugins: [
          mcp({
            loginPage: `${BASE_URL}/login`,
            oidcConfig: {
              loginPage: `${BASE_URL}/login`,
              consentPage: `${BASE_URL}/api/oauth/mcp/consent`,
              requirePKCE: true,
            },
          }),
        ],
      },
      { port: 3047 },
    );

    const registration = await instance.auth.handler(
      new Request(`${BASE_URL}/api/auth/mcp/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Codex',
          redirect_uris: [CALLBACK_URL],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        }),
      }),
    );
    expect(registration.status).toBe(201);
    const registered = (await registration.json()) as { client_id: string };

    const signedIn = await instance.signInWithTestUser();
    const codeVerifier = 'reta-codex-consent-verifier-123456789012345678901234567890';
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const authorizeUrl = new URL(`${BASE_URL}/api/auth/mcp/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: registered.client_id,
      redirect_uri: CALLBACK_URL,
      scope: 'openid profile email offline_access',
      state: 'state-1',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    const authorizeHeaders = new Headers(signedIn.headers);
    authorizeHeaders.set('Accept', 'text/html');

    const authorization = await instance.auth.handler(
      requireExplicitMcpConsent(new Request(authorizeUrl, { headers: authorizeHeaders })),
    );
    expect(authorization.status).toBe(302);
    const consentLocation = new URL(authorization.headers.get('location')!);
    expect(consentLocation.origin + consentLocation.pathname).toBe(
      `${BASE_URL}/api/oauth/mcp/consent`,
    );
    expect(consentLocation.origin + consentLocation.pathname).not.toBe(CALLBACK_URL);
    const consentCode = consentLocation.searchParams.get('consent_code');
    expect(consentCode).toBeTruthy();

    const findVerification = async (identifier: string) => {
      const row = await instance.db.findOne<{ value: string }>({
        model: 'verification',
        where: [{ field: 'identifier', value: identifier }],
      });
      return row ? { value: row.value } : null;
    };
    expect(await isPendingMcpConsent(consentCode!, findVerification)).toBe(true);

    const makeTokenRequest = (code: string) =>
      new Request(`${BASE_URL}/api/auth/mcp/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: registered.client_id,
          code,
          redirect_uri: CALLBACK_URL,
          code_verifier: codeVerifier,
        }),
      });

    const blockedToken = await handleConsentGatedMcpToken(
      makeTokenRequest(consentCode!),
      findVerification,
      (request) => instance.auth.handler(request),
    );
    expect(blockedToken.status).toBe(400);
    await expect(blockedToken.json()).resolves.toMatchObject({ error: 'consent_required' });
    await expect(
      instance.db.findOne({
        model: 'oauthAccessToken',
        where: [{ field: 'clientId', value: registered.client_id }],
      }),
    ).resolves.toBeNull();

    const consentHeaders = new Headers(signedIn.headers);
    consentHeaders.set('Content-Type', 'application/json');
    consentHeaders.set('Origin', BASE_URL);
    const consent = await instance.auth.handler(
      new Request(`${BASE_URL}/api/auth/oauth2/consent`, {
        method: 'POST',
        headers: consentHeaders,
        body: JSON.stringify({ accept: true, consent_code: consentCode }),
      }),
    );
    expect(consent.status).toBe(200);
    const consentResult = (await consent.json()) as { redirectURI: string };
    const callback = new URL(consentResult.redirectURI);
    expect(callback.origin + callback.pathname).toBe(CALLBACK_URL);
    const authorizationCode = callback.searchParams.get('code');
    expect(authorizationCode).toBeTruthy();
    expect(authorizationCode).not.toBe(consentCode);

    const token = await handleConsentGatedMcpToken(
      makeTokenRequest(authorizationCode!),
      findVerification,
      (request) => instance.auth.handler(request),
    );
    expect(token.status).toBe(200);
    const tokenBody = (await token.json()) as Record<string, unknown>;
    expect(typeof tokenBody.access_token).toBe('string');
    expect(typeof tokenBody.refresh_token).toBe('string');
    expect(tokenBody.scope).toBe('openid profile email offline_access');
  });
});
