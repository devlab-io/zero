import { draftOutbox, sendJob } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from './logger';
import type { DB } from '../db';

export type MailboxActivity = {
  queue: number;
  processedToday: number;
  processedWeek: number;
};

type ActivityWindow = {
  connectionId: string;
  todayStart: Date;
  weekStart: Date;
};

const numeric = (value: unknown) => Number(value ?? 0);

export const EMPTY_MAILBOX_ACTIVITY: MailboxActivity = {
  queue: 0,
  processedToday: 0,
  processedWeek: 0,
};

/**
 * Activity is a SECONDARY signal (prod fix 2026-08-01): a failure on the
 * send_job/draft_outbox aggregates must NEVER take the overview — or Ask
 * Reta, whose deps.overview() shares this path — down while the folder
 * counts are exact and available. Degrades to zeroed activity with ONE
 * fixed-classification log line: no error text (SQL/connection URLs could
 * leak), no mail content, no keys, no PII.
 */
export async function getMailboxActivityOrZero(
  db: DB,
  input: ActivityWindow,
): Promise<MailboxActivity> {
  try {
    return await getMailboxActivity(db, input);
  } catch {
    logger.error('[mailbox-overview] activity aggregate failed; degraded to zeroed activity');
    return { ...EMPTY_MAILBOX_ACTIVITY };
  }
}

/**
 * Productive activity is deliberately evidence-based: a message counts once
 * its durable send record reaches `sent`. The two outboxes are disjoint today
 * (human composer vs. agent draft outbox), so they can be added safely.
 */
export async function getMailboxActivity(db: DB, input: ActivityWindow): Promise<MailboxActivity> {
  const [sendMetrics, draftMetrics] = await Promise.all([
    db
      .select({
        queue:
          sql<number>`count(*) filter (where ${sendJob.status} <> 'sent' and ${sendJob.status} <> 'cancelled')`.mapWith(
            Number,
          ),
        today:
          sql<number>`count(*) filter (where ${sendJob.status} = 'sent' and ${sendJob.updatedAt} >= ${input.todayStart})`.mapWith(
            Number,
          ),
        week: sql<number>`count(*) filter (where ${sendJob.status} = 'sent' and ${sendJob.updatedAt} >= ${input.weekStart})`.mapWith(
          Number,
        ),
      })
      .from(sendJob)
      .where(eq(sendJob.connectionId, input.connectionId)),
    db
      .select({
        queue:
          sql<number>`count(*) filter (where ${draftOutbox.status} <> 'sent' and ${draftOutbox.status} <> 'cancelled')`.mapWith(
            Number,
          ),
        today:
          sql<number>`count(*) filter (where ${draftOutbox.status} = 'sent' and ${draftOutbox.updatedAt} >= ${input.todayStart})`.mapWith(
            Number,
          ),
        week: sql<number>`count(*) filter (where ${draftOutbox.status} = 'sent' and ${draftOutbox.updatedAt} >= ${input.weekStart})`.mapWith(
          Number,
        ),
      })
      .from(draftOutbox)
      .where(eq(draftOutbox.connectionId, input.connectionId)),
  ]);

  const send = sendMetrics[0];
  const draft = draftMetrics[0];

  return {
    queue: numeric(send?.queue) + numeric(draft?.queue),
    processedToday: numeric(send?.today) + numeric(draft?.today),
    processedWeek: numeric(send?.week) + numeric(draft?.week),
  };
}

export function buildMailboxOverview(
  folders: { inbox: number; drafts: number; sent: number },
  activity: MailboxActivity,
) {
  return {
    folders: { ...folders, queue: activity.queue },
    activity: {
      processedToday: activity.processedToday,
      processedWeek: activity.processedWeek,
      // Conservative, explicit product estimate: two minutes per completed send.
      estimatedMinutesSaved: activity.processedWeek * 2,
    },
  };
}
