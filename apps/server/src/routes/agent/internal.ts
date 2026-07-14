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

import type { IGetThreadResponse, MailManager } from '../../lib/driver/types';
import type { CreateDraftData } from '../../lib/schemas';
import type { IOutgoingMessage } from '../../types';
import type { ThreadSyncResult } from './errors';
import type { ZeroAgent } from './chat-agent';
import type { connection } from '../../db/schema';
import type { ZeroEnv } from '../../env';
import type { DB } from './db';

/** Recipient suggestion cache shape held on the ZeroDriver instance. */
export interface RecipientCache {
  contacts: Array<{ email: string; name?: string | null; freq: number; last: number }>;
  hash: string;
}

/**
 * Internal seam for the ZeroDriver Durable Object.
 *
 * ZeroDriver is a single DO class, so its method bodies cannot be spread across
 * files as methods. The heavy per-concern logic (topics, recipients, alarms/outbox,
 * sync, projection, labels) lives in sibling modules as free functions that receive
 * the live instance through this interface. The instance's declared visibility is
 * left untouched: `zero-driver.ts` bridges via a single `this as unknown as
 * ZeroDriverInternal` accessor. Every member below MUST exist on ZeroDriver — tsc
 * over the whole surface plus the test suite are the guards against drift.
 *
 * Method return types are pinned to the driver contract (`ReturnType<MailManager[…]>`)
 * so the delegating wrappers and the free functions agree exactly.
 */
export interface ZeroDriverInternal {
  // --- instance state (declared private/protected on the class; read via the seam) ---
  ctx: DurableObjectState;
  env: ZeroEnv;
  db: DB;
  sql: SqlStorage;
  driver: MailManager | null;
  name: string;
  agent: DurableObjectStub<ZeroAgent> | null;
  connection: typeof connection.$inferSelect | null;
  recipientCache: RecipientCache | null;
  syncThreadsInProgress: Map<string, boolean>;

  // --- public methods the free functions call back into ---
  invalidateRecipientCache(): void;
  reloadFolder(folder: string): Promise<void>;
  setupAuth(): Promise<void>;
  syncThread(params: { threadId: string }): Promise<ThreadSyncResult>;
  getThread(threadId: string, includeDrafts?: boolean): Promise<IGetThreadResponse>;
  getThreadCount(): Promise<number>;
  // `.filter(s => s !== null)` narrows via TS 5.5+ inferred type predicates → string[].
  getAllSubjects(): Promise<string[]>;
  getUserLabels(): ReturnType<MailManager['getUserLabels']>;
  createLabel(params: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): ReturnType<MailManager['createLabel']>;
  createDraft(draftData: CreateDraftData): ReturnType<MailManager['createDraft']>;
  getDraft(id: string): ReturnType<MailManager['getDraft']>;
  sendDraft(id: string, data: IOutgoingMessage): ReturnType<MailManager['sendDraft']>;
}
