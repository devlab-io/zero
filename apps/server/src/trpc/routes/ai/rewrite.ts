import {
  assertPreservedEmailStructure,
  buildEmailRewriteMessages,
  normalizeEmailRewriteHtml,
} from '../../../lib/rewrite-email';
import { createSelectedRetaModel } from '../../../lib/ask-reta/deps';
import { activeConnectionProcedure } from '../../trpc';
import { z } from 'zod';

export const rewriteEmail = activeConnectionProcedure
  .input(
    z.object({
      content: z.string().trim().min(1).max(40_000),
      mode: z.enum(['correct', 'rewrite']),
      mood: z.string().trim().max(160).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const messages = buildEmailRewriteMessages(input);
    const { model, modelKey } = await createSelectedRetaModel(ctx.sessionUser.id);
    const raw = await model.complete({
      system: messages[0]!.content,
      user: messages[1]!.content,
      maxTokens: 2_500,
      temperature: input.mode === 'correct' ? 0.1 : 0.35,
      signal: ctx.c.req.raw.signal,
    });

    if (!raw) throw new Error('The writing assistant returned an invalid response');

    const html = normalizeEmailRewriteHtml(raw);
    assertPreservedEmailStructure(input.content, html);
    return { html, model: modelKey };
  });
