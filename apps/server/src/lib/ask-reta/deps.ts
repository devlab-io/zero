import { decodeKek, decryptApiKey, RETA_BYOK_KEK_VERSION, zeroize } from './byok-crypto';
import { getThread, getThreadsFromDB, getZeroAgent, getZeroDB } from '../server-utils';
import { workersAiModel, type RetaModel, type WorkersAiBinding } from './model';
import { buildMailboxOverview, getMailboxActivity } from '../mailbox-overview';
import { createProviderModel, RetaVaultUnavailableError } from './providers';
import { resolveSelectedEntry, type RetaCatalogueEntry } from './catalogue';
import type { AskRetaDeps } from './pipeline';
import type { AskRetaStep } from './schema';
import { guardWithSignal } from './errors';
import { createDb } from '../../db';
import { env } from '../../env';

/**
 * Shared dependency wiring for BOTH Ask Reta transports (tRPC copilot.ask and
 * the slice-2 NDJSON stream). Connection ownership is the caller's contract:
 * `connectionId` must come from the server-resolved active connection, never
 * from the client. The surface stays read-only by construction.
 *
 * Model resolution (slice 3A): the STORED selection resolves through the
 * deployment-owned catalogue (legacy short keys aliased, anything stale →
 * Workers default — never forwarded to a provider). A BYOK selection decrypts
 * the vault credential in MINIMAL scope; if the vault is unusable the ask
 * fails with a FIXED error — never a silent fallback to another model.
 */

type VaultReader = {
  findRetaByokCredential(provider: string): Promise<
    | {
        id: string;
        ciphertext: string;
        iv: string;
        wrappedDek: string;
        wrapIv: string;
        kekVersion: string;
      }
    | undefined
  >;
};

export async function buildByokModel(params: {
  vault: VaultReader;
  userId: string;
  entry: RetaCatalogueEntry;
  kekSecret: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<RetaModel> {
  const { vault, userId, entry, kekSecret } = params;
  if (!kekSecret) throw new RetaVaultUnavailableError();
  const row = await vault.findRetaByokCredential(entry.provider);
  if (!row) throw new RetaVaultUnavailableError();
  // Version pinning: an envelope wrapped under a retired KEK fails closed
  // until a rewrap migration re-wraps it — never a guessing loop over KEKs.
  if (row.kekVersion !== RETA_BYOK_KEK_VERSION) throw new RetaVaultUnavailableError();

  let kek: Uint8Array;
  try {
    kek = decodeKek(kekSecret);
  } catch {
    throw new RetaVaultUnavailableError();
  }
  let keyBytes: Uint8Array | null = null;
  try {
    keyBytes = await decryptApiKey({
      envelope: row,
      kek,
      aad: { userId, provider: entry.provider, credentialId: row.id },
    });
    // The decoded string lives only in the adapter closure for this request;
    // the buffers are zeroized below (best-effort — JS strings cannot be).
    const apiKey = new TextDecoder().decode(keyBytes);
    // The adapter resolves the catalogue ITSELF from the internal id — no
    // entry object crosses this boundary (nothing injectable).
    return createProviderModel({ modelId: entry.id, apiKey, fetchImpl: params.fetchImpl });
  } catch (error) {
    if (error instanceof RetaVaultUnavailableError) throw error;
    // Tampered/misbound envelope: fail closed, no crypto detail leaves here.
    throw new RetaVaultUnavailableError();
  } finally {
    if (keyBytes) zeroize(keyBytes);
    zeroize(kek);
  }
}

export async function createAskRetaDeps(params: {
  userId: string;
  connectionId: string;
  executionCtx: ExecutionContext;
  signal?: AbortSignal;
  onStep?: (step: AskRetaStep) => void;
}): Promise<{ deps: AskRetaDeps; modelKey: string }> {
  const { userId, connectionId, executionCtx, signal, onStep } = params;
  const { stub: agent } = await getZeroAgent(connectionId, executionCtx);

  const db = await getZeroDB(userId);
  const stored = await db.findUserSettings();
  const entry = resolveSelectedEntry(
    (stored?.settings as { askRetaModel?: unknown } | undefined)?.askRetaModel,
  );

  const model =
    entry.provider === 'workers-ai'
      ? // Workers AI path works WITHOUT any KEK/vault — no credential involved.
        workersAiModel(env.AI as unknown as WorkersAiBinding, {
          key: entry.id,
          upstreamModel: entry.upstreamModel,
        })
      : await buildByokModel({ vault: db, userId, entry, kekSecret: env.RETA_BYOK_KEK_V1 });

  // DO RPC calls have NO abort contract: a dispatched RPC may complete on its
  // shard regardless. Cooperative discipline only — never dispatch after
  // abort, discard a late result after abort (review 02-cancel-contract).
  const deps: AskRetaDeps = {
    model,
    overview: () =>
      guardWithSignal(signal, async () => {
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
      }),
    // Multi-shard helpers (revue Codex 2026-08-01): the ZeroDriver stub is ONE
    // shard — searching through it silently misses every other shard. No folder
    // default either: the contract is the WHOLE active mailbox.
    searchThreads: ({ query, folder, maxResults }) =>
      guardWithSignal(signal, () =>
        getThreadsFromDB(connectionId, { q: query, folder, maxResults }),
      ),
    readThread: (threadId) =>
      guardWithSignal(signal, async () => (await getThread(connectionId, threadId)).result),
    signal,
    onStep,
  };

  return { deps, modelKey: model.key };
}
