import {
  askRetaLimits,
  askRetaPlanJsonSchema,
  askRetaPlanSchema,
  askRetaSynthesisJsonSchema,
  askRetaSynthesisSchema,
  type AskRetaCitation,
  type AskRetaInput,
  type AskRetaMessageCitation,
  type AskRetaPlan,
  type AskRetaResult,
  type AskRetaSource,
  type AskRetaStep,
} from './schema';
import {
  askRetaPlanSystemPrompt,
  askRetaPlanUserPrompt,
  askRetaSynthesisSystemPrompt,
  askRetaSynthesisUserPrompt,
} from './prompts';
import {
  containsSanitizerMarker,
  sanitizeMailContent,
  stripSanitizerMarkers,
} from '../mail-sanitize';
import type { IGetThreadResponse, ThreadsResponse } from '@zero/types';
import { normalizeEmailRewriteHtml } from '../rewrite-email';
import { extractJsonObject, type RetaModel } from './model';
import { AskRetaAbortedError } from './errors';
import sanitizeHtml from 'sanitize-html';
import { logger } from '../logger';
import { z } from 'zod';

/**
 * Typed failure classification (tour 06): every terminal pipeline failure is
 * an AskRetaPhaseError carrying ONLY a phase and a kind — the message is a
 * FIXED template of those two enums. No question text, mail content, ids,
 * SQL, URLs, keys or raw upstream messages ever enter it: a production tail
 * shows exactly WHERE the pipeline broke and WHAT CLASS of failure it was,
 * and nothing else.
 */
export type AskRetaPhase = 'plan' | 'overview' | 'search' | 'read' | 'synthesis' | 'finalize';
export type AskRetaFailureKind = 'provider' | 'dependency' | 'schema' | 'deadline' | 'unknown';

export class AskRetaPhaseError extends Error {
  constructor(
    public readonly phase: AskRetaPhase,
    public readonly kind: AskRetaFailureKind,
  ) {
    super(`Ask Reta failed (phase=${phase} kind=${kind})`);
    this.name = 'AskRetaPhaseError';
  }
}

/**
 * Ask Reta pipeline — bounded plan → retrieve → synthesize (spec
 * docs/spec/mail-copilot.md). Retrieval is READ-ONLY by construction: the
 * dependency surface below simply has no mutating capability. Sources are
 * server-generated; the model only ever handles opaque refs, so a citation
 * outside the retrieved set cannot exist in the result.
 */
export interface AskRetaDeps {
  model: RetaModel;
  /** Exact folder counts + send activity (never model-estimated). */
  overview(): Promise<unknown>;
  /** Literal metadata search over ALL the connection's shards (multi-shard helper). */
  searchThreads(params: {
    query: string;
    folder?: string;
    maxResults: number;
  }): Promise<ThreadsResponse>;
  /** Full thread (bodies), resolved across shards; throws when not owned/found. */
  readThread(threadId: string): Promise<IGetThreadResponse>;
  signal?: AbortSignal;
  /** Wall-clock budget for the whole ask; expired → AskRetaAbortedError. */
  deadlineMs?: number;
  /** Streaming hook: fired as each retrieval step COMPLETES (slice 2). */
  onStep?: (step: AskRetaStep) => void;
}

// Re-exported for existing consumers; the class (and the honest cancellation
// contract) lives in ./errors.
export { AskRetaAbortedError } from './errors';

/** Canonical Ask Reta wall-clock budget — shared by the pipeline race AND the
 * transport-level AbortController (review 02-2: a race rejection alone left
 * the underlying operation running until an unrelated 60s belt). */
export const ASK_RETA_DEADLINE_MS = 45_000;
const DEFAULT_DEADLINE_MS = ASK_RETA_DEADLINE_MS;

/** Re-checked after EVERY await (model, overview, search, thread read). */
type Budget = { signal?: AbortSignal; deadline: number };

const checkBudget = (budget: Budget) => {
  if (budget.signal?.aborted) throw new AskRetaAbortedError('aborted');
  if (Date.now() > budget.deadline) throw new AskRetaAbortedError('deadline');
};

/**
 * Budget race — honest contract (review 02-cancel-contract): on deadline or
 * abort, THE PIPELINE'S WAIT is interrupted immediately (no further step, no
 * further dependency call, late results discarded). The dependency ALREADY
 * DISPATCHED is not killed when its API has no abort contract (Workers AI,
 * DO RPC): it may run to completion on the Cloudflare side — abandoned here.
 */
const withBudget = async <T>(budget: Budget, run: () => Promise<T>): Promise<T> => {
  checkBudget(budget);
  const remaining = Math.max(0, budget.deadline - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AskRetaAbortedError('deadline')), remaining);
  });
  // The abort signal joins the race via a once-listener: the WAIT ends
  // immediately on cancel instead of sitting out the dependency.
  const aborted = new Promise<never>((_, reject) => {
    const signal = budget.signal;
    if (!signal) return; // never settles — the race ignores it
    const onAbort = () => reject(new AskRetaAbortedError('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  try {
    const running = run();
    // The abandoned dependency may settle (or FAIL) long after the race is
    // lost — its late rejection must never surface as unhandled.
    running.catch(() => {});
    const result = await Promise.race([running, expiry, aborted]);
    if (budget.signal?.aborted) throw new AskRetaAbortedError('aborted');
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    removeAbortListener?.();
  }
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'about',
  'what',
  'when',
  'who',
  'how',
  'did',
  'does',
  'is',
  'are',
  'was',
  'were',
  'my',
  'me',
  'i',
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'et',
  'ou',
  'que',
  'qui',
  'quoi',
  'quand',
  'comment',
  'est',
  'sont',
  'dans',
  'sur',
  'pour',
  'avec',
  'mon',
  'ma',
  'mes',
  'quel',
  'quelle',
  'quels',
  'quelles',
  'dernier',
  'derniere',
  // Mailbox-generic noise: never discriminating inside a mail client.
  'from',
  'many',
  'email',
  'emails',
  'mail',
  'mails',
  'courriel',
  'courriels',
  'message',
  'messages',
  // Recency/inbox vocabulary (tour 09): these words describe the RETRIEVAL
  // intent, not content — searching them literally matches nothing.
  'expediteur',
  'expediteurs',
  'reception',
  'boite',
  'inbox',
  'sender',
  'senders',
  'recent',
  'recents',
  'recente',
  'recentes',
  'derniers',
  'dernieres',
  'latest',
  'last',
  'visible',
  'visibles',
]);

const stripDiacritics = (word: string) => word.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * The DO search is ONE literal (folded) LIKE over subject/sender — a joined
 * multi-word phrase matches nothing. The fallback therefore picks single
 * discriminating TERMS: emails/numbers first, then longest, stable order.
 */
export const fallbackSearchTerms = (question: string, count: number): string[] => {
  const tokens = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.\-\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(stripDiacritics(word)));
  const unique = [...new Set(tokens)];
  const score = (word: string) =>
    (word.includes('@') ? 1_000 : 0) + (/\d/.test(word) ? 500 : 0) + word.length;
  return unique
    .map((word, index) => ({ word, index, score: score(word) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.word);
};

/**
 * Deterministic fallback query: the single most discriminating term, or ''
 * when the question has none. NEVER the raw phrase (re-review P2): a joined
 * sentence matches nothing in the literal LIKE and leaks the question.
 */
export const fallbackSearchQuery = (question: string): string =>
  fallbackSearchTerms(question, 1)[0] ?? '';

const COUNT_QUESTION = /\bcombien\b|\bhow many\b|\bcount\b|\bnombre\b|\bunread\b|\bnon lus?\b/i;

/** Recency intent (tour 09): latest/most-recent questions, FR and EN. */
const RECENCY_QUESTION =
  /\b(r[ée]cents?|r[ée]centes?|derni[eè]rs?|derni[eè]res?|latest|most recent|newest)\b|\blast\s+(email|emails|mail|mails|message|messages|sender|senders)\b/i;

/**
 * The recency LISTING only fires when the question is about the mailbox
 * stream itself (inbox/senders/messages) — « la dernière facture Balguerie »
 * stays a literal search (already ordered latest-first by the projection).
 */
const RECENT_LISTING_HINT =
  /\b(bo[îi]te|r[ée]ception|inbox|exp[ée]diteurs?|senders?|messages?|emails?|mails?|courriels?)\b/i;

/**
 * Negative guard (revue Codex, tour 11) : toute demande de CONTENU — résumé,
 * corps, « que dit », rédaction/réponse — exige des preuves MESSAGE. NB :
 * « cite » seul n'y figure pas (citer ses sources est compatible metadata).
 */
const CONTENT_DEMAND =
  /\b(r[ée]sum[ée]?s?|r[ée]sumer|contenus?|corps|dit|disent|parlent?|say|says|said|talk(s|ing)? about|content|body|bodies|summar(y|ies|ize|ise|izing)|extraits?|excerpts?|r[ée]pond(re|s|ez)?|r[ée]ponses?|reply|draft|r[ée]dige[rz]?|write)\b/i;

/**
 * Prédicat DÉTERMINISTE du court-circuit metadata (tour 11) : dérivé de la
 * QUESTION uniquement — jamais du plan choisi par le modèle. Vrai seulement
 * pour une question de récence STRICTEMENT metadata (qui/quand : expéditeurs,
 * flux de la boîte) SANS demande de contenu/résumé/corps/action.
 */
export const isStrictRecentMetadataQuestion = (question: string): boolean =>
  RECENCY_QUESTION.test(question) &&
  RECENT_LISTING_HINT.test(question) &&
  !CONTENT_DEMAND.test(question);

export const fallbackPlan = (input: AskRetaInput): AskRetaPlan => {
  const terms = fallbackSearchTerms(input.question, askRetaLimits.searchesPerAsk);
  const actions: AskRetaPlan['actions'] = [];
  // Recency questions ("les 3 expéditeurs les plus récents", "latest
  // senders") are a RETRIEVAL intent, not a literal needle: list the most
  // recent inbox threads then READ the top results so the answer can cite
  // real messages. A remaining discriminating term still gets its search.
  if (RECENCY_QUESTION.test(input.question) && RECENT_LISTING_HINT.test(input.question)) {
    if (isStrictRecentMetadataQuestion(input.question)) {
      // Tour 10 : la réponse de récence est METADATA et déterministe — le
      // listing seul suffit (zéro corps lu, zéro appel de synthèse, plus vite).
      actions.push({
        type: 'list_recent',
        folder: input.context.folder ?? 'inbox',
        limit: askRetaLimits.threadsRead,
      });
      return { actions: actions.slice(0, askRetaLimits.planActions) };
    }
    // Tour 11 : demande de CONTENU récent (« résume mes derniers emails ») —
    // le listing fournit les fils, la LECTURE fournit les preuves message,
    // la synthèse tourne normalement.
    actions.push({
      type: 'list_recent',
      folder: input.context.folder ?? 'inbox',
      limit: askRetaLimits.threadsRead,
    });
    actions.push({ type: 'read_thread', target: 'top_results' });
    if (terms[0])
      actions.push({
        type: 'search',
        query: terms[0],
        ...(input.context.folder ? { folder: input.context.folder } : {}),
      });
    return { actions: actions.slice(0, askRetaLimits.planActions) };
  }
  if (input.context.selectedThreadIds.length) {
    actions.push({ type: 'read_thread', target: 'selected' });
  }
  if (COUNT_QUESTION.test(input.question)) actions.push({ type: 'overview' });
  // No discriminating token → the search is OMITTED (an empty plan yields the
  // insufficient-evidence answer); the full phrase is never reused as a query.
  if (terms[0])
    actions.push({
      type: 'search',
      query: terms[0],
      ...(input.context.folder ? { folder: input.context.folder } : {}),
    });
  if (input.context.threadId) actions.push({ type: 'read_thread', target: 'open' });
  if (terms[1]) actions.push({ type: 'search', query: terms[1] });
  return { actions: actions.slice(0, askRetaLimits.planActions) };
};

/** Enforce every plan cap; an ill-formed plan degrades, it never throws. */
export const normalizePlan = (plan: AskRetaPlan, input: AskRetaInput): AskRetaPlan => {
  const actions: AskRetaPlan['actions'] = [];
  let searches = 0;
  let hasOverview = false;
  for (const action of plan.actions) {
    if (actions.length >= askRetaLimits.planActions) break;
    if (action.type === 'overview') {
      if (hasOverview) continue;
      hasOverview = true;
      actions.push(action);
    } else if (action.type === 'search') {
      if (searches >= askRetaLimits.searchesPerAsk) continue;
      searches += 1;
      actions.push(action);
    } else if (action.type === 'list_recent') {
      // Shares the search budget (it IS a listing retrieval) and produces
      // top results a read_thread can consume. Limit hard-clamped 1..10.
      if (searches >= askRetaLimits.searchesPerAsk) continue;
      searches += 1;
      actions.push({
        type: 'list_recent',
        ...(action.folder ? { folder: action.folder } : {}),
        limit: Math.min(Math.max(action.limit ?? askRetaLimits.threadsRead, 1), 10),
      });
    } else if (action.type === 'read_thread') {
      if (action.target === 'open' && !input.context.threadId) continue;
      if (action.target === 'selected' && input.context.selectedThreadIds.length === 0) continue;
      if (action.target === 'top_results' && searches === 0) continue;
      if (actions.some((a) => a.type === 'read_thread' && a.target === action.target)) continue;
      actions.push(action);
    }
  }
  if (actions.length === 0) return fallbackPlan(input);
  return { actions };
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const formatSender = (sender?: { name?: string; email?: string }) =>
  sender ? `${sender.name ?? ''} <${sender.email ?? 'unknown'}>`.trim() : 'unknown';

const excerptOf = (value: string) =>
  value.replace(/\s+/g, ' ').trim().slice(0, askRetaLimits.excerptChars);

type Gathered = {
  sources: AskRetaSource[];
  steps: AskRetaStep[];
  overviewJson: string | null;
  /** Set ONLY after the open thread was read successfully within this connection. */
  validatedOpenThreadId: string | null;
  /** First list_recent execution of this run — feeds the deterministic
   * metadata answer (tour 10). */
  recentListing: { folder?: string; limit: number; refs: string[] } | null;
};

const addSource = async (
  gathered: Gathered,
  source: Omit<AskRetaSource, 'ref' | 'excerptHash'>,
): Promise<AskRetaSource> => {
  const ref = `s${gathered.sources.length + 1}`;
  const full: AskRetaSource = {
    ...source,
    ref,
    excerpt: excerptOf(source.excerpt),
    excerptHash: await sha256Hex(excerptOf(source.excerpt)),
  };
  gathered.sources.push(full);
  return full;
};

const readOneThread = async (
  deps: AskRetaDeps,
  budget: Budget,
  gathered: Gathered,
  threadId: string,
): Promise<{ refs: string[]; found: boolean }> => {
  let thread: IGetThreadResponse;
  try {
    thread = await withBudget(budget, () => deps.readThread(threadId));
  } catch (error) {
    if (error instanceof AskRetaAbortedError) throw error;
    // Never the raw thread id in logs — its length is enough to correlate.
    logger.warn('[ask-reta] readThread failed', { threadIdLength: threadId.length });
    return { refs: [], found: false };
  }
  checkBudget(budget);
  const refs: string[] = [];
  const messages = (thread.messages ?? [])
    .filter((message) => !message.isDraft)
    .slice(-askRetaLimits.messagesPerThread);
  for (const message of messages) {
    // Sanitizer markers are NOT mailbox content: stripped from citable text so
    // they can never satisfy the evidence floor (re-review 3, P1).
    const text = stripSanitizerMarkers(
      sanitizeMailContent(message.decodedBody ?? message.body ?? '').text,
    );
    if (!text.trim()) continue;
    const source = await addSource(gathered, {
      kind: 'message',
      threadId,
      messageId: message.id,
      subject: message.subject ?? '(no subject)',
      sender: formatSender(message.sender),
      date: message.receivedOn ?? 'unknown',
      excerpt: text,
    });
    checkBudget(budget);
    refs.push(source.ref);
  }
  return { refs, found: messages.length > 0 };
};

const executePlan = async (
  deps: AskRetaDeps,
  budget: Budget,
  input: AskRetaInput,
  plan: AskRetaPlan,
): Promise<Gathered> => {
  const gathered: Gathered = {
    sources: [],
    steps: [],
    overviewJson: null,
    validatedOpenThreadId: null,
    recentListing: null,
  };
  let topResultIds: string[] = [];

  // Streamed as it completes; a listener failure must never break the ask.
  const pushStep = (step: AskRetaStep) => {
    gathered.steps.push(step);
    try {
      deps.onStep?.(step);
    } catch {
      logger.warn('[ask-reta] onStep listener failed');
    }
  };

  const phaseOfAction = (action: AskRetaPlan['actions'][number]): AskRetaPhase =>
    action.type === 'overview' ? 'overview' : action.type === 'read_thread' ? 'read' : 'search';

  let failedActions = 0;
  let firstFailurePhase: AskRetaPhase | null = null;

  for (const action of plan.actions) {
    checkBudget(budget);
    // Per-action containment (tour 06): ONE failing search/read/overview must
    // not kill the ask when other actions can still gather evidence. The
    // failure surfaces as an honest fixed-detail step; deadlines/abort stay
    // STRICT (rethrown immediately, never degraded).
    try {
      await runPlanAction(action);
    } catch (error) {
      if (error instanceof AskRetaAbortedError) throw error;
      failedActions += 1;
      firstFailurePhase ??= phaseOfAction(action);
      // FIXED classification only — never the query, ids or upstream message.
      logger.warn('[ask-reta] action failed', {
        phase: phaseOfAction(action),
        kind: 'dependency',
      });
      pushStep({
        kind:
          action.type === 'read_thread'
            ? 'read_thread'
            : action.type === 'overview'
              ? 'overview'
              : 'search',
        detail:
          action.type === 'overview'
            ? 'mailbox overview unavailable'
            : action.type === 'read_thread'
              ? 'thread read unavailable'
              : 'search unavailable',
        sourceRefs: [],
      });
    }
  }

  // At least one action FAILED and NOTHING was gathered (no sources, no
  // overview): retrieval was at least partly down and there is zero evidence
  // either way — surface a TYPED failure. Answering "insufficient evidence"
  // here would be a false statement about the mailbox (an outage dressed up
  // as a confident empty result).
  if (failedActions > 0 && gathered.sources.length === 0 && gathered.overviewJson === null) {
    throw new AskRetaPhaseError(firstFailurePhase ?? 'search', 'dependency');
  }

  return gathered;

  async function runPlanAction(action: AskRetaPlan['actions'][number]): Promise<void> {
    if (action.type === 'overview') {
      const overview = await withBudget(budget, () => deps.overview());
      checkBudget(budget);
      gathered.overviewJson = JSON.stringify(overview);
      pushStep({ kind: 'overview', detail: 'exact mailbox counts', sourceRefs: [] });
    } else if (action.type === 'list_recent') {
      // Recency retrieval (tour 09): empty query = pure folder listing,
      // ordered latest-received first by the projection. READ-ONLY, bounded.
      const limit = Math.min(Math.max(action.limit ?? askRetaLimits.threadsRead, 1), 10);
      const response = await withBudget(budget, () =>
        deps.searchThreads({ query: '', folder: action.folder, maxResults: limit }),
      );
      checkBudget(budget);
      const rows = response.threads.slice(0, limit);
      if (topResultIds.length === 0) topResultIds = rows.map((row) => row.id);
      const refs: string[] = [];
      for (const row of rows) {
        const source = await addSource(gathered, {
          kind: 'metadata',
          threadId: row.id,
          subject: row.subject ?? '(no subject)',
          sender: formatSender(row.sender),
          date: row.receivedOn ?? 'unknown',
          excerpt: `${row.subject ?? '(no subject)'} — ${formatSender(row.sender)}`,
        });
        checkBudget(budget);
        refs.push(source.ref);
      }
      gathered.recentListing ??= {
        ...(action.folder ? { folder: action.folder } : {}),
        limit,
        refs,
      };
      pushStep({
        kind: 'search',
        // FIXED detail shape: canonical folder token + count, nothing user-derived.
        detail: `recent ${action.folder ?? 'all'} → ${rows.length} threads`,
        sourceRefs: refs,
        search: {
          query: '',
          ...(action.folder ? { folder: action.folder } : {}),
          threads: rows.map((row) => ({
            threadId: row.id,
            subject: row.subject ?? '(no subject)',
            sender: formatSender(row.sender),
            date: row.receivedOn ?? 'unknown',
          })),
        },
      });
    } else if (action.type === 'search') {
      const response = await withBudget(budget, () =>
        deps.searchThreads({
          query: action.query,
          folder: action.folder,
          maxResults: askRetaLimits.searchResults,
        }),
      );
      checkBudget(budget);
      const rows = response.threads.slice(0, askRetaLimits.searchResults);
      if (topResultIds.length === 0) topResultIds = rows.map((row) => row.id);
      const refs: string[] = [];
      for (const row of rows) {
        const source = await addSource(gathered, {
          kind: 'metadata',
          threadId: row.id,
          subject: row.subject ?? '(no subject)',
          sender: formatSender(row.sender),
          date: row.receivedOn ?? 'unknown',
          excerpt: `${row.subject ?? '(no subject)'} — ${formatSender(row.sender)}`,
        });
        checkBudget(budget);
        refs.push(source.ref);
      }
      pushStep({
        kind: 'search',
        detail: `"${action.query}"${action.folder ? ` in ${action.folder}` : ''} → ${rows.length} threads`,
        sourceRefs: refs,
        // The EXACT metadata set + the visible/replayable query (slice 2).
        search: {
          query: action.query,
          ...(action.folder ? { folder: action.folder } : {}),
          threads: rows.map((row) => ({
            threadId: row.id,
            subject: row.subject ?? '(no subject)',
            sender: formatSender(row.sender),
            date: row.receivedOn ?? 'unknown',
          })),
        },
      });
    } else {
      // Bounded productive scan (tour 09): a thread whose bodies are empty
      // yields no message source — keep reading the NEXT candidates, capped
      // at 2× threadsRead scanned and threadsRead PRODUCTIVE reads.
      const scanCap = askRetaLimits.threadsRead * 2;
      const targets =
        action.target === 'open'
          ? input.context.threadId
            ? [input.context.threadId]
            : []
          : action.target === 'selected'
            ? input.context.selectedThreadIds.slice(0, scanCap)
            : topResultIds.slice(0, scanCap);
      const refs: string[] = [];
      let productiveReads = 0;
      let scanned = 0;
      for (const threadId of targets) {
        if (productiveReads >= askRetaLimits.threadsRead) break;
        checkBudget(budget);
        scanned += 1;
        const read = await readOneThread(deps, budget, gathered, threadId);
        refs.push(...read.refs);
        if (read.refs.length > 0) productiveReads += 1;
        // Reply proposals may only target an open thread PROVEN readable
        // within this connection — a forged id never validates.
        if (action.target === 'open' && read.found && threadId === input.context.threadId) {
          gathered.validatedOpenThreadId = threadId;
        }
      }
      pushStep({
        kind: 'read_thread',
        detail:
          action.target === 'open'
            ? 'read the open thread'
            : action.target === 'selected'
              ? `read ${Math.min(scanned, scanCap)} selected threads`
              : `read top ${Math.min(scanned, scanCap)} results`,
        sourceRefs: refs,
      });
    }
  }
};

const getPlan = async (
  deps: AskRetaDeps,
  budget: Budget,
  input: AskRetaInput,
): Promise<AskRetaPlan> => {
  let raw: string;
  try {
    raw = await withBudget(budget, () =>
      deps.model.complete({
        system: askRetaPlanSystemPrompt(),
        user: askRetaPlanUserPrompt(input),
        maxTokens: 400,
        temperature: 0.1,
        signal: deps.signal,
        jsonSchema: askRetaPlanJsonSchema,
      }),
    );
  } catch (error) {
    if (error instanceof AskRetaAbortedError) throw error;
    // FIXED classification only — never the question or the upstream message.
    logger.warn('[ask-reta] plan call failed, using fallback plan', {
      phase: 'plan',
      kind: 'provider',
    });
    checkBudget(budget);
    return fallbackPlan(input);
  }
  checkBudget(budget);
  const parsed = askRetaPlanSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    logger.warn('[ask-reta] plan output rejected, using fallback plan', {
      phase: 'plan',
      kind: 'schema',
    });
    return fallbackPlan(input);
  }
  return normalizePlan(parsed.data, input);
};

/**
 * The model is instructed to return a PLAIN TEXT proposal body. Any markup in
 * it is suspect: sanitize-html drops tags AND script/style content, the result
 * (entity-safe text) is paragraphized, then the standard email sanitizer runs
 * as the final gate — no double escaping, no surviving markup.
 */
export const proposalBodyToHtml = (body: string): string => {
  const text = sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).trim();
  const html = text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br />')}</p>`)
    .join('');
  return normalizeEmailRewriteHtml(html);
};

const getSynthesis = async (
  deps: AskRetaDeps,
  budget: Budget,
  input: AskRetaInput,
  gathered: Gathered,
) => {
  const sourcesJson = JSON.stringify(
    gathered.sources.map(({ ref, kind, subject, sender, date, excerpt }) => ({
      ref,
      kind,
      subject,
      sender,
      date,
      excerpt,
    })),
  );
  const user = askRetaSynthesisUserPrompt({
    input,
    overviewJson: gathered.overviewJson,
    sourcesJson,
  });

  // NEVER fatal (tour 06): an unavailable or twice-malformed synthesis
  // returns null — the caller degrades to a DETERMINISTIC grounded result
  // built from what was actually retrieved. Deadlines/abort stay strict.
  for (const attempt of [0, 1]) {
    checkBudget(budget);
    let raw: string;
    try {
      raw = await withBudget(budget, () =>
        deps.model.complete({
          system: askRetaSynthesisSystemPrompt(),
          user:
            attempt === 0
              ? user
              : `${user}\n\nREMINDER: return ONLY the JSON object described by the system prompt.`,
          maxTokens: 1_400,
          temperature: 0.2,
          signal: deps.signal,
          jsonSchema: askRetaSynthesisJsonSchema,
        }),
      );
    } catch (error) {
      if (error instanceof AskRetaAbortedError) throw error;
      // FIXED classification only — no upstream message, no content.
      logger.warn('[ask-reta] synthesis call failed', { phase: 'synthesis', kind: 'provider' });
      continue;
    }
    checkBudget(budget);
    const parsed = askRetaSynthesisSchema.safeParse(extractJsonObject(raw));
    if (parsed.success) return parsed.data;
    logger.warn('[ask-reta] synthesis output rejected', { phase: 'synthesis', kind: 'schema' });
  }
  return null;
};

const normalizeForQuoteMatch = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Served VERBATIM when a mailbox answer (beyond pure overview counts) has zero
 * valid citations: the assistant must say so instead of sounding grounded.
 */
export const INSUFFICIENT_EVIDENCE_ANSWER =
  "Preuve insuffisante dans la boîte pour fonder cette réponse — précisez l'expéditeur, le sujet ou la période. (Insufficient mailbox evidence to ground this answer.)";

/** Served when only a draft proposal exists — a proposal is reviewable, not proof. */
export const PROPOSAL_ONLY_ANSWER =
  'Brouillon proposé ci-dessous — à vérifier avant utilisation ; aucune preuve de la boîte ne fonde une réponse factuelle. (Draft proposed below — review before use; no mailbox evidence grounds a factual answer.)';

const EXTRACTIVE_ANSWER_MAX_CITATIONS = 6;

/**
 * v1 answer contract (re-review 4, P1): a validated quote does NOT entail the
 * model's prose — "Bonjour merci" can be quoted under a fabricated "wire
 * 100 000". So with sources, the displayed answer is EXTRACTIVE: assembled
 * server-side from validated citations only (sender/date + verbatim quote,
 * bounded). The model's free text is never displayed.
 */
export const formatExtractiveAnswer = (citations: AskRetaMessageCitation[]): string => {
  const shown = citations.slice(0, EXTRACTIVE_ANSWER_MAX_CITATIONS);
  const lines = shown.map(
    (citation) => `— ${citation.sender} (${citation.date}) : « ${citation.quote} »`,
  );
  const hidden = citations.length - shown.length;
  const suffix = hidden > 0 ? `\n(+ ${hidden} autre(s) extrait(s) cité(s))` : '';
  return `Extraits vérifiés de votre boîte :\n${lines.join('\n')}${suffix}`;
};

// Whitelisted numeric overview fields — the ONLY values a citation-free answer
// may display, formatted server-side (re-review 3, P1: a free model answer must
// never pass uncited, overview questions included).
const overviewAnswerWhitelist = z.object({
  folders: z
    .object({
      inbox: z.number().int().nonnegative(),
      drafts: z.number().int().nonnegative(),
      sent: z.number().int().nonnegative(),
      queue: z.number().int().nonnegative(),
    })
    .partial()
    .optional(),
  activity: z
    .object({
      processedToday: z.number().int().nonnegative(),
      processedWeek: z.number().int().nonnegative(),
    })
    .partial()
    .optional(),
});

/** Deterministic overview answer — every displayed number comes from the whitelist. */
export const formatOverviewAnswer = (overview: unknown): string | null => {
  const parsed = overviewAnswerWhitelist.safeParse(overview);
  if (!parsed.success) return null;
  const parts: string[] = [];
  const folders = parsed.data.folders;
  if (folders) {
    const bits: string[] = [];
    if (folders.inbox !== undefined) bits.push(`${folders.inbox} en boîte de réception`);
    if (folders.drafts !== undefined) bits.push(`${folders.drafts} brouillons`);
    if (folders.sent !== undefined) bits.push(`${folders.sent} envoyés`);
    if (folders.queue !== undefined) bits.push(`${folders.queue} en file d'envoi`);
    if (bits.length) parts.push(`Boîte : ${bits.join(', ')}.`);
  }
  const activity = parsed.data.activity;
  if (activity) {
    const bits: string[] = [];
    if (activity.processedToday !== undefined)
      bits.push(`${activity.processedToday} envoyés aujourd'hui`);
    if (activity.processedWeek !== undefined) bits.push(`${activity.processedWeek} sur 7 jours`);
    if (bits.length) parts.push(`Activité : ${bits.join(', ')}.`);
  }
  return parts.length ? parts.join(' ') : null;
};

/**
 * Deterministic SAFE result when synthesis is unavailable: built ONLY from
 * what was actually retrieved this run — zero model prose. Message sources →
 * server-picked extractive citations (verbatim excerpt prefixes, so the
 * quote⊂excerpt invariant holds by construction); else the deterministic
 * overview; else the explicit insufficient-evidence answer. Metadata sources
 * are NEVER promoted to evidence (unchanged contract).
 */
const buildDeterministicFallbackResult = (gathered: Gathered): Omit<AskRetaResult, 'model'> => {
  const citations: AskRetaMessageCitation[] = [];
  const citedThreads = new Set<string>();
  const tryCite = (source: AskRetaSource, requireNewThread: boolean): void => {
    if (citations.length >= EXTRACTIVE_ANSWER_MAX_CITATIONS) return;
    if (source.kind !== 'message') return;
    if (requireNewThread && citedThreads.has(source.threadId)) return;
    if (citations.some((citation) => citation.ref === source.ref)) return;
    const quote = source.excerpt.replace(/\s+/g, ' ').trim().slice(0, 240).trim();
    // Same evidence floor as model citations; a sanitizer marker is never citable.
    if (quote.length < 24 || containsSanitizerMarker(quote)) return;
    const { excerpt: _excerpt, kind: _kind, ...rest } = source;
    citations.push({ ...rest, kind: 'message', quote });
    citedThreads.add(source.threadId);
  };
  // THREAD-DIVERSE first (tour 09): one citation per distinct thread — a
  // "latest senders" degraded answer shows the distinct recent senders, not
  // six quotes of the same thread — then fill up to the cap.
  for (const source of gathered.sources) tryCite(source, true);
  for (const source of gathered.sources) tryCite(source, false);
  const answer = citations.length
    ? formatExtractiveAnswer(citations)
    : ((gathered.overviewJson ? formatOverviewAnswer(JSON.parse(gathered.overviewJson)) : null) ??
      INSUFFICIENT_EVIDENCE_ANSWER);
  return { answer, citations, proposal: undefined, steps: gathered.steps };
};

/**
 * Deterministic METADATA answer for a recency listing (tour 10): built
 * server-side from the rows retrieved THIS run — one line and ONE metadata
 * citation per listed thread (sender/date/subject as FIELDS, never dressed
 * as a body excerpt). Zero model involvement, zero body read. Returns null
 * when the listing is empty — the caller stays honestly insufficient.
 */
const buildRecentSendersResult = (gathered: Gathered): Omit<AskRetaResult, 'model'> | null => {
  const listing = gathered.recentListing;
  if (!listing) return null;
  const byRef = new Map(gathered.sources.map((source) => [source.ref, source]));
  const rows = listing.refs
    .map((ref) => byRef.get(ref))
    .filter((source): source is AskRetaSource => !!source)
    .slice(0, listing.limit);
  if (rows.length === 0) return null;
  const citations: AskRetaCitation[] = [];
  const lines: string[] = [];
  for (const source of rows) {
    const { excerpt: _excerpt, kind: _kind, messageId: _messageId, ...rest } = source;
    citations.push({ ...rest, kind: 'metadata' });
    lines.push(`${citations.length}. ${source.sender} — ${source.date} — « ${source.subject} »`);
  }
  const answer = `Expéditeurs les plus récents (${listing.folder ?? 'boîte'}) / Most recent senders:\n${lines.join('\n')}`;
  return { answer, citations, proposal: undefined, steps: gathered.steps };
};

export async function runAskReta(
  deps: AskRetaDeps,
  input: AskRetaInput,
): Promise<Omit<AskRetaResult, 'model'>> {
  const budget: Budget = {
    signal: deps.signal,
    deadline: Date.now() + (deps.deadlineMs ?? DEFAULT_DEADLINE_MS),
  };
  checkBudget(budget);

  // Tour 13 : question STRICTEMENT metadata → le PLANIFICATEUR n'est jamais
  // consulté (zéro appel modèle). Plan déterministe list_recent borné, puis
  // réponse metadata serveur — le modèle ne peut pas dérouter la question
  // vers un plan contenu plus lent (12,6 s observées en prod quand il le
  // faisait). Les demandes de CONTENU récentes gardent plan/lecture/synthèse.
  if (isStrictRecentMetadataQuestion(input.question)) {
    const recentPlan: AskRetaPlan = {
      actions: [
        {
          type: 'list_recent',
          folder: input.context.folder ?? 'inbox',
          limit: askRetaLimits.threadsRead,
        },
      ],
    };
    const listed = await executePlan(deps, budget, input, recentPlan);
    const recent = buildRecentSendersResult(listed);
    if (recent) return recent;
    return {
      answer: INSUFFICIENT_EVIDENCE_ANSWER,
      citations: [],
      proposal: undefined,
      steps: listed.steps,
    };
  }

  const plan = normalizePlan(await getPlan(deps, budget, input), input);
  const gathered = await executePlan(deps, budget, input, plan);
  const synthesis = await getSynthesis(deps, budget, input, gathered);
  // Synthesis unavailable after both attempts (tour 06): degrade to a
  // DETERMINISTIC grounded result from the retrieved evidence — never throw,
  // never model prose. An infra-wide outage never reaches here (executePlan
  // throws typed when NOTHING was gathered), so this cannot dress a global
  // provider failure up as a confident answer.
  if (!synthesis) return buildDeterministicFallbackResult(gathered);

  const byRef = new Map(gathered.sources.map((source) => [source.ref, source]));
  // Server-side containment, strict v1 contract: a citation exists ONLY when
  // the cite resolves to a MESSAGE source retrieved this run AND its non-empty
  // quote is a substring of that source's excerpt. Everything else — unknown
  // refs, metadata refs, missing/altered quotes — yields ZERO citations.
  // Metadata sources still power sources/steps (thread discovery), never proof.
  const citations: AskRetaMessageCitation[] = [];
  for (const cite of synthesis.cites) {
    const source = byRef.get(cite.ref);
    if (!source) continue;
    if (source.kind !== 'message') continue;
    if (citations.some((c) => c.ref === cite.ref)) continue;
    // A quote carrying a sanitizer marker is a forgery attempt, never evidence.
    if (containsSanitizerMarker(cite.quote)) continue;
    if (!normalizeForQuoteMatch(source.excerpt).includes(normalizeForQuoteMatch(cite.quote))) {
      continue;
    }
    const { excerpt: _excerpt, kind: _kind, ...citation } = source;
    citations.push({ ...citation, kind: 'message', quote: cite.quote });
  }

  // Reply proposals require the open thread to have been read successfully
  // within this connection during THIS ask — never a client-asserted id alone.
  const replyThreadId =
    synthesis.proposal?.kind === 'reply' &&
    gathered.validatedOpenThreadId &&
    gathered.validatedOpenThreadId === input.context.threadId
      ? gathered.validatedOpenThreadId
      : null;

  const proposal = synthesis.proposal
    ? {
        kind: replyThreadId ? ('reply' as const) : ('new' as const),
        to: synthesis.proposal.to,
        subject: synthesis.proposal.subject,
        bodyHtml: proposalBodyToHtml(synthesis.proposal.body),
        ...(replyThreadId ? { threadId: replyThreadId } : {}),
      }
    : undefined;

  // Answer contract (re-review 4, P1): the model's free prose is NEVER
  // displayed — a validated quote does not entail whatever text surrounds it.
  // Priority: extractive from validated citations → deterministic overview →
  // proposal notice (the draft stays reviewable) → insufficient evidence.
  let answer: string;
  if (citations.length > 0) {
    answer = formatExtractiveAnswer(citations);
  } else {
    const overviewAnswer = gathered.overviewJson
      ? formatOverviewAnswer(JSON.parse(gathered.overviewJson))
      : null;
    if (overviewAnswer) answer = overviewAnswer;
    else if (proposal) answer = PROPOSAL_ONLY_ANSWER;
    else answer = INSUFFICIENT_EVIDENCE_ANSWER;
  }

  return { answer, citations, proposal, steps: gathered.steps };
}
