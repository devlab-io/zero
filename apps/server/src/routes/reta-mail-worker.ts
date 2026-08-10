import {
  authenticateMailAgentDevice,
  claimNextDraftRevisionJob,
  completeDraftRevisionJob,
  exchangeMailAgentEnrollment,
  failDraftRevisionJob,
  getClaimedDraftRevision,
  updateDraftOutboxSnapshot,
} from '../lib/mail-agent';
import { normalizeMailAddresses } from '../lib/mail-agent/triage';
import { createDraftContentDigest } from '../lib/draft-outbox';
import { getThread, getZeroAgent } from '../lib/server-utils';
import type { ParsedDraft } from '../lib/driver/types';
import type { HonoContext } from '../ctx';
import { createDb, type DB } from '../db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

const claimSchema = z.object({});
const enrollmentSchema = z.object({
  code: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
});
const completionSchema = z.object({
  claimToken: z.string().min(1),
  subject: z.string().max(998),
  body: z.string().max(200_000),
});
const failureSchema = z.object({
  claimToken: z.string().min(1),
  error: z.string().trim().min(1).max(2_000),
});

type ProviderDraft = ParsedDraft & {
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    body: string;
  }>;
};

const bearerToken = (header: string | undefined) => {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
};

const withWorkerDb = async <T>(connectionString: string, callback: (db: DB) => Promise<T>) => {
  const { db, conn } = createDb(connectionString);
  try {
    return await callback(db);
  } finally {
    await conn.end();
  }
};

const authenticate = async (c: Context<HonoContext>) =>
  withWorkerDb(c.env.HYPERDRIVE.connectionString, (db) =>
    authenticateMailAgentDevice(db, bearerToken(c.req.header('Authorization'))),
  );

const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

const serializedAttachments = (draft: ProviderDraft | null) =>
  (draft?.attachments ?? []).map((attachment) => ({
    name: attachment.filename,
    type: attachment.mimeType || 'application/octet-stream',
    size: attachment.size,
    lastModified: Date.now(),
    base64: attachment.body,
  }));

export const retaMailWorkerRouter = new Hono<HonoContext>()
  .post('/enroll', async (c) => {
    const parsed = enrollmentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid enrollment request' }, 400);
    const enrolled = await withWorkerDb(c.env.HYPERDRIVE.connectionString, (db) =>
      exchangeMailAgentEnrollment(db, parsed.data),
    );
    if (!enrolled) return c.json({ error: 'Enrollment code invalid or expired' }, 401);
    return c.json({ deviceId: enrolled.id, token: enrolled.token });
  })
  .post('/jobs/claim-next', async (c) => {
    const parsed = claimSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const device = await authenticate(c);
    if (!device) return c.json({ error: 'Unauthorized' }, 401);

    const claimed = await withWorkerDb(c.env.HYPERDRIVE.connectionString, (db) =>
      claimNextDraftRevisionJob(db, {
        deviceId: device.id,
        userId: device.userId,
      }),
    );
    if (!claimed) return c.json({ job: null });

    const item = await withWorkerDb(c.env.HYPERDRIVE.connectionString, async (db) => {
      const row = await getClaimedDraftRevision(db, {
        jobId: claimed.job.id,
        deviceId: device.id,
        userId: device.userId,
        claimToken: claimed.claimToken,
      });
      return row?.item ?? null;
    });
    if (!item) return c.json({ error: 'Claim lost' }, 409);

    const thread = item.threadId
      ? (await getThread(item.connectionId, item.threadId)).result
      : null;
    const context = (thread?.messages ?? []).slice(-12).map((message) => ({
      from: message.sender,
      to: message.to,
      cc: message.cc ?? [],
      subject: message.subject,
      receivedOn: message.receivedOn,
      body: stripHtml(message.decodedBody || message.body || '').slice(0, 12_000),
      attachments: (message.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      })),
    }));
    if (claimed.job.kind === 'compose' && !context.some((message) => message.body)) {
      await withWorkerDb(c.env.HYPERDRIVE.connectionString, (db) =>
        failDraftRevisionJob(db, {
          jobId: claimed.job.id,
          itemId: item.id,
          error: 'Le contenu du fil est indisponible. Aucun brouillon n’a été créé.',
        }),
      );
      return c.json({ job: null });
    }

    return c.json({
      job: {
        id: claimed.job.id,
        claimToken: claimed.claimToken,
        kind: claimed.job.kind,
        instruction: claimed.job.instruction,
        baseRevision: claimed.job.baseRevision,
        baseDigest: claimed.job.baseDigest,
        outboxId: item.id,
        threadId: item.threadId,
        to: item.to,
        cc: item.cc,
        bcc: item.bcc,
        subject: item.subject,
        body: item.body,
        sourceAttachments: item.sourceAttachments,
        context,
      },
    });
  })
  .post('/jobs/:id/complete', async (c) => {
    const parsed = completionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid completion' }, 400);
    const device = await authenticate(c);
    if (!device) return c.json({ error: 'Unauthorized' }, 401);

    return withWorkerDb(c.env.HYPERDRIVE.connectionString, async (db) => {
      const claimed = await getClaimedDraftRevision(db, {
        jobId: c.req.param('id'),
        deviceId: device.id,
        userId: device.userId,
        claimToken: parsed.data.claimToken,
      });
      if (!claimed) return c.json({ error: 'Claim missing or expired' }, 409);

      const { job, item } = claimed;
      const { stub: agent } = await getZeroAgent(item.connectionId, c.executionCtx);
      let providerDraft: ProviderDraft | null = null;
      let providerDigest: string | null = null;
      if (job.kind === 'revise') {
        if (!item.gmailDraftId) return c.json({ error: 'Draft missing' }, 409);
        try {
          providerDraft = (await agent.getDraft(item.gmailDraftId)) as ProviderDraft;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`RETA provider draft read failed: ${message}`);
        }
        providerDigest = await createDraftContentDigest({
          to: providerDraft.to ?? [],
          cc: providerDraft.cc ?? [],
          bcc: providerDraft.bcc ?? [],
          subject: providerDraft.subject ?? '',
          body: providerDraft.content ?? '',
        });
      }
      const snapshotDigest = await createDraftContentDigest({
        to: item.to,
        cc: item.cc,
        bcc: item.bcc,
        subject: item.subject,
        body: item.body,
      });
      if (
        job.baseDigest !== item.contentDigest ||
        item.contentRevision !== job.baseRevision ||
        (providerDigest !== null && providerDigest !== snapshotDigest)
      ) {
        await failDraftRevisionJob(db, {
          jobId: job.id,
          itemId: item.id,
          error: 'Le brouillon a changé pendant la correction. Aucune modification appliquée.',
          stale: true,
        });
        return c.json({ error: 'Draft changed; no update applied' }, 409);
      }

      const to = normalizeMailAddresses(item.to);
      const cc = normalizeMailAddresses(item.cc);
      const bcc = normalizeMailAddresses(item.bcc);

      let saved;
      try {
        saved = await agent.createDraft({
          to: to.join(', '),
          cc: cc.join(', '),
          bcc: bcc.join(', '),
          subject: parsed.data.subject,
          message: parsed.data.body,
          attachments: serializedAttachments(providerDraft),
          id: item.gmailDraftId ?? null,
          threadId: item.threadId ?? null,
          fromEmail: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`RETA provider draft write failed: ${message}`);
      }
      if (!saved?.id) {
        await failDraftRevisionJob(db, {
          jobId: job.id,
          itemId: item.id,
          error: saved?.error ?? 'Le fournisseur n’a renvoyé aucun identifiant de brouillon',
        });
        return c.json({ error: 'Draft save failed' }, 502);
      }

      const digest = await createDraftContentDigest({
        to,
        cc,
        bcc,
        subject: parsed.data.subject,
        body: parsed.data.body,
      });
      const updated = await updateDraftOutboxSnapshot(db, {
        id: item.id,
        expectedRevision: item.contentRevision,
        to,
        cc,
        bcc,
        subject: parsed.data.subject,
        body: parsed.data.body,
        digest,
        gmailDraftId: saved.id,
        status: 'draft_ready',
        reviewState: 'ready',
      });
      if (!updated) {
        await failDraftRevisionJob(db, {
          jobId: job.id,
          itemId: item.id,
          error: 'La version RETA a changé. Le brouillon fournisseur doit être vérifié.',
          stale: true,
        });
        return c.json({ error: 'Outbox changed during completion' }, 409);
      }
      await completeDraftRevisionJob(db, {
        jobId: job.id,
        revision: updated.contentRevision,
      });
      return c.json({
        ok: true,
        outboxId: updated.id,
        contentRevision: updated.contentRevision,
        contentDigest: updated.contentDigest,
      });
    });
  })
  .post('/jobs/:id/fail', async (c) => {
    const parsed = failureSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid failure' }, 400);
    const device = await authenticate(c);
    if (!device) return c.json({ error: 'Unauthorized' }, 401);
    return withWorkerDb(c.env.HYPERDRIVE.connectionString, async (db) => {
      const claimed = await getClaimedDraftRevision(db, {
        jobId: c.req.param('id'),
        deviceId: device.id,
        userId: device.userId,
        claimToken: parsed.data.claimToken,
      });
      if (!claimed) return c.json({ error: 'Claim missing or expired' }, 409);
      await failDraftRevisionJob(db, {
        jobId: claimed.job.id,
        itemId: claimed.item.id,
        error: parsed.data.error,
      });
      return c.json({ ok: true });
    });
  })
  .get('/heartbeat', async (c) => {
    const device = await authenticate(c);
    return device
      ? c.json({ ok: true, deviceId: device.id })
      : c.json({ error: 'Unauthorized' }, 401);
  });
