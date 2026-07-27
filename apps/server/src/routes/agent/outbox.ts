/*
 * Licensed to Zero Email Inc. under one or more contributor license agreements.
 * You may not use this file except in compliance with the Apache License, Version 2.0 (the "License").
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Reuse or distribution of this file requires a license from Zero Email Inc.
 */

import {
  beginGeneratingDraftOutboxJob,
  beginSendingDraftOutboxJob,
  decideDraftOutboxSendSettlement,
  failDraftOutboxJob,
  findNextApprovedDraftOutboxSendAt,
  findNextDueApprovedDraftOutboxItem,
  findNextQueuedDraftOutboxItem,
  getDraftOutboxItem,
  markDraftOutboxJobReady,
  markDraftOutboxJobSent,
  settleSendingDraftOutboxJob,
  type DraftOutboxItem,
  type DraftOutboxStatus,
} from '../../lib/draft-outbox';
import { generateAutomaticDraft } from '../../thread-workflow-utils';
import type { ParsedDraft } from '../../lib/driver/types';
import type { CreateDraftData } from '../../lib/schemas';
import { reSyncThread } from '../../lib/server-utils';
import type { ZeroDriverInternal } from './internal';
import type { IOutgoingMessage } from '../../types';
import { invariant } from '../../lib/invariant';
import { createDb } from '../../db';

export const DRAFT_OUTBOX_CONNECTION_ID_KEY = 'draftOutboxConnectionId';

/**
 * Issues sur lesquelles il n'y a plus rien à écrire. `unresolved` en fait partie : y
 * repasser un `failed` le rendrait rejouable, ce qui est exactement le doublon qu'on ferme.
 */
const TERMINAL_OUTBOX_STATUSES = new Set<DraftOutboxStatus>(['sent', 'cancelled', 'unresolved']);

type OutboxDb = ReturnType<typeof createDb>['db'];

async function getDraftOutboxConnectionId(self: ZeroDriverInternal) {
  if (self.name !== 'general') return self.name;

  const storedConnectionId = await self.ctx.storage.get<string>(DRAFT_OUTBOX_CONNECTION_ID_KEY);
  if (storedConnectionId) {
    self.name = storedConnectionId;
    return storedConnectionId;
  }

  return null;
}

export async function armDraftOutboxAlarm(
  self: ZeroDriverInternal,
  scheduledSendAt?: number | null,
) {
  const connectionId = await getDraftOutboxConnectionId(self);
  if (!connectionId) return;

  await self.ctx.storage.put(DRAFT_OUTBOX_CONNECTION_ID_KEY, connectionId);

  const alarmAt = Math.max(Date.now(), scheduledSendAt ?? Date.now());
  const currentAlarm = await self.ctx.storage.getAlarm();
  if (currentAlarm === null || alarmAt < currentAlarm) {
    await self.ctx.storage.setAlarm(alarmAt);
  }
}

export async function processDraftOutboxAlarm(self: ZeroDriverInternal) {
  const connectionId = await getDraftOutboxConnectionId(self);
  if (!connectionId) return;

  self.name = connectionId;
  await self.setupAuth();

  const { db, conn } = createDb(self.env.HYPERDRIVE.connectionString);
  try {
    const now = new Date();
    const dueApproved = await findNextDueApprovedDraftOutboxItem(db, connectionId, now);
    if (dueApproved) {
      await sendDraftOutboxItem(self, db, dueApproved);
    }

    const queued = await findNextQueuedDraftOutboxItem(db, connectionId);
    if (queued) {
      await generateDraftOutboxItem(self, db, queued);
    }

    await armNextDraftOutboxAlarm(self, db, connectionId);
  } finally {
    self.ctx.waitUntil(conn.end());
  }
}

async function armNextDraftOutboxAlarm(
  self: ZeroDriverInternal,
  db: OutboxDb,
  connectionId: string,
) {
  const nextQueued = await findNextQueuedDraftOutboxItem(db, connectionId);
  if (nextQueued) {
    await self.ctx.storage.setAlarm(Date.now());
    return;
  }

  const nextSendAt = await findNextApprovedDraftOutboxSendAt(db, connectionId);
  if (nextSendAt) {
    await self.ctx.storage.setAlarm(Math.max(Date.now(), nextSendAt.getTime()));
  }
}

async function generateDraftOutboxItem(
  self: ZeroDriverInternal,
  db: OutboxDb,
  item: DraftOutboxItem,
) {
  let current = item;
  try {
    current = await beginGeneratingDraftOutboxJob(db, item);
    const draftData = await createDraftDataForOutboxItem(self, current);
    const createdDraft = await self.createDraft(draftData);

    if (!createdDraft?.id) {
      throw new Error(createdDraft?.error ?? 'Gmail draft creation returned no id');
    }

    await markDraftOutboxJobReady(db, current, {
      gmailDraftId: createdDraft.id,
      subject: draftData.subject,
      body: draftData.message,
    });

    if (draftData.threadId) {
      self.ctx.waitUntil(reSyncThread(current.connectionId, draftData.threadId));
    }
  } catch (error) {
    await failLatestDraftOutboxState(db, item, error);
  }
}

async function sendDraftOutboxItem(self: ZeroDriverInternal, db: OutboxDb, item: DraftOutboxItem) {
  let current = item;
  // Frontière exacte de l'irréversible : tant qu'elle est fausse, AUCUN octet n'a été
  // soumis au fournisseur et rejouer est sûr. Elle est posée juste avant `sendDraft`, et
  // reste vraie pour tout ce qui suit — y compris l'écriture de `sent`, dont l'échec
  // signifie « le mail est parti mais nous ne l'avons pas noté ».
  let dispatched = false;
  try {
    current = await beginSendingDraftOutboxJob(db, item);
    invariant(current.gmailDraftId, 'outbox item has no gmailDraftId');
    const draft = await self.getDraft(current.gmailDraftId);
    dispatched = true;
    await self.sendDraft(current.gmailDraftId, toOutgoingMessage(self, current, draft));
    await markDraftOutboxJobSent(db, current);

    if (current.threadId) {
      self.ctx.waitUntil(reSyncThread(current.connectionId, current.threadId));
    }
  } catch (error) {
    await settleFailedDraftOutboxSend(db, item, error, dispatched);
  }
}

/**
 * Règle un envoi de brouillon en échec, en distinguant ce qui est rejouable de ce qui ne
 * l'est pas.
 *
 * Le défaut fermé ici : ce chemin appelait `failDraftOutboxJob` pour TOUTE erreur, y
 * compris une coupure survenue après que Gmail eut accepté l'envoi. L'item passait
 * `failed`, l'UI proposait « Réessayer », et le rejeu renvoyait le mail — un doublon
 * présenté comme une réparation.
 *
 * Le classement s'appuie sur `classifySendFailure`, qui lit l'enveloppe `StandardizedError`
 * du driver. Contrairement au chemin d'envoi différé, aucune frontière RPC ne s'interpose :
 * cette fonction s'exécute DANS le Durable Object, l'erreur y est encore entière.
 */
async function settleFailedDraftOutboxSend(
  db: OutboxDb,
  item: DraftOutboxItem,
  error: unknown,
  dispatched: boolean,
) {
  const latest = await getDraftOutboxItem(db, {
    id: item.id,
    connectionId: item.connectionId,
  });
  if (!latest) return;

  const message = error instanceof Error ? error.message : String(error);
  const settlement = decideDraftOutboxSendSettlement(latest.status, error, dispatched);

  switch (settlement.action) {
    case 'ignore':
      return;
    case 'fail':
      await failDraftOutboxJob(db, latest, message);
      return;
    case 'settle-sending':
      await settleSendingDraftOutboxJob(db, latest, {
        error: message,
        failureClass: settlement.failureClass,
      });
      return;
  }
}

async function failLatestDraftOutboxState(db: OutboxDb, item: DraftOutboxItem, error: unknown) {
  const latest = await getDraftOutboxItem(db, {
    id: item.id,
    connectionId: item.connectionId,
  });
  if (!latest || TERMINAL_OUTBOX_STATUSES.has(latest.status)) return;

  await failDraftOutboxJob(db, latest, error instanceof Error ? error.message : String(error));
}

async function createDraftDataForOutboxItem(
  self: ZeroDriverInternal,
  item: DraftOutboxItem,
): Promise<CreateDraftData> {
  if (!self.connection) {
    throw new Error('No connection available');
  }

  if (!item.threadId) {
    return {
      to: '',
      cc: '',
      bcc: '',
      subject: item.subject,
      message: item.body || item.mission || '',
      attachments: [],
      id: null,
      threadId: null,
      fromEmail: self.connection.email,
    };
  }

  const thread = await self.getThread(item.threadId);
  const latestMessage = thread.latest ?? thread.messages[thread.messages.length - 1];
  const replyTo = latestMessage?.sender?.email ?? '';
  const cc =
    latestMessage?.cc
      ?.map((recipient) => recipient.email)
      .filter((email) => email && email !== self.connection?.email)
      .join(', ') ?? '';
  const originalSubject = latestMessage?.subject || item.subject;
  const replySubject = originalSubject.startsWith('Re: ')
    ? originalSubject
    : `Re: ${originalSubject}`;
  const generatedBody =
    item.body ||
    (await generateAutomaticDraft(item.connectionId, thread, self.connection)) ||
    item.mission ||
    '';

  return {
    to: replyTo,
    cc,
    bcc: '',
    subject: item.subject === 'Draft' ? replySubject : item.subject,
    message: generatedBody,
    attachments: [],
    id: null,
    threadId: item.threadId,
    fromEmail: self.connection.email,
  };
}

function toRecipients(emails?: string[]): IOutgoingMessage['to'] {
  return emails?.filter(Boolean).map((email) => ({ email })) ?? [];
}

function toOutgoingMessage(
  self: ZeroDriverInternal,
  item: DraftOutboxItem,
  draft?: ParsedDraft,
): IOutgoingMessage {
  return {
    to: toRecipients(draft?.to),
    cc: toRecipients(draft?.cc),
    bcc: toRecipients(draft?.bcc),
    subject: draft?.subject ?? item.subject,
    message: draft?.content ?? item.body,
    attachments: [],
    headers: {},
    threadId: item.threadId ?? undefined,
    fromEmail: self.connection?.email,
  };
}
