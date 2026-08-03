import { env } from 'cloudflare:workers';
import { logger } from './logger';

const DELETE_BATCH_SIZE = 50;

export interface BulkDeleteResult {
  successful: number;
  failed: number;
}

/**
 * Delete keys from the bound Cloudflare KV namespace.
 *
 * KV bindings do not expose the REST bulk-delete endpoint, so keep concurrency
 * bounded while avoiding a second set of Cloudflare credentials in the Worker.
 * @param keys Array of keys to delete
 * @returns Promise with deletion results
 */
export const bulkDeleteKeys = async (keys: string[]): Promise<BulkDeleteResult> => {
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) {
    return { successful: 0, failed: 0 };
  }

  let successful = 0;
  let failed = 0;

  for (let offset = 0; offset < uniqueKeys.length; offset += DELETE_BATCH_SIZE) {
    const batch = uniqueKeys.slice(offset, offset + DELETE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((key) => env.gmail_processing_threads.delete(key)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') successful += 1;
      else failed += 1;
    }
  }

  if (failed > 0) {
    logger.warn('[BULK_DELETE] Some KV deletions failed', {
      attempted: uniqueKeys.length,
      successful,
      failed,
    });
  }

  return { successful, failed };
};
