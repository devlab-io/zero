import { IGetThreadResponseSchema } from '../../lib/driver/types';
import { processEmailHtml } from '../../lib/email-processor';
import type { ZeroTracingSpan } from 'cloudflare:workers';
import { getThread } from '../../lib/server-utils';
import { activeDriverProcedure } from '../trpc';
import { TtlCache } from '../../lib/ttl-cache';
import { tracing } from 'cloudflare:workers';
import { logger } from '../../lib/logger';
import { z } from 'zod';

const MAX_PREPROCESSED_MESSAGES = 8;

// Native Workers Traces custom spans (feature-checked: tracing is undefined
// under the Node test stub). Real runtime signature is callback-style —
// enterSpan(name, (span) => …), span auto-ends when the callback settles,
// attributes via span.setAttribute. Automatic DO/R2/fetch spans come from
// the observability traces config; these spans delimit the ZeroDB/ZeroDriver
// fetch and the server-side HTML sanitization so each millisecond is
// attributable.
const withSpan = <T>(name: string, fn: (span?: ZeroTracingSpan) => T): T => {
  if (!tracing?.enterSpan) return fn(undefined);
  return tracing.enterSpan(name, fn as (span: ZeroTracingSpan) => T);
};

const renderedEmailSchema = z.object({
  html: z.string(),
  hasBlockedImages: z.boolean(),
});

type RenderedEmail = { html: string; hasBlockedImages: boolean };

// Devlab/perf — la sanitisation était le seul poste CPU significatif du Worker
// sur `openThread` : `sanitizeHtml` + deux `cheerio.load` + `CssSanitizer` par
// message, jusqu'à 8 messages, refaits à chaque ouverture (le client force
// `refetchOnMount: 'always'`). Le corps d'un message non-brouillon est
// immuable, et `processEmailHtml` est pur en (html, theme, shouldLoadImages) :
// le résultat se cache donc sans risque de péremption, la clé portant les trois
// paramètres. Cache d'isolate, borné — un isolate froid le reconstruit.
const renderedCache = new TtlCache<RenderedEmail>(10 * 60_000, 600);

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
    const result = await withSpan('openThread.getThread', async (span) => {
      const r = await getThread(ctx.activeConnection.id, input.id);
      span?.setAttribute('thread.id', input.id);
      span?.setAttribute('connection.id', ctx.activeConnection.id);
      span?.setAttribute('message.count', r.result.messages.length);
      return r;
    });
    const thread = result.result;
    const candidates = thread.messages
      .flatMap((message) =>
        !message.isDraft && message.decodedBody
          ? [{ id: message.id, html: message.decodedBody }]
          : [],
      )
      .slice(-MAX_PREPROCESSED_MESSAGES);

    const rendered = withSpan('openThread.sanitize', (span) => {
      span?.setAttribute('message.count', candidates.length);
      span?.setAttribute('shouldLoadImages', input.shouldLoadImages);
      span?.setAttribute('theme', input.theme);
      let cacheHits = 0;
      const out = Object.fromEntries(
        candidates.flatMap(({ id, html }) => {
          const cacheKey = `${id}|${input.theme}|${input.shouldLoadImages ? '1' : '0'}`;
          const cached = renderedCache.get(cacheKey);
          if (cached) {
            cacheHits++;
            return [[id, cached] as const];
          }
          try {
            const processed = processEmailHtml({
              html,
              shouldLoadImages: input.shouldLoadImages,
              theme: input.theme,
            });
            const value: RenderedEmail = {
              html: processed.processedHtml,
              hasBlockedImages: processed.hasBlockedImages,
            };
            renderedCache.set(cacheKey, value);
            return [[id, value] as const];
          } catch (error) {
            logger.warn('[openThread] Failed to preprocess message', { id, error });
            return [];
          }
        }),
      );
      span?.setAttribute('rendered.count', Object.keys(out).length);
      span?.setAttribute('rendered.cacheHits', cacheHits);
      return out;
    });

    return { thread, rendered };
  });
