import {
  deleteActiveConnection,
  FatalErrors,
  sanitizeContext,
  StandardizedError,
} from './utils';
import {
  DEFAULT_BACKOFF,
  withGmailBackoff,
  type BackoffDeps,
  type BackoffOptions,
} from './gmail-backoff';
import {
  assertBatchComplete,
  runBatched,
  RECOMMENDED_BATCH_SIZE,
  type BatchHttp,
  type BatchSubRequest,
} from './gmail-batch';
import { GOOGLE_OAUTH_SCOPE_STRING } from '../google-scopes';
import { type gmail_v1, gmail } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
import type { ManagerConfig } from './types';
import { logger } from '../logger';
import { env } from '../../env';

/** Dépendances injectables du transport (tests déterministes sans réseau ni timers). */
export interface GmailTransportDeps {
  batchHttp?: BatchHttp;
  backoff?: Partial<BackoffOptions>;
  backoffDeps?: Partial<BackoffDeps>;
  /** Sous-requêtes par POST batch (≤100 dur Gmail ; défaut 50 recommandé). */
  batchSize?: number;
  /** Concurrence bornée des POST batch. Défaut 5. */
  batchConcurrency?: number;
  /** Générateur d'ID de boundary (injectable pour déterminisme). */
  boundaryId?: () => string;
}

/**
 * GmailTransport — point UNIQUE d'exécution des requêtes Gmail HTTP du driver Google.
 *
 * Contrat #31 : chaque requête Gmail REST du driver est dispatchée via
 * {@link GmailTransport.execute}, qui applique désormais :
 *  - un COMPTEUR d'appels par cycle (round-trips HTTP), loggé via `lib/logger` ;
 *  - un BACKOFF exponentiel + jitter sur 429/403-rate/5xx (opt-in `retry` pour les
 *    lectures idempotentes ; les écritures — send/modify — ne sont JAMAIS rejouées),
 *    remplaçant la stratégie « flat 60 s » (lib/gmail-rate-limit.ts, hors périmètre).
 *
 * Pour le chemin chaud de sync (~2000 `threads.get`/cycle), le transport expose des
 * primitives de BATCH ({@link batchThreadsGet}, {@link batchMessagesGet},
 * {@link batchAttachmentsGet}) qui coalescent jusqu'à 50 sous-requêtes en UN POST
 * `multipart/mixed` → round-trips ⌈N/50⌉ ≤ 100/cycle. Le batch ne réduit pas le quota
 * (ruling gelé) — il divise les round-trips. L'interface `MailManager` reste INCHANGÉE ;
 * ces primitives sont internes au driver.
 */
export class GmailTransport {
  readonly auth: OAuth2Client;
  readonly gmail: gmail_v1.Gmail;

  private gmailCallCount = 0;
  private readonly batchHttp: BatchHttp;
  private readonly backoffOptions: BackoffOptions;
  private readonly backoffDeps: BackoffDeps;
  private readonly batchSize: number;
  private readonly batchConcurrency: number;
  private readonly boundaryId: () => string;

  constructor(
    public readonly config: ManagerConfig,
    deps: GmailTransportDeps = {},
  ) {
    this.auth = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

    if (config.auth)
      this.auth.setCredentials({
        refresh_token: config.auth.refreshToken,
        scope: this.getScope(),
      });

    this.gmail = gmail({ version: 'v1', auth: this.auth });

    this.backoffOptions = { ...DEFAULT_BACKOFF, ...deps.backoff };
    this.backoffDeps = {
      sleep: deps.backoffDeps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      random: deps.backoffDeps?.random ?? Math.random,
    };
    this.batchSize = Math.max(1, Math.min(deps.batchSize ?? RECOMMENDED_BATCH_SIZE, 100));
    this.batchConcurrency = Math.max(1, deps.batchConcurrency ?? 5);
    this.boundaryId = deps.boundaryId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    this.batchHttp = deps.batchHttp ?? this.defaultBatchHttp.bind(this);
  }

  public getScope(): string {
    return GOOGLE_OAUTH_SCOPE_STRING;
  }

  public getQuotaUser() {
    return this.config.auth?.email ? `${this.config.auth.email}-${env.NODE_ENV}` : undefined;
  }

  // --- Compteur d'appels par cycle (observabilité A5/A8) ---

  /** Nombre de round-trips HTTP Gmail émis depuis le dernier reset. */
  public getGmailCallCount(): number {
    return this.gmailCallCount;
  }

  /** Logge le compteur du cycle via `lib/logger` puis le remet à zéro. Retourne le total. */
  public logCycleCallCount(label?: string): number {
    const calls = this.gmailCallCount;
    logger.info('[GmailTransport] gmail api round-trips this cycle', {
      calls,
      ...(label ? { label } : {}),
      email: this.config.auth?.email,
    });
    this.gmailCallCount = 0;
    return calls;
  }

  /**
   * Exécute une requête Gmail HTTP unique. Compte le round-trip. Si `opts.retry` (lectures
   * idempotentes uniquement), applique le backoff expo + jitter sur 429/403-rate/5xx.
   */
  public execute<T>(
    fn: (gmail: gmail_v1.Gmail) => Promise<T>,
    opts?: { retry?: boolean },
  ): Promise<T> {
    const attempt = () => {
      this.gmailCallCount += 1;
      return fn(this.gmail);
    };
    if (!opts?.retry) return attempt();
    return withGmailBackoff(attempt, this.backoffOptions, this.backoffDeps);
  }

  // --- Batch HTTP (coalescing round-trips) ---

  private async defaultBatchHttp(req: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }): Promise<{ status: number; contentType: string | undefined; text: string }> {
    const client = this.auth as unknown as {
      request: (o: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body: string;
        responseType: 'text';
        validateStatus: () => boolean;
      }) => Promise<{ status: number; headers: Record<string, string | string[]>; data: string }>;
    };
    const res = await client.request({
      url: req.url,
      method: 'POST',
      headers: req.headers,
      body: req.body,
      responseType: 'text',
      validateStatus: () => true,
    });
    const ct = res.headers['content-type'];
    return {
      status: res.status,
      contentType: Array.isArray(ct) ? ct[0] : ct,
      text: typeof res.data === 'string' ? res.data : String(res.data ?? ''),
    };
  }

  /**
   * Dispatch un lot de sous-requêtes en POST batch via l'orchestrateur env-free
   * {@link runBatched} (chunk ≤`batchSize`, concurrence bornée, backoff par chunk). Chaque
   * chunk = 1 round-trip compté sur `gmailCallCount`. Alignées 1:1 sur `subRequests`.
   */
  private dispatchBatch(subRequests: BatchSubRequest[]) {
    return runBatched(subRequests, {
      batchHttp: this.batchHttp,
      boundaryId: this.boundaryId,
      onRoundTrip: () => {
        this.gmailCallCount += 1;
      },
      backoff: this.backoffOptions,
      backoffDeps: this.backoffDeps,
      batchSize: this.batchSize,
      concurrency: this.batchConcurrency,
    });
  }

  private quotaUserParam(): string {
    const q = this.getQuotaUser();
    return q ? `&quotaUser=${encodeURIComponent(q)}` : '';
  }

  /**
   * Récupère N threads en batch (⌈N/50⌉ round-trips). Résultat COMPLET (une entrée/thread)
   * ou {@link GmailBatchError} si une sous-réponse échoue après retries — jamais un
   * sous-ensemble silencieux.
   */
  public async batchThreadsGet(
    ids: readonly string[],
    format: 'full' | 'metadata' | 'minimal' = 'metadata',
  ): Promise<Map<string, gmail_v1.Schema$Thread>> {
    const subs: BatchSubRequest[] = ids.map((id) => ({
      method: 'GET',
      path: `/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=${format}${this.quotaUserParam()}`,
    }));
    const results = await this.dispatchBatch(subs);
    assertBatchComplete('threads.get', results, ids);
    const out = new Map<string, gmail_v1.Schema$Thread>();
    results.forEach((r, i) => out.set(ids[i], r.body as gmail_v1.Schema$Thread));
    return out;
  }

  /**
   * Récupère en batch les pièces jointes `(messageId, attachmentId)` (⌈N/50⌉ round-trips).
   * Résultat COMPLET (données base64url dans l'ordre) ou {@link GmailBatchError} si une
   * sous-réponse échoue après retries — jamais une PJ perdue en silence.
   */
  public async batchAttachmentsGet(
    refs: readonly { messageId: string; attachmentId: string }[],
  ): Promise<string[]> {
    const subs: BatchSubRequest[] = refs.map((r) => ({
      method: 'GET',
      path: `/gmail/v1/users/me/messages/${encodeURIComponent(r.messageId)}/attachments/${encodeURIComponent(r.attachmentId)}${this.getQuotaUser() ? `?quotaUser=${encodeURIComponent(this.getQuotaUser() as string)}` : ''}`,
    }));
    const results = await this.dispatchBatch(subs);
    assertBatchComplete(
      'messages.attachments.get',
      results,
      refs.map((r) => r.attachmentId),
    );
    return results.map((r) => (r.body as gmail_v1.Schema$MessagePartBody).data ?? '');
  }

  public async withErrorHandler<T>(
    operation: string,
    fn: () => Promise<T> | T,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await Promise.resolve(fn());
    } catch (error) {
      const err = error as Error & { code: string };
      const isFatal = FatalErrors.includes(err.message);
      logger.error(
        `[${isFatal ? 'FATAL_ERROR' : 'ERROR'}] [Gmail Driver] Operation: ${operation}`,
        {
          error: err.message,
          code: err.code,
          context: sanitizeContext(context),
          stack: err.stack,
          isFatal,
        },
      );
      if (isFatal) await deleteActiveConnection();
      throw new StandardizedError(err, operation, context);
    }
  }

  public withSyncErrorHandler<T>(
    operation: string,
    fn: () => T,
    context?: Record<string, unknown>,
  ): T {
    try {
      return fn();
    } catch (error) {
      const err = error as Error & { code: string };
      const isFatal = FatalErrors.includes(err.message);
      logger.error(`[Gmail Driver Error] Operation: ${operation}`, {
        error: err.message,
        code: err.code,
        context: sanitizeContext(context),
        stack: err.stack,
        isFatal,
      });
      if (isFatal) void deleteActiveConnection();
      throw new StandardizedError(err, operation, context);
    }
  }
}
