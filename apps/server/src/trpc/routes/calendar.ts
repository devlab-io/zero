import {
  createGoogleCalendarEvent,
  GoogleCalendarApiError,
  listGoogleCalendarEvents,
  selectGoogleCalendarEventsAccount,
} from '../../lib/calendar/events';
import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { Ratelimit } from '@upstash/ratelimit';
import { logger } from '../../lib/logger';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const dayInput = z.object({
  timeMin: z.string().datetime(),
  timeMax: z.string().datetime(),
  timeZone: z.string().min(1).max(100),
});

function calendarErrorContext(error: unknown) {
  if (error instanceof GoogleCalendarApiError) {
    return {
      name: error.name,
      operation: error.operation,
      status: error.status,
      reason: error.reason,
    };
  }
  return { name: error instanceof Error ? error.name : 'UnknownError' };
}

async function getCalendarAccount(ctx: {
  activeConnection: { providerId: string; authAccountId?: string | null };
  c: {
    req: { raw: { headers: Headers } };
    var: {
      auth: {
        api: {
          listUserAccounts: (input: { headers: Headers }) => Promise<
            {
              accountId: string;
              providerId: string;
              scopes?: readonly string[] | null;
            }[]
          >;
        };
      };
    };
  };
}) {
  if (ctx.activeConnection.providerId !== 'google' || !ctx.activeConnection.authAccountId) {
    return null;
  }
  const accounts = await ctx.c.var.auth.api.listUserAccounts({ headers: ctx.c.req.raw.headers });
  return selectGoogleCalendarEventsAccount(accounts, ctx.activeConnection.authAccountId);
}

export const calendarRouter = router({
  listDay: activeDriverProcedure.input(dayInput).query(async ({ ctx, input }) => {
    if (ctx.activeConnection.providerId !== 'google') {
      return { supported: false as const, authorizationRequired: false, events: [] };
    }
    try {
      const account = await getCalendarAccount(ctx);
      if (!account) {
        return { supported: true as const, authorizationRequired: true, events: [] };
      }
      const result = await listGoogleCalendarEvents(input, {
        getAccessToken: () =>
          ctx.c.var.auth.api.getAccessToken({
            body: { providerId: 'google', accountId: account.accountId },
            headers: ctx.c.req.raw.headers,
          }),
      });
      return { supported: true as const, ...result };
    } catch (error) {
      logger.warn('[calendar] Day lookup failed', calendarErrorContext(error));
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Calendar is temporarily unavailable',
      });
    }
  }),

  createEvent: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(20, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:calendar-create-${sessionUser?.id}`,
      }),
    )
    .input(
      z.object({
        title: z.string().trim().min(1).max(250),
        description: z.string().trim().max(8_000).optional(),
        location: z.string().trim().max(500).optional(),
        attendees: z.array(z.string().trim().toLowerCase().email().max(320)).max(50).default([]),
        timeZone: z.string().min(1).max(100),
        allDay: z.boolean().default(false),
        start: z.string().datetime(),
        end: z.string().datetime(),
        createMeetLink: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.activeConnection.providerId !== 'google') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Google Calendar is required' });
      }
      try {
        const account = await getCalendarAccount(ctx);
        if (!account) return { authorizationRequired: true as const, event: null };
        return await createGoogleCalendarEvent(input, {
          getAccessToken: () =>
            ctx.c.var.auth.api.getAccessToken({
              body: { providerId: 'google', accountId: account.accountId },
              headers: ctx.c.req.raw.headers,
            }),
        });
      } catch (error) {
        logger.warn('[calendar] Event creation failed', calendarErrorContext(error));
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Calendar event could not be created',
        });
      }
    }),
});
