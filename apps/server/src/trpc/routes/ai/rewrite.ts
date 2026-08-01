import { buildEmailRewriteMessages, normalizeEmailRewriteHtml } from '../../../lib/rewrite-email';
import { activeConnectionProcedure } from '../../trpc';
import { env } from '../../../env';
import { z } from 'zod';

const REWRITE_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

export const rewriteEmail = activeConnectionProcedure
  .input(
    z.object({
      content: z.string().trim().min(1).max(40_000),
      mode: z.enum(['correct', 'rewrite']),
      mood: z.string().trim().max(160).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const response = await env.AI.run(REWRITE_MODEL, {
      messages: buildEmailRewriteMessages(input),
      max_tokens: 2_500,
      temperature: input.mode === 'correct' ? 0.1 : 0.35,
    });

    const raw =
      typeof response === 'string'
        ? response
        : 'response' in response && typeof response.response === 'string'
          ? response.response
          : null;

    if (!raw) throw new Error('The writing assistant returned an invalid response');

    return { html: normalizeEmailRewriteHtml(raw) };
  });
