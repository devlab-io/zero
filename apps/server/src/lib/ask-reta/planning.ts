import { askRetaLimits, type AskRetaInput, type AskRetaPlan } from './schema';
import { AskRetaAbortedError } from './errors';

/** Canonical wall-clock budget shared by the pipeline and transport abort. */
export const ASK_RETA_DEADLINE_MS = 45_000;
export const DEFAULT_DEADLINE_MS = ASK_RETA_DEADLINE_MS;

export type AskRetaBudget = { signal?: AbortSignal; deadline: number };

export const checkAskRetaBudget = (budget: AskRetaBudget) => {
  if (budget.signal?.aborted) throw new AskRetaAbortedError('aborted');
  if (Date.now() > budget.deadline) throw new AskRetaAbortedError('deadline');
};

/**
 * Interrupt the pipeline wait immediately on deadline or abort. A dependency
 * already dispatched may finish remotely, but its late result is discarded.
 */
export const withAskRetaBudget = async <T>(
  budget: AskRetaBudget,
  run: () => Promise<T>,
): Promise<T> => {
  checkAskRetaBudget(budget);
  const remaining = Math.max(0, budget.deadline - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AskRetaAbortedError('deadline')), remaining);
  });
  const aborted = new Promise<never>((_, reject) => {
    const signal = budget.signal;
    if (!signal) return;
    const onAbort = () => reject(new AskRetaAbortedError('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  try {
    const running = run();
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

/** Pick single discriminating terms for the driver's literal LIKE search. */
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

export const fallbackSearchQuery = (question: string): string =>
  fallbackSearchTerms(question, 1)[0] ?? '';

const COUNT_QUESTION = /\bcombien\b|\bhow many\b|\bcount\b|\bnombre\b|\bunread\b|\bnon lus?\b/i;
const RECENCY_QUESTION =
  /\b(r[ée]cents?|r[ée]centes?|derni[eè]rs?|derni[eè]res?|latest|most recent|newest)\b|\blast\s+(email|emails|mail|mails|message|messages|sender|senders)\b/i;
const RECENT_LISTING_HINT =
  /\b(bo[îi]te|r[ée]ception|inbox|exp[ée]diteurs?|senders?|messages?|emails?|mails?|courriels?)\b/i;
const CONTENT_DEMAND =
  /\b(r[ée]sum[ée]?s?|r[ée]sumer|contenus?|corps|dit|disent|parlent?|say|says|said|talk(s|ing)? about|content|body|bodies|summar(y|ies|ize|ise|izing)|extraits?|excerpts?|r[ée]pond(re|s|ez)?|r[ée]ponses?|reply|draft|r[ée]dige[rz]?|write)\b/i;

export const isStrictRecentMetadataQuestion = (question: string): boolean =>
  RECENCY_QUESTION.test(question) &&
  RECENT_LISTING_HINT.test(question) &&
  !CONTENT_DEMAND.test(question);

export const fallbackPlan = (input: AskRetaInput): AskRetaPlan => {
  const terms = fallbackSearchTerms(input.question, askRetaLimits.searchesPerAsk);
  const actions: AskRetaPlan['actions'] = [];
  if (RECENCY_QUESTION.test(input.question) && RECENT_LISTING_HINT.test(input.question)) {
    if (isStrictRecentMetadataQuestion(input.question)) {
      actions.push({
        type: 'list_recent',
        folder: input.context.folder ?? 'inbox',
        limit: askRetaLimits.threadsRead,
      });
      return { actions: actions.slice(0, askRetaLimits.planActions) };
    }
    actions.push({
      type: 'list_recent',
      folder: input.context.folder ?? 'inbox',
      limit: askRetaLimits.threadsRead,
    });
    actions.push({ type: 'read_thread', target: 'top_results' });
    if (terms[0]) {
      actions.push({
        type: 'search',
        query: terms[0],
        ...(input.context.folder ? { folder: input.context.folder } : {}),
      });
    }
    return { actions: actions.slice(0, askRetaLimits.planActions) };
  }
  if (input.context.selectedThreadIds.length) {
    actions.push({ type: 'read_thread', target: 'selected' });
  }
  if (COUNT_QUESTION.test(input.question)) actions.push({ type: 'overview' });
  if (terms[0]) {
    actions.push({
      type: 'search',
      query: terms[0],
      ...(input.context.folder ? { folder: input.context.folder } : {}),
    });
  }
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
      if (actions.some((item) => item.type === 'read_thread' && item.target === action.target)) {
        continue;
      }
      actions.push(action);
    }
  }
  if (actions.length === 0) return fallbackPlan(input);
  return { actions };
};
