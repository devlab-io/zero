import { connection as connectionSchema } from '../../db/schema';
import { connectionToDriver } from '../../lib/server-utils';
import { DurableObject } from 'cloudflare:workers';
import type { ParsedMessage } from '../../types';
import type { ZeroEnv } from '../../env';

export class ThreadSyncWorker extends DurableObject<ZeroEnv> {
  constructor(state: DurableObjectState, env: ZeroEnv) {
    super(state, env);
  }

  private getThreadKey(connectionId: string, threadId: string) {
    return `${connectionId}/${threadId}.json`;
  }

  public async syncThread(
    connection: typeof connectionSchema.$inferSelect,
    threadId: string,
  ): Promise<ParsedMessage | undefined> {
    const driver = connectionToDriver(connection);
    if (!driver) throw new Error('No driver available');

    // #44 (cold-start / hot-path): the flat 60 s retry wrapper (lib/gmail-rate-limit.ts) is
    // removed as redundant. On the Gmail path driver.get() now goes through the transport
    // backoff (expo + jitter, 429/403-rate/5xx — google-transport.ts, #31); on non-Gmail
    // paths the old wrapper was a no-op anyway (its rate-limit classifier only matched Gmail
    // error shapes, so recurWhile stopped immediately). Behaviour of the retry semantics is
    // preserved; only the obsolete 60 s ceiling is gone.
    const thread = await driver.get(threadId);

    await this.env.THREADS_BUCKET.put(
      this.getThreadKey(connection.id, threadId),
      JSON.stringify(thread),
      {
        customMetadata: {
          threadId,
        },
      },
    );

    return thread.latest;
  }
}
