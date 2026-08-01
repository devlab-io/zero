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
  /** Literal metadata search over the connection's own DO SQLite. */
  searchThreads(params: {
    query: string;
    folder?: string;
    maxResults: number;
  }): Promise<ThreadsResponse>;
  /** Full thread (bodies) from the connection's own DO + R2. */
  readThread(threadId: string): Promise<IGetThreadResponse>;
  signal?: AbortSignal;
}

export class AskRetaAbortedError extends Error {
  constructor() {
    super('Ask Reta request aborted');
    this.name = 'AskRetaAbortedError';
  }
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AskRetaAbortedError();
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
]);

const stripDiacritics = (word: string) => word.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Deterministic fallback query: the discriminating words of the question. */
export const fallbackSearchQuery = (question: string): string => {
  const words = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.\-\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(stripDiacritics(word)));
  return words.slice(0, 6).join(' ') || question.slice(0, 60);
};

const COUNT_QUESTION = /\bcombien\b|\bhow many\b|\bcount\b|\bnombre\b|\bunread\b|\bnon lus?\b/i;

export const fallbackPlan = (input: AskRetaInput): AskRetaPlan => {
  const actions: AskRetaPlan['actions'] = [];
  if (COUNT_QUESTION.test(input.question)) actions.push({ type: 'overview' });
  actions.push({ type: 'search', query: fallbackSearchQuery(input.question) });
  if (input.context.threadId) actions.push({ type: 'read_thread', target: 'open' });
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
  gathered: Gathered,
  threadId: string,
): Promise<string[]> => {
  let thread: IGetThreadResponse;
  try {
    thread = await deps.readThread(threadId);
  } catch {
    logger.warn('[ask-reta] readThread failed', { threadId });
    return [];
  }
  const refs: string[] = [];
  const messages = (thread.messages ?? [])
    .filter((message) => !message.isDraft)
    .slice(-askRetaLimits.messagesPerThread);
  for (const message of messages) {
    const text = sanitizeMailContent(message.decodedBody ?? message.body ?? '').text;
    if (!text.trim()) continue;
    const source = await addSource(gathered, {
      threadId,
      subject: message.subject ?? '(no subject)',
      sender: formatSender(message.sender),
      date: message.receivedOn ?? 'unknown',
      excerpt: text,
    });
    refs.push(source.ref);
  }
  return refs;
};

const executePlan = async (
  deps: AskRetaDeps,
  input: AskRetaInput,
  plan: AskRetaPlan,
): Promise<Gathered> => {
  const gathered: Gathered = { sources: [], steps: [], overviewJson: null };
  let topResultIds: string[] = [];

  for (const action of plan.actions) {
    throwIfAborted(deps.signal);

    if (action.type === 'overview') {
      const overview = await deps.overview();
      gathered.overviewJson = JSON.stringify(overview);
      gathered.steps.push({ kind: 'overview', detail: 'exact mailbox counts', sourceRefs: [] });
    } else if (action.type === 'search') {
      const response = await deps.searchThreads({
        query: action.query,
        folder: action.folder,
        maxResults: askRetaLimits.searchResults,
      });
      const rows = response.threads.slice(0, askRetaLimits.searchResults);
      if (topResultIds.length === 0) topResultIds = rows.map((row) => row.id);
      const refs: string[] = [];
      for (const row of rows) {
        const source = await addSource(gathered, {
          threadId: row.id,
          subject: row.subject ?? '(no subject)',
          sender: formatSender(row.sender),
          date: row.receivedOn ?? 'unknown',
          excerpt: `${row.subject ?? '(no subject)'} — ${formatSender(row.sender)}`,
        });
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
        throwIfAborted(deps.signal);
        refs.push(...(await readOneThread(deps, gathered, threadId)));
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

const getPlan = async (deps: AskRetaDeps, input: AskRetaInput): Promise<AskRetaPlan> => {
  let raw: string;
  try {
    raw = await deps.model.complete({
      system: askRetaPlanSystemPrompt(),
      user: askRetaPlanUserPrompt(input),
      maxTokens: 400,
      temperature: 0.1,
      signal: deps.signal,
    });
  } catch {
    logger.warn('[ask-reta] plan call failed, using fallback plan');
    return fallbackPlan(input);
  }
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

const getSynthesis = async (deps: AskRetaDeps, input: AskRetaInput, gathered: Gathered) => {
  const sourcesJson = JSON.stringify(
    gathered.sources.map(({ ref, subject, sender, date, excerpt }) => ({
      ref,
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
    throwIfAborted(deps.signal);
    const raw = await deps.model.complete({
      system: askRetaSynthesisSystemPrompt(),
      user:
        attempt === 0
          ? user
          : `${user}\n\nREMINDER: return ONLY the JSON object described by the system prompt.`,
      maxTokens: 1_400,
      temperature: 0.2,
      signal: deps.signal,
    });
    const parsed = askRetaSynthesisSchema.safeParse(extractJsonObject(raw));
    if (parsed.success) return parsed.data;
  }
  throw new Error('Ask Reta could not produce a grounded answer');
};

export async function runAskReta(
  deps: AskRetaDeps,
  input: AskRetaInput,
): Promise<Omit<AskRetaResult, 'model'>> {
  throwIfAborted(deps.signal);
  const plan = normalizePlan(await getPlan(deps, input), input);
  const gathered = await executePlan(deps, input, plan);
  const synthesis = await getSynthesis(deps, input, gathered);

  const byRef = new Map(gathered.sources.map((source) => [source.ref, source]));
  // Server-side containment: a cite outside the retrieved set is DROPPED —
  // the model cannot point the user at a thread the pipeline never touched.
  const citations: AskRetaCitation[] = [];
  for (const ref of synthesis.cites) {
    const source = byRef.get(ref);
    if (!source) continue;
    if (citations.some((c) => c.ref === ref)) continue;
    const { excerpt: _excerpt, ...citation } = source;
    citations.push(citation);
  }

  const proposal = synthesis.proposal
    ? {
        kind:
          synthesis.proposal.kind === 'reply' && !input.context.threadId
            ? ('new' as const)
            : synthesis.proposal.kind,
        to: synthesis.proposal.to,
        subject: synthesis.proposal.subject,
        bodyHtml: proposalBodyToHtml(synthesis.proposal.body),
        ...(synthesis.proposal.kind === 'reply' && input.context.threadId
          ? { threadId: input.context.threadId }
          : {}),
      }
    : undefined;

  return { answer: synthesis.answer, citations, proposal, steps: gathered.steps };
}
