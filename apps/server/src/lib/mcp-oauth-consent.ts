import { and, eq } from 'drizzle-orm';

import { oauthApplication, verification } from '../db/schema';
import type { DB } from '../db';

const MCP_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;
type McpScope = (typeof MCP_SCOPES)[number];

/**
 * A focused browser button can emit more than one submit activation through
 * accessibility tooling. Keep the first explicit decision and reject every
 * subsequent submit before it can consume the single-use OAuth consent code.
 *
 * This literal is covered by a CSP hash in the consent route. Keep the script
 * static: user/client data must never be interpolated into it.
 */
export const MCP_CONSENT_SUBMISSION_SCRIPT = `(() => {
  const form = document.querySelector('form');
  const decision = document.querySelector('input[name="decision"]');
  if (!form || !decision) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') {
      return;
    }
    const value = event.submitter?.dataset?.decision;
    if (value !== 'accept' && value !== 'deny') {
      return;
    }
    decision.value = value;
    form.dataset.submitting = 'true';
    for (const button of form.querySelectorAll('button')) button.setAttribute('aria-disabled', 'true');
    form.submit();
  });
})();`;

// sha256 of MCP_CONSENT_SUBMISSION_SCRIPT, base64 encoded. A test prevents drift.
export const MCP_CONSENT_SCRIPT_CSP_HASH = "'sha256-/B1vMuPRyBeSo3LEhybFooKMQradZfSeyrJ0YO50Cfs='";

const scopeCopy: Record<McpScope, { title: string; description: string }> = {
  openid: {
    title: 'Verify your Reta identity',
    description: 'Lets Codex confirm which Reta account approved this connection.',
  },
  profile: {
    title: 'Read your basic profile',
    description: 'Shares your display name and profile image with the connected client.',
  },
  email: {
    title: 'Read your account email address',
    description: 'Shares your Reta sign-in address. This scope does not grant Gmail access itself.',
  },
  offline_access: {
    title: 'Stay connected when Codex is not open',
    description:
      'Issues a refresh token so Codex can renew access later. You can revoke the connection at any time.',
  },
};

type ConsentVerificationPayload = {
  clientId: string;
  redirectURI: string;
  scope: string[];
  userId: string;
  requireConsent: boolean;
  state?: string | null;
};

export type McpConsentContext = {
  consentCode: string;
  clientId: string;
  clientName: string;
  callbackOrigin: string;
  isDynamicClient: boolean;
  scopes: McpScope[];
  accountEmail: string;
};

export class McpConsentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 = 400,
  ) {
    super(message);
    this.name = 'McpConsentError';
  }
}

/**
 * CSRF boundary for the browser consent form.
 *
 * Some privacy-focused browsers omit (or redact to `null`) Origin on a
 * same-origin top-level form POST. In that case Fetch Metadata remains the
 * browser-authenticated signal: accept only `Sec-Fetch-Site: same-origin` and
 * only when the effective request URL itself is the configured backend
 * origin. Non-browser clients with neither signal remain rejected.
 */
export function isSameOriginMcpConsentSubmission(request: Request, backendUrl: string): boolean {
  const expectedOrigin = new URL(backendUrl).origin;
  if (new URL(request.url).origin !== expectedOrigin) return false;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    try {
      return new URL(origin).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return fetchSite === 'same-origin';
}

function parseVerificationPayload(value: string): ConsentVerificationPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<ConsentVerificationPayload>;
    if (
      typeof parsed.clientId !== 'string' ||
      typeof parsed.redirectURI !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.requireConsent !== 'boolean' ||
      !Array.isArray(parsed.scope) ||
      parsed.scope.some((scope) => typeof scope !== 'string')
    ) {
      return null;
    }
    return parsed as ConsentVerificationPayload;
  } catch {
    return null;
  }
}

function normalizeScopes(scopes: string[]): McpScope[] {
  const unique = [...new Set(scopes)];
  const invalid = unique.filter((scope) => !MCP_SCOPES.includes(scope as McpScope));
  if (invalid.length > 0)
    throw new McpConsentError('The authorization request contains an unsupported scope.');
  return unique as McpScope[];
}

/**
 * The deprecated Better Auth MCP plugin only asks for consent when the client
 * supplies prompt=consent. Reta owns the authorization boundary, so every MCP
 * authorization request is upgraded to an explicit consent request.
 */
export function requireExplicitMcpConsent(request: Request): Request {
  const url = new URL(request.url);
  url.searchParams.set('prompt', 'consent');
  return new Request(url, request);
}

export async function readOAuthCode(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.clone().json()) as { code?: unknown };
      return typeof body.code === 'string' && body.code ? body.code : null;
    }
    const body = await request.clone().formData();
    const code = body.get('code');
    return typeof code === 'string' && code ? code : null;
  } catch {
    return null;
  }
}

export async function isPendingMcpConsent(
  code: string,
  findVerification: (identifier: string) => Promise<{ value: string } | null>,
): Promise<boolean> {
  const row = await findVerification(code);
  if (!row) return false;
  return parseVerificationPayload(row.value)?.requireConsent === true;
}

export async function handleConsentGatedMcpToken(
  request: Request,
  findVerification: (identifier: string) => Promise<{ value: string } | null>,
  next: (request: Request) => Promise<Response>,
): Promise<Response> {
  const code = await readOAuthCode(request);
  if (code && (await isPendingMcpConsent(code, findVerification))) {
    return Response.json(
      {
        error: 'consent_required',
        error_description: 'Explicit user consent is required before this code can be exchanged.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      },
    );
  }
  return next(request);
}

export async function findMcpVerification(db: DB, identifier: string) {
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1);
  return row ?? null;
}

export async function loadMcpConsentContext(
  db: DB,
  input: {
    consentCode: string;
    queryClientId: string;
    sessionUserId: string;
    accountEmail: string;
    now?: Date;
  },
): Promise<McpConsentContext> {
  const now = input.now ?? new Date();
  const [verificationRow] = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, input.consentCode))
    .limit(1);

  if (!verificationRow || verificationRow.expiresAt <= now) {
    throw new McpConsentError(
      'This authorization request has expired. Start again from Codex.',
      404,
    );
  }

  const payload = parseVerificationPayload(verificationRow.value);
  if (!payload || payload.requireConsent !== true) {
    throw new McpConsentError('This authorization request is not awaiting consent.', 400);
  }
  if (payload.clientId !== input.queryClientId) {
    throw new McpConsentError('The client does not match this authorization request.', 400);
  }
  if (payload.userId !== input.sessionUserId) {
    throw new McpConsentError('This authorization request belongs to another Reta account.', 403);
  }

  const [client] = await db
    .select({
      clientId: oauthApplication.clientId,
      name: oauthApplication.name,
      userId: oauthApplication.userId,
      disabled: oauthApplication.disabled,
    })
    .from(oauthApplication)
    .where(
      and(eq(oauthApplication.clientId, payload.clientId), eq(oauthApplication.disabled, false)),
    )
    .limit(1);

  if (!client?.clientId) throw new McpConsentError('This OAuth client is unavailable.', 404);

  let callbackOrigin: string;
  try {
    callbackOrigin = new URL(payload.redirectURI).origin;
  } catch {
    throw new McpConsentError('The OAuth callback is invalid.', 400);
  }

  return {
    consentCode: input.consentCode,
    clientId: client.clientId,
    clientName: client.name?.trim() || 'External MCP client',
    callbackOrigin,
    isDynamicClient: client.userId === null,
    scopes: normalizeScopes(payload.scope),
    accountEmail: input.accountEmail,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

export function renderMcpConsentPage(context: McpConsentContext): string {
  const scopeItems = context.scopes
    .map((scope) => {
      const copy = scopeCopy[scope];
      const emphasis = scope === 'offline_access' ? ' scope--persistent' : '';
      return `<li class="scope${emphasis}"><div class="scope__title">${escapeHtml(copy.title)}</div><p>${escapeHtml(copy.description)}</p><code>${scope}</code></li>`;
    })
    .join('');
  const clientSuffix = context.clientId.slice(-6);
  const clientTrust = context.isDynamicClient
    ? 'Dynamically registered · not trusted'
    : 'Registered external client';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${escapeHtml(context.clientName)} · Reta</title>
  <style>
    :root { color-scheme: light dark; font-family: Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: Canvas; color: CanvasText; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, Canvas 96%, CanvasText 4%); }
    main { width: min(100%, 560px); border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 16px; background: Canvas; box-shadow: 0 16px 42px color-mix(in srgb, CanvasText 10%, transparent); overflow: hidden; }
    header, section, form { padding: 22px 24px; }
    header { border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
    .brand { font-weight: 700; letter-spacing: -0.03em; }
    h1 { margin: 18px 0 8px; font-size: 24px; letter-spacing: -0.035em; }
    p { margin: 0; line-height: 1.5; color: color-mix(in srgb, CanvasText 68%, transparent); }
    .meta { display: grid; gap: 8px; margin-top: 18px; padding: 14px; border-radius: 12px; background: color-mix(in srgb, CanvasText 5%, transparent); font-size: 14px; }
    .meta strong { color: CanvasText; }
    .badge { display: inline-flex; width: fit-content; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 650; background: color-mix(in srgb, #d97706 16%, transparent); color: color-mix(in srgb, #d97706 84%, CanvasText); }
    ul { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 10px; }
    .scope { position: relative; padding: 13px 92px 13px 14px; border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); border-radius: 12px; }
    .scope--persistent { border-color: color-mix(in srgb, #d97706 48%, transparent); background: color-mix(in srgb, #d97706 7%, transparent); }
    .scope__title { font-size: 14px; font-weight: 650; }
    .scope p { margin-top: 3px; font-size: 13px; }
    code { position: absolute; top: 13px; right: 12px; font-size: 11px; color: color-mix(in srgb, CanvasText 54%, transparent); }
    .capabilities { margin-top: 18px; font-size: 13px; }
    form { display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
    form[data-submitting="true"] button { cursor: wait; opacity: .65; pointer-events: none; }
    button { min-height: 42px; border-radius: 10px; padding: 0 16px; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); font: inherit; font-weight: 650; cursor: pointer; transition: background-color 180ms ease, color 180ms ease, transform 180ms ease; }
    button:focus-visible { outline: 3px solid color-mix(in srgb, #2563eb 65%, transparent); outline-offset: 2px; }
    button:active { transform: translateY(1px); }
    .deny { background: transparent; color: CanvasText; }
    .allow { background: CanvasText; color: Canvas; }
    @media (max-width: 520px) { body { padding: 0; } main { min-height: 100vh; border: 0; border-radius: 0; } form { position: sticky; bottom: 0; background: Canvas; } }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">Reta</div>
      <h1>Authorize ${escapeHtml(context.clientName)}?</h1>
      <p>Review every permission before connecting this client to your Reta account.</p>
      <div class="meta">
        <span class="badge">${escapeHtml(clientTrust)}</span>
        <span><strong>Account</strong> · ${escapeHtml(context.accountEmail)}</span>
        <span><strong>Callback</strong> · ${escapeHtml(context.callbackOrigin)}</span>
        <span><strong>Client</strong> · …${escapeHtml(clientSuffix)}</span>
      </div>
    </header>
    <section>
      <strong>Requested OAuth scopes</strong>
      <ul>${scopeItems}</ul>
      <p class="capabilities">After authorization, Codex can use only the Reta MCP tools enabled in your Codex configuration. Reta never grants permanent deletion, and sending still requires a separate explicit confirmation.</p>
    </section>
    <form method="post" action="/api/oauth/mcp/consent">
      <input type="hidden" name="consent_code" value="${escapeHtml(context.consentCode)}" />
      <input type="hidden" name="client_id" value="${escapeHtml(context.clientId)}" />
      <input type="hidden" name="decision" value="" />
      <button class="deny" type="submit" data-decision="deny">Deny</button>
      <button class="allow" type="submit" data-decision="accept">Authorize</button>
    </form>
    <script>${MCP_CONSENT_SUBMISSION_SCRIPT}</script>
  </main>
</body>
</html>`;
}
