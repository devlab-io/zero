import { IGetThreadResponseSchema } from '../../lib/driver/types';
import { processEmailHtml } from '../../lib/email-processor';
import { getThread } from '../../lib/server-utils';
import { activeDriverProcedure } from '../trpc';
import { tracing } from 'cloudflare:workers';
import { logger } from '../../lib/logger';
import { z } from 'zod';

const MAX_PREPROCESSED_MESSAGES = 8;

// Native Workers Traces custom spans (feature-checked: the API is absent on
// older runtimes). Automatic DO/R2/fetch spans come from the observability
// traces config; these spans delimit the ZeroDB/ZeroDriver fetch and the
// server-side HTML sanitization so each millisecond is attributable.
const enterSpan = (name: string, attributes?: Record<string, string | number | boolean>) =>
  tracing?.enterSpan(name, { attributes });

const renderedEmailSchema = z.object({
  html: z.string(),
  hasBlockedImages: z.boolean(),
});

export const openThreadProcedure = activeDriverProcedure
  .input(
    z.object({
      id: z.string().min(1),
      shouldLoadImages: z.boolean().optional().default(false),
      theme: z.enum(['light', 'dark']).optional().default('light'),
    }),
  )
  .output(
    z.object({
      thread: IGetThreadResponseSchema,
      rendered: z.record(z.string(), renderedEmailSchema),
    }),
  )
  .query(async ({ input, ctx }) => {
    const fetchSpan = enterSpan('openThread.getThread', {
      threadId: input.id,
      connectionId: ctx.activeConnection.id,
    });
    const result = await getThread(ctx.activeConnection.id, input.id);
    fetchSpan?.end({ messageCount: result.result.messages.length });
    const thread = result.result;
    const candidates = thread.messages
      .flatMap((message) =>
        !message.isDraft && message.decodedBody
          ? [{ id: message.id, html: message.decodedBody }]
          : [],
      )
      .slice(-MAX_PREPROCESSED_MESSAGES);

    const sanitizeSpan = enterSpan('openThread.sanitize', {
      messageCount: candidates.length,
      shouldLoadImages: input.shouldLoadImages,
      theme: input.theme,
    });
    const rendered = Object.fromEntries(
      candidates.flatMap(({ id, html }) => {
        try {
          const processed = processEmailHtml({
            html,
            shouldLoadImages: input.shouldLoadImages,
            theme: input.theme,
          });
          return [
            [
              id,
              {
                html: processed.processedHtml,
                hasBlockedImages: processed.hasBlockedImages,
              },
            ] as const,
          ];
        } catch (error) {
          logger.warn('[openThread] Failed to preprocess message', { id, error });
          return [];
        }
      }),
    );
    sanitizeSpan?.end({ renderedCount: Object.keys(rendered).length });

    return { thread, rendered };
  });
