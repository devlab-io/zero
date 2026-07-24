import { activeDriverProcedure } from '../../trpc';
import { z } from 'zod';

export const webSearch = activeDriverProcedure
  .input(z.object({ query: z.string() }))
  .mutation(async ({ input }) => {
    const [{ generateText }, { perplexity }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/perplexity'),
    ]);
    const result = await generateText({
      model: perplexity('sonar'),
      system:
        'You are a helpful assistant that can search the web for information. NEVER include sources or sources references in your response. NEVER use markdown formatting in your response.',
      messages: [{ role: 'user', content: input.query }],
      maxTokens: 1024,
    });
    return result;
  });
