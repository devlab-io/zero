// Server routing composition, extracted from main.ts during the V2.3
// routing-consolidation (issue devlab-io/zero#24). This is the single Hono
// mounting layer: the `api` sub-app (tracing/auth middleware + /ai, /autumn,
// /public sub-routers + tRPC at /api/trpc) and the root `app` (CORS, OAuth
// discovery, MCP/SSE mounts, agents websocket middleware, health, Sentry
// tunnel and provider webhooks). Frontier rationale: docs/adr/0001-routing-hono-vs-trpc.md.
import { logger } from '../lib/logger';
import { invariant } from '../lib/invariant';
import { oAuthDiscoveryMetadata } from 'better-auth/plugins';
import { contextStorage } from 'hono/context-storage';
import { getZeroDB, verifyToken } from '../lib/server-utils';
import { ThinkingMCP } from '../lib/sequential-thinking';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { trpcServer } from '@hono/trpc-server';
import { agentsMiddleware } from 'hono-agents';
import { ZeroMCP } from './agent/mcp';
import {
  buildMcpProtectedResourceMetadata,
  mcpUnauthorizedResponse,
} from './agent/mcp-auth';
import { initTracing } from '../lib/tracing';
import type { HonoContext } from '../ctx';
import { EProviders } from '../types';
import { publicRouter } from './auth';
import { createAuth } from '../lib/auth';
import { autumnApi } from './autumn';
import { env } from '../env';
import { appRouter } from '../trpc';
import { aiRouter } from './ai';
import { cors } from 'hono/cors';
import { Hono } from 'hono';

const SENTRY_HOST = 'o4509328786915328.ingest.us.sentry.io';
const SENTRY_PROJECT_IDS = new Set(['4509328795303936']);

// Utility function to hash IP addresses for PII protection
function hashIpAddress(ip: string | undefined): string | undefined {
  if (!ip) return undefined;

  // Simple but effective hash for IP addresses
  // This preserves uniqueness while protecting PII
  const salt = 'zero-mail-ip-salt-2024'; // Consider using env variable for production
  let hash = 0;
  const str = ip + salt;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Return a prefixed hex representation
  return `ip_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export const api = new Hono<HonoContext>()
  .use(contextStorage())
  .use('*', async (c, next) => {
    // Initialize request tracing using headers (no context pollution)
    const traceId = c.req.header('X-Trace-ID') || crypto.randomUUID();
    const requestId = c.req.header('X-Request-Id') || crypto.randomUUID();

    // Set trace ID in response headers for client correlation
    c.header('X-Trace-ID', traceId);
    c.header('X-Request-ID', requestId);

    // Store trace ID in context variables for TRPC access
    c.set('traceId', traceId);
    c.set('requestId', requestId);

    const { TraceContext } = await import('../lib/trace-context');

    // Create trace for this request
    const rawIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');
    const trace = TraceContext.createTrace(traceId, {
      requestId,
      ip: hashIpAddress(rawIp), // Hash IP address to protect PII
      userAgent: c.req.header('User-Agent'),
    });

    // Start authentication span
    const authSpan = TraceContext.startSpan(traceId, 'authentication', {
      method: c.req.method,
      url: c.req.url,
      hasAuthHeader: !!c.req.header('Authorization'),
    }, {
      'auth.method': c.req.header('Authorization') ? 'bearer_token' : 'session_cookie'
    });

    const auth = createAuth();
    c.set('auth', auth);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('sessionUser', session?.user);

    if (c.req.header('Authorization') && !session?.user) {
      // Start token verification span
      const tokenSpan = TraceContext.startSpan(traceId, 'token_verification', {
        tokenPresent: true,
      }, {
        'auth.token_type': 'jwt'
      });

      const token = c.req.header('Authorization')?.split(' ')[1];

      if (token) {
        try {
          const localJwks = await auth.api.getJwks();
          const jwks = createLocalJWKSet(localJwks);

          const { payload } = await jwtVerify(token, jwks);
          const userId = payload.sub;

          if (userId) {
            const db = await getZeroDB(userId);
            const user = await db.findUser();
            c.set('sessionUser', user);

            TraceContext.completeSpan(traceId, tokenSpan.id, {
              success: true,
              userId,
            });
          } else {
            TraceContext.completeSpan(traceId, tokenSpan.id, {
              success: false,
              reason: 'no_user_id_in_token',
            });
          }
        } catch (error) {
          TraceContext.completeSpan(traceId, tokenSpan.id, {
            success: false,
            reason: 'token_verification_failed',
          }, error instanceof Error ? error.message : 'Unknown token error');
        }
      } else {
        TraceContext.completeSpan(traceId, tokenSpan.id, {
          success: false,
          reason: 'no_token_provided',
        });
      }
    }

    // Complete auth span
    TraceContext.completeSpan(traceId, authSpan.id, {
      authenticated: !!c.var.sessionUser,
      userId: c.var.sessionUser?.id,
      authMethod: session?.user ? 'session' : (c.req.header('Authorization') ? 'token' : 'none'),
    });

    // Update trace metadata with user info
    trace.metadata.userId = c.var.sessionUser?.id;
    trace.metadata.sessionId = c.var.sessionUser?.id || 'anonymous';

    // Start request processing span
    const requestSpan = TraceContext.startSpan(traceId, 'request_processing', {
      authenticated: !!c.var.sessionUser,
      path: new URL(c.req.url).pathname,
    });

    try {
      await next();
      // Don't complete the request span here - let TRPC middleware handle it
    } catch (error) {
      TraceContext.completeSpan(traceId, requestSpan.id, {
        success: false,

        statusCode: c.res.status,
      }, error instanceof Error ? error.message : 'Unknown request error');
      throw error;
    }
    // Note: Trace will be completed by TRPC middleware after logging

    c.set('sessionUser', undefined);
  })
  .route('/ai', aiRouter)
  .route('/autumn', autumnApi)
  .route('/public', publicRouter)
  .on(['GET', 'POST', 'OPTIONS'], '/auth/*', (c) => {
    return c.var.auth.handler(c.req.raw);
  })
  .use(
    trpcServer({
      endpoint: '/api/trpc',
      router: appRouter,
      createContext: (_, c) => {
        return { c, sessionUser: c.var['sessionUser'], db: c.var['db'] };
      },
      allowMethodOverride: true,
      onError: (opts) => {
        logger.error('Error in TRPC handler:', opts.error);
      },
    }),
  )
  .onError(async (err, c) => {
    if (err instanceof Response) return err;
    logger.error('Error in Hono handler:', err);
    return c.json(
      {
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      500,
    );
  });

export const app = new Hono<HonoContext>()
  .use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return null;
        let hostname: string;
        try {
          hostname = new URL(origin).hostname;
        } catch {
          logger.debug('CORS origin parse failed', { origin });
          return null;
        }
        const cookieDomain = env.COOKIE_DOMAIN;
        if (!cookieDomain) return null;
        if (hostname === cookieDomain || hostname.endsWith('.' + cookieDomain)) {
          return origin;
        }
        return null;
      },
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Zero-Redirect'],
    }),
  )
  .get('.well-known/oauth-authorization-server', async (c) => {
    const auth = createAuth();
    return oAuthDiscoveryMetadata(auth)(c.req.raw);
  })
  .get('/.well-known/oauth-protected-resource/mcp', (c) =>
    c.json(buildMcpProtectedResourceMetadata(env.VITE_PUBLIC_BACKEND_URL)),
  )
  .mount(
    '/sse',
    async (request, env, ctx) => {
      const authBearer = request.headers.get('Authorization');
      if (!authBearer) {
        logger.info('No auth provided');
        return mcpUnauthorizedResponse(env.VITE_PUBLIC_BACKEND_URL);
      }
      const auth = createAuth();
      const session = await auth.api.getMcpSession({ headers: request.headers });
      if (!session) {
        logger.info('Invalid auth provided', { transport: 'sse' });
        return mcpUnauthorizedResponse(env.VITE_PUBLIC_BACKEND_URL);
      }
      ctx.props = {
        userId: session?.userId,
      };
      return ZeroMCP.serveSSE('/sse', { binding: 'ZERO_MCP' }).fetch(request, env, ctx);
    },
    { replaceRequest: false },
  )
  .mount(
    '/mcp/thinking/sse',
    async (request, env, ctx) => {
      return ThinkingMCP.serveSSE('/mcp/thinking/sse', { binding: 'THINKING_MCP' }).fetch(
        request,
        env,
        ctx,
      );
    },
    { replaceRequest: false },
  )
  .mount(
    '/mcp',
    async (request, env, ctx) => {
      const authBearer = request.headers.get('Authorization');
      if (!authBearer) {
        return mcpUnauthorizedResponse(env.VITE_PUBLIC_BACKEND_URL);
      }
      const auth = createAuth();
      const session = await auth.api.getMcpSession({ headers: request.headers });
      if (!session) {
        logger.info('Invalid auth provided', { transport: 'streamable-http' });
        return mcpUnauthorizedResponse(env.VITE_PUBLIC_BACKEND_URL);
      }
      ctx.props = {
        userId: session?.userId,
      };
      return ZeroMCP.serve('/mcp', { binding: 'ZERO_MCP' }).fetch(request, env, ctx);
    },
    { replaceRequest: false },
  )
  .route('/api', api)
  .use(
    '*',
    agentsMiddleware({
      options: {
        onBeforeConnect: (c) => {
          if (!c.headers.get('Cookie')) {
            return new Response('Unauthorized', { status: 401 });
          }
        },
      },
    }),
  )
  .get('/health', (c) => c.json({ message: 'Zero Server is Up!' }))
  .get('/', (c) => c.redirect(`${env.VITE_PUBLIC_APP_URL}`))
  .post('/monitoring/sentry', async (c) => {
    try {
      const envelopeBytes = await c.req.arrayBuffer();
      const envelope = new TextDecoder().decode(envelopeBytes);
      const piece = envelope.split('\n')[0];
      const header = JSON.parse(piece);
      const dsn = new URL(header['dsn']);
      const project_id = dsn.pathname?.replace('/', '');

      if (dsn.hostname !== SENTRY_HOST) {
        throw new Error(`Invalid sentry hostname: ${dsn.hostname}`);
      }

      if (!project_id || !SENTRY_PROJECT_IDS.has(project_id)) {
        throw new Error(`Invalid sentry project id: ${project_id}`);
      }

      const upstream_sentry_url = `https://${SENTRY_HOST}/api/${project_id}/envelope/`;
      await fetch(upstream_sentry_url, {
        method: 'POST',
        body: envelopeBytes,
      });

      return c.json({}, { status: 200 });
    } catch (e) {
      logger.error('error tunneling to sentry', e);
      return c.json({ error: 'error tunneling to sentry' }, { status: 500 });
    }
  })
  .post('/a8n/notify/:providerId', async (c) => {
    const tracer = initTracing();
    const span = tracer.startSpan('a8n_notify', {
      attributes: {
        'provider.id': c.req.param('providerId'),
        'notification.type': 'email_notification',
        'http.method': c.req.method,
        'http.url': c.req.url,
      },
    });

    try {
      if (!c.req.header('Authorization')) {
        span.setAttributes({ 'auth.status': 'missing' });
        return c.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (env.DISABLE_WORKFLOWS === 'true') {
        span.setAttributes({ 'workflows.disabled': true });
        return c.json({ message: 'OK' }, { status: 200 });
      }
      const providerId = c.req.param('providerId');
      if (providerId === EProviders.google) {
        const body = await c.req.json<{ historyId: string }>();
        const subHeader = c.req.header('x-goog-pubsub-subscription-name');

        span.setAttributes({
          'history.id': body.historyId,
          'subscription.name': subHeader || 'missing',
        });

        if (!subHeader) {
          logger.info('[GOOGLE] no subscription header', body);
          span.setAttributes({ 'error.type': 'missing_subscription_header' });
          return c.json({}, { status: 200 });
        }
        const authHeader = c.req.header('Authorization');
        invariant(authHeader, 'missing Authorization header');
        const isValid = await verifyToken(authHeader.split(' ')[1]);
        if (!isValid) {
          logger.info('[GOOGLE] invalid request', body);
          span.setAttributes({ 'auth.status': 'invalid' });
          return c.json({}, { status: 200 });
        }

        span.setAttributes({ 'auth.status': 'valid' });

        try {
          await env.thread_queue.send({
            providerId,
            historyId: body.historyId,
            subscriptionName: subHeader,
          });
          span.setAttributes({ 'queue.message_sent': true });
        } catch (error) {
          logger.error('Error sending to thread queue', error, {
            providerId,
            historyId: body.historyId,
            subscriptionName: subHeader,
          });
          span.recordException(error as Error);
          span.setStatus({ code: 2, message: (error as Error).message });
        }
        return c.json({ message: 'OK' }, { status: 200 });
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
