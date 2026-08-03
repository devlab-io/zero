import { privateProcedure, router } from '../trpc';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const userRouter = router({
  delete: privateProcedure.mutation(async ({ ctx }) => {
    const { success, message } = await ctx.c.var.auth.api.deleteUser({
      body: {
        callbackURL: '/',
      },
      headers: ctx.c.req.raw.headers,
      request: ctx.c.req.raw,
    });
    return { success, message };
  }),
  getIntercomToken: privateProcedure.query(async ({ ctx }) => {
    const token = await jwt.sign(
      {
        user_id: ctx.sessionUser.id,
        email: ctx.sessionUser.email,
      },
      ctx.c.env.JWT_SECRET,
    );
    return token;
  }),

  // --- P17-D : sessions/appareils révocables ----------------------------------
  // Tout passe par l'API better-auth (Postgres + secondaryStorage invalidés
  // ensemble) ; le cookieCache borne la fenêtre résiduelle à 5 minutes. Le
  // token de session ne QUITTE JAMAIS le serveur — le client manipule des ids.
  listSessions: privateProcedure.query(async ({ ctx }) => {
    const headers = ctx.c.req.raw.headers;
    const [sessions, current] = await Promise.all([
      ctx.c.var.auth.api.listSessions({ headers }),
      ctx.c.var.auth.api.getSession({ headers }),
    ]);
    const currentId = current?.session.id ?? null;
    return {
      sessions: sessions
        .map((session) => ({
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          expiresAt: session.expiresAt,
          userAgent: session.userAgent ?? null,
          current: session.id === currentId,
        }))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    };
  }),
  revokeSession: privateProcedure
    .input(z.object({ sessionId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const headers = ctx.c.req.raw.headers;
      // listSessions est déjà scopé à l'utilisateur de la session appelante :
      // impossible de révoquer la session d'un autre compte par construction.
      const sessions = await ctx.c.var.auth.api.listSessions({ headers });
      const target = sessions.find((session) => session.id === input.sessionId);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'session_not_found' });
      await ctx.c.var.auth.api.revokeSession({ body: { token: target.token }, headers });
      return { success: true };
    }),
  revokeOtherSessions: privateProcedure.mutation(async ({ ctx }) => {
    await ctx.c.var.auth.api.revokeOtherSessions({ headers: ctx.c.req.raw.headers });
    return { success: true };
  }),
});
