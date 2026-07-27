import { getActiveConnection, getZeroDB } from '../lib/server-utils';
import { Ratelimit, type RatelimitConfig } from '@upstash/ratelimit';
import { createLoggingMiddleware } from '../lib/trpc-logging';
import { getConnInfo } from 'hono/cloudflare-workers';
import { initTRPC, TRPCError } from '@trpc/server';
import { env } from 'cloudflare:workers';
import { logger } from '../lib/logger';
import type { ZeroEnv } from '../env';

import { redis } from '../lib/services';
import type { Context } from 'hono';
import superjson from 'superjson';

// --- tRPC context: type-boundary facade (issue devlab-io/zero#43) ------------------
// The context exposed to `AppRouter` deliberately does NOT reference better-auth's
// `Auth` type. `Auth = ReturnType<typeof createAuth>` embeds non-portable types
// (zod v4 bundled by better-auth, `MCPOptions` from an un-exported subpath) that make
// the inferred procedure/router declarations non-emittable (TS2742/TS4023) — which in
// turn forces apps/mail's `tsc` program to compile the server source graph. We expose
// only the minimal capability surface the resolvers actually consume from the context
// (`ctx.sessionUser.{id,name,email}`, `ctx.c.var.auth.api.{signOut,deleteUser}`,
// `ctx.c.env`). The runtime objects remain the real better-auth session/api — see
// `routes/index.ts` auth middleware + `createContext`, and `serverTrpc` in `./index`.
// This is a type-exposition narrowing, not a runtime change. A drift type-test
// (`trpc/boundary.test-d.ts`) asserts these facades stay assignable from the real
// better-auth types. `ZeroEnv` is a nameable alias and is stubbed on the mail side of
// the boundary. See docs/adr/0006-trpc-type-boundary.md.
type BoundarySessionUser = { id: string; name: string; email: string };
type BoundaryAuthApi = {
  api: {
    signOut: (input: { headers: Headers }) => Promise<unknown>;
    deleteUser: (input: {
      body: { callbackURL: string };
      headers: Headers;
      request: Request;
    }) => Promise<{ success: boolean; message: string }>;
  };
};
type BoundaryVariables = {
  auth: BoundaryAuthApi;
  sessionUser?: BoundarySessionUser;
  traceId?: string;
  requestId?: string;
};
type TrpcContext = {
  c: Context<{ Bindings: ZeroEnv; Variables: BoundaryVariables }>;
  sessionUser?: BoundarySessionUser;
};

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

const loggingMiddleware = createLoggingMiddleware();

export const router = t.router;
export const publicProcedure = t.procedure.use(loggingMiddleware);

export const privateProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const { addRequestSpan, completeRequestSpan } = await import('../lib/trace-context');

  // Start auth validation span
  const authSpan = addRequestSpan(
    ctx.c,
    'trpc_auth_validation',
    {
      hasSessionUser: !!ctx.sessionUser,
      procedure: 'private',
    },
    {
      'trpc.auth_required': 'true',
    },
  );

  if (!ctx.sessionUser) {
    if (authSpan) {
      completeRequestSpan(
        ctx.c,
        authSpan.id,
        {
          success: false,
          reason: 'no_session_user',
        },
        'UNAUTHORIZED: No session user found',
      );
    }

    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }

  if (authSpan) {
    completeRequestSpan(ctx.c, authSpan.id, {
      success: true,
      userId: ctx.sessionUser.id,
    });
  }

  return next({ ctx: { ...ctx, sessionUser: ctx.sessionUser } });
});

export const activeConnectionProcedure = privateProcedure.use(async ({ ctx, next }) => {
  const { addRequestSpan, completeRequestSpan } = await import('../lib/trace-context');

  // Start connection validation span
  const connectionSpan = addRequestSpan(
    ctx.c,
    'trpc_connection_validation',
    {
      userId: ctx.sessionUser.id,
    },
    {
      'trpc.connection_required': 'true',
    },
  );

  try {
    const activeConnection = await getActiveConnection();

    if (connectionSpan) {
      completeRequestSpan(ctx.c, connectionSpan.id, {
        success: true,
        connectionId: activeConnection.id,
        connectionType: activeConnection.providerId,
      });
    }

    return next({ ctx: { ...ctx, activeConnection } });
  } catch (err) {
    if (connectionSpan) {
      completeRequestSpan(
        ctx.c,
        connectionSpan.id,
        {
          success: false,
          reason: 'connection_not_found',
        },
        err instanceof Error ? err.message : 'Failed to get active connection',
      );
    }

    // Devlab (robustesse) : ne PLUS déconnecter ici. Ce `signOut` frappait sur
    // *toute* erreur de `getActiveConnection`, y compris une erreur transitoire
    // (DO froid, aller-retour réseau raté) — une requête qui arrive trop tôt au
    // boot suffisait à détruire la session. Le cas légitime « cet utilisateur
    // n'a aucune connexion » est déjà traité, et déconnecte, dans
    // `getActiveConnection` lui-même : ce second appel était redondant sur le
    // cas légitime et destructeur sur le cas transitoire.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err instanceof Error ? err.message : 'Failed to get active connection',
    });
  }
});

const permissionErrors = ['precondition check', 'insufficient permission', 'invalid credentials'];

export const activeDriverProcedure = activeConnectionProcedure.use(async ({ ctx, next }) => {
  const { activeConnection, sessionUser } = ctx;
  const res = await next({ ctx: { ...ctx } });

  if (!res.ok) {
    const errorMessage = res.error.message.toLowerCase();

    const isPermissionError = permissionErrors.some((errorType) =>
      errorMessage.includes(errorType),
    );

    if (isPermissionError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Required scopes missing',
        cause: res.error,
      });
    }

    // Handle token expiration/refresh issues
    if (errorMessage.includes('invalid_grant')) {
      // Remove the access token and refresh token
      const db = await getZeroDB(sessionUser.id);
      await db.updateConnection(activeConnection.id, {
        accessToken: null,
        refreshToken: null,
      });

      ctx.c.header(
        'X-Zero-Redirect',
        `/settings/connections?disconnectedConnectionId=${activeConnection.id}`,
      );

      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Connection expired. Please reconnect.',
        cause: res.error,
      });
    }
  }

  return res;
});

export const createRateLimiterMiddleware = (config: {
  limiter: RatelimitConfig['limiter'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generatePrefix: (ctx: TrpcContext, input: unknown) => string;
}) =>
  t.middleware(async ({ next, ctx, input }) => {
    // Devlab self-host: sans Redis, pas de rate limiting (no-op).
    const zenv = env as unknown as ZeroEnv;
    if (!zenv.REDIS_URL || !zenv.REDIS_TOKEN) return next();
    const ratelimiter = new Ratelimit({
      redis: redis(),
      limiter: config.limiter,
      analytics: true,
      prefix: config.generatePrefix(ctx, input),
    });
    const finalIp = getConnInfo(ctx.c).remote.address ?? 'no-ip';
    const { success, limit, reset, remaining } = await ratelimiter.limit(finalIp);

    ctx.c.res.headers.append('X-RateLimit-Limit', limit.toString());
    ctx.c.res.headers.append('X-RateLimit-Remaining', remaining.toString());
    ctx.c.res.headers.append('X-RateLimit-Reset', reset.toString());

    if (!success) {
      logger.info(`Rate limit exceeded for IP ${finalIp}.`);
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
      });
    }

    return next();
  });
