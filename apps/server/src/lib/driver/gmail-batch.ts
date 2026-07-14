/*
 * gmail-batch.ts — coalescing HTTP des requêtes Gmail (issue devlab-io/zero#31).
 *
 * Gmail expose un endpoint batch global `POST https://gmail.googleapis.com/batch/gmail/v1`
 * qui accepte jusqu'à 100 sous-requêtes (≤50 recommandé) dans une seule requête
 * `multipart/mixed`. Le batch NE RÉDUIT PAS le quota (ruling gelé) — il divise les
 * ROUND-TRIPS : ~2000 `threads.get` unitaires → ⌈2000/50⌉ = 40 POST batch ≤ 100/cycle.
 *
 * Ce module est ENV-FREE : build/parse/chunk purs + l'orchestrateur `runBatched`
 * (chunk + concurrence bornée + backoff + compteur), le tout injectable via `batchHttp`.
 * Aucun import `cloudflare:workers`/`env` → testable en Node vitest avec un fake, zéro
 * réseau. `GmailTransport` n'est qu'un adaptateur mince qui fournit auth + compteur réels.
 */
import {
  computeBackoffDelayMs,
  extractStatus,
  isRetryableGmailError,
  mapWithConcurrency,
  type BackoffDeps,
  type BackoffOptions,
} from './gmail-backoff';

export const GMAIL_BATCH_URL = 'https://gmail.googleapis.com/batch/gmail/v1';

/** Borne recommandée de sous-requêtes par POST batch (max dur Gmail = 100). */
export const RECOMMENDED_BATCH_SIZE = 50;

export interface BatchSubRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Chemin relatif, ex. `/gmail/v1/users/me/threads/ID?format=metadata`. */
  path: string;
  /** Corps JSON optionnel (POST/PUT). */
  body?: unknown;
}

export interface BatchPartResult<T = unknown> {
  status: number;
  body: T | undefined;
  contentId?: string;
}

/** Découpe `arr` en tranches de taille `size` (≥1). Pur. */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const bound = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += bound) out.push(arr.slice(i, i + bound));
  return out;
}

/**
 * Construit le corps `multipart/mixed` d'un batch. Chaque partie porte un `Content-ID`
 * `<item-INDEX>` pour corréler la réponse. Pur, déterministe pour un `boundary` donné.
 */
export function buildBatchBody(subRequests: readonly BatchSubRequest[], boundary: string): string {
  const parts = subRequests.map((req, i) => {
    const lines = [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <item-${i}>`,
      '',
      `${req.method} ${req.path}`,
    ];
    if (req.body !== undefined) {
      const json = JSON.stringify(req.body);
      lines.push('Content-Type: application/json', '', json);
    } else {
      lines.push('');
    }
    return lines.join('\r\n');
  });
  return parts.join('\r\n') + `\r\n--${boundary}--\r\n`;
}

/** Extrait le `boundary` d'un en-tête `Content-Type: multipart/mixed; boundary=...`. Pur. */
export function extractBoundary(contentType: string | undefined | null): string | undefined {
  if (!contentType) return undefined;
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  return m ? (m[1] ?? m[2]) : undefined;
}

/**
 * Parse une réponse batch `multipart/mixed`. Préserve l'ordre des sous-requêtes (Gmail
 * garantit l'ordre) ; corrèle aussi via `Content-ID` (`response-item-N`) quand présent.
 * Pur, tolérant : une partie illisible devient `{ status: 0, body: undefined }`.
 */
export function parseBatchResponse(text: string, boundary: string): BatchPartResult[] {
  const delimiter = `--${boundary}`;
  const segments = text
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '--');

  return segments.map((segment) => {
    const contentIdMatch = segment.match(/Content-ID:\s*<?(?:response-)?item-(\d+)>?/i);
    const contentId = contentIdMatch ? `item-${contentIdMatch[1]}` : undefined;

    const statusMatch = segment.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : 0;

    // Le corps JSON commence après la ligne vide qui suit les en-têtes HTTP internes.
    let body: unknown = undefined;
    const jsonStart = segment.search(/\r?\n\r?\n\s*[{[]/);
    if (jsonStart !== -1) {
      const rawBody = segment.slice(jsonStart).trim();
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = undefined;
      }
    }
    return { status, body, contentId };
  });
}

/**
 * Réordonne les parties selon l'index `Content-ID` quand disponible, sinon garde l'ordre
 * positionnel. Garantit `results[i]` ↔ `subRequests[i]`. Pur.
 */
export function alignBatchResults(
  results: readonly BatchPartResult[],
  expected: number,
): BatchPartResult[] {
  const aligned = new Array<BatchPartResult>(expected);
  let positional = 0;
  for (const r of results) {
    const idx = r.contentId ? Number(r.contentId.replace('item-', '')) : positional;
    if (Number.isInteger(idx) && idx >= 0 && idx < expected) aligned[idx] = r;
    positional += 1;
  }
  for (let i = 0; i < expected; i++) {
    if (!aligned[i]) aligned[i] = { status: 0, body: undefined };
  }
  return aligned;
}

/** Dispatch HTTP brut d'un POST batch (injectable — fake en test, `auth.request` en prod). */
export type BatchHttp = (req: {
  url: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; contentType: string | undefined; text: string }>;

export interface BatchRunDeps {
  batchHttp: BatchHttp;
  /** Génère l'ID de boundary (injectable pour déterminisme). */
  boundaryId: () => string;
  /** Appelé une fois par POST batch (= 1 round-trip HTTP) → compteur du transport. */
  onRoundTrip: () => void;
  backoff: BackoffOptions;
  backoffDeps: BackoffDeps;
  /** Sous-requêtes par POST (≤100 dur Gmail ; 50 recommandé). */
  batchSize: number;
  /** Concurrence bornée des POST batch. */
  concurrency: number;
}

/** Vrai si le status HTTP est un succès 2xx. */
export function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Échec batch explicite : au moins une sous-requête reste non-2xx après tous les retries.
 * Levée par les wrappers typés du transport pour interdire tout sous-ensemble silencieux.
 */
export class GmailBatchError extends Error {
  constructor(
    public readonly operation: string,
    public readonly failures: { ref: string; status: number }[],
  ) {
    super(
      `Gmail batch ${operation}: ${failures.length} sub-request(s) failed after retries: ` +
        failures
          .slice(0, 10)
          .map((f) => `${f.ref}=${f.status}`)
          .join(', '),
    );
    this.name = 'GmailBatchError';
  }
}

/**
 * Interdit tout sous-ensemble silencieux : lève un {@link GmailBatchError} nommant chaque
 * sous-réponse restée non-2xx (après retries). `refs[i]` identifie la sous-requête `i`.
 * Pur — testable sans réseau ni env ; utilisé par les wrappers typés du transport.
 */
export function assertBatchComplete(
  operation: string,
  results: readonly BatchPartResult[],
  refs: readonly string[],
): void {
  const failures = results
    .map((r, i) => (isOk(r.status) ? null : { ref: refs[i], status: r.status }))
    .filter((f): f is { ref: string; status: number } => f !== null);
  if (failures.length > 0) throw new GmailBatchError(operation, failures);
}

/**
 * Orchestrateur de batch : découpe en chunks ≤ `batchSize`, dispatche avec concurrence
 * bornée, compte chaque POST (round-trip). Gère la résilience à DEUX niveaux :
 *  - échec HTTP EXTERNE (429/5xx sur le POST) → toutes les sous-parties du chunk retryées ;
 *    externe non-retryable → propagation immédiate (aucune perte silencieuse) ;
 *  - échec de SOUS-RÉPONSE (Gmail renvoie 200 multipart avec des parties 429/403-rate/5xx)
 *    → SEULES les sous-parties retryables sont re-batchées, backoff expo entre tentatives.
 * Retourne les parties alignées 1:1 sur `subRequests` (les non-2xx exhaustés/non-retryables
 * y figurent avec leur status réel — c'est aux wrappers typés d'échouer explicitement).
 * ENV-FREE (tout passe par `deps.batchHttp`) : moteur réel du transport, testable au fake.
 */
export async function runBatched(
  subRequests: readonly BatchSubRequest[],
  deps: BatchRunDeps,
): Promise<BatchPartResult[]> {
  const results = new Array<BatchPartResult>(subRequests.length);
  let pending = subRequests.map((_, i) => i);

  for (let attempt = 0; pending.length > 0; attempt++) {
    const chunks = chunk(pending, deps.batchSize);
    const dispatched = await mapWithConcurrency(chunks, deps.concurrency, async (idxChunk) => {
      const reqs = idxChunk.map((i) => subRequests[i]);
      deps.onRoundTrip();
      const boundary = `batch_${deps.boundaryId()}`;
      const body = buildBatchBody(reqs, boundary);
      try {
        const res = await deps.batchHttp({
          url: GMAIL_BATCH_URL,
          headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
          body,
        });
        if (isRetryableGmailError({ code: res.status })) {
          // Échec externe retryable → chaque sous-partie hérite du status pour re-batch.
          return { idxChunk, parsed: reqs.map(() => ({ status: res.status, body: undefined })) };
        }
        const respBoundary = extractBoundary(res.contentType) ?? boundary;
        return {
          idxChunk,
          parsed: alignBatchResults(parseBatchResponse(res.text, respBoundary), reqs.length),
        };
      } catch (err) {
        // Externe non-retryable → propagation (pas de perte silencieuse).
        if (!isRetryableGmailError(err)) throw err;
        const status = extractStatus(err) ?? 503;
        return { idxChunk, parsed: reqs.map(() => ({ status, body: undefined })) };
      }
    });

    const nextPending: number[] = [];
    for (const { idxChunk, parsed } of dispatched) {
      idxChunk.forEach((origIdx, j) => {
        const part = parsed[j];
        results[origIdx] = part;
        if (isRetryableGmailError({ code: part.status }) && attempt < deps.backoff.maxRetries) {
          nextPending.push(origIdx);
        }
      });
    }

    if (nextPending.length === 0) break;
    await deps.backoffDeps.sleep(
      computeBackoffDelayMs(attempt, deps.backoff, deps.backoffDeps.random),
    );
    pending = nextPending;
  }

  return results;
}
