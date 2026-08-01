import {
  catalogueIdsForProvider,
  DEFAULT_CATALOGUE_ID,
  findCatalogueEntry,
  resolveSelectedEntry,
  RETA_BYOK_CONSENT_VERSION,
  RETA_MODEL_CATALOGUE,
} from '../../lib/ask-reta/catalogue';
import {
  askRetaFolderSchema,
  askRetaInputSchema,
  askRetaLimits,
  type AskRetaResult,
  type AskRetaStepThread,
} from '../../lib/ask-reta/schema';
import { decodeKekRing, encryptApiKey, zeroizeKekRing } from '../../lib/ask-reta/byok-crypto';
import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { AskRetaAbortedError, runAskReta } from '../../lib/ask-reta/pipeline';
import { createAskRetaCancellation } from '../../lib/ask-reta/cancellation';
import { getThreadsFromDB, getZeroDB } from '../../lib/server-utils';
import { createAskRetaDeps } from '../../lib/ask-reta/deps';
import type { ThreadsResponse } from '@zero/types';
import { getContext } from 'hono/context-storage';
import { Ratelimit } from '@upstash/ratelimit';
import { type HonoContext } from '../../ctx';
import { TRPCError } from '@trpc/server';
import { env } from '../../env';
import { z } from 'zod';

const formatSender = (sender?: { name?: string; email?: string }) =>
  sender ? `${sender.name ?? ''} <${sender.email ?? 'unknown'}>`.trim() : 'unknown';

/** BYOK providers accepted over the wire — must mirror RETA_BYOK_PROVIDERS. */
const byokProviderSchema = z.enum(['openai', 'anthropic', 'gemini', 'moonshot', 'zai']);

const vaultUnavailable = () =>
  new TRPCError({ code: 'PRECONDITION_FAILED', message: 'BYOK vault unavailable' });

const kekRingSecrets = () => ({
  RETA_BYOK_KEK_V1: env.RETA_BYOK_KEK_V1,
  RETA_BYOK_KEK_V2: env.RETA_BYOK_KEK_V2,
  RETA_BYOK_KEK_ACTIVE: env.RETA_BYOK_KEK_ACTIVE,
});

/** Ring metadata only — the decoded keys are zeroized before returning. */
const kekRingInfo = (): { activeVersion: string; versions: string[] } | null => {
  const ring = decodeKekRing(kekRingSecrets());
  if (!ring) return null;
  const info = { activeVersion: ring.activeVersion, versions: Array.from(ring.keys.keys()) };
  zeroizeKekRing(ring);
  return info;
};

/**
 * Ask Reta (spec docs/spec/mail-copilot.md). The ONLY sanctioned client
 * surface is components/copilot/** — enforced by the r9 guard test in
 * apps/mail. Connection ownership comes exclusively from the request context;
 * no connection id is ever accepted from the client. The dependency surface
 * handed to the pipeline (lib/ask-reta/deps.ts, shared with the slice-2
 * NDJSON stream) is read-only: nothing here can mutate a mailbox.
 */
export const copilotRouter = router({
  ask: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(20, '5m'),
        generatePrefix: () => 'ratelimit:copilot-ask',
        // Strict per-user key + fail-closed: in production without remote
        // Redis this expensive surface DENIES instead of running unlimited.
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(askRetaInputSchema)
    .mutation(async ({ ctx, input }): Promise<AskRetaResult> => {
      const { activeConnection, sessionUser } = ctx;
      const executionCtx = getContext<HonoContext>().executionCtx;

      // Owned cancellation (review 02-2): the canonical 45s deadline aborts
      // the controller so a pipeline deadline rejection also SETTLES the
      // underlying operation; disposal on every exit path.
      const cancellation = createAskRetaCancellation({ requestSignal: ctx.c.req.raw.signal });
      try {
        const { deps, modelKey } = await createAskRetaDeps({
          userId: sessionUser.id,
          connectionId: activeConnection.id,
          executionCtx,
          signal: cancellation.signal,
        });

        const result = await runAskReta(deps, input);
        return { ...result, model: modelKey };
      } catch (error) {
        if (error instanceof AskRetaAbortedError) cancellation.abort();
        throw error;
      } finally {
        cancellation.dispose();
      }
    }),

  /**
   * Replayable search preview (slice 2): the SAME semantics as a pipeline
   * search step — whole active mailbox by default (multi-shard helper, no
   * folder default), same hard cap, metadata only. Powers the editable
   * query replay in the panel's step display.
   */
  searchPreview: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(60, '5m'),
        generatePrefix: () => 'ratelimit:copilot-search-preview',
        // Same posture as ask: strict userId key, fail-closed in production.
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(
      z.object({
        query: z.string().trim().min(1).max(300),
        folder: askRetaFolderSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<{ threads: AskRetaStepThread[] }> => {
      const response = await getThreadsFromDB(ctx.activeConnection.id, {
        q: input.query,
        folder: input.folder,
        maxResults: askRetaLimits.searchResults,
      });
      // The projection rows carry the rich metadata at runtime; the driver
      // type is the thin superset (same coercion as the pipeline dep).
      const rows = response.threads as ThreadsResponse['threads'];
      return {
        threads: rows.slice(0, askRetaLimits.searchResults).map((row) => ({
          threadId: row.id,
          subject: row.subject ?? '(no subject)',
          sender: formatSender(row.sender),
          date: row.receivedOn ?? 'unknown',
        })),
      };
    }),

  // --- BYOK backend (slice 3A) ---------------------------------------------
  // The client only ever handles catalogue ids and provider names. NOTHING
  // sensitive crosses this boundary: no key echo, no ciphertext/iv/envelope
  // field, no upstream model mapping, no provider response body.

  /**
   * Catalogue + per-user status: which models exist, which are usable
   * (credential configured), which is selected. Non-sensitive metadata only.
   */
  modelCatalog: activeDriverProcedure.query(async ({ ctx }) => {
    const db = await getZeroDB(ctx.sessionUser.id);
    const [stored, credentials] = await Promise.all([
      db.findUserSettings(),
      db.listRetaByokCredentialStatus(),
    ]);
    // "Configured" = USABLE, exactly what selectModel will accept: CURRENT
    // consent version AND a kekVersion the operational ring can open. A
    // credential under a retired KEK or an older consent must never show as
    // configured/selectable only to fail at selection (release-tail fix).
    // Without a ring, every BYOK provider is unusable; Workers is unaffected.
    const ring = kekRingInfo();
    const vaultAvailable = ring !== null;
    const configured = new Set(
      credentials
        .filter(
          (c) =>
            c.consentVersion === RETA_BYOK_CONSENT_VERSION &&
            ring !== null &&
            ring.versions.includes(c.kekVersion),
        )
        .map((c) => c.provider),
    );
    const selected = resolveSelectedEntry(
      (stored?.settings as { askRetaModel?: unknown } | undefined)?.askRetaModel,
    );
    return {
      selectedModelId: selected.id,
      vaultAvailable,
      consentVersion: RETA_BYOK_CONSENT_VERSION,
      models: RETA_MODEL_CATALOGUE.map((entry) => ({
        id: entry.id,
        provider: entry.provider,
        label: entry.label,
        requiresCredential: entry.requiresCredential,
        configured: !entry.requiresCredential || configured.has(entry.provider),
      })),
    };
  }),

  /**
   * Store/rotate a provider API key. Requires EXPLICIT egress consent (fixed
   * literal) — the key is envelope-encrypted immediately and NEVER echoed,
   * hinted at, or persisted in any derived form (no suffix/length/prefix).
   */
  setCredential: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(10, '5m'),
        generatePrefix: () => 'ratelimit:copilot-byok-set',
        // Vault writes are fail-closed like every copilot write surface.
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(
      z.object({
        provider: byokProviderSchema,
        apiKey: z.string().min(8).max(512),
        acceptsMailboxEgress: z.literal(true),
        consentVersion: z.literal(RETA_BYOK_CONSENT_VERSION),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      // New envelopes are always wrapped under the ring's ACTIVE version.
      const ring = decodeKekRing(kekRingSecrets());
      if (!ring) throw vaultUnavailable();
      try {
        // AAD binds the envelope to THIS user+provider+row id: moved to any
        // other row/user/provider it fails closed at decrypt.
        const credentialId = crypto.randomUUID();
        const envelope = await encryptApiKey({
          apiKey: input.apiKey,
          kek: ring.keys.get(ring.activeVersion)!,
          kekVersion: ring.activeVersion,
          aad: {
            userId: ctx.sessionUser.id,
            provider: input.provider,
            credentialId,
          },
        });
        const db = await getZeroDB(ctx.sessionUser.id);
        await db.replaceRetaByokCredential({
          id: credentialId,
          provider: input.provider,
          ...envelope,
          consentVersion: input.consentVersion,
        });
        return { ok: true };
      } finally {
        zeroizeKekRing(ring);
      }
    }),

  /**
   * Remove a provider credential. ATOMIC with the model reset: if the current
   * selection points at this provider it falls back to the Workers default in
   * the same transaction — no window where a selected model has no key.
   */
  deleteCredential: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(10, '5m'),
        generatePrefix: () => 'ratelimit:copilot-byok-delete',
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(z.object({ provider: byokProviderSchema }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const db = await getZeroDB(ctx.sessionUser.id);
      // Reset set is SERVER-owned (catalogue ids of this provider).
      await db.deleteRetaByokCredentialAndResetModel(
        input.provider,
        catalogueIdsForProvider(input.provider),
        DEFAULT_CATALOGUE_ID,
      );
      return { ok: true };
    }),

  /**
   * Select the Ask Reta model. Only catalogue ids are accepted; a BYOK model
   * additionally requires the vault to be available AND the provider to be
   * configured. Workers models are always selectable.
   */
  selectModel: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(30, '5m'),
        generatePrefix: () => 'ratelimit:copilot-byok-select',
        key: 'userId',
        failClosed: true,
      }),
    )
    .input(z.object({ modelId: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }): Promise<{ selectedModelId: string }> => {
      const entry = findCatalogueEntry(input.modelId);
      if (!entry) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown Ask Reta model' });
      }
      const db = await getZeroDB(ctx.sessionUser.id);
      let supportedKekVersions: string[] = [];
      if (entry.requiresCredential) {
        const ring = kekRingInfo();
        if (!ring) throw vaultUnavailable();
        supportedKekVersions = ring.versions;
      }
      // Eligibility + selection happen in ONE ZeroDB transaction (TOCTOU
      // fix): the credential (existence + CURRENT consent + openable KEK
      // version) is checked under a row lock in the same transaction as the
      // settings write — a concurrent delete cannot leave an orphan
      // selection. The envelope never enters this route's scope.
      const result = await db.selectRetaModel({
        modelId: entry.id,
        provider: entry.requiresCredential ? entry.provider : null,
        requiredConsentVersion: RETA_BYOK_CONSENT_VERSION,
        supportedKekVersions,
      });
      if (!result.ok) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Provider not configured' });
      }
      return { selectedModelId: entry.id };
    }),
});
