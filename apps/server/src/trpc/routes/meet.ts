import { loadGoogleAvailability, selectGoogleFreeBusyAccount } from '../../lib/meetings/freebusy';
import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { buildMeetingPreview } from '../../lib/meetings/prepare-from-thread';
import { getThread, getZeroDB } from '../../lib/server-utils';
import { isProCustomer } from '../../lib/utils';
import { Ratelimit } from '@upstash/ratelimit';
import { logger } from '../../lib/logger';
import { TRPCError } from '@trpc/server';
import { env } from '../../env';
import { z } from 'zod';

type MeetResponse = {
  success: boolean;
  data: {
    created_at: string;
    id: string;
    is_large: boolean;
    live_stream_on_start: boolean;
    persist_chat: boolean;
    record_on_start: boolean;
    status: string;
    summarize_on_end: boolean;
    updated_at: string;
  };
};

export const meetRouter = router({
  /**
   * P11 — preview ÉDITABLE d'un RDV construit depuis un fil : participants
   * dédupliqués (no-reply/listes écartés et LISTÉS), sujet nettoyé, contexte
   * borné, fuseau du réglage utilisateur. AUCUNE création d'événement, aucune
   * invitation, aucun nouveau scope OAuth — la création réelle restera une
   * action humaine distincte (calendar.freebusy incrémental pour les
   * disponibilités, scope de création séparé).
   */
  prepareFromThread: activeDriverProcedure
    .input(z.object({ threadId: z.string().min(1).max(256) }))
    .query(async ({ ctx, input }) => {
      const { result } = await getThread(ctx.activeConnection.id, input.threadId);
      const db = await getZeroDB(ctx.sessionUser.id);
      const settings = await db.findUserSettings();
      const timeZone = settings?.settings?.timezone ?? null;
      return {
        preview: buildMeetingPreview(result, {
          selfEmail: ctx.activeConnection.email,
          timeZone: timeZone && timeZone !== 'UTC' ? timeZone : null,
        }),
      };
    }),
  /**
   * Read-only availability for the proposed slot. The route can only query the
   * authenticated user's primary Google calendar and returns no event content.
   * Missing incremental consent is an explicit product state, not an error.
   */
  getAvailability: activeDriverProcedure
    .input(
      z.object({
        timeMin: z.string().datetime(),
        timeMax: z.string().datetime(),
        timeZone: z.string().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.activeConnection.providerId !== 'google') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Availability is currently supported for Google Calendar only',
        });
      }
      try {
        const accounts = await ctx.c.var.auth.api.listUserAccounts({
          headers: ctx.c.req.raw.headers,
        });
        const calendarAccount = selectGoogleFreeBusyAccount(accounts);
        if (!calendarAccount) return { authorizationRequired: true as const, busy: [] };
        return await loadGoogleAvailability(input, {
          getAccessToken: () =>
            ctx.c.var.auth.api.getAccessToken({
              body: { providerId: 'google', accountId: calendarAccount.accountId },
              headers: ctx.c.req.raw.headers,
            }),
        });
      } catch {
        logger.warn('[meet] Google FreeBusy lookup failed');
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Calendar availability is temporarily unavailable',
        });
      }
    }),
  create: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(10, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:meet-create-${sessionUser?.id}`,
      }),
    )
    .mutation(async ({ ctx }) => {
      const enableMeet = env.ENABLE_MEET === 'true';
      if (!enableMeet) return new Response('Not implemented', { status: 501 });
      const { Autumn } = await import('autumn-js');
      const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
      const customer = await autumn.customers.get(ctx.sessionUser?.id);
      if (!customer.data) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Customer not found' });
      }

      if (!isProCustomer(customer.data)) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Customer is not a pro customer, please upgrade to a pro plan',
        });
      }

      const AuthHeader = env.MEET_AUTH_HEADER;
      const response = await fetch(env.MEET_API_URL + '/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AuthHeader,
        },
      });

      if (!response.ok) {
        logger.error(await response.text());
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create meeting' });
      }

      const data = await response.json<MeetResponse>();
      return data;
    }),
});
