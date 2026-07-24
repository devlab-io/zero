import { env } from 'cloudflare:workers';
import { logger } from './logger';

// KV namespace IDs for different environments
const KV_NAMESPACE_IDS = {
  local: 'b7db3a98a80f4e16a8b6edc5fa8c7b76',
  staging: 'b7db3a98a80f4e16a8b6edc5fa8c7b76',
  production: '3348ff0976284269a8d8a5e6e4c04c56',
} as const;

export type Environment = 'local' | 'staging' | 'production';

export interface BulkDeleteResult {
  successful: number;
  failed: number;
}

/**
 * Bulk delete keys from Cloudflare KV namespace
 * @param keys Array of keys to delete
 * @param environment Environment to use (defaults to 'local')
 * @returns Promise with deletion results
 */
export const bulkDeleteKeys = async (
  keys: string[],
  environment: Environment = env.NODE_ENV as Environment,
): Promise<BulkDeleteResult> => {
  if (environment === 'local') {
    await Promise.all(keys.map((key) => env.gmail_processing_threads.delete(key)));
    return { successful: keys.length, failed: 0 };
  }
  if (keys.length === 0) {
    return { successful: 0, failed: 0 };
  }

  const namespaceId = KV_NAMESPACE_IDS[environment];
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!accountId) {
    logger.error('[BULK_DELETE] CLOUDFLARE_ACCOUNT_ID environment variable not set');
    return { successful: 0, failed: keys.length };
  }

  try {
    // Devlab/perf — le SDK `cloudflare` était importé dynamiquement, ce qui
    // évitait son évaluation au démarrage mais PAS son parse : wrangler (y
    // compris en 4.114, vérifié) inline les `await import()` dans un unique
    // `main.js`, sans code splitting. Ces 1,75 Mio étaient donc parsés à chaque
    // démarrage d'isolate pour un seul appel, ici. L'endpoint REST correspondant
    // attend un tableau de clés en corps ; le SDK ne faisait rien de plus.
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/bulk/delete`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN || ''}`,
        },
        body: JSON.stringify(keys),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      result?: { successful_key_count?: number };
      errors?: { message?: string }[];
    } | null;

    if (!response.ok || payload?.success === false) {
      logger.error('[BULK_DELETE] KV bulk delete rejected', {
        status: response.status,
        errors: payload?.errors?.map((e) => e.message).join('; '),
      });
      return { successful: 0, failed: keys.length };
    }

    const successful = payload?.result?.successful_key_count ?? 0;
    const failed = keys.length - successful;

    logger.info(`[BULK_DELETE] Successfully deleted ${successful}/${keys.length} keys`);
    if (failed > 0) {
      logger.warn(`[BULK_DELETE] Failed to delete ${failed} keys`);
    }

    return { successful, failed };
  } catch (error) {
    logger.error('[BULK_DELETE] Failed to bulk delete keys:', error);
    return { successful: 0, failed: keys.length };
  }
};
