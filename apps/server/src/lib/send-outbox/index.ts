import {
  CANCELLABLE_SEND_JOB_STATUSES,
  CLAIMABLE_SEND_JOB_STATUSES,
  SENDING_LEASE_MS,
  type SendJobStatus,
} from './state-machine';
import { and, desc, eq, inArray, isNull, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import { connection, sendJob } from '../../db/schema';
import type { DB } from '../../db';

export * from './state-machine';

export type SendJobRow = typeof sendJob.$inferSelect;

export type CreateSendJobInput = {
  connectionId: string;
  clientSubmissionKey: string;
  payload: unknown;
  threadId?: string | null;
  scheduledSendAt?: Date | null;
};

/**
 * Insère le job d'envoi ; la contrainte unique (connection_id,
 * client_submission_key) absorbe les doubles clics et retries réseau : le
 * second appel récupère la ligne existante (`deduped: true`) sans ré-enqueue.
 */
export const createSendJob = async (
  db: DB,
  input: CreateSendJobInput,
): Promise<{ job: SendJobRow; deduped: boolean }> => {
  const now = new Date();
  const [inserted] = await db
    .insert(sendJob)
    .values({
      id: crypto.randomUUID(),
      connectionId: input.connectionId,
      clientSubmissionKey: input.clientSubmissionKey,
      status: 'queued',
      payload: input.payload,
      threadId: input.threadId ?? null,
      scheduledSendAt: input.scheduledSendAt ?? null,
      enqueuedAt: null,
      attempts: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [sendJob.connectionId, sendJob.clientSubmissionKey] })
    .returning();

  if (inserted) return { job: inserted, deduped: false };

  const [existing] = await db
    .select()
    .from(sendJob)
    .where(
      and(
        eq(sendJob.connectionId, input.connectionId),
        eq(sendJob.clientSubmissionKey, input.clientSubmissionKey),
      ),
    )
    .limit(1);

  if (!existing) throw new Error('Failed to create send job');
  return { job: existing, deduped: true };
};

/**
 * Marque le job comme remis à Cloudflare Queue. Purement informatif pour le
 * sweep cron (distingue « en vol avec délai » de « jamais enqueued ») ; un
 * échec ici est bénin, le sweep ré-enqueue et le claim CAS déduplique.
 */
export const markSendJobEnqueued = async (db: DB, id: string) => {
  await db.update(sendJob).set({ enqueuedAt: new Date() }).where(eq(sendJob.id, id));
};

/**
 * Rollback d'un enqueue refusé par la Queue : la ligne n'a jamais été visible
 * d'un consumer, la supprimer rend la clé de soumission réutilisable pour le
 * retry client (sinon la dédup renverrait un job mort).
 */
export const deleteUnqueuedSendJob = async (db: DB, id: string) => {
  await db.delete(sendJob).where(and(eq(sendJob.id, id), eq(sendJob.status, 'queued')));
};

/**
 * Claim CAS du consumer : queued/failed → sending, ou re-claim d'un `sending`
 * au bail expiré. Retourne la ligne réclamée, ou null si un autre worker la
 * détient / si elle est terminale — c'est LE verrou anti-double-envoi.
 */
export const claimSendJob = async (
  db: DB,
  input: { id: string; now?: Date; leaseMs?: number },
): Promise<SendJobRow | null> => {
  const now = input.now ?? new Date();
  const leaseCutoff = new Date(now.getTime() - (input.leaseMs ?? SENDING_LEASE_MS));
  const [claimed] = await db
    .update(sendJob)
    .set({ status: 'sending', attempts: sql`${sendJob.attempts} + 1`, error: null, updatedAt: now })
    .where(
      and(
        eq(sendJob.id, input.id),
        or(
          inArray(sendJob.status, [...CLAIMABLE_SEND_JOB_STATUSES]),
          and(eq(sendJob.status, 'sending'), lt(sendJob.updatedAt, leaseCutoff)),
        ),
      ),
    )
    .returning();

  return claimed ?? null;
};

/** Succès fournisseur : sending → sent ; payload nullifié (rétention minimale). */
export const markSendJobSent = async (db: DB, id: string): Promise<SendJobRow | null> => {
  const [updated] = await db
    .update(sendJob)
    .set({ status: 'sent', payload: null, error: null, updatedAt: new Date() })
    .where(and(eq(sendJob.id, id), eq(sendJob.status, 'sending')))
    .returning();
  return updated ?? null;
};

/** Échec fournisseur : sending → failed ; payload CONSERVÉ pour le retry. */
export const markSendJobFailed = async (
  db: DB,
  id: string,
  error: string,
): Promise<SendJobRow | null> => {
  const [updated] = await db
    .update(sendJob)
    .set({ status: 'failed', error: error.slice(0, 2000), updatedAt: new Date() })
    .where(and(eq(sendJob.id, id), eq(sendJob.status, 'sending')))
    .returning();
  return updated ?? null;
};

/** Annulation (undo / cancel) : uniquement depuis queued/failed, scoping connexion. */
export const cancelSendJob = async (
  db: DB,
  input: { id: string; connectionId: string },
): Promise<SendJobRow | null> => {
  const [updated] = await db
    .update(sendJob)
    .set({ status: 'cancelled', payload: null, scheduledSendAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(sendJob.id, input.id),
        eq(sendJob.connectionId, input.connectionId),
        inArray(sendJob.status, [...CANCELLABLE_SEND_JOB_STATUSES]),
      ),
    )
    .returning();
  return updated ?? null;
};

/** Retry manuel : failed → queued (le payload conservé repart tel quel). */
export const retrySendJob = async (
  db: DB,
  input: { id: string; connectionId: string },
): Promise<SendJobRow | null> => {
  const [updated] = await db
    .update(sendJob)
    .set({ status: 'queued', error: null, enqueuedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(sendJob.id, input.id),
        eq(sendJob.connectionId, input.connectionId),
        eq(sendJob.status, 'failed'),
      ),
    )
    .returning();
  return updated ?? null;
};

export const getSendJob = async (db: DB, id: string): Promise<SendJobRow | null> => {
  const [row] = await db.select().from(sendJob).where(eq(sendJob.id, id)).limit(1);
  return row ?? null;
};

export const getSendJobForConnection = async (
  db: DB,
  input: { id: string; connectionId: string },
): Promise<SendJobRow | null> => {
  const [row] = await db
    .select()
    .from(sendJob)
    .where(and(eq(sendJob.id, input.id), eq(sendJob.connectionId, input.connectionId)))
    .limit(1);
  return row ?? null;
};

export const listSendJobsForUser = async (
  db: DB,
  input: { userId: string; statuses?: SendJobStatus[]; limit?: number },
): Promise<SendJobRow[]> => {
  const conditions = [eq(connection.userId, input.userId)];
  if (input.statuses?.length) conditions.push(inArray(sendJob.status, input.statuses));

  const rows = await db
    .select({ item: sendJob })
    .from(sendJob)
    .innerJoin(connection, eq(sendJob.connectionId, connection.id))
    .where(and(...conditions))
    .orderBy(desc(sendJob.createdAt))
    .limit(input.limit ?? 50);

  return rows.map(({ item }) => item);
};

/** Grâce avant de considérer un job enqueued comme perdu par la Queue. */
export const SWEEP_GRACE_MS = 5 * 60_000;
/** Au-delà : un `sending` sans issue est présumé orphelin (worker mort). */
export const SWEEP_STALE_SENDING_MS = 15 * 60_000;

/**
 * Filet de réconciliation (cron) — l'insertion DB et le send Queue ne sont pas
 * transactionnels entre eux, ce sweep comble les trois trous possibles :
 *   1. jamais enqueued (crash entre commit et Queue, ou planifié > 12 h) et dû
 *      dans l'horizon Queue → enqueue avec le délai restant ;
 *   2. enqueued mais échéance dépassée depuis > grâce (message Queue perdu ou
 *      épuisé) → ré-enqueue immédiat ;
 *   3. `sending` figé au-delà du bail long (worker mort après claim) →
 *      ré-enqueue ; le claim CAS re-réclamera via le bail expiré.
 * Ne touche que enqueued_at (jamais updated_at : c'est le bail du claim).
 * Les relivraisons excédentaires sont neutralisées par le claim CAS.
 */
export const sweepDueSendJobs = async (
  db: DB,
  input: { now?: Date; horizonMs: number },
): Promise<Array<Pick<SendJobRow, 'id' | 'connectionId' | 'scheduledSendAt'>>> => {
  const now = input.now ?? new Date();
  const horizon = new Date(now.getTime() + input.horizonMs);
  const graceCutoff = new Date(now.getTime() - SWEEP_GRACE_MS);
  const staleSendingCutoff = new Date(now.getTime() - SWEEP_STALE_SENDING_MS);
  const dueAt = sql`coalesce(${sendJob.scheduledSendAt}, ${sendJob.createdAt})`;

  return db
    .update(sendJob)
    .set({ enqueuedAt: now })
    .where(
      or(
        and(
          eq(sendJob.status, 'queued'),
          isNull(sendJob.enqueuedAt),
          or(isNull(sendJob.scheduledSendAt), lte(sendJob.scheduledSendAt, horizon)),
        ),
        and(
          eq(sendJob.status, 'queued'),
          isNotNull(sendJob.enqueuedAt),
          lt(sendJob.enqueuedAt, graceCutoff),
          lt(dueAt, graceCutoff),
        ),
        and(eq(sendJob.status, 'sending'), lt(sendJob.updatedAt, staleSendingCutoff)),
      ),
    )
    .returning({
      id: sendJob.id,
      connectionId: sendJob.connectionId,
      scheduledSendAt: sendJob.scheduledSendAt,
    });
};
