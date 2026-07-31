import { clearSendJobEnqueueMark, sweepDueSendJobs } from './index';
import type { IEmailSendBatch } from '../../types';
import { logger } from '../logger';
import type { DB } from '../../db';

export type SendJobSweepQueue = {
  send: (body: IEmailSendBatch, opts?: { delaySeconds?: number }) => Promise<unknown>;
};

export type SendJobSweepDeps = {
  horizonMs: number;
  now?: Date;
  /** Couture de test : opérations DB substituables par des fakes en mémoire. */
  ops?: {
    sweepDueSendJobs: typeof sweepDueSendJobs;
    clearSendJobEnqueueMark: typeof clearSendJobEnqueueMark;
  };
};

/**
 * Passe cron du filet de réconciliation : marque les jobs dus (sweepDueSendJobs
 * pose enqueuedAt) puis publie chacun dans la Queue. Si la publication échoue,
 * le marqueur est ré-armé par CAS (enqueuedAt = celui posé par CE sweep) afin
 * que le prochain cron retente — sans jamais écraser une transition plus
 * récente survenue entre-temps.
 */
export const runSendJobSweep = async (
  db: DB,
  queue: SendJobSweepQueue,
  input: SendJobSweepDeps,
): Promise<{ enqueued: number; failed: number }> => {
  const now = input.now ?? new Date();
  const ops = input.ops ?? { sweepDueSendJobs, clearSendJobEnqueueMark };

  const due = await ops.sweepDueSendJobs(db, { now, horizonMs: input.horizonMs });

  let enqueued = 0;
  let failed = 0;
  for (const job of due) {
    const delaySeconds = Math.max(
      0,
      Math.floor(((job.scheduledSendAt?.getTime() ?? now.getTime()) - now.getTime()) / 1000),
    );
    try {
      await queue.send(
        { messageId: job.id, jobId: job.id, connectionId: job.connectionId },
        { delaySeconds },
      );
      enqueued += 1;
      logger.info(`[SCHEDULED] Re-enqueued send job ${job.id} (delay ${delaySeconds}s)`);
    } catch (error) {
      failed += 1;
      logger.error(`[SCHEDULED] Failed to re-enqueue send job ${job.id}`, error);
      await ops
        .clearSendJobEnqueueMark(db, { id: job.id, enqueuedAt: now })
        .catch((clearError) =>
          logger.error(`[SCHEDULED] Failed to re-arm send job ${job.id}`, clearError),
        );
    }
  }

  return { enqueued, failed };
};
