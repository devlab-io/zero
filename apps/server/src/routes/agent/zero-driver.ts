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

import type { IGetThreadResponse, IGetThreadsResponse, MailManager } from '../../lib/driver/types';
import { countThreads, countThreadsByLabels, deleteSpamThreads, type DB } from './db';
import { connectionToDriver, getZeroSocketAgent } from '../../lib/server-utils';
import { planDraftProjectionCleanup } from '../../lib/driver/draft-deletion';
import type { IOutgoingMessage, ISnoozeBatch, Sender } from '../../types';
import { OutgoingMessageType, type OutgoingMessage } from './types';
import type { UserTopic } from '../../lib/analyze/interests';
import { Migratable, Queryable, Transfer } from 'dormroom';
import type { CreateDraftData } from '../../lib/schemas';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import type { ZeroDriverInternal } from './internal';
import { DurableObject } from 'cloudflare:workers';
import migrations from './db/drizzle/migrations';
import type { ThreadSyncResult } from './errors';
import type { ZeroAgent } from './chat-agent';
import { connection } from '../../db/schema';
import { logger } from '../../lib/logger';
import { FOLDERS } from '../../lib/utils';
import { type ZeroEnv } from '../../env';
import * as schema from './db/schema';
import { threads } from './db/schema';
import { createDb } from '../../db';
import { eq } from 'drizzle-orm';

import * as recipients from './recipients';
import * as projection from './projection';
import * as topics from './topics';
import * as outbox from './outbox';
import * as labels from './labels';
import * as sync from './sync';

const _migrations = Object.fromEntries(
  Object.entries(migrations.migrations).map(([_, value], index) => [index + 1, [value]]),
);

@Migratable({
  migrations: _migrations,
})
@Queryable()
export class ZeroDriver extends DurableObject<ZeroEnv> {
  transfer = new Transfer(this);
  sql: SqlStorage;
  private db: DB;
  private syncThreadsInProgress: Map<string, boolean> = new Map();
  private driver: MailManager | null = null;
  private agent: DurableObjectStub<ZeroAgent> | null = null;
  private name: string = 'general';
  private connection: typeof connection.$inferSelect | null = null;
  private recipientCache: {
    contacts: Array<{ email: string; name?: string | null; freq: number; last: number }>;
    hash: string;
  } | null = null;

  private invalidateRecipientCache() {
    this.recipientCache = null;
  }

  constructor(ctx: DurableObjectState, env: ZeroEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.db = drizzle(ctx.storage, { schema });
    // Ré-initialisation autonome après éviction : le Worker peut ainsi sauter le
    // handshake setName/setupAuth sur le chemin chaud une fois le premier contact
    // établi. Toute erreur dégrade vers l'init paresseuse via setName.
    ctx.blockConcurrencyWhile(async () => {
      try {
        const storedName = await ctx.storage.get<string>(outbox.DRAFT_OUTBOX_CONNECTION_ID_KEY);
        if (storedName && storedName !== 'general') {
          this.name = storedName;
          await this.setupAuth();
        }
      } catch (error) {
        logger.error('[ZeroDriver] Self-init from storage failed, deferring to setName:', error);
      }
    });
  }

  async setName(name: string) {
    if (this.name === name && this.driver) return;
    this.name = name;
    await this.ctx.storage.put(outbox.DRAFT_OUTBOX_CONNECTION_ID_KEY, name);
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.setupAuth();
    });
  }

  getDatabaseSize() {
    return this.ctx.storage.sql.databaseSize;
  }

  async isSyncing(): Promise<boolean> {
    return false;
  }

  async getAllSubjects() {
    const subjects = await this.db.select({ latestSubject: threads.latestSubject }).from(threads);
    return subjects.map((row) => row.latestSubject).filter((subject) => subject !== null);
  }

  broadcast(message: OutgoingMessage) {
    this.agent?.broadcastChatMessage(message);
  }

  async getUserTopics(): Promise<UserTopic[]> {
    return topics.getUserTopics(internal(this));
  }

  async normalizeIds(ids: string[]) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return this.driver.normalizeIds(ids);
  }

  async sendDraft(id: string, data: IOutgoingMessage) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    const result = await this.driver.sendDraft(id, data);
    this.invalidateRecipientCache();
    return result;
  }

  async sendStoredDraft(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    const result = await this.driver.sendStoredDraft(id);
    this.invalidateRecipientCache();
    return result;
  }

  async create(data: IOutgoingMessage) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    const result = await this.driver.create(data);
    this.invalidateRecipientCache();
    return result;
  }

  async delete(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.delete(id);
  }

  async deleteAllSpam() {
    return await deleteSpamThreads(this.db);
  }

  async getEmailAliases() {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.getEmailAliases();
  }

  async getMessageAttachments(messageId: string, options?: { inlineOnly?: boolean }) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.getMessageAttachments(messageId, options);
  }

  async getRawEmail(messageId: string) {
    if (!this.driver) throw new Error('No driver available');
    return await this.driver.getRawEmail(messageId);
  }

  async forceReSync() {
    return sync.forceReSync(internal(this));
  }

  public async setupAuth() {
    if (this.name === 'general') return;
    if (!this.driver) {
      const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);
      const _connection = await db.query.connection.findFirst({
        where: eq(connection.id, this.name),
      });
      if (_connection) {
        this.driver = connectionToDriver(_connection);
        this.connection = _connection;
      }
      this.ctx.waitUntil(conn.end());
    }
    if (!this.agent) this.agent = await getZeroSocketAgent(this.name);
  }

  async armDraftOutboxAlarm(scheduledSendAt?: number | null) {
    return outbox.armDraftOutboxAlarm(internal(this), scheduledSendAt);
  }

  async alarm() {
    await outbox.processDraftOutboxAlarm(internal(this));
  }

  async syncFolders() {
    return sync.syncFolders(internal(this));
  }

  async rawListThreads(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
    // Serializable return: IGetThreadsResponse's `$raw?: unknown` is not Rpc.Serializable,
    // so the DO stub otherwise collapses this method's return to `never`. Runtime unchanged.
  }): Promise<{
    threads: { id: string; historyId: string | null }[];
    nextPageToken: string | null;
  }> {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.list(params);
  }

  async getThread(threadId: string, includeDrafts: boolean = false) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.getThreadFromDB(threadId, includeDrafts);
  }

  async modifyLabels(threadIds: string[], addLabelIds: string[], removeLabelIds: string[]) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.modifyLabels(threadIds, {
      addLabels: addLabelIds,
      removeLabels: removeLabelIds,
    });
  }

  async listHistory<T>(historyId: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.listHistory<T>(historyId);
  }

  async getUserLabels() {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.getUserLabels();
  }

  async getLabel(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.getLabel(id);
  }

  async createLabel(params: {
    name: string;
    color?: {
      backgroundColor: string;
      textColor: string;
    };
  }) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.createLabel(params);
  }

  async bulkDelete(threadIds: string[]) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.modifyLabels(threadIds, {
      addLabels: ['TRASH'],
      removeLabels: ['INBOX'],
    });
  }

  async bulkArchive(threadIds: string[]) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.modifyLabels(threadIds, {
      addLabels: [],
      removeLabels: ['INBOX'],
    });
  }

  async updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.updateLabel(id, label);
  }

  async deleteLabel(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.deleteLabel(id);
  }

  async createDraft(draftData: CreateDraftData) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.createDraft(draftData);
  }

  async getDraft(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.getDraft(id);
  }

  async listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.driver.listDrafts(params);
  }

  async deleteDraft(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    // CUA round 6 : après le succès Gmail, la projection locale gardait le fil
    // marqué DRAFT et le broadcast visait 'drafts' (non canonique — le client
    // invalide par clé exacte de dossier, FOLDERS.DRAFT = 'draft' : no-op
    // depuis toujours). Le driver rend les identifiants exacts + l'état du fil
    // post-suppression ; le nettoyage est minimal et ne touche AUCUN autre
    // brouillon (voir planDraftProjectionCleanup).
    const outcome = await this.driver.deleteDraft(id);
    const cleanup = planDraftProjectionCleanup({
      threadId: outcome.threadId,
      threadGone: outcome.threadGone,
      hasOtherDrafts: outcome.hasOtherDrafts,
    });
    if (cleanup.action === 'delete-thread' && cleanup.threadId) {
      const { deleteThreadById } = await import('./db');
      await deleteThreadById(this.db, cleanup.threadId);
    } else if (cleanup.action === 'remove-draft-label' && cleanup.threadId) {
      const { removeThreadLabel } = await import('./db');
      await removeThreadLabel(this.db, cleanup.threadId, 'DRAFT');
    }
    await this.reloadFolder(FOLDERS.DRAFT);
    return { success: true };
  }

  // Additional mail operations
  async count() {
    const folders = ['inbox', 'sent', 'spam', 'archive', 'trash'];
    const results = await countThreadsByLabels(
      this.db,
      folders.map((f) => f.toUpperCase()),
    );
    const resultMap = new Map(
      results.map((r: { labelId: string; count: number }) => [r.labelId, r.count]),
    );
    return folders.map((f) => ({ label: f, count: resultMap.get(f.toUpperCase()) ?? 0 }));
  }

  async getMailboxCounts() {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return this.driver.getMailboxCounts();
  }

  async deleteThread(id: string) {
    await this.db.delete(threads).where(eq(threads.threadId, id));
    this.invalidateRecipientCache();
    this.agent?.broadcastChatMessage({
      type: OutgoingMessageType.Mail_List,
      folder: 'trash',
    });
  }

  async reloadFolder(folder: string) {
    this.agent?.broadcastChatMessage({
      type: OutgoingMessageType.Mail_List,
      folder,
    });
  }

  async syncThread(params: { threadId: string }): Promise<ThreadSyncResult> {
    return sync.syncThread(internal(this), params);
  }

  async getThreadCount() {
    const count = await countThreads(this.db);
    return count || 0;
  }

  async inboxRag(query: string) {
    return projection.inboxRag(internal(this), query);
  }

  async searchThreads(params: {
    query: string;
    folder?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  }) {
    return projection.searchThreads(internal(this), params);
  }

  normalizeFolderName(folderName: string) {
    return projection.normalizeFolderName(folderName);
  }

  async getThreadsFromDB(params: {
    labelIds?: string[];
    folder?: string;
    q?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<IGetThreadsResponse> {
    return projection.getThreadsFromDB(internal(this), params);
  }

  async modifyThreadLabelsByName(
    threadId: string,
    addLabelNames: string[],
    removeLabelNames: string[],
  ) {
    return labels.modifyThreadLabelsByName(
      internal(this),
      threadId,
      addLabelNames,
      removeLabelNames,
    );
  }

  async modifyThreadLabelsInDB(threadId: string, addLabels: string[], removeLabels: string[]) {
    return labels.modifyThreadLabelsInDB(internal(this), threadId, addLabels, removeLabels);
  }

  async getThreadFromDB(id: string, includeDrafts: boolean = false): Promise<IGetThreadResponse> {
    return projection.getThreadFromDB(internal(this), id, includeDrafts);
  }

  /** Ownership-honest read: absent on this shard → null, no sync side effect. */
  async getThreadIfPresent(
    id: string,
    includeDrafts: boolean = false,
  ): Promise<IGetThreadResponse | null> {
    return projection.getThreadFromDBIfPresent(internal(this), id, includeDrafts);
  }

  async unsnoozeThreadsHandler(payload: ISnoozeBatch) {
    const { connectionId, threadIds, keyNames } = payload;
    try {
      if (!this.driver) {
        await this.setupAuth();
      }

      if (threadIds.length) {
        await this.modifyLabels(threadIds, ['INBOX'], ['SNOOZED']);
      }

      if (keyNames.length) {
        await Promise.all(keyNames.map((k: string) => this.env.snoozed_emails.delete(k)));
      }
    } catch (error) {
      logger.error('[AGENT][unsnoozeThreadsHandler] Failed', { connectionId, threadIds, error });
      throw error;
    }
  }

  async listThreads(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  }) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.getThreadsFromDB(params);
  }

  async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  }) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.getThreadsFromDB(params);
  }

  async get(id: string) {
    if (!this.driver) {
      throw new Error('No driver available');
    }
    return await this.getThreadFromDB(id);
  }

  async suggestRecipients(query: string = '', limit: number = 10) {
    return recipients.suggestRecipients(internal(this), query, limit);
  }

  public async storeThreadInDB(
    threadData: {
      id: string;
      threadId: string;
      providerId: string;
      latestSender: Sender;
      latestReceivedOn: string;
      latestSubject: string;
    },
    labelIds: string[],
  ): Promise<void> {
    return sync.storeThreadInDB(internal(this), threadData, labelIds);
  }
}

/**
 * Bridge to the internal seam. ZeroDriver keeps its declared field/method visibility
 * intact (ctx/env are inherited `protected`, own state is `private`); the free-function
 * modules receive the live instance through {@link ZeroDriverInternal}. tsc over the
 * whole file plus the test suite guard against the interface drifting from the class.
 */
const internal = (d: ZeroDriver): ZeroDriverInternal => d as unknown as ZeroDriverInternal;
