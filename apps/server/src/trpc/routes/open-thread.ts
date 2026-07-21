import { IGetThreadResponseSchema } from '../../lib/driver/types';
import { processEmailHtml } from '../../lib/email-processor';
import { getThread } from '../../lib/server-utils';
import { activeDriverProcedure } from '../trpc';
import { logger } from '../../lib/logger';
import { z } from 'zod';

const MAX_PREPROCESSED_MESSAGES = 8;

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
    const result = await getThread(ctx.activeConnection.id, input.id);
    const thread = result.result;
    const candidates = thread.messages
      .flatMap((message) =>
        !message.isDraft && message.decodedBody
          ? [{ id: message.id, html: message.decodedBody }]
          : [],
      )
      .slice(-MAX_PREPROCESSED_MESSAGES);

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

    return { thread, rendered };
  });
