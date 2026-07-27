import {
  approveDraftOutboxItem,
  beginGeneratingDraftOutboxItem,
  beginSendingDraftOutboxItem,
  cancelDraftOutboxItem,
  failDraftOutboxItem,
  markDraftOutboxItemReady,
  markDraftOutboxItemSent,
  retryDraftOutboxItem,
  settleSendingDraftOutboxItem,
  type DraftOutboxItem,
  type DraftOutboxStatus,
} from './state-machine';
import { connection, draftOutbox } from '../../db/schema';
import { and, asc, desc, eq, lte } from 'drizzle-orm';
import type { DB } from '../../db';

export type { DraftOutboxItem, DraftOutboxStatus };
export {
  DraftOutboxTransitionError,
  approveDraftOutboxItem,
  beginGeneratingDraftOutboxItem,
  beginSendingDraftOutboxItem,
  cancelDraftOutboxItem,
  draftOutboxStatuses,
  failDraftOutboxItem,
  markDraftOutboxItemReady,
  classifyDraftOutboxSendFailure,
  decideDraftOutboxSendSettlement,
  markDraftOutboxItemSent,
  retryDraftOutboxItem,
  settleSendingDraftOutboxItem,
} from './state-machine';

export type EnqueueDraftJobInput = {
  connectionId: string;
  threadId?: string | null;
  mission?: string | null;
  subject?: string | null;
  body?: string | null;
};

type DraftOutboxRow = typeof draftOutbox.$inferSelect;

const textEncoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const normalizeNullable = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const defaultSubject = (input: EnqueueDraftJobInput) =>
  normalizeNullable(input.subject) ?? normalizeNullable(input.mission)?.slice(0, 120) ?? 'Draft';

const defaultBody = (input: EnqueueDraftJobInput) =>
  input.body ?? normalizeNullable(input.mission) ?? '';

export const createDraftOutboxIdempotencyKey = async (input: EnqueueDraftJobInput) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(
      JSON.stringify({
        connectionId: input.connectionId,
        threadId: normalizeNullable(input.threadId),
        mission: normalizeNullable(input.mission),
        subject: normalizeNullable(input.subject),
        body: input.body ?? null,
      }),
    ),
  );

  return `draft_outbox:${toHex(digest)}`;
};

export const toDraftOutboxItem = (row: DraftOutboxRow): DraftOutboxItem => ({
  id: row.id,
  connectionId: row.connectionId,
  threadId: row.threadId,
  mission: row.mission,
  status: row.status,
  gmailDraftId: row.gmailDraftId,
  subject: row.subject,
  body: row.body,
  idempotencyKey: row.idempotencyKey,
  scheduledSendAt: row.scheduledSendAt,
  error: row.error,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toDraftOutboxUpdate = (item: DraftOutboxItem): Partial<typeof draftOutbox.$inferInsert> => ({
  status: item.status,
  gmailDraftId: item.gmailDraftId ?? null,
  subject: item.subject,
  body: item.body,
  scheduledSendAt: item.scheduledSendAt ?? null,
  error: item.error ?? null,
  updatedAt: item.updatedAt,
});

export const assertDraftOutboxConnectionOwner = async (
  db: DB,
  input: { userId: string; connectionId: string },
) => {
  const [ownedConnection] = await db
    .select({ id: connection.id })
    .from(connection)
    .where(and(eq(connection.id, input.connectionId), eq(connection.userId, input.userId)))
    .limit(1);

  return !!ownedConnection;
};

export const enqueueDraftJob = async (
  db: DB,
  input: EnqueueDraftJobInput,
): Promise<{ id: string }> => {
  const idempotencyKey = await createDraftOutboxIdempotencyKey(input);
  const now = new Date();
  const [inserted] = await db
    .insert(draftOutbox)
    .values({
      id: crypto.randomUUID(),
      connectionId: input.connectionId,
      threadId: normalizeNullable(input.threadId),
      mission: normalizeNullable(input.mission),
      status: 'queued',
      gmailDraftId: null,
      subject: defaultSubject(input),
      body: defaultBody(input),
      idempotencyKey,
      scheduledSendAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: draftOutbox.idempotencyKey })
    .returning({ id: draftOutbox.id });

  if (inserted) return inserted;

  const [existing] = await db
    .select({ id: draftOutbox.id })
    .from(draftOutbox)
    .where(eq(draftOutbox.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!existing) {
    throw new Error('Failed to enqueue draft outbox job');
  }

  return existing;
};

export const listDraftOutboxItems = async (
  db: DB,
  input: { userId: string; status?: DraftOutboxStatus },
) => {
  const conditions = [eq(connection.userId, input.userId)];
  if (input.status) conditions.push(eq(draftOutbox.status, input.status));

  const rows = await db
    .select({ item: draftOutbox })
    .from(draftOutbox)
    .innerJoin(connection, eq(draftOutbox.connectionId, connection.id))
    .where(and(...conditions))
    .orderBy(desc(draftOutbox.createdAt));

  return rows.map(({ item }) => toDraftOutboxItem(item));
};

export const getDraftOutboxItem = async (
  db: DB,
  input: { id: string; userId?: string; connectionId?: string },
) => {
  const conditions = [eq(draftOutbox.id, input.id)];
  if (input.userId) conditions.push(eq(connection.userId, input.userId));
  if (input.connectionId) conditions.push(eq(draftOutbox.connectionId, input.connectionId));

  const [row] = await db
    .select({ item: draftOutbox })
    .from(draftOutbox)
    .innerJoin(connection, eq(draftOutbox.connectionId, connection.id))
    .where(and(...conditions))
    .limit(1);

  return row ? toDraftOutboxItem(row.item) : null;
};

export const persistDraftOutboxItemTransition = async (
  db: DB,
  current: DraftOutboxItem,
  next: DraftOutboxItem,
) => {
  const [updated] = await db
    .update(draftOutbox)
    .set(toDraftOutboxUpdate(next))
    .where(and(eq(draftOutbox.id, current.id), eq(draftOutbox.status, current.status)))
    .returning();

  if (!updated) {
    throw new Error(`Draft outbox item ${current.id} changed state; retry the transition`);
  }

  return toDraftOutboxItem(updated);
};

export const approveDraftOutboxJob = async (db: DB, current: DraftOutboxItem) =>
  persistDraftOutboxItemTransition(db, current, approveDraftOutboxItem(current));

export const cancelDraftOutboxJob = async (db: DB, current: DraftOutboxItem) =>
  persistDraftOutboxItemTransition(db, current, cancelDraftOutboxItem(current));

export const retryDraftOutboxJob = async (db: DB, current: DraftOutboxItem) =>
  persistDraftOutboxItemTransition(db, current, retryDraftOutboxItem(current));

export const beginGeneratingDraftOutboxJob = async (db: DB, current: DraftOutboxItem) =>
  persistDraftOutboxItemTransition(db, current, beginGeneratingDraftOutboxItem(current));

export const markDraftOutboxJobReady = async (
  db: DB,
  current: DraftOutboxItem,
  draft: { gmailDraftId: string; subject?: string; body?: string },
) => persistDraftOutboxItemTransition(db, current, markDraftOutboxItemReady(current, draft));

export const beginSendingDraftOutboxJob = async (db: DB, current: DraftOutboxItem) =>
  persistDraftOutboxItemTransition(db, current, beginSendingDraftOutboxItem(current));

export const markDraftOutboxJobSent = async (db: DB, current: DraftOutboxItem) =>
  persistDraftOutboxItemTransition(db, current, markDraftOutboxItemSent(current));

export const failDraftOutboxJob = async (db: DB, current: DraftOutboxItem, error: string) =>
  persistDraftOutboxItemTransition(db, current, failDraftOutboxItem(current, error));

/**
 * Règle un item resté en `sending` selon le classement de l'échec : `failed` (rejouable)
 * si la non-acceptation est prouvée, `unresolved` (terminal) si l'issue est inconnue.
 */
export const settleSendingDraftOutboxJob = async (
  db: DB,
  current: DraftOutboxItem,
  outcome: Parameters<typeof settleSendingDraftOutboxItem>[1],
) => persistDraftOutboxItemTransition(db, current, settleSendingDraftOutboxItem(current, outcome));

export const findNextQueuedDraftOutboxItem = async (db: DB, connectionId: string) => {
  const [row] = await db
    .select()
    .from(draftOutbox)
    .where(and(eq(draftOutbox.connectionId, connectionId), eq(draftOutbox.status, 'queued')))
    .orderBy(asc(draftOutbox.createdAt))
    .limit(1);

  return row ? toDraftOutboxItem(row) : null;
};

export const findNextDueApprovedDraftOutboxItem = async (
  db: DB,
  connectionId: string,
  now: Date,
) => {
  const [row] = await db
    .select()
    .from(draftOutbox)
    .where(
      and(
        eq(draftOutbox.connectionId, connectionId),
        eq(draftOutbox.status, 'approved'),
        lte(draftOutbox.scheduledSendAt, now),
      ),
    )
    .orderBy(asc(draftOutbox.scheduledSendAt))
    .limit(1);

  return row ? toDraftOutboxItem(row) : null;
};

export const findNextApprovedDraftOutboxSendAt = async (db: DB, connectionId: string) => {
  const [row] = await db
    .select({ scheduledSendAt: draftOutbox.scheduledSendAt })
    .from(draftOutbox)
    .where(and(eq(draftOutbox.connectionId, connectionId), eq(draftOutbox.status, 'approved')))
    .orderBy(asc(draftOutbox.scheduledSendAt))
    .limit(1);

  return row?.scheduledSendAt ?? null;
};
