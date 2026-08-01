import {
  askRetaLimits,
  askRetaPlanSchema,
  askRetaSynthesisSchema,
  type AskRetaCitation,
  type AskRetaInput,
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
import type { IGetThreadResponse, ThreadsResponse } from '@zero/types';
import { normalizeEmailRewriteHtml } from '../rewrite-email';
import { extractJsonObject, type RetaModel } from './model';
import { sanitizeMailContent } from '../mail-sanitize';
import sanitizeHtml from 'sanitize-html';
import { logger } from '../logger';

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
}

export class AskRetaAbortedError extends Error {
  constructor(reason: 'aborted' | 'deadline' = 'aborted') {
    super(reason === 'deadline' ? 'Ask Reta deadline exceeded' : 'Ask Reta request aborted');
    this.name = 'AskRetaAbortedError';
  }
}

const DEFAULT_DEADLINE_MS = 45_000;

/** Re-checked after EVERY await (model, overview, search, thread read). */
type Budget = { signal?: AbortSignal; deadline: number };

const checkBudget = (budget: Budget) => {
  if (budget.signal?.aborted) throw new AskRetaAbortedError('aborted');
  if (Date.now() > budget.deadline) throw new AskRetaAbortedError('deadline');
};

/**
 * PREEMPTIVE budget (re-review Codex 2026-08-01, P2): the awaited work races
 * the deadline timer, so a slow model/dep call is interrupted the moment the
 * budget expires — not merely detected after it eventually resolves.
 */
const withBudget = async <T>(budget: Budget, run: () => Promise<T>): Promise<T> => {
  checkBudget(budget);
  const remaining = Math.max(0, budget.deadline - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AskRetaAbortedError('deadline')), remaining);
  });
  try {
    const result = await Promise.race([run(), expiry]);
    if (budget.signal?.aborted) throw new AskRetaAbortedError('aborted');
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
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

export const fallbackPlan = (input: AskRetaInput): AskRetaPlan => {
  const terms = fallbackSearchTerms(input.question, askRetaLimits.searchesPerAsk);
  const actions: AskRetaPlan['actions'] = [];
  if (COUNT_QUESTION.test(input.question)) actions.push({ type: 'overview' });
  // No discriminating token → the search is OMITTED (an empty plan yields the
  // insufficient-evidence answer); the full phrase is never reused as a query.
  if (terms[0]) actions.push({ type: 'search', query: terms[0] });
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
    } else if (action.type === 'read_thread') {
      if (action.target === 'open' && !input.context.threadId) continue;
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
    logger.warn('[ask-reta] readThread failed', { threadId });
    return { refs: [], found: false };
  }
  checkBudget(budget);
  const refs: string[] = [];
  const messages = (thread.messages ?? [])
    .filter((message) => !message.isDraft)
    .slice(-askRetaLimits.messagesPerThread);
  for (const message of messages) {
    const text = sanitizeMailContent(message.decodedBody ?? message.body ?? '').text;
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
  };
  let topResultIds: string[] = [];

  for (const action of plan.actions) {
    checkBudget(budget);

    if (action.type === 'overview') {
      const overview = await withBudget(budget, () => deps.overview());
      checkBudget(budget);
      gathered.overviewJson = JSON.stringify(overview);
      gathered.steps.push({ kind: 'overview', detail: 'exact mailbox counts', sourceRefs: [] });
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
      gathered.steps.push({
        kind: 'search',
        detail: `"${action.query}"${action.folder ? ` in ${action.folder}` : ''} → ${rows.length} threads`,
        sourceRefs: refs,
      });
    } else {
      const targets =
        action.target === 'open'
          ? input.context.threadId
            ? [input.context.threadId]
            : []
          : topResultIds.slice(0, askRetaLimits.threadsRead);
      const refs: string[] = [];
      for (const threadId of targets.slice(0, askRetaLimits.threadsRead)) {
        checkBudget(budget);
        const read = await readOneThread(deps, budget, gathered, threadId);
        refs.push(...read.refs);
        // Reply proposals may only target an open thread PROVEN readable
        // within this connection — a forged id never validates.
        if (action.target === 'open' && read.found && threadId === input.context.threadId) {
          gathered.validatedOpenThreadId = threadId;
        }
      }
      gathered.steps.push({
        kind: 'read_thread',
        detail:
          action.target === 'open'
            ? 'read the open thread'
            : `read top ${Math.min(targets.length, askRetaLimits.threadsRead)} results`,
        sourceRefs: refs,
      });
    }
  }

  return gathered;
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
      }),
    );
  } catch (error) {
    if (error instanceof AskRetaAbortedError) throw error;
    logger.warn('[ask-reta] plan call failed, using fallback plan');
    checkBudget(budget);
    return fallbackPlan(input);
  }
  checkBudget(budget);
  const parsed = askRetaPlanSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) return fallbackPlan(input);
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

  for (const attempt of [0, 1]) {
    checkBudget(budget);
    const raw = await withBudget(budget, () =>
      deps.model.complete({
        system: askRetaSynthesisSystemPrompt(),
        user:
          attempt === 0
            ? user
            : `${user}\n\nREMINDER: return ONLY the JSON object described by the system prompt.`,
        maxTokens: 1_400,
        temperature: 0.2,
        signal: deps.signal,
      }),
    );
    checkBudget(budget);
    const parsed = askRetaSynthesisSchema.safeParse(extractJsonObject(raw));
    if (parsed.success) return parsed.data;
  }
  throw new Error('Ask Reta could not produce a grounded answer');
};

const normalizeForQuoteMatch = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Served VERBATIM when a mailbox answer (beyond pure overview counts) has zero
 * valid citations: the assistant must say so instead of sounding grounded.
 */
export const INSUFFICIENT_EVIDENCE_ANSWER =
  "Preuve insuffisante dans la boîte pour fonder cette réponse — précisez l'expéditeur, le sujet ou la période. (Insufficient mailbox evidence to ground this answer.)";

export async function runAskReta(
  deps: AskRetaDeps,
  input: AskRetaInput,
): Promise<Omit<AskRetaResult, 'model'>> {
  const budget: Budget = {
    signal: deps.signal,
    deadline: Date.now() + (deps.deadlineMs ?? DEFAULT_DEADLINE_MS),
  };
  checkBudget(budget);
  const plan = normalizePlan(await getPlan(deps, budget, input), input);
  const gathered = await executePlan(deps, budget, input, plan);
  const synthesis = await getSynthesis(deps, budget, input, gathered);

  const byRef = new Map(gathered.sources.map((source) => [source.ref, source]));
  // Server-side containment, strict v1 contract: a citation exists ONLY when
  // the cite resolves to a MESSAGE source retrieved this run AND its non-empty
  // quote is a substring of that source's excerpt. Everything else — unknown
  // refs, metadata refs, missing/altered quotes — yields ZERO citations.
  // Metadata sources still power sources/steps (thread discovery), never proof.
  const citations: AskRetaCitation[] = [];
  for (const cite of synthesis.cites) {
    const source = byRef.get(cite.ref);
    if (!source) continue;
    if (source.kind !== 'message') continue;
    if (citations.some((c) => c.ref === cite.ref)) continue;
    if (!normalizeForQuoteMatch(source.excerpt).includes(normalizeForQuoteMatch(cite.quote))) {
      continue;
    }
    const { excerpt: _excerpt, kind: _kind, ...citation } = source;
    citations.push({ ...citation, kind: 'message', quote: cite.quote });
  }

  // Evidence gate: a mailbox answer that goes beyond pure overview counts and
  // carries ZERO valid citations must not sound grounded — replace it with the
  // explicit insufficient-evidence answer. Proposals/steps survive: a draft is
  // reviewable content, not a factual claim.
  const overviewOnly = gathered.sources.length === 0 && gathered.overviewJson !== null;
  const answer =
    citations.length > 0 || overviewOnly ? synthesis.answer : INSUFFICIENT_EVIDENCE_ANSWER;

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

  return { answer, citations, proposal, steps: gathered.steps };
}
