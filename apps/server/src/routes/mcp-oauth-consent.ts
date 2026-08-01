import { Hono } from 'hono';

import {
  findMcpVerification,
  handleConsentGatedMcpToken,
  isSameOriginMcpConsentSubmission,
  loadMcpConsentContext,
  MCP_CONSENT_SCRIPT_CSP_HASH,
  McpConsentError,
  renderMcpConsentPage,
  requireExplicitMcpConsent,
} from '../lib/mcp-oauth-consent';
import type { HonoContext } from '../ctx';
import { createDb } from '../db';
import { env } from '../env';

type AuthHandler = { handler(request: Request): Promise<Response> };

async function withDatabase<T>(run: (db: ReturnType<typeof createDb>['db']) => Promise<T>) {
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  try {
    return await run(db);
  } finally {
    await conn.end();
  }
}

export function handleMcpAuthorize(auth: AuthHandler, request: Request) {
  return auth.handler(requireExplicitMcpConsent(request));
}

export function handleMcpToken(auth: AuthHandler, request: Request) {
  return withDatabase((db) =>
    handleConsentGatedMcpToken(
      request,
      (identifier) => findMcpVerification(db, identifier),
      (nextRequest) => auth.handler(nextRequest),
    ),
  );
}

function consentHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src ${MCP_CONSENT_SCRIPT_CSP_HASH}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function consentError(error: unknown) {
  if (error instanceof McpConsentError) return error;
  return new McpConsentError('Unable to load this authorization request.', 400);
}

export const mcpOAuthConsentRouter = new Hono<HonoContext>()
  .get('/consent', async (c) => {
    if (!c.var.sessionUser) return c.text('Authentication required.', 401, consentHeaders());

    const consentCode = c.req.query('consent_code');
    const clientId = c.req.query('client_id');
    if (!consentCode || !clientId) {
      return c.text('Invalid authorization request.', 400, consentHeaders());
    }

    try {
      const context = await withDatabase((db) =>
        loadMcpConsentContext(db, {
          consentCode,
          queryClientId: clientId,
          sessionUserId: c.var.sessionUser!.id,
          accountEmail: c.var.sessionUser!.email,
        }),
      );
      return c.html(renderMcpConsentPage(context), 200, consentHeaders());
    } catch (error) {
      const safeError = consentError(error);
      return c.text(safeError.message, safeError.status, consentHeaders());
    }
  })
  .post('/consent', async (c) => {
    if (!c.var.sessionUser) return c.text('Authentication required.', 401, consentHeaders());
    if (!isSameOriginMcpConsentSubmission(c.req.raw, env.VITE_PUBLIC_BACKEND_URL)) {
      return c.text('Invalid consent origin.', 403, consentHeaders());
    }

    const body = await c.req.parseBody();
    const consentCode = typeof body.consent_code === 'string' ? body.consent_code : '';
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    const decision = body.decision;
    if (!consentCode || !clientId || (decision !== 'accept' && decision !== 'deny')) {
      return c.text('Invalid consent submission.', 400, consentHeaders());
    }

    try {
      await withDatabase((db) =>
        loadMcpConsentContext(db, {
          consentCode,
          queryClientId: clientId,
          sessionUserId: c.var.sessionUser!.id,
          accountEmail: c.var.sessionUser!.email,
        }),
      );
      const result = await c.var.auth.api.oAuthConsent({
        headers: c.req.raw.headers,
        body: { accept: decision === 'accept', consent_code: consentCode },
      });
      return c.redirect(result.redirectURI, 303);
    } catch (error) {
      const safeError = consentError(error);
      return c.text(safeError.message, safeError.status, consentHeaders());
    }
  });
