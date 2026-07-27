// services/web-search-tool.ts — outil de recherche web pour l'agent (pitbull A8, axe 1).
//
// Cet outil vivait dans routes/agent/tools.ts, que services/compose-service.ts réimportait
// dynamiquement pour lui seul — pendant que tools.ts importe statiquement `composeEmail`
// depuis ce même service. Résultat : un cycle de valeur services ↔ routes/agent, soit une
// couche de transport dont dépend le métier, exactement ce que l'extraction de composeEmail
// prétendait avoir supprimé. L'outil est une feuille : il ne dépend que du SDK IA.
//
// `tools.ts` le réexporte, donc ses consommateurs existants sont inchangés.

import { perplexity } from '@ai-sdk/perplexity';
import { generateText, tool } from 'ai';
import { logger } from '../lib/logger';
import { z } from 'zod';

export const webSearch = () =>
  tool({
    description: 'Search the web for information using Perplexity AI',
    parameters: z.object({
      query: z.string().describe('The query to search the web for'),
    }),
    execute: async ({ query }) => {
      try {
        const response = await generateText({
          model: perplexity('sonar'),
          messages: [
            { role: 'system', content: 'Be precise and concise.' },
            { role: 'system', content: 'Do not include sources in your response.' },
            { role: 'system', content: 'Do not use markdown formatting in your response.' },
            { role: 'user', content: query },
          ],
          maxTokens: 1024,
        });

        return response.text;
      } catch (error) {
        logger.error('Error searching the web:', error);
        throw new Error('Failed to search the web');
      }
    },
  });
