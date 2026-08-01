import {
  AskRetaAbortedError,
  fallbackPlan,
  fallbackSearchQuery,
  fallbackSearchTerms,
  normalizePlan,
  runAskReta,
  type AskRetaDeps,
} from './pipeline';
import { askRetaInputSchema, askRetaLimits, type AskRetaPlan } from './schema';
import type { IGetThreadResponse, ThreadsResponse } from '@zero/types';
import { describe, expect, it, vi } from 'vitest';
import type { RetaModel } from './model';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const input = (overrides: Partial<ReturnType<typeof askRetaInputSchema.parse>> = {}) =>
  askRetaInputSchema.parse({ question: 'Que dit la dernière facture Balguerie ?', ...overrides });

const scriptedModel = (responses: string[]): RetaModel & { calls: number } => {
  const state = { calls: 0 };
  return {
    key: 'llama-4-scout',
    get calls() {
      return state.calls;
    },
    complete: vi.fn(async () => {
      const response = responses[state.calls] ?? responses[responses.length - 1] ?? '';
      state.calls += 1;
      return response;
    }),
  } as RetaModel & { calls: number };
};

const searchRow = (n: number) => ({
  id: `thread-${n}`,
  historyId: null,
  subject: `Facture ${n}`,
  sender: { name: 'Compta', email: 'compta@balguerie.test' },
  receivedOn: '2026-07-30T10:00:00.000Z',
  unread: false,
  labels: [],
});

const threadWithMessages = (threadId: string, count: number): IGetThreadResponse => {
  const messages = Array.from({ length: count }, (_, i) => ({
    id: `${threadId}-m${i + 1}`,
    subject: `Facture — message ${i + 1}`,
    sender: { name: 'Compta', email: 'compta@balguerie.test' },
    receivedOn: `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
    decodedBody: `<p>Montant dû message ${i + 1} : ${'détail '.repeat(400)}</p>`,
    isDraft: i === 0,
  }));
  return { messages } as unknown as IGetThreadResponse;
};

const makeDeps = (
  model: RetaModel,
  overrides: Partial<AskRetaDeps> = {},
): AskRetaDeps & { searchThreads: ReturnType<typeof vi.fn> } => {
  const searchThreads = vi.fn(
    async (): Promise<ThreadsResponse> => ({
      threads: Array.from({ length: 12 }, (_, i) => searchRow(i + 1)),
      nextPageToken: null,
    }),
  );
  return {
    model,
    overview: vi.fn(async () => ({ folders: { inbox: 42 } })),
    searchThreads,
    readThread: vi.fn(async (id: string) => threadWithMessages(id, 14)),
    ...overrides,
  } as AskRetaDeps & { searchThreads: ReturnType<typeof vi.fn> };
};

const planJson = JSON.stringify({
  actions: [
    { type: 'search', query: 'balguerie' },
    { type: 'read_thread', target: 'top_results' },
  ],
});

// Search yields s1..s10 (metadata). Reading the top 3 threads then yields
// message sources: thread-1 non-draft messages 3..14 → s11..s22, thread-2 →
// s23.., etc. s11 = thread-1 message 3.
const synthesisJson = JSON.stringify({
  answer: 'La dernière facture Balguerie réclame 120 000 XPF.',
  cites: [{ ref: 's11', quote: 'Montant dû message 3' }, { ref: 's99', quote: 'forged' }, 's1'],
});

describe('fallback search terms — single literal LIKE means single terms', () => {
  it('picks ONE most-discriminant token (emails/numbers first, then longest)', () => {
    expect(fallbackSearchQuery('Que dit la dernière facture de Balguerie ?')).toBe('balguerie');
    expect(fallbackSearchQuery('How many unread emails from Github ?')).toBe('unread');
    expect(fallbackSearchQuery('relance de compta@socredo.pf pour le devis 2026-113')).toBe(
      'compta@socredo.pf',
    );
  });

  it('exposes ranked distinct terms for the fallback plan', () => {
    expect(fallbackSearchTerms('Que dit la dernière facture de Balguerie ?', 2)).toEqual([
      'balguerie',
      'facture',
    ]);
  });

  it('fallbackPlan issues single-term searches (never a joined sentence)', () => {
    const plan = fallbackPlan(input());
    const searches = plan.actions.filter((a) => a.type === 'search');
    expect(searches.length).toBeGreaterThanOrEqual(1);
    for (const search of searches) {
      expect(search.type === 'search' && search.query.includes(' ')).toBe(false);
    }
  });
});

describe('normalizePlan — every cap enforced, degradation never throws', () => {
  it('clamps searches, drops read-open without an open thread, keeps ≤ 3 actions', () => {
    const plan: AskRetaPlan = {
      actions: [
        { type: 'search', query: 'a' },
        { type: 'search', query: 'b' },
        { type: 'search', query: 'c' },
        { type: 'read_thread', target: 'open' },
        { type: 'overview' },
      ],
    };
    const normalized = normalizePlan(plan, input());
    expect(normalized.actions.length).toBeLessThanOrEqual(askRetaLimits.planActions);
    expect(normalized.actions.filter((a) => a.type === 'search')).toHaveLength(2);
    expect(normalized.actions.some((a) => a.type === 'read_thread')).toBe(false);
  });

  it('drops top_results reads when no search exists, falls back when empty', () => {
    const normalized = normalizePlan(
      { actions: [{ type: 'read_thread', target: 'top_results' }] },
      input(),
    );
    expect(normalized).toEqual(fallbackPlan(input()));
  });
});

describe('runAskReta — strict citations: message-kind + verified quote ONLY', () => {
  it('keeps only message-source cites whose quote matches; metadata/forged/string cites vanish', async () => {
    const model = scriptedModel([planJson, synthesisJson]);
    const deps = makeDeps(model);
    const result = await runAskReta(deps, input());

    expect(result.answer).toContain('120 000 XPF');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      ref: 's11',
      kind: 'message',
      threadId: 'thread-1',
      quote: 'Montant dû message 3',
    });
    expect(result.citations[0]?.messageId).toBe('thread-1-m3');
    expect(result.citations[0]?.excerptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.citations[0]).not.toHaveProperty('excerpt');
    expect(result.steps.map((s) => s.kind)).toEqual(['search', 'read_thread']);
  });

  it('a claim citing a METADATA ref yields zero citations', async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 120 000 XPF.',
      cites: [{ ref: 's1', quote: 'Facture 1' }],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
  });

  it('a claim without quotes (legacy string cites) yields zero citations', async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 120 000 XPF.',
      cites: ['s11', { ref: 's12' }],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
  });

  it('an altered quote on a real message source yields zero citations', async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 999 999 XPF.',
      cites: [{ ref: 's11', quote: 'Montant dû 999 999 XPF' }],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
  });

  it('hard-caps retrieval: 10 search results, 3 threads read', async () => {
    const model = scriptedModel([planJson, synthesisJson]);
    const deps = makeDeps(model);
    await runAskReta(deps, input());

    expect(deps.searchThreads).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: askRetaLimits.searchResults }),
    );
    expect(deps.readThread).toHaveBeenCalledTimes(askRetaLimits.threadsRead);
  });

  it('uses the deterministic single-term fallback plan when the planner returns garbage', async () => {
    const model = scriptedModel(['not json at all', synthesisJson]);
    const deps = makeDeps(model);
    await runAskReta(deps, input({ context: { threadId: 'open-thread' } }));

    expect(deps.searchThreads).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'balguerie' }),
    );
    expect(deps.readThread).toHaveBeenCalledWith('open-thread');
  });
});

describe('runAskReta — reply proposals require a VALIDATED open-thread read', () => {
  const readOpenPlan = JSON.stringify({
    actions: [{ type: 'read_thread', target: 'open' }],
  });
  const replyProposal = JSON.stringify({
    answer: 'Réponse préparée.',
    cites: [],
    proposal: { kind: 'reply', body: 'Bien reçu, merci.' },
  });

  it('keeps reply + threadId after a successful scoped read of the open thread', async () => {
    const model = scriptedModel([readOpenPlan, replyProposal]);
    const result = await runAskReta(
      makeDeps(model),
      input({ context: { threadId: 'open-thread' } }),
    );
    expect(result.proposal?.kind).toBe('reply');
    expect(result.proposal?.threadId).toBe('open-thread');
  });

  it('downgrades to new when the open thread was never read during the ask', async () => {
    const model = scriptedModel([planJson, replyProposal]); // plan never reads the open thread
    const result = await runAskReta(
      makeDeps(model),
      input({ context: { threadId: 'open-thread' } }),
    );
    expect(result.proposal?.kind).toBe('new');
    expect(result.proposal?.threadId).toBeUndefined();
  });

  it('downgrades to new when the open-thread read finds nothing (forged id)', async () => {
    const model = scriptedModel([readOpenPlan, replyProposal]);
    const deps = makeDeps(model, {
      readThread: vi.fn(async () => ({ messages: [] }) as unknown as IGetThreadResponse),
    });
    const result = await runAskReta(deps, input({ context: { threadId: 'forged-id' } }));
    expect(result.proposal?.kind).toBe('new');
    expect(result.proposal?.threadId).toBeUndefined();
  });

  it('sanitizes proposals and downgrades reply→new without an open thread', async () => {
    const withProposal = JSON.stringify({
      answer: 'Réponse préparée.',
      cites: [],
      proposal: {
        kind: 'reply',
        subject: 'Re: Facture',
        body: "Ia ora na,\n\nC'est réglé.<script>alert(1)</script>",
      },
    });
    const model = scriptedModel([planJson, withProposal]);
    const result = await runAskReta(makeDeps(model), input());

    expect(result.proposal?.kind).toBe('new');
    expect(result.proposal?.threadId).toBeUndefined();
    expect(result.proposal?.bodyHtml).toContain('<p>Ia ora na,</p>');
    expect(result.proposal?.bodyHtml).not.toContain('script');
  });
});

describe('runAskReta — abort & deadline', () => {
  it('aborts between steps when the signal fires', async () => {
    const controller = new AbortController();
    controller.abort();
    const model = scriptedModel([planJson, synthesisJson]);
    await expect(
      runAskReta(makeDeps(model, { signal: controller.signal }), input()),
    ).rejects.toBeInstanceOf(AskRetaAbortedError);
  });

  it('stops with a deadline error once the wall-clock budget is spent', async () => {
    const model = scriptedModel([planJson, synthesisJson]);
    await expect(runAskReta(makeDeps(model, { deadlineMs: -1 }), input())).rejects.toThrow(
      'deadline exceeded',
    );
  });

  it('retries synthesis once, then fails without leaking content', async () => {
    const model = scriptedModel([planJson, 'garbage', 'still garbage']);
    await expect(runAskReta(makeDeps(model), input())).rejects.toThrow(
      'Ask Reta could not produce a grounded answer',
    );
  });
});

describe('read-only guarantee — structural', () => {
  it('the pipeline source references no mutating mailbox capability', () => {
    const source = readFileSync(join(__dirname, 'pipeline.ts'), 'utf8');
    for (const forbidden of [
      'createDraft',
      'sendDraft',
      'modifyThreadLabels',
      'markAs',
      'bulkArchive',
      'delete(',
      'webSearch',
    ]) {
      expect(source.includes(forbidden), `pipeline.ts must not reference ${forbidden}`).toBe(false);
    }
  });
});
