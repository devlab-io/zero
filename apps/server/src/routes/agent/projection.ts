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

/**
 * Thread projection — the read surface over the Durable Object's SQLite (`threads`
 * + `thread_labels`) and the R2 thread-body bucket.
 *
 * This module is the named boundary consumed by #30 (rich projection) and #36 (MCP):
 * thread metadata (subject / sender / date / labels / unread) is sourced from the
 * `threads` row and `thread_labels`; message bodies come from `THREADS_BUCKET`.
 * Behaviour is unchanged from the pre-split monolith — #30 owns any change to the
 * projection *content*.
 */

import type { IGetThreadResponse } from '../../lib/driver/types';
import type { ThreadsResponse } from '@zero/types';
import { GmailSearchAssistantSystemPrompt } from '../../lib/prompts';
import type { ZeroDriverInternal } from './internal';
import type { ParsedMessage, Sender } from '../../types';
import { get, getThreadLabels } from './db';
import { threadLabels as threadLabelsTable, labels as labelsTable } from './db/schema';
import { inArray, eq } from 'drizzle-orm';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { Effect } from 'effect';

/** Row shape carried out of {@link queryThreads}: id + the rich list columns (#30). */
type ThreadRow = {
  id: string;
  latest_received_on: string | null;
  latest_subject: string | null;
  latest_sender: Sender | null;
};

/** Project a `threads` DB row down to the rich list-projection row (#30). */
function projectRow(thread: {
  id: string;
  latestReceivedOn: string | null;
  latestSubject: string | null;
  latestSender: Sender | null;
}): ThreadRow {
  return {
    id: String(thread.id),
    latest_received_on: thread.latestReceivedOn ?? null,
    latest_subject: thread.latestSubject ?? null,
    latest_sender: thread.latestSender ?? null,
  };
}

/**
 * Batch-load `thread_labels` for a page of threads in ONE query (#30). Keeps the list
 * path from doing a per-row label lookup; reads `self.db` without touching `db/**`.
 */
async function getLabelsForThreads(
  db: ZeroDriverInternal['db'],
  threadIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const byThread = new Map<string, { id: string; name: string }[]>();
  if (threadIds.length === 0) return byThread;

  const rows = await db
    .select({
      threadId: threadLabelsTable.threadId,
      id: labelsTable.id,
      name: labelsTable.name,
    })
    .from(threadLabelsTable)
    .innerJoin(labelsTable, eq(labelsTable.id, threadLabelsTable.labelId))
    .where(inArray(threadLabelsTable.threadId, threadIds));

  for (const row of rows) {
    const list = byThread.get(row.threadId);
    if (list) list.push({ id: row.id, name: row.name });
    else byThread.set(row.threadId, [{ id: row.id, name: row.name }]);
  }
  return byThread;
}

/** R2 object key for a thread's stored message bodies. */
function threadKey(name: string, threadId: string) {
  return `${name}/${threadId}.json`;
}

/** `bin` is the user-facing alias for the `trash` folder. */
export function normalizeFolderName(folderName: string) {
  if (folderName === 'bin') return 'trash';
  return folderName;
}

export async function inboxRag(self: ZeroDriverInternal, query: string) {
  if (!self.env.AUTORAG_ID) {
    console.warn('[inboxRag] AUTORAG_ID not configured - RAG search disabled');
    return { result: 'Not enabled', data: [] };
  }

  try {
    console.log(`[inboxRag] Executing AI search with parameters:`, {
      query,
      max_num_results: 3,
      score_threshold: 0.3,
      folder_filter: `${self.name}/`,
    });

    const answer = await self.env.AI.autorag(self.env.AUTORAG_ID).aiSearch({
      query: query,
      //   rewrite_query: true,
      max_num_results: 3,
      ranking_options: {
        score_threshold: 0.3,
      },
      //   stream: true,
      filters: {
        type: 'eq',
        key: 'folder',
        value: `${self.name}/`,
      },
    });

    return { result: answer.response, data: answer.data };
  } catch (error) {
    console.error(`[inboxRag] Search failed for query: "${query}"`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      user: self.name,
    });

    // Return empty result on error to prevent breaking the flow
    return { result: 'Search failed', data: [] };
  }
}

export async function searchThreads(
  self: ZeroDriverInternal,
  params: {
    query: string;
    folder?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  },
) {
  const { query, folder = 'inbox', maxResults = 50, labelIds = [], pageToken } = params;

  if (!self.driver) {
    throw new Error('No driver available');
  }

  // Create parallel Effect operations
  const ragEffect = Effect.tryPromise(() =>
    inboxRag(self, query).then((rag) => {
      const ids = rag?.data?.map((d) => d.attributes.threadId).filter(Boolean) ?? [];
      return ids.slice(0, maxResults);
    }),
  ).pipe(Effect.catchAll(() => Effect.succeed([])));

  const genQueryEffect = Effect.tryPromise(() =>
    generateText({
      model: openai(self.env.OPENAI_MODEL || 'gpt-4o'),
      system: GmailSearchAssistantSystemPrompt(),
      prompt: params.query,
    }).then((response) => response.text),
  ).pipe(Effect.catchAll(() => Effect.succeed(query)));

  const genQueryResult = await Effect.runPromise(genQueryEffect);

  const rawEffect = Effect.tryPromise(() =>
    self.driver!.list({
      folder,
      query: genQueryResult,
      labelIds,
      maxResults,
      pageToken,
    }).then((r) => r.threads.map((t) => t.id)),
  ).pipe(Effect.catchAll(() => Effect.succeed([])));

  const effects: Effect.Effect<string[]>[] = [rawEffect];
  if (self.env.AUTORAG_ID) effects.unshift(ragEffect as Effect.Effect<string[]>);

  // Run both in parallel and wait for results
  const results = await Effect.runPromise(Effect.all(effects, { concurrency: 'unbounded' }));
  if (self.env.AUTORAG_ID) {
    const [ragIds, rawIds] = results;

    // Return InboxRag results if found, otherwise fallback to raw
    if (ragIds.length > 0) {
      return {
        threadIds: ragIds,
        source: 'autorag' as const,
      };
    }

    return {
      threadIds: rawIds,
      source: 'raw' as const,
      nextPageToken: pageToken,
    };
  }
  const [rawIds] = results;
  return {
    threadIds: rawIds,
    source: 'raw' as const,
    nextPageToken: pageToken,
  };
}

function queryThreads(
  self: ZeroDriverInternal,
  params: {
    labelIds?: string[];
    folder?: string;
    q?: string;
    pageToken?: string;
    maxResults: number;
  },
) {
  return Effect.tryPromise(async (): Promise<ThreadRow[]> => {
    const { labelIds = [], folder, q, pageToken, maxResults } = params;

    console.log('[queryThreads] params:', { labelIds, folder, q, pageToken, maxResults });

    // Import the new database functions
    const {
      findThreadsWithPagination,
      findThreadsByFolderWithPagination,
      findThreadsWithAnyLabels,
      findThreadsWithTextSearch,
      list,
    } = await import('./db');

    // Case 1: All threads (no filters)
    if (!folder && labelIds.length === 0 && !q && !pageToken) {
      console.log('[queryThreads] Case: all threads');
      const threads = await list(self.db);
      return threads.map(projectRow);
    }

    // Case 2: Folder only — always via the SQL-LIMIT paginated query so the first
    // inbox page is bounded at the database (#30), not fetch-all-then-slice.
    if (folder && labelIds.length === 0 && !q) {
      const folderLabel = folder.toUpperCase();
      console.log('[queryThreads] Case: folder only', { folderLabel });

      const result = await findThreadsByFolderWithPagination(self.db, folderLabel, {
        pageToken,
        maxResults,
      });
      return result.threads.map(projectRow);
    }

    // Case 3: Single label only
    if (labelIds.length === 1 && !folder && !q) {
      const labelId = labelIds[0];
      console.log('[queryThreads] Case: single label only', { labelId });

      if (pageToken) {
        const result = await findThreadsWithPagination(self.db, {
          labelIds: [labelId],
          pageToken,
          maxResults,
        });
        return result.threads.map(projectRow);
      } else {
        const threads = await findThreadsWithAnyLabels(self.db, [labelId]);
        return threads.slice(0, maxResults).map(projectRow);
      }
    }

    // Case 4: Text search only
    if (q && !folder && labelIds.length === 0) {
      console.log('[queryThreads] Case: text search only', { q });
      const threads = await findThreadsWithTextSearch(self.db, q);
      return threads.slice(0, maxResults).map(projectRow);
    }

    // Case 5: Complex filtering (folder + labels + search + pagination)
    console.log('[queryThreads] Case: complex filtering', {
      folder,
      labelIds,
      q,
      pageToken,
    });

    const allLabelIds = [...labelIds];
    if (folder) {
      allLabelIds.push(folder.toUpperCase());
    }

    const result = await findThreadsWithPagination(self.db, {
      labelIds: allLabelIds,
      searchText: q,
      pageToken,
      maxResults,
      requireAllLabels: true, // Require all labels to be present
    });

    return result.threads.map(projectRow);
  });
}

/**
 * Pure reshape (#30): DO `threads` rows + batched `thread_labels` → the rich list
 * projection. Extracted so it is unit-testable with fake DO data (no SQLite/DO needed).
 * Carries NO message body and NO base64 — subject/sender/date/labels/unread only.
 */
export function buildThreadProjection(
  rows: ThreadRow[],
  labelsByThread: Map<string, { id: string; name: string }[]>,
  maxResults: number,
): ThreadsResponse {
  if (!rows.length) {
    return { threads: [], nextPageToken: '' };
  }

  const threads = rows.map((row) => {
    const labels = labelsByThread.get(row.id) ?? [];
    return {
      id: row.id,
      historyId: null,
      // Coalesce DB nulls to undefined so the item stays assignable to non-nullable
      // consumers of listThreads (the `.output()` schema forbids null on these).
      subject: row.latest_subject ?? undefined,
      sender: row.latest_sender ?? undefined,
      receivedOn: row.latest_received_on ?? undefined,
      labels,
      unread: labels.some((label) => label.id === 'UNREAD'),
    };
  });

  // Cursor heuristic preserved from the pre-projection path: last row's latest_received_on.
  const nextPageToken =
    threads.length === maxResults && rows.length > 0
      ? String(rows[rows.length - 1].latest_received_on)
      : null;

  return { threads, nextPageToken };
}

export async function getThreadsFromDB(
  self: ZeroDriverInternal,
  params: {
    labelIds?: string[];
    folder?: string;
    q?: string;
    maxResults?: number;
    pageToken?: string;
  },
): Promise<ThreadsResponse> {
  const { maxResults = 50 } = params;
  const normalizedParams = {
    ...params,
    folder: params.folder ? normalizeFolderName(params.folder) : undefined,
    maxResults,
  };

  try {
    const rows = await Effect.runPromise(queryThreads(self, normalizedParams));
    const labelsByThread = await getLabelsForThreads(
      self.db,
      rows.map((row) => row.id),
    );
    return buildThreadProjection(rows, labelsByThread, maxResults);
  } catch (error) {
    console.error('Failed to get threads from database:', error);
    throw error;
  }
}

export async function getThreadFromDB(
  self: ZeroDriverInternal,
  id: string,
  includeDrafts: boolean = false,
): Promise<IGetThreadResponse> {
  try {
    const result = await get(self.db, { id });
    if (!result) {
      await self.syncThread({ threadId: id });
      return {
        messages: [],
        latest: undefined,
        hasUnread: false,
        totalReplies: 0,
        labels: [],
      } satisfies IGetThreadResponse;
    }
    const storedThread = await self.env.THREADS_BUCKET.get(threadKey(self.name, id));

    let messages: ParsedMessage[] = storedThread
      ? (JSON.parse(await storedThread.text()) as IGetThreadResponse).messages
      : [];

    const isLatestDraft = messages.some((e) => e.isDraft === true);

    if (!includeDrafts) {
      messages = messages.filter((e) => e.isDraft !== true);
    }

    const labelsList = await getThreadLabels(self.db, id);
    const labelIds = labelsList.map((l) => l.id);

    return {
      messages,
      latest: messages.findLast((e) => e.isDraft !== true),
      hasUnread: labelIds.includes('UNREAD'),
      totalReplies: messages.filter((e) => e.isDraft !== true).length,
      labels: labelsList,
      isLatestDraft,
    } satisfies IGetThreadResponse;
  } catch (error) {
    console.error('Failed to get thread from database:', error);
    throw error;
  }
}
