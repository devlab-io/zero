import {
  claimSendJob,
  getSendJob,
  markSendJobFailed,
  markSendJobSent,
  type SendJobRow,
} from './index';
import { toAttachmentFiles, type SerializedAttachment, type AttachmentFile } from '../attachments';
import type { IEmailSendBatch, IOutgoingMessage } from '../../types';
import { logger } from '../logger';
import type { DB } from '../../db';

export type SendEmailQueueMessage = {
  body: IEmailSendBatch;
  ack?: () => void;
  retry?: () => void;
};

type SendAgentStub = {
  stub: {
    sendDraft: (draftId: string, mail: IOutgoingMessage) => Promise<unknown>;
    create: (mail: IOutgoingMessage) => Promise<unknown>;
  };
};

export type SendOutboxConsumerDeps = {
  db: DB;
  statusKV: KVNamespace;
  payloadKV: KVNamespace;
  getAgent: (connectionId: string) => Promise<SendAgentStub>;
  resyncThread?: (connectionId: string, threadId: string) => Promise<unknown>;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** Couture de test : opérations DB CAS substituables par des fakes en mémoire. */
  ops?: {
    claimSendJob: typeof claimSendJob;
    getSendJob: typeof getSendJob;
    markSendJobSent: typeof markSendJobSent;
    markSendJobFailed: typeof markSendJobFailed;
  };
};

/** TTL du marqueur `sent` KV (chemin legacy) : fenêtre de dédup des relivraisons. */
export const LEGACY_SENT_MARKER_TTL_SECONDS = 60 * 60;
/** TTL du marqueur `failed` KV (chemin legacy), aligné sur le TTL du payload. */
export const LEGACY_FAILED_MARKER_TTL_SECONDS = 60 * 60 * 24;

type StoredSendPayload = Omit<IOutgoingMessage, 'attachments'> & {
  attachments?: (SerializedAttachment | AttachmentFile)[];
  draftId?: string;
  connectionId?: string;
  threadId?: string;
};

const materializeAttachments = (payload: StoredSendPayload): IOutgoingMessage => {
  if (Array.isArray(payload.attachments)) {
    payload.attachments = payload.attachments.map((att) =>
      'arrayBuffer' in att && typeof att.arrayBuffer === 'function'
        ? (att as AttachmentFile)
        : toAttachmentFiles([att as SerializedAttachment])[0],
    );
  }
  return payload as IOutgoingMessage;
};

const deliver = async (
  deps: SendOutboxConsumerDeps,
  connectionId: string,
  payload: StoredSendPayload,
) => {
  const agent = await deps.getAgent(connectionId);
  const { draftId, connectionId: _scope, threadId, ...mail } = payload;
  const outgoing = materializeAttachments({ ...mail, threadId } as StoredSendPayload);
  if (draftId) {
    await agent.stub.sendDraft(draftId, outgoing);
  } else {
    await agent.stub.create(outgoing);
  }
};

/**
 * Traite un job send_job autoritatif (corps { jobId }). At-least-once : le
 * claim CAS est le verrou anti-double-envoi ; un échec fournisseur conserve le
 * payload, marque `failed` et relance l'erreur pour la relivraison Queue.
 */
const processJobMessage = async (deps: SendOutboxConsumerDeps, jobId: string): Promise<void> => {
  const ops = deps.ops ?? { claimSendJob, getSendJob, markSendJobSent, markSendJobFailed };

  const claimed = await ops.claimSendJob(deps.db, { id: jobId });
  if (!claimed) {
    const job = await ops.getSendJob(deps.db, jobId);
    if (!job) {
      logger.warn(`Send job ${jobId} not found – skipping.`);
    } else {
      // sent/cancelled : dédup normale d'une relivraison. sending au bail
      // frais : un autre worker le détient ; sa propre relivraison couvrira
      // son éventuel échec.
      logger.info(`Send job ${jobId} not claimable (status=${job.status}) – skipping.`);
    }
    return;
  }

  if (!claimed.payload) {
    // Irrécupérable (payload absent hors des chemins normaux) : failed visible
    // dans l'UI plutôt qu'une boucle de retries vouée à l'échec.
    await ops.markSendJobFailed(deps.db, jobId, 'Send job payload is missing');
    logger.error(`Send job ${jobId} has no payload – marked failed.`);
    return;
  }

  const payload = claimed.payload as StoredSendPayload;
  try {
    await deliver(deps, claimed.connectionId, payload);
    await ops.markSendJobSent(deps.db, jobId);
    if (claimed.threadId && deps.resyncThread) {
      const resync = deps.resyncThread(claimed.connectionId, claimed.threadId);
      deps.waitUntil ? deps.waitUntil(resync) : await resync.catch(() => {});
    }
    logger.info(`Send job ${jobId} sent successfully`);
  } catch (error) {
    await ops.markSendJobFailed(deps.db, jobId, String(error));
    logger.error(`Send job ${jobId} failed:`, error);
    throw error;
  }
};

/**
 * Chemin legacy (corps { messageId } + KV) : messages encore en vol au moment
 * du déploiement. Corrige la perte silencieuse d'avant : un échec CONSERVE le
 * payload, pose `failed` et relance pour retry — plus aucun delete en catch.
 */
const processLegacyMessage = async (
  deps: SendOutboxConsumerDeps,
  body: IEmailSendBatch,
): Promise<void> => {
  const { messageId, connectionId, mail } = body;

  const status = await deps.statusKV.get(messageId);
  if (status === 'cancelled' || status === 'sent') {
    logger.info(`Email ${messageId} ${status} – skipping send.`);
    return;
  }

  let payload = mail as StoredSendPayload | undefined;
  if (!payload) {
    const stored = await deps.payloadKV.get(messageId);
    if (!stored) {
      logger.error(`No payload found for scheduled email ${messageId}`);
      return;
    }
    payload = JSON.parse(stored) as StoredSendPayload;
  }

  try {
    await deliver(deps, connectionId, payload);
    await deps.statusKV.put(messageId, 'sent', {
      expirationTtl: LEGACY_SENT_MARKER_TTL_SECONDS,
    });
    await deps.payloadKV.delete(messageId);
    logger.info(`Email ${messageId} sent successfully`);
  } catch (error) {
    logger.error(`Failed to send scheduled email ${messageId}:`, error);
    await deps.statusKV.put(messageId, 'failed', {
      expirationTtl: LEGACY_FAILED_MARKER_TTL_SECONDS,
    });
    throw error;
  }
};

/**
 * Point d'entrée du consumer send-email-queue. Ack explicite des messages
 * traités, retry explicite des échecs (ou échec du batch si le runtime ne
 * fournit pas retry()) — un succès n'est plus jamais re-livré par un voisin
 * de batch en échec, un échec n'est plus jamais acquitté silencieusement.
 */
export const processSendEmailBatch = async (
  messages: SendEmailQueueMessage[],
  deps: SendOutboxConsumerDeps,
): Promise<void> => {
  const outcomes = await Promise.allSettled(
    messages.map(async (msg) => {
      const body = msg.body;
      if (body.jobId) {
        await processJobMessage(deps, body.jobId);
      } else {
        await processLegacyMessage(deps, body);
      }
    }),
  );

  let unretriedFailure: unknown = null;
  outcomes.forEach((outcome, index) => {
    const msg = messages[index];
    if (outcome.status === 'rejected') {
      if (typeof msg?.retry === 'function') {
        msg.retry();
      } else {
        unretriedFailure = outcome.reason;
      }
    } else {
      msg?.ack?.();
    }
  });

  if (unretriedFailure) throw unretriedFailure;
};

export type { SendJobRow };
