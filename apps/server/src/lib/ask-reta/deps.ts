import {
  askRetaModelKeys,
  DEFAULT_ASK_RETA_MODEL,
  type AskRetaModelKey,
  type AskRetaStep,
} from './schema';
import { getThread, getThreadsFromDB, getZeroAgent, getZeroDB } from '../server-utils';
import { buildMailboxOverview, getMailboxActivity } from '../mailbox-overview';
import { workersAiModel, type WorkersAiBinding } from './model';
import type { AskRetaDeps } from './pipeline';
import { env } from 'cloudflare:workers';
import { createDb } from '../../db';

/**
 * Shared dependency wiring for BOTH Ask Reta transports (tRPC copilot.ask and
 * the slice-2 NDJSON stream). Connection ownership is the caller's contract:
 * `connectionId` must come from the server-resolved active connection, never
 * from the client. The surface stays read-only by construction.
 */

export const resolveAskRetaModelKey = (value: unknown): AskRetaModelKey =>
  askRetaModelKeys.includes(value as AskRetaModelKey)
    ? (value as AskRetaModelKey)
    : DEFAULT_ASK_RETA_MODEL;

export async function createAskRetaDeps(params: {
  userId: string;
  connectionId: string;
  executionCtx: ExecutionContext;
  signal?: AbortSignal;
  onStep?: (step: AskRetaStep) => void;
}): Promise<{ deps: AskRetaDeps; modelKey: AskRetaModelKey }> {
  const { userId, connectionId, executionCtx, signal, onStep } = params;
  const { stub: agent } = await getZeroAgent(connectionId, executionCtx);

  const db = await getZeroDB(userId);
  const stored = await db.findUserSettings();
  const modelKey = resolveAskRetaModelKey(
    (stored?.settings as { askRetaModel?: unknown } | undefined)?.askRetaModel,
  );

  const deps: AskRetaDeps = {
    // Structural narrowing: the generated Ai<AiModels> run() overloads reject a
    // string-typed model id; the catalogue only holds valid @cf/meta ids.
    model: workersAiModel(env.AI as unknown as WorkersAiBinding, modelKey),
    overview: async () => {
      const now = Date.now();
      // Fixed UTC windows (supplementary signal only; folder counts are exact).
      const todayStart = new Date(new Date(now).setUTCHours(0, 0, 0, 0));
      const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const { db: sendDb, conn } = createDb(env.HYPERDRIVE.connectionString);
      try {
        const [folders, activity] = await Promise.all([
          agent.getMailboxCounts(),
          getMailboxActivity(sendDb, { connectionId, todayStart, weekStart }),
        ]);
        return buildMailboxOverview(folders, activity);
      } finally {
        executionCtx.waitUntil(conn.end());
      }
    },
    // Multi-shard helpers (revue Codex 2026-08-01): the ZeroDriver stub is ONE
    // shard — searching through it silently misses every other shard. No folder
    // default either: the contract is the WHOLE active mailbox.
    searchThreads: async ({ query, folder, maxResults }) =>
      await getThreadsFromDB(connectionId, { q: query, folder, maxResults }),
    readThread: async (threadId) => (await getThread(connectionId, threadId)).result,
    signal,
    onStep,
  };

  return { deps, modelKey };
}
