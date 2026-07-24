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

import { threadLabels as threadLabelsTable, labels as labelsTable } from './db/schema';
import { GmailSearchAssistantSystemPrompt } from '../../lib/prompts';
import type { IGetThreadResponse } from '../../lib/driver/types';
import type { ParsedMessage, Sender } from '../../types';
import type { ZeroDriverInternal } from './internal';
import type { ThreadsResponse } from '@zero/types';
import { invariant } from '../../lib/invariant';
import { TtlCache } from '../../lib/ttl-cache';
import { get, getThreadLabels } from './db';
import { logger } from '../../lib/logger';
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
 * Cursor for the slice/heuristic query paths (#30): emit the last row's date only when the
 * page is exactly full. Guards a null date so we never emit the bogus string `"null"` as a
 * cursor (which would break the `lt(latest_received_on, token)` continuation).
 *
 * The folder path (Case 2) consumes the SQL `LIMIT maxResults+1` token from
 * `findThreadsByFolderWithPagination` instead (exact — no phantom empty page at a full boundary).
 * The label/complex paths keep this heuristic: their `findThreadsWithPagination` token points at
 * the first row of the *next* page, which its own `lt` filter would then skip — so consuming it
 * would drop a row. That off-by-one lives in `db/**` (out of bounds) and predates this change.
 */
export function heuristicToken(rows: ThreadRow[], maxResults: number): string | null {
  if (rows.length === 0 || rows.length !== maxResults) return null;
  const last = rows[rows.length - 1].latest_received_on;
  return last == null ? null : String(last);
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

// In-memory cache of R2 thread bodies (read + JSON.parse), keyed by
// `${connectionName}:${threadId}`; syncThread invalidates on rewrite and the
// 60 s TTL bounds any residual staleness.
// Devlab/perf : 50 entrées étaient sous-dimensionnées pour une navigation
// clavier avec préfetch des voisins — la fenêtre utile dépasse largement 50
// fils, et l'éviction LRU annulait le cache avant sa péremption.
const threadBodyCache = new TtlCache<ParsedMessage[]>(60_000, 400);

/** Drop the cached R2 body for a thread — called when the sync rewrites it. */
export function invalidateThreadBodyCache(connectionName: string, threadId: string) {
  threadBodyCache.delete(`${connectionName}:${threadId}`);
}

/** `bin` is the user-facing alias for the `trash` folder. */
export function normalizeFolderName(folderName: string) {
  if (folderName === 'bin') return 'trash';
  return folderName;
}

export async function inboxRag(self: ZeroDriverInternal, query: string) {
  if (!self.env.AUTORAG_ID) {
    logger.warn('[inboxRag] AUTORAG_ID not configured - RAG search disabled');
    return { result: 'Not enabled', data: [] };
  }

  try {
    logger.info(`[inboxRag] Executing AI search with parameters:`, {
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
    logger.error(`[inboxRag] Search failed for query: "${query}"`, {
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

  const driver = self.driver;
  invariant(driver, 'driver is not available');
  const rawEffect = Effect.tryPromise(() =>
    driver
      .list({
        folder,
        query: genQueryResult,
        labelIds,
        maxResults,
        pageToken,
      })
      .then((r) => r.threads.map((t) => t.id)),
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
  return Effect.tryPromise(
    async (): Promise<{ rows: ThreadRow[]; nextPageToken: string | null }> => {
      const { labelIds = [], folder, q, pageToken, maxResults } = params;

      logger.info('[queryThreads] params:', { labelIds, folder, q, pageToken, maxResults });

      // Slice/heuristic paths derive the cursor from the page; the folder path overrides it
      // with the exact SQL LIMIT+1 token (see heuristicToken doc).
      const page = (rows: ThreadRow[]) => ({
        rows,
        nextPageToken: heuristicToken(rows, maxResults),
      });

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
        logger.info('[queryThreads] Case: all threads');
        const threads = await list(self.db);
        return page(threads.map(projectRow));
      }

      // Case 2: Folder only — always via the SQL-LIMIT paginated query so the first
      // inbox page is bounded at the database (#30), not fetch-all-then-slice. Its
      // LIMIT+1 token is exact, so consume it directly (no phantom empty page).
      if (folder && labelIds.length === 0 && !q) {
        const folderLabel = folder.toUpperCase();
        logger.info('[queryThreads] Case: folder only', { folderLabel });

        const result = await findThreadsByFolderWithPagination(self.db, folderLabel, {
          pageToken,
          maxResults,
        });
        return { rows: result.threads.map(projectRow), nextPageToken: result.nextPageToken };
      }

      // Case 3: Single label only
      if (labelIds.length === 1 && !folder && !q) {
        const labelId = labelIds[0];
        logger.info('[queryThreads] Case: single label only', { labelId });

        if (pageToken) {
          const result = await findThreadsWithPagination(self.db, {
            labelIds: [labelId],
            pageToken,
            maxResults,
          });
          return page(result.threads.map(projectRow));
        } else {
          const threads = await findThreadsWithAnyLabels(self.db, [labelId]);
          return page(threads.slice(0, maxResults).map(projectRow));
        }
      }

      // Case 4: Text search only
      if (q && !folder && labelIds.length === 0) {
        logger.info('[queryThreads] Case: text search only', { q });
        const threads = await findThreadsWithTextSearch(self.db, q);
        return page(threads.slice(0, maxResults).map(projectRow));
      }

      // Case 5: Complex filtering (folder + labels + search + pagination)
      logger.info('[queryThreads] Case: complex filtering', {
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

      return page(result.threads.map(projectRow));
    },
  );
}

/**
 * Pure reshape (#30): DO `threads` rows + batched `thread_labels` → the rich list
 * projection. Extracted so it is unit-testable with fake DO data (no SQLite/DO needed).
 * Carries NO message body and NO base64 — subject/sender/date/labels/unread only.
 */
export function buildThreadProjection(
  rows: ThreadRow[],
  labelsByThread: Map<string, { id: string; name: string }[]>,
  nextPageToken: string | null,
): ThreadsResponse {
  if (!rows.length) {
    // Preserve the pre-projection empty sentinel (`''`) regardless of the query token.
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
    const { rows, nextPageToken } = await Effect.runPromise(queryThreads(self, normalizedParams));
    const labelsByThread = await getLabelsForThreads(
      self.db,
      rows.map((row) => row.id),
    );
    return buildThreadProjection(rows, labelsByThread, nextPageToken);
  } catch (error) {
    logger.error('Failed to get threads from database:', error);
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
    const bodyCacheKey = `${self.name}:${id}`;
    // Devlab/perf : la lecture R2 des corps et la requête SQLite des labels
    // n'ont aucune dépendance de données entre elles — elles étaient pourtant
    // enchaînées, ajoutant un aller-retour complet au chemin d'ouverture.
    const labelsPromise = getThreadLabels(self.db, id);
    let messages = threadBodyCache.get(bodyCacheKey);
    if (!messages) {
      const storedThread = await self.env.THREADS_BUCKET.get(threadKey(self.name, id));
      messages = storedThread
        ? (JSON.parse(await storedThread.text()) as IGetThreadResponse).messages
        : [];
      // Cache positive hits only: a missing body may just precede the sync write.
      if (storedThread) threadBodyCache.set(bodyCacheKey, messages);
    }

    const isLatestDraft = messages.some((e) => e.isDraft === true);

    if (!includeDrafts) {
      messages = messages.filter((e) => e.isDraft !== true);
    }

    const labelsList = await labelsPromise;
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
    logger.error('Failed to get thread from database:', error);
    throw error;
  }
}
