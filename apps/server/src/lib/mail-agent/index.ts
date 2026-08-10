import {
  connection,
  draftOutbox,
  mailAgentDevice,
  mailDraftRevisionJob,
  mailTriageRun,
} from '../../db/schema';
import { and, asc, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type { DB } from '../../db';

const encoder = new TextEncoder();
const ENROLLMENT_PREFIX = 'reta_enroll';
const DEVICE_PREFIX = 'reta_device';

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const randomSecret = (size = 24) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
};

export const hashMailAgentSecret = async (value: string) =>
  toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

const parseCredential = (value: string, prefix: string) => {
  const parts = value.trim().split('_');
  if (parts.length !== 4 || `${parts[0]}_${parts[1]}` !== prefix) return null;
  const [, , deviceId, secret] = parts;
  if (!deviceId || !secret) return null;
  return { deviceId, secret };
};

const credential = (prefix: string, deviceId: string, secret: string) =>
  `${prefix}_${deviceId}_${secret}`;

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
};

export async function createMailAgentEnrollment(
  db: DB,
  input: { userId: string; name: string; ttlMs?: number },
) {
  const id = crypto.randomUUID();
  const secret = randomSecret();
  const code = credential(ENROLLMENT_PREFIX, id, secret);
  const now = new Date();
  const enrollmentExpiresAt = new Date(now.getTime() + (input.ttlMs ?? 10 * 60_000));
  await db.insert(mailAgentDevice).values({
    id,
    userId: input.userId,
    name: input.name.trim() || 'Mac de Thomas',
    enrollmentCodeHash: await hashMailAgentSecret(code),
    enrollmentExpiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return { id, code, enrollmentExpiresAt };
}

export async function exchangeMailAgentEnrollment(db: DB, input: { code: string; name?: string }) {
  const parsed = parseCredential(input.code, ENROLLMENT_PREFIX);
  if (!parsed) return null;
  const [device] = await db
    .select()
    .from(mailAgentDevice)
    .where(eq(mailAgentDevice.id, parsed.deviceId))
    .limit(1);
  if (
    !device ||
    device.revokedAt ||
    device.tokenHash ||
    !device.enrollmentCodeHash ||
    !device.enrollmentExpiresAt ||
    device.enrollmentExpiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  const suppliedHash = await hashMailAgentSecret(input.code);
  if (!constantTimeEqual(device.enrollmentCodeHash, suppliedHash)) return null;

  const token = credential(DEVICE_PREFIX, device.id, randomSecret());
  const now = new Date();
  const [updated] = await db
    .update(mailAgentDevice)
    .set({
      name: input.name?.trim() || device.name,
      tokenHash: await hashMailAgentSecret(token),
      enrollmentCodeHash: null,
      enrollmentExpiresAt: null,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(mailAgentDevice.id, device.id),
        isNull(mailAgentDevice.tokenHash),
        isNull(mailAgentDevice.revokedAt),
      ),
    )
    .returning({ id: mailAgentDevice.id, userId: mailAgentDevice.userId });
  return updated ? { ...updated, token } : null;
}

export async function authenticateMailAgentDevice(db: DB, bearer: string | undefined) {
  const parsed = bearer ? parseCredential(bearer, DEVICE_PREFIX) : null;
  if (!parsed) return null;
  const [device] = await db
    .select()
    .from(mailAgentDevice)
    .where(eq(mailAgentDevice.id, parsed.deviceId))
    .limit(1);
  if (!device?.tokenHash || device.revokedAt) return null;
  const suppliedHash = await hashMailAgentSecret(bearer!);
  if (!constantTimeEqual(device.tokenHash, suppliedHash)) return null;
  const now = new Date();
  await db
    .update(mailAgentDevice)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(and(eq(mailAgentDevice.id, device.id), isNull(mailAgentDevice.revokedAt)));
  return { ...device, lastSeenAt: now };
}

export const listMailAgentDevices = async (db: DB, userId: string) => {
  const rows = await db
    .select({
      id: mailAgentDevice.id,
      name: mailAgentDevice.name,
      enrolled: mailAgentDevice.tokenHash,
      lastSeenAt: mailAgentDevice.lastSeenAt,
      revokedAt: mailAgentDevice.revokedAt,
      createdAt: mailAgentDevice.createdAt,
    })
    .from(mailAgentDevice)
    .where(eq(mailAgentDevice.userId, userId))
    .orderBy(desc(mailAgentDevice.createdAt));
  return rows.map((row) => ({ ...row, enrolled: Boolean(row.enrolled) }));
};

export const revokeMailAgentDevice = async (db: DB, input: { userId: string; id: string }) => {
  const now = new Date();
  const [revoked] = await db
    .update(mailAgentDevice)
    .set({ revokedAt: now, tokenHash: null, enrollmentCodeHash: null, updatedAt: now })
    .where(and(eq(mailAgentDevice.id, input.id), eq(mailAgentDevice.userId, input.userId)))
    .returning({ id: mailAgentDevice.id });
  return revoked ?? null;
};

export async function createMailTriageRun(
  db: DB,
  input: { userId: string; connectionId: string; lookbackDays: number; maxResults: number },
) {
  const now = new Date();
  const [run] = await db
    .insert(mailTriageRun)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      connectionId: input.connectionId,
      status: 'running',
      lookbackDays: input.lookbackDays,
      maxResults: input.maxResults,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!run) throw new Error('Failed to create triage run');
  return run;
}

export const completeMailTriageRun = async (
  db: DB,
  input: {
    id: string;
    nextPageToken?: string | null;
    scannedCount: number;
    replyNeededCount: number;
    noReplyNeededCount: number;
  },
) => {
  const now = new Date();
  const [run] = await db
    .update(mailTriageRun)
    .set({
      status: 'completed',
      nextPageToken: input.nextPageToken ?? null,
      scannedCount: input.scannedCount,
      replyNeededCount: input.replyNeededCount,
      noReplyNeededCount: input.noReplyNeededCount,
      completedAt: now,
      updatedAt: now,
      error: null,
    })
    .where(eq(mailTriageRun.id, input.id))
    .returning();
  return run ?? null;
};

export const failMailTriageRun = async (db: DB, input: { id: string; error: string }) => {
  const now = new Date();
  await db
    .update(mailTriageRun)
    .set({ status: 'failed', error: input.error, completedAt: now, updatedAt: now })
    .where(eq(mailTriageRun.id, input.id));
};

export const listMailTriageRuns = async (db: DB, userId: string) =>
  db
    .select()
    .from(mailTriageRun)
    .where(eq(mailTriageRun.userId, userId))
    .orderBy(desc(mailTriageRun.createdAt))
    .limit(10);

export async function createDraftRevisionJob(
  db: DB,
  input: {
    draftOutboxId: string;
    kind: 'compose' | 'revise';
    instruction: string;
    baseRevision: number;
    baseDigest: string;
    idempotencyKey: string;
  },
) {
  const now = new Date();
  const [inserted] = await db
    .insert(mailDraftRevisionJob)
    .values({
      id: crypto.randomUUID(),
      ...input,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: mailDraftRevisionJob.idempotencyKey })
    .returning({ id: mailDraftRevisionJob.id });
  if (inserted) return inserted;
  const [existing] = await db
    .select({ id: mailDraftRevisionJob.id })
    .from(mailDraftRevisionJob)
    .where(eq(mailDraftRevisionJob.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) throw new Error('Failed to create revision job');
  return existing;
}

export async function claimNextDraftRevisionJob(
  db: DB,
  input: { deviceId: string; userId: string; leaseMs?: number },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    const [candidate] = await db
      .select({ job: mailDraftRevisionJob })
      .from(mailDraftRevisionJob)
      .innerJoin(draftOutbox, eq(mailDraftRevisionJob.draftOutboxId, draftOutbox.id))
      .innerJoin(connection, eq(draftOutbox.connectionId, connection.id))
      .where(
        and(
          eq(connection.userId, input.userId),
          or(
            eq(mailDraftRevisionJob.status, 'queued'),
            and(
              eq(mailDraftRevisionJob.status, 'claimed'),
              lte(mailDraftRevisionJob.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(mailDraftRevisionJob.createdAt))
      .limit(1);
    if (!candidate) return null;

    const claimToken = randomSecret();
    const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? 10 * 60_000));
    const [claimed] = await db
      .update(mailDraftRevisionJob)
      .set({
        status: 'claimed',
        claimedByDeviceId: input.deviceId,
        claimTokenHash: await hashMailAgentSecret(claimToken),
        leaseExpiresAt,
        error: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(mailDraftRevisionJob.id, candidate.job.id),
          or(
            eq(mailDraftRevisionJob.status, 'queued'),
            and(
              eq(mailDraftRevisionJob.status, 'claimed'),
              lte(mailDraftRevisionJob.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .returning();
    if (claimed) {
      await db
        .update(draftOutbox)
        .set({ reviewState: 'revising', updatedAt: now })
        .where(eq(draftOutbox.id, claimed.draftOutboxId));
      return { job: claimed, claimToken };
    }
  }
  return null;
}

export async function getClaimedDraftRevision(
  db: DB,
  input: { jobId: string; deviceId: string; userId: string; claimToken: string },
) {
  const [row] = await db
    .select({ job: mailDraftRevisionJob, item: draftOutbox })
    .from(mailDraftRevisionJob)
    .innerJoin(draftOutbox, eq(mailDraftRevisionJob.draftOutboxId, draftOutbox.id))
    .innerJoin(connection, eq(draftOutbox.connectionId, connection.id))
    .where(
      and(
        eq(mailDraftRevisionJob.id, input.jobId),
        eq(mailDraftRevisionJob.status, 'claimed'),
        eq(mailDraftRevisionJob.claimedByDeviceId, input.deviceId),
        eq(connection.userId, input.userId),
      ),
    )
    .limit(1);
  if (!row?.job.claimTokenHash || !row.job.leaseExpiresAt) return null;
  if (row.job.leaseExpiresAt.getTime() <= Date.now()) return null;
  const suppliedHash = await hashMailAgentSecret(input.claimToken);
  return constantTimeEqual(row.job.claimTokenHash, suppliedHash) ? row : null;
}

export async function updateDraftOutboxSnapshot(
  db: DB,
  input: {
    id: string;
    expectedRevision: number;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    digest: string;
    gmailDraftId?: string | null;
    status?: 'queued' | 'generating' | 'draft_ready';
    reviewState?: 'pending' | 'revision_requested' | 'revising' | 'ready' | 'stale' | 'failed';
  },
) {
  const now = new Date();
  const [updated] = await db
    .update(draftOutbox)
    .set({
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      contentDigest: input.digest,
      contentRevision: input.expectedRevision + 1,
      ...(input.gmailDraftId !== undefined ? { gmailDraftId: input.gmailDraftId } : {}),
      ...(input.status ? { status: input.status } : {}),
      reviewState: input.reviewState ?? 'ready',
      error: null,
      updatedAt: now,
    })
    .where(
      and(eq(draftOutbox.id, input.id), eq(draftOutbox.contentRevision, input.expectedRevision)),
    )
    .returning();
  return updated ?? null;
}

export async function completeDraftRevisionJob(db: DB, input: { jobId: string; revision: number }) {
  const now = new Date();
  await db
    .update(mailDraftRevisionJob)
    .set({
      status: 'completed',
      resultRevision: input.revision,
      claimTokenHash: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(mailDraftRevisionJob.id, input.jobId));
}

export async function failDraftRevisionJob(
  db: DB,
  input: { jobId: string; itemId: string; error: string; stale?: boolean },
) {
  const now = new Date();
  await db
    .update(mailDraftRevisionJob)
    .set({
      status: input.stale ? 'stale' : 'failed',
      error: input.error,
      claimTokenHash: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(mailDraftRevisionJob.id, input.jobId));
  await db
    .update(draftOutbox)
    .set({
      reviewState: input.stale ? 'stale' : 'failed',
      error: input.error,
      updatedAt: now,
    })
    .where(eq(draftOutbox.id, input.itemId));
}

export async function cancelDraftRevisionJobs(db: DB, itemId: string) {
  const now = new Date();
  await db
    .update(mailDraftRevisionJob)
    .set({
      status: 'cancelled',
      claimedByDeviceId: null,
      claimTokenHash: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(mailDraftRevisionJob.draftOutboxId, itemId),
        or(eq(mailDraftRevisionJob.status, 'queued'), eq(mailDraftRevisionJob.status, 'claimed')),
      ),
    );
}

export async function retryLatestDraftRevisionJob(
  db: DB,
  input: { itemId: string; userId: string },
) {
  const [row] = await db
    .select({ job: mailDraftRevisionJob })
    .from(mailDraftRevisionJob)
    .innerJoin(draftOutbox, eq(mailDraftRevisionJob.draftOutboxId, draftOutbox.id))
    .innerJoin(connection, eq(draftOutbox.connectionId, connection.id))
    .where(
      and(
        eq(mailDraftRevisionJob.draftOutboxId, input.itemId),
        eq(mailDraftRevisionJob.status, 'failed'),
        eq(connection.userId, input.userId),
      ),
    )
    .orderBy(desc(mailDraftRevisionJob.createdAt))
    .limit(1);
  if (!row) return null;
  const now = new Date();
  const [retried] = await db
    .update(mailDraftRevisionJob)
    .set({
      status: 'queued',
      claimedByDeviceId: null,
      claimTokenHash: null,
      leaseExpiresAt: null,
      error: null,
      completedAt: null,
      updatedAt: now,
    })
    .where(and(eq(mailDraftRevisionJob.id, row.job.id), eq(mailDraftRevisionJob.status, 'failed')))
    .returning({ id: mailDraftRevisionJob.id });
  if (!retried) return null;
  await db
    .update(draftOutbox)
    .set({ reviewState: 'revision_requested', error: null, updatedAt: now })
    .where(eq(draftOutbox.id, input.itemId));
  return retried;
}

export const revisionJobIdempotencyKey = async (input: {
  kind: 'compose' | 'revise';
  itemId: string;
  baseDigest: string;
  instruction: string;
}) =>
  `mail_revision:${await hashMailAgentSecret(
    JSON.stringify({
      kind: input.kind,
      itemId: input.itemId,
      baseDigest: input.baseDigest,
      instruction: input.instruction.trim(),
    }),
  )}`;
