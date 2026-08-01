import {
  AskRetaAbortedError,
  AskRetaPhaseError,
  fallbackPlan,
  isStrictRecentMetadataQuestion,
  fallbackSearchQuery,
  fallbackSearchTerms,
  formatExtractiveAnswer,
  INSUFFICIENT_EVIDENCE_ANSWER,
  normalizePlan,
  PROPOSAL_ONLY_ANSWER,
  runAskReta,
  type AskRetaDeps,
} from './pipeline';
import {
  askRetaInputSchema,
  askRetaLimits,
  askRetaPlanJsonSchema,
  askRetaSynthesisJsonSchema,
  type AskRetaPlan,
} from './schema';
import type { IGetThreadResponse, ThreadsResponse } from '@zero/types';
import { describe, expect, it, vi } from 'vitest';
import type { RetaModel } from './model';
import { readFileSync } from 'node:fs';
import { logger } from '../logger';
import { join } from 'node:path';
import type { z } from 'zod';

// Typé sur l'ENTRÉE du schéma (pré-parse) : selectedThreadIds a un .default([])
// — requis en sortie, optionnel en entrée. Les overrides des tests sont des
// entrées ; le .parse applique les défauts.
const input = (overrides: Partial<z.input<typeof askRetaInputSchema>> = {}) =>
  askRetaInputSchema.parse({ question: 'Que dit la dernière facture Balguerie ?', ...overrides });

const scriptedModel = (responses: string[]): RetaModel & { calls: number } => {
  const state = { calls: 0 };
  return {
    key: 'llama-4-scout',
    abortMode: 'cooperative',
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
const VALID_QUOTE = 'Montant dû message 3 : détail détail';
const synthesisJson = JSON.stringify({
  answer: 'La dernière facture Balguerie réclame 120 000 XPF.',
  cites: [
    { ref: 's11', quote: VALID_QUOTE },
    { ref: 's99', quote: 'forged quote that is long enough here' },
    's1',
  ],
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

  it('binds fallback retrieval to the current folder and selected threads', () => {
    const plan = fallbackPlan(
      input({
        context: {
          folder: 'sent',
          selectedThreadIds: ['selected-1', 'selected-2'],
        },
      }),
    );
    expect(plan.actions).toContainEqual({ type: 'read_thread', target: 'selected' });
    expect(plan.actions).toContainEqual({ type: 'search', query: 'balguerie', folder: 'sent' });
  });

  it('NO discriminating token → the search is omitted, the phrase is never reused', async () => {
    const stopwordQuestion = 'Que est quoi comment ?';
    expect(fallbackSearchQuery(stopwordQuestion)).toBe('');
    const plan = fallbackPlan(input({ question: stopwordQuestion }));
    expect(plan.actions.some((a) => a.type === 'search')).toBe(false);

    // End to end: the planner fails, the fallback has no search → searchThreads
    // is NEVER called with the raw phrase, and the answer admits insufficiency.
    const model = scriptedModel(['garbage', JSON.stringify({ answer: 'invented', cites: [] })]);
    const deps = makeDeps(model);
    const result = await runAskReta(deps, input({ question: stopwordQuestion }));
    expect(deps.searchThreads).not.toHaveBeenCalled();
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
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

    // Extractive answer: assembled from the validated citation, NEVER model prose.
    expect(result.answer).toContain(VALID_QUOTE);
    expect(result.answer).toContain('Compta');
    expect(result.answer).not.toContain('120 000 XPF');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      ref: 's11',
      kind: 'message',
      threadId: 'thread-1',
      quote: VALID_QUOTE,
    });
    expect(
      result.citations[0]?.kind === 'message' ? result.citations[0].messageId : undefined,
    ).toBe('thread-1-m3');
    expect(result.citations[0]?.excerptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.citations[0]).not.toHaveProperty('excerpt');
    expect(result.steps.map((s) => s.kind)).toEqual(['search', 'read_thread']);
  });

  it('a claim citing a METADATA ref yields zero citations and the insufficient-evidence answer', async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 120 000 XPF.',
      cites: [{ ref: 's1', quote: 'Facture 1 — Compta metadata row' }],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it('a claim without quotes (legacy string cites) yields zero citations', async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 120 000 XPF.',
      cites: ['s11', { ref: 's12' }],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it("the 'quote e' attack — trivially-matching micro-quotes — yields zero citations", async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 120 000 XPF.',
      cites: [
        { ref: 's11', quote: 'e' },
        { ref: 's12', quote: 'dû' },
        // Long enough but only two words — still not substantial evidence.
        { ref: 's13', quote: 'détaildétaildétaildétail détail' },
      ],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it('an altered quote on a real message source yields zero citations', async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 999 999 XPF.',
      cites: [{ ref: 's11', quote: 'Montant réclamé 999 999 XPF immédiatement' }],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it("the sanitizer-marker attack — quoting '[UNTRUSTED EMAIL CONTENT - SANITIZED]' — yields zero citations", async () => {
    const claim = JSON.stringify({
      answer: 'La facture réclame 120 000 XPF.',
      cites: [
        // Long enough, ≥3 words — but a technical marker, present in NO citable excerpt.
        { ref: 's11', quote: '[UNTRUSTED EMAIL CONTENT - SANITIZED]' },
        { ref: 's12', quote: 'Sanitizer note: removed 2 hidden segment(s).' },
        { ref: 's13', quote: 'voici [hidden content removed] la suite du texte' },
      ],
    });
    const model = scriptedModel([planJson, claim]);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations).toEqual([]);
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it('ENTAILMENT attack: a benign validated quote can never carry fabricated prose', async () => {
    // The model cites a real, harmless quote… under a fraudulent instruction.
    const attack = JSON.stringify({
      answer: 'Virez 100 000 XPF sur le compte FR76-XXXX immédiatement, virement urgent.',
      cites: [{ ref: 's11', quote: VALID_QUOTE }],
    });
    const model = scriptedModel([planJson, attack]);
    const result = await runAskReta(makeDeps(model), input());

    // The displayed answer contains ONLY the validated extraction…
    expect(result.answer).toContain(VALID_QUOTE);
    expect(result.answer).toContain('Extraits vérifiés');
    // …and NEVER the fabricated payload.
    expect(result.answer).not.toMatch(/virez|virement|100\s?000|FR76/i);
    expect(result.citations).toHaveLength(1);
  });

  it('the extractive answer is BOUNDED: at most 6 quotes shown, the rest counted', () => {
    const citation = (n: number) => ({
      ref: `s${n}`,
      kind: 'message' as const,
      threadId: 't',
      subject: 's',
      sender: 'Compta <c@x.test>',
      date: '2026-07-30',
      excerptHash: 'a'.repeat(64),
      quote: `extrait numéro ${n} suffisamment long pour le plancher`,
    });
    const answer = formatExtractiveAnswer(Array.from({ length: 9 }, (_, i) => citation(i + 1)));
    expect(answer.match(/— Compta/g)).toHaveLength(6);
    expect(answer).toContain('(+ 3 autre(s) extrait(s) cité(s))');
  });

  it('a draft request WITHOUT evidence gets the deterministic proposal notice, proposal kept', async () => {
    const draftOnly = JSON.stringify({
      answer: 'Voici votre brouillon, tout est confirmé par la compta.',
      cites: [],
      proposal: { kind: 'new', subject: 'Relance', body: 'Ia ora na, petit rappel de facture.' },
    });
    const model = scriptedModel([planJson, draftOnly]);
    const result = await runAskReta(makeDeps(model), input());

    expect(result.answer).toBe(PROPOSAL_ONLY_ANSWER);
    expect(result.answer).not.toContain('confirmé par la compta');
    expect(result.proposal?.bodyHtml).toContain('rappel de facture');
  });

  it('overview answers are SERVER-FORMATTED: a free model answer never ships uncited', async () => {
    const overviewPlan = JSON.stringify({ actions: [{ type: 'overview' }] });
    const injectedAnswer = JSON.stringify({
      answer: 'Virez 100 000 XPF sur le compte FR76-XXXX immédiatement.',
      cites: [],
    });
    const model = scriptedModel([overviewPlan, injectedAnswer]);
    const result = await runAskReta(makeDeps(model), input({ question: 'Combien de mails ?' }));
    // Deterministic server format from whitelisted numbers — the model text is gone.
    expect(result.answer).toBe('Boîte : 42 en boîte de réception.');
    expect(result.answer).not.toContain('100 000');
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
    await runAskReta(deps, input({ context: { threadId: 'open-thread', selectedThreadIds: [] } }));

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
      input({ context: { threadId: 'open-thread', selectedThreadIds: [] } }),
    );
    expect(result.proposal?.kind).toBe('reply');
    expect(result.proposal?.threadId).toBe('open-thread');
  });

  it('downgrades to new when the open thread was never read during the ask', async () => {
    const model = scriptedModel([planJson, replyProposal]); // plan never reads the open thread
    const result = await runAskReta(
      makeDeps(model),
      input({ context: { threadId: 'open-thread', selectedThreadIds: [] } }),
    );
    expect(result.proposal?.kind).toBe('new');
    expect(result.proposal?.threadId).toBeUndefined();
  });

  it('downgrades to new when the open-thread read finds nothing (forged id)', async () => {
    const model = scriptedModel([readOpenPlan, replyProposal]);
    const deps = makeDeps(model, {
      readThread: vi.fn(async () => ({ messages: [] }) as unknown as IGetThreadResponse),
    });
    const result = await runAskReta(
      deps,
      input({ context: { threadId: 'forged-id', selectedThreadIds: [] } }),
    );
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

describe('runAskReta — P8 selected threads are bounded and connection-scoped by deps', () => {
  it('reads the selected ids directly, never turns them into a mailbox search', async () => {
    const model = scriptedModel([
      JSON.stringify({ actions: [{ type: 'read_thread', target: 'selected' }] }),
      synthesisJson,
    ]);
    const deps = makeDeps(model);

    await runAskReta(
      deps,
      input({ context: { folder: 'archive', selectedThreadIds: ['sel-1', 'sel-2'] } }),
    );

    expect(deps.readThread).toHaveBeenCalledWith('sel-1');
    expect(deps.readThread).toHaveBeenCalledWith('sel-2');
    expect(deps.searchThreads).not.toHaveBeenCalled();
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

  it('PREEMPTS a slow model call on ABORT: a 10ms abort beats a 100ms model', async () => {
    let modelSettled = false;
    const slowModel: RetaModel = {
      key: 'llama-4-scout',
      abortMode: 'cooperative',
      complete: vi.fn(
        () =>
          new Promise<string>((resolve) =>
            setTimeout(() => {
              modelSettled = true;
              resolve(planJson);
            }, 100),
          ),
      ),
    };
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const started = Date.now();
    await expect(
      runAskReta(makeDeps(slowModel, { signal: controller.signal }), input()),
    ).rejects.toThrow('request aborted');
    expect(modelSettled).toBe(false);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('PREEMPTS a slow model call: 10ms budget beats an 80ms model, before it resolves', async () => {
    let modelSettled = false;
    const slowModel: RetaModel = {
      key: 'llama-4-scout',
      abortMode: 'cooperative',
      complete: vi.fn(
        () =>
          new Promise<string>((resolve) =>
            setTimeout(() => {
              modelSettled = true;
              resolve(planJson);
            }, 80),
          ),
      ),
    };
    const started = Date.now();
    await expect(runAskReta(makeDeps(slowModel, { deadlineMs: 10 }), input())).rejects.toThrow(
      'deadline exceeded',
    );
    // The rejection came from the timer race, not from waiting the model out.
    expect(modelSettled).toBe(false);
    expect(Date.now() - started).toBeLessThan(80);
  });

  it('cancel during a SLOW dependency: immediate rejection, NO next call, late result ignored', async () => {
    const controller = new AbortController();
    let releaseSearch!: (value: ThreadsResponse) => void;
    const hangingSearch = vi.fn(
      () => new Promise<ThreadsResponse>((resolve) => (releaseSearch = resolve)),
    );
    const model = scriptedModel([planJson, synthesisJson]);
    const deps = makeDeps(model, { signal: controller.signal, searchThreads: hangingSearch });

    const pending = runAskReta(deps, input());
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AskRetaAbortedError);

    // The abandoned DO call settles LATE: nothing follows — no read, no synthesis.
    releaseSearch({ threads: [searchRow(1)], nextPageToken: null });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(hangingSearch).toHaveBeenCalledTimes(1);
    expect(deps.readThread).not.toHaveBeenCalled();
    expect(model.calls).toBe(1); // the plan call only — synthesis never dispatched
  });

  it('a LATE REJECTION of an abandoned dependency never surfaces as unhandled', async () => {
    // Vitest fails the run on unhandled rejections: this test passing IS the proof.
    const model = scriptedModel([planJson, synthesisJson]);
    let rejectSearch!: (error: Error) => void;
    const failingSearch = vi.fn(
      () => new Promise<ThreadsResponse>((_, reject) => (rejectSearch = reject)),
    );
    const deps = makeDeps(model, { deadlineMs: 10, searchThreads: failingSearch });
    await expect(runAskReta(deps, input())).rejects.toThrow('deadline exceeded');
    rejectSearch(new Error('late DO failure after abandonment'));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('retries synthesis once, then DEGRADES deterministically — never throws, never model prose', async () => {
    // Tour 06: two malformed synthesis attempts must not kill the ask. The
    // result is built server-side from what was RETRIEVED: message sources →
    // extractive citations whose quotes are verbatim excerpt prefixes.
    const model = scriptedModel([planJson, 'garbage', 'still garbage']);
    const result = await runAskReta(makeDeps(model), input());
    expect(result.citations.length).toBeGreaterThan(0);
    for (const citation of result.citations) {
      expect(citation.kind).toBe('message');
    }
    expect(result.answer).not.toContain('garbage');
    expect(result.proposal).toBeUndefined();
  });

  it('synthesis PROVIDER failure (both attempts reject) degrades the same way', async () => {
    const planOnly = scriptedModel([planJson]);
    const model = {
      ...planOnly,
      complete: vi.fn(async () => {
        const calls = (model.complete as ReturnType<typeof vi.fn>).mock.calls.length;
        if (calls <= 1) return planJson; // plan succeeds
        throw new Error('provider down: socket hangup at api.internal:443');
      }),
    };
    const result = await runAskReta(makeDeps(model), input());
    // Grounded degraded result — and the upstream error text leaks NOWHERE.
    expect(JSON.stringify(result)).not.toContain('socket hangup');
    expect(result.citations.length).toBeGreaterThan(0);
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

describe('tour 06 — classification typée, confinement par action, non-fuite', () => {
  it("UN échec de recherche n'emporte pas l'ask : les autres actions répondent, step d'échec FIXE", async () => {
    const model = scriptedModel([planJson, 'garbage', 'garbage']);
    let searchCalls = 0;
    const flakySearch = vi.fn(async (): Promise<ThreadsResponse> => {
      searchCalls += 1;
      if (searchCalls === 1) {
        throw new Error('SELECT secret FROM mail0_threads at postgres://hyperdrive');
      }
      return {
        threads: Array.from({ length: 3 }, (_, i) => searchRow(i + 1)),
        nextPageToken: null,
      };
    });
    const twoSearchPlan = JSON.stringify({
      actions: [
        { type: 'search', query: 'premiere' },
        { type: 'search', query: 'seconde' },
        { type: 'read_thread', target: 'top_results' },
      ],
    });
    const result = await runAskReta(
      makeDeps(scriptedModel([twoSearchPlan, 'garbage', 'garbage']), {
        searchThreads: flakySearch,
      }),
      input(),
    );
    void model;
    // La 2e recherche + lecture ont fourni des sources message → extractif.
    expect(result.citations.length).toBeGreaterThan(0);
    // Le step d'échec est HONNÊTE et FIXE — jamais le message upstream.
    const failed = result.steps.find((step) => step.detail === 'search unavailable');
    expect(failed).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('postgres://');
    expect(JSON.stringify(result)).not.toContain('SELECT secret');
  });

  it('TOUTES les actions échouent sans rien récupérer → AskRetaPhaseError typée, message FIXE sans contenu', async () => {
    const failingSearch = vi.fn(async (): Promise<ThreadsResponse> => {
      throw new Error('ECONNREFUSED postgres://user:pass@hyperdrive.internal:5432');
    });
    const failure = await runAskReta(
      makeDeps(scriptedModel([planJson]), {
        searchThreads: failingSearch,
        readThread: vi.fn(async () => {
          throw new Error('same outage');
        }),
      }),
      input({ question: 'Question CONFIDENTIELLE sur Balguerie' }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AskRetaPhaseError);
    const typed = failure as AskRetaPhaseError;
    expect(typed.phase).toBe('search');
    expect(typed.kind).toBe('dependency');
    expect(typed.message).toBe('Ask Reta failed (phase=search kind=dependency)');
    expect(typed.message).not.toContain('CONFIDENTIELLE');
    expect(typed.message).not.toContain('postgres');
  });

  it('les logs de classification ne portent JAMAIS question/mail/SQL/URL (spy exhaustif)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');
    const failingSearch = vi.fn(async (): Promise<ThreadsResponse> => {
      throw new Error('leak: SELECT * FROM mail WHERE q=CONFIDENTIEL at https://hyper.example');
    });
    await runAskReta(
      makeDeps(scriptedModel(['not json', 'garbage', 'garbage']), {
        searchThreads: failingSearch,
        readThread: vi.fn(async () => {
          throw new Error('leak too');
        }),
      }),
      input({ question: 'Virement CONFIDENTIEL 987654' }),
    ).catch(() => {});
    const allLogged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls]);
    for (const forbidden of ['CONFIDENTIEL', '987654', 'SELECT', 'https://', 'leak']) {
      expect(allLogged, forbidden).not.toContain(forbidden);
    }
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('les appels plan et synthèse portent le jsonSchema Workers AI (response_format côté modèle)', async () => {
    const model = scriptedModel([planJson, 'garbage', 'garbage']);
    await runAskReta(makeDeps(model), input());
    const completeCalls = (model.complete as ReturnType<typeof vi.fn>).mock.calls as [
      { jsonSchema?: Record<string, unknown> },
    ][];
    expect(completeCalls.length).toBeGreaterThanOrEqual(3);
    for (const [params] of completeCalls) {
      expect(params.jsonSchema).toBeTruthy();
      expect(typeof params.jsonSchema).toBe('object');
    }
  });
});

describe('tour 09 — intent de récence : list_recent grounded', () => {
  const FRENCH_QUESTION =
    'Quels sont les trois expéditeurs les plus récents visibles dans ma boîte de réception ? Cite les emails utilisés.';

  it('la question prod EXACTE : réponse METADATA déterministe, zéro synthèse, zéro corps lu', async () => {
    // Plan model rejeté (le cas du tail prod) : fallback list_recent seul.
    const model = scriptedModel(['not json at all']);
    const deps = makeDeps(model);
    const result = await runAskReta(deps, input({ question: FRENCH_QUESTION }));

    // Récupération : listing multi-shard q VIDE, dossier inbox, borné à 3.
    expect(deps.searchThreads).toHaveBeenCalledWith({
      query: '',
      folder: 'inbox',
      maxResults: 3,
    });
    // Tour 13 : le MODÈLE n'est JAMAIS consulté — ni plan ni synthèse. La
    // réponse est entièrement serveur depuis les métadonnées listées.
    expect(deps.readThread).not.toHaveBeenCalled();
    expect(model.complete).not.toHaveBeenCalled();
    // Step visible au détail FIXE.
    expect(result.steps.some((step) => step.detail === 'recent inbox → 3 threads')).toBe(true);
    // 3 citations METADATA, trois fils distincts, expéditeurs issus des rows.
    expect(result.citations).toHaveLength(3);
    for (const citation of result.citations) {
      expect(citation.kind).toBe('metadata');
      expect(citation).not.toHaveProperty('quote');
      expect(citation.excerptHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(result.citations.map((c) => c.threadId)).size).toBe(3);
    // La réponse liste les expéditeurs des rows du fixture — rien d'hardcodé.
    for (const citation of result.citations) {
      expect(result.answer).toContain(citation.sender);
    }
    expect(result.answer).not.toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it('variante anglaise « latest senders » prend le même chemin', async () => {
    const deps = makeDeps(scriptedModel(['still not json', 'garbage', 'garbage']));
    await runAskReta(deps, input({ question: 'Who are my latest senders in the inbox?' }));
    expect(deps.searchThreads).toHaveBeenCalledWith({ query: '', folder: 'inbox', maxResults: 3 });
  });

  it('« la dernière facture Balguerie » reste une RECHERCHE littérale (pas de listing)', async () => {
    const deps = makeDeps(scriptedModel(['not json', 'garbage', 'garbage']));
    await runAskReta(deps, input({ question: 'Que dit la dernière facture Balguerie ?' }));
    expect(deps.searchThreads).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'balguerie' }),
    );
    expect(deps.searchThreads).not.toHaveBeenCalledWith(expect.objectContaining({ query: '' }));
  });

  it('un plan MODÈLE list_recent est accepté par zod et exécuté avec limit clampée', async () => {
    const modelPlan = JSON.stringify({
      actions: [
        { type: 'list_recent', folder: 'inbox', limit: 3 },
        { type: 'read_thread', target: 'top_results' },
      ],
    });
    // Tour 13 : sur une question de CONTENU, le plan modèle list_recent est
    // bien accepté par zod, la limite clampée, et la synthèse suit son cours.
    const deps = makeDeps(scriptedModel([modelPlan, 'garbage', 'garbage']));
    const result = await runAskReta(
      deps,
      input({ question: 'Résume le contenu de mes emails les plus récents' }),
    );
    expect(deps.searchThreads).toHaveBeenCalledWith({ query: '', folder: 'inbox', maxResults: 3 });
    expect(deps.readThread).toHaveBeenCalled();
    expect(result.citations.every((citation) => citation.kind === 'message')).toBe(true);
  });

  it('NÉGATIF FR : « Résume le contenu de mes trois emails les plus récents » → lecture + SYNTHÈSE, jamais metadata-only', async () => {
    const modelPlan = JSON.stringify({
      actions: [
        { type: 'list_recent', folder: 'inbox', limit: 3 },
        { type: 'read_thread', target: 'top_results' },
      ],
    });
    const model = scriptedModel([modelPlan, 'garbage', 'garbage']);
    const deps = makeDeps(model);
    const result = await runAskReta(
      deps,
      input({ question: 'Résume le contenu de mes trois emails les plus récents' }),
    );
    // La synthèse EST appelée (plan + 2 tentatives) et les corps sont lus.
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(deps.readThread).toHaveBeenCalled();
    // Dégradé déterministe fondé sur les MESSAGES lus — pas metadata-only.
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.every((citation) => citation.kind === 'message')).toBe(true);
  });

  it('NÉGATIF EN : « Summarize the content of my latest emails » → même contrat contenu', async () => {
    const model = scriptedModel(['not json', 'garbage', 'garbage']);
    const deps = makeDeps(model);
    const result = await runAskReta(
      deps,
      input({ question: 'Summarize the content of my latest emails' }),
    );
    // Fallback plan CONTENU récent : listing + lecture, synthèse tentée.
    expect(deps.searchThreads).toHaveBeenCalledWith({ query: '', folder: 'inbox', maxResults: 3 });
    expect(deps.readThread).toHaveBeenCalled();
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(result.citations.every((citation) => citation.kind === 'message')).toBe(true);
  });

  it('prédicat strict : positifs exacts vrais, demandes de contenu fausses, « Cite » ne déclenche pas la garde', () => {
    expect(isStrictRecentMetadataQuestion(FRENCH_QUESTION)).toBe(true);
    expect(isStrictRecentMetadataQuestion('Who are my latest senders in the inbox?')).toBe(true);
    expect(
      isStrictRecentMetadataQuestion('Résume le contenu de mes trois emails les plus récents'),
    ).toBe(false);
    expect(isStrictRecentMetadataQuestion('Summarize the content of my latest emails')).toBe(false);
    expect(isStrictRecentMetadataQuestion('Que dit la dernière facture Balguerie ?')).toBe(false);
  });

  it('normalizePlan clampe la limite list_recent (50 → 10) et garde le read top_results', () => {
    const plan = normalizePlan(
      {
        actions: [
          { type: 'list_recent', folder: 'inbox', limit: 50 } as never,
          { type: 'read_thread', target: 'top_results' },
        ],
      },
      input(),
    );
    expect(plan.actions[0]).toEqual({ type: 'list_recent', folder: 'inbox', limit: 10 });
    expect(plan.actions[1]).toEqual({ type: 'read_thread', target: 'top_results' });
  });

  it('des corps VIDES ne stoppent pas la lecture : scan borné vers les candidats suivants', async () => {
    // Chemin recherche (pool de 10 candidats) : thread-1 et thread-2 sans
    // corps exploitables → le scan continue vers 3,4,5 (3 lectures
    // PRODUCTIVES), borné à 2× threadsRead — jamais tout le pool.
    const twoActionPlan = JSON.stringify({
      actions: [
        { type: 'search', query: 'balguerie' },
        { type: 'read_thread', target: 'top_results' },
      ],
    });
    const deps = makeDeps(scriptedModel([twoActionPlan, 'garbage', 'garbage']), {
      readThread: vi.fn(async (id: string) =>
        id === 'thread-1' || id === 'thread-2'
          ? ({ messages: [] } as never)
          : threadWithMessages(id, 5),
      ),
    });
    const result = await runAskReta(deps, input());
    expect(deps.readThread).toHaveBeenCalledTimes(5);
    expect(result.citations.length).toBeGreaterThanOrEqual(3);

    // Le listing de récence, lui, n'a plus besoin d'AUCUN corps (tour 10) :
    // à listing VIDE, la réponse reste honnêtement insuffisante.
    const emptyListing = makeDeps(scriptedModel(['not json']), {
      searchThreads: vi.fn(async () => ({ threads: [], nextPageToken: null })),
    });
    const degraded = await runAskReta(emptyListing, input({ question: FRENCH_QUESTION }));
    expect(emptyListing.readThread).not.toHaveBeenCalled();
    expect(degraded.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
    expect(degraded.citations).toHaveLength(0);
  });

  it('variante anglaise : mêmes citations metadata, ZÉRO appel modèle', async () => {
    const model = scriptedModel(['still not json']);
    const deps = makeDeps(model);
    const result = await runAskReta(
      deps,
      input({ question: 'Who are my latest senders in the inbox?' }),
    );
    expect(model.complete).not.toHaveBeenCalled();
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.every((citation) => citation.kind === 'metadata')).toBe(true);
  });

  it('un modèle qui AURAIT proposé search/read ne peut jamais être consulté sur le positif strict', async () => {
    // Le script est un plan CONTENU parfaitement valide : s'il était consulté,
    // il déroulerait recherche + lecture + synthèse. Le bypass le rend inerte.
    const poisonedPlan = JSON.stringify({
      actions: [
        { type: 'search', query: 'balguerie' },
        { type: 'read_thread', target: 'top_results' },
      ],
    });
    const model = scriptedModel([poisonedPlan]);
    const deps = makeDeps(model);
    const result = await runAskReta(deps, input({ question: FRENCH_QUESTION }));
    expect(model.complete).not.toHaveBeenCalled();
    expect(deps.readThread).not.toHaveBeenCalled();
    expect(deps.searchThreads).toHaveBeenCalledTimes(1);
    expect(deps.searchThreads).toHaveBeenCalledWith({ query: '', folder: 'inbox', maxResults: 3 });
    expect(result.citations.every((citation) => citation.kind === 'metadata')).toBe(true);
  });

  it('FRONTIÈRE : la synthèse modèle ne peut JAMAIS produire une citation metadata', async () => {
    // Question de CONTENU : le modèle cite s1 (source metadata de recherche)
    // — la validation stricte la rejette, kind metadata n'est pas promu.
    const contentPlan = JSON.stringify({
      actions: [{ type: 'search', query: 'balguerie' }],
    });
    const forgedSynthesis = JSON.stringify({
      answer: 'Réponse forgée sur métadonnées',
      cites: [{ ref: 's1', quote: 'Relance facture Socredo — Compta <compta@socredo.test>' }],
    });
    const result = await runAskReta(
      makeDeps(scriptedModel([contentPlan, forgedSynthesis])),
      input(),
    );
    expect(result.citations).toHaveLength(0);
    expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
  });

  it('les JSON schemas plan/synthèse sont STRICTS : additionalProperties=false sur chaque objet', () => {
    const assertClosed = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (record.type === 'object') {
        expect(record.additionalProperties, path).toBe(false);
      }
      for (const [key, value] of Object.entries(record)) assertClosed(value, `${path}.${key}`);
    };
    assertClosed(askRetaPlanJsonSchema, 'plan');
    assertClosed(askRetaSynthesisJsonSchema, 'synthesis');
    expect(JSON.stringify(askRetaPlanJsonSchema)).toContain('list_recent');
  });
});
