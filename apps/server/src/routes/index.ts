// Server routing composition, extracted from main.ts during the V2.3
// routing-consolidation (issue devlab-io/zero#24). This is the single Hono
// mounting layer: the `api` sub-app (tracing/auth middleware + /ai, /autumn,
// /public sub-routers + tRPC at /api/trpc) and the root `app` (CORS, OAuth
// discovery, MCP/SSE mounts, agents websocket middleware, health, Sentry
// tunnel and provider webhooks). Frontier rationale: docs/adr/0001-routing-hono-vs-trpc.md.
import {
  INTERNAL_SERVICE_HEADER,
  isInternalServiceCaller,
  THINKING_MCP_PURPOSE,
} from '../lib/internal-service-auth';
import { authorizeAgentAccess, type AgentLobby } from '../lib/agent-authorization';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { oAuthDiscoveryMetadata } from 'better-auth/plugins';
import { getZeroDB, verifyToken } from '../lib/server-utils';
import { ThinkingMCP } from '../lib/sequential-thinking';
import { describeRequest, logger } from '../lib/logger';
import { contextStorage } from 'hono/context-storage';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { trpcServer } from '@hono/trpc-server';
import { toHonoResponse } from '../lib/errors';
import { agentsMiddleware } from 'hono-agents';
import { invariant } from '../lib/invariant';
import { initTracing } from '../lib/tracing';
import { env, type ZeroEnv } from '../env';
import type { HonoContext } from '../ctx';
import { createAuth } from '../lib/auth';
import { ZeroMCP } from './agent/mcp';
import { EProviders } from '../types';
import { publicRouter } from './auth';
import { autumnApi } from './autumn';
import { appRouter } from '../trpc';
import { sql } from 'drizzle-orm';
import { cors } from 'hono/cors';
import { createDb } from '../db';
import { aiRouter } from './ai';
import { Hono } from 'hono';

// Tunnel Sentry : l'hôte d'ingestion et les identifiants de projet étaient ceux du projet de
// l'AMONT, codés en dur. Deux conséquences : le tunnel refusait les enveloppes d'un projet
// Sentry qui nous appartiendrait, et acceptait de relayer vers le leur. Ils sont désormais
// déclarés par environnement ; NON configurés, le tunnel refuse (fail-closed) au lieu de
// pousser les erreurs de nos utilisateurs chez un tiers.
const sentryTunnelHost = () => env.SENTRY_TUNNEL_HOST?.trim() || null;
const sentryTunnelProjectIds = () =>
  new Set(
    (env.SENTRY_TUNNEL_PROJECT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );

// Sel de hachage des IP. Il était en dur — avec, dans le code lui-même, un commentaire
// demandant de le sortir en variable d'environnement. Un sel public rend le hachage
// réversible par simple table de correspondance sur l'espace IPv4, donc ne protège plus rien.
// Le repli n'existe qu'en développement local, et il est explicite.
const DEV_IP_HASH_SALT = 'local-development-ip-salt';
let warnedAboutIpSalt = false;
const ipHashSalt = () => {
  const configured = env.IP_HASH_SALT?.trim();
  if (configured) return configured;

  if (env.NODE_ENV !== 'local' && !warnedAboutIpSalt) {
    // Une fois par isolate : ce chemin est traversé à chaque requête.
    warnedAboutIpSalt = true;
    logger.warn('[tracing] IP_HASH_SALT is not configured — IP hashes are not deidentified');
  }
  return DEV_IP_HASH_SALT;
};

// Utility function to hash IP addresses for PII protection
function hashIpAddress(ip: string | undefined): string | undefined {
  if (!ip) return undefined;

  // Simple but effective hash for IP addresses
  // This preserves uniqueness while protecting PII
  const salt = ipHashSalt();
  let hash = 0;
  const str = ip + salt;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Return a prefixed hex representation
  return `ip_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// Wires the agent authorisation policy (lib/agent-authorization.ts) to the real session
// and connection-ownership lookups. Kept out of the middleware literal so the policy
// stays unit-testable and this file stays a routing composition.
const authorizeAgent = (request: Request, lobby: AgentLobby) =>
  authorizeAgentAccess(request, lobby, {
    resolveUserId: async (headers) => {
      const auth = await createAuth();
      const session = await auth.api.getSession({ headers });
      return session?.user?.id;
    },
    ownsConnection: async (userId, connectionId) => {
      const db = await getZeroDB(userId);
      return Boolean(await db.findUserConnection(connectionId));
    },
  });

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
    const authSpan = TraceContext.startSpan(
      traceId,
      'authentication',
      {
        method: c.req.method,
        url: c.req.url,
        hasAuthHeader: !!c.req.header('Authorization'),
      },
      {
        'auth.method': c.req.header('Authorization') ? 'bearer_token' : 'session_cookie',
      },
    );

    const auth = await createAuth();
    c.set('auth', auth);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('sessionUser', session?.user);

    if (c.req.header('Authorization') && !session?.user) {
      // Start token verification span
      const tokenSpan = TraceContext.startSpan(
        traceId,
        'token_verification',
        {
          tokenPresent: true,
        },
        {
          'auth.token_type': 'jwt',
        },
      );

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
          TraceContext.completeSpan(
            traceId,
            tokenSpan.id,
            {
              success: false,
              reason: 'token_verification_failed',
            },
            error instanceof Error ? error.message : 'Unknown token error',
          );
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
      authMethod: session?.user ? 'session' : c.req.header('Authorization') ? 'token' : 'none',
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
      TraceContext.completeSpan(
        traceId,
        requestSpan.id,
        {
          success: false,

          statusCode: c.res.status,
        },
        error instanceof Error ? error.message : 'Unknown request error',
      );
      throw error;
    }
    // Note: Trace will be completed by TRPC middleware after logging

    c.set('sessionUser', undefined);
    c.set('auth', undefined as any);
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
    // Reponse normalisee par la taxonomie (lib/errors.ts) : code stable pour une erreur
    // metier connue, 500 generique sinon. Le handler precedent reversait `err.message`
    // dans le corps de CHAQUE 500 — une chaine de connexion ou un detail interne partait
    // ainsi au client.
    const { status, body } = toHonoResponse(err);
    return c.json(body, status as ContentfulStatusCode);
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
    const auth = await createAuth();
    return oAuthDiscoveryMetadata(auth)(c.req.raw);
  })
  .mount(
    '/sse',
    async (request, env, ctx) => {
      const authBearer = request.headers.get('Authorization');
      if (!authBearer) {
        logger.info('No auth provided');
        return new Response('Unauthorized', { status: 401 });
      }
      const auth = await createAuth();
      const session = await auth.api.getMcpSession({ headers: request.headers });
      if (!session) {
        logger.info('Invalid auth provided', describeRequest(request));
        return new Response('Unauthorized', { status: 401 });
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
    async (request, mountEnv, ctx) => {
      // Ce mount n'exerçait AUCUN contrôle, contrairement à /sse et /mcp juste au-dessus.
      // Deux appelants légitimes, donc deux clés d'entrée : le ZeroAgent, qui se connecte en
      // boucle locale sur l'URL publique et présente un jeton de service dérivé
      // (lib/internal-service-auth.ts), et un client MCP d'utilisateur, qui présente une
      // session MCP comme sur /sse. Tout le reste est refusé.
      const isInternal = await isInternalServiceCaller(
        (mountEnv as ZeroEnv).JWT_SECRET,
        THINKING_MCP_PURPOSE,
        request.headers.get(INTERNAL_SERVICE_HEADER),
      );

      if (!isInternal) {
        if (!request.headers.get('Authorization')) {
          return new Response('Unauthorized', { status: 401 });
        }
        const auth = await createAuth();
        const session = await auth.api.getMcpSession({ headers: request.headers });
        if (!session) {
          logger.info('Invalid auth provided', describeRequest(request));
          return new Response('Unauthorized', { status: 401 });
        }
        ctx.props = { userId: session.userId };
      }

      return ThinkingMCP.serveSSE('/mcp/thinking/sse', { binding: 'THINKING_MCP' }).fetch(
        request,
        mountEnv,
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
        return new Response('Unauthorized', { status: 401 });
      }
      const auth = await createAuth();
      const session = await auth.api.getMcpSession({ headers: request.headers });
      if (!session) {
        logger.info('Invalid auth provided', describeRequest(request));
        return new Response('Unauthorized', { status: 401 });
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
        // Both branches guarded: partyserver calls onBeforeConnect on a WebSocket
        // upgrade and onBeforeRequest on plain HTTP. See lib/agent-authorization.ts.
        onBeforeConnect: (request: Request, lobby: AgentLobby) => authorizeAgent(request, lobby),
        onBeforeRequest: (request: Request, lobby: AgentLobby) => authorizeAgent(request, lobby),
      },
    }),
  )
  // Liveness : l'isolate répond. Ne touche AUCUNE dépendance, à dessein — une sonde de
  // vivacité qui échoue parce que la base est lente provoque des redémarrages inutiles.
  .get('/health', (c) => c.json({ message: 'Zero Server is Up!' }))
  // Readiness (pitbull A11, axe 10) : vérifie réellement les dépendances dont dépend le
  // service. `/health` renvoyait 200 en dur, base et bindings à terre compris, donc ne
  // pouvait servir ni de sonde de déploiement ni d'alerte. Chaque sonde est bornée dans le
  // temps pour que l'endpoint réponde même quand une dépendance pend.
  .get('/health/ready', async (c) => {
    const withTimeout = async <T>(label: string, probe: Promise<T>, ms = 2_000) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          probe,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
          }),
        ]);
        return { name: label, ok: true as const };
      } catch (error) {
        return { name: label, ok: false as const, error: (error as Error).message };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const probeDatabase = async () => {
      const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
      try {
        await db.execute(sql`select 1`);
      } finally {
        await conn.end();
      }
    };

    const checks = await Promise.all([
      withTimeout('database', probeDatabase()),
      withTimeout('kv', env.pending_emails_status.get('__readiness_probe__')),
    ]);

    const failed = checks.filter((check) => !check.ok);
    if (failed.length) {
      logger.warn('[readiness] dependency check failed', { failed });
      return c.json({ ready: false, checks }, 503);
    }
    return c.json({ ready: true, checks });
  })
  .get('/', (c) => c.redirect(`${env.VITE_PUBLIC_APP_URL}`))
  .post('/monitoring/sentry', async (c) => {
    try {
      const envelopeBytes = await c.req.arrayBuffer();
      const envelope = new TextDecoder().decode(envelopeBytes);
      const piece = envelope.split('\n')[0];
      const header = JSON.parse(piece);
      const dsn = new URL(header['dsn']);
      const project_id = dsn.pathname?.replace('/', '');

      const host = sentryTunnelHost();
      if (!host) {
        throw new Error('Sentry tunnel is not configured (SENTRY_TUNNEL_HOST)');
      }

      if (dsn.hostname !== host) {
        throw new Error(`Invalid sentry hostname: ${dsn.hostname}`);
      }

      if (!project_id || !sentryTunnelProjectIds().has(project_id)) {
        throw new Error(`Invalid sentry project id: ${project_id}`);
      }

      const upstream_sentry_url = `https://${host}/api/${project_id}/envelope/`;
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
        // Le jeton D'ABORD, le corps ENSUITE. Le corps JSON etait parse avant toute
        // verification : un appelant non authentifie faisait travailler le parseur sur une
        // charge qu'il choisissait. Plus rien n'est desormais lu du corps avant le 403.
        const authHeader = c.req.header('Authorization');
        invariant(authHeader, 'missing Authorization header');
        const isValid = await verifyToken(authHeader.split(' ')[1]);
        if (!isValid) {
          // 403 et non 200 : un 200 acquittait la notification ET masquait le refus. Pub/Sub
          // ne redélivre pas sur 403 — c'est voulu, un jeton refusé ne devient pas valide en
          // le rejouant, et le refus reste visible dans les métriques de l'abonnement.
          // Aucun champ du corps n'est journalise ici : il n'est pas encore lu, et il vient
          // d'un appelant non authentifie.
          logger.debug('[GOOGLE] invalid request');
          span.setAttributes({ 'auth.status': 'invalid' });
          return c.json({ error: 'Forbidden' }, { status: 403 });
        }

        span.setAttributes({ 'auth.status': 'valid' });

        // Un corps illisible faisait lever `c.req.json()` : l'exception remontait au catch
        // du handler, qui la RELANCAIT — soit une 500 opaque. Un corps mal forme est une
        // faute de l'appelant : 400 explicite, et Pub/Sub ne redelivre pas indefiniment.
        let body: { historyId: string };
        try {
          body = await c.req.json<{ historyId: string }>();
        } catch {
          logger.debug('[GOOGLE] malformed JSON body');
          span.setAttributes({ 'error.type': 'invalid_json_body' });
          return c.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const subHeader = c.req.header('x-goog-pubsub-subscription-name');

        span.setAttributes({
          'history.id': body.historyId,
          'subscription.name': subHeader || 'missing',
        });

        if (!subHeader) {
          // Le corps entier de la notification Pub/Sub partait en `info` : il porte
          // l'adresse de la boite concernee. Retrograde en `debug`, borne a l'historyId.
          logger.debug('[GOOGLE] no subscription header', { historyId: body.historyId });
          span.setAttributes({ 'error.type': 'missing_subscription_header' });
          return c.json({}, { status: 200 });
        }

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
          // Un 200 acquittait la notification Google alors que rien n'avait ete mis en
          // queue : le fil n'etait jamais synchronise et la notification etait perdue.
          // Un 5xx fait redelivrer Pub/Sub.
          return c.json({ message: 'Failed to enqueue notification' }, { status: 503 });
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
