import { z } from 'zod';

/**
 * Ask Reta — shared contracts (spec docs/spec/mail-copilot.md, slice 1).
 * Everything the panel sends or receives is validated here; every quantity the
 * pipeline may pull from the mailbox has a HARD cap in `askRetaLimits`.
 */

/** Slice-1 model catalogue: Workers AI only — zero external credentials. */
export const ASK_RETA_MODELS = {
  'llama-4-scout': '@cf/meta/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
} as const;

export type AskRetaModelKey = keyof typeof ASK_RETA_MODELS;

export const askRetaModelKeys = Object.keys(ASK_RETA_MODELS) as [
  AskRetaModelKey,
  ...AskRetaModelKey[],
];

export const DEFAULT_ASK_RETA_MODEL: AskRetaModelKey = 'llama-4-scout';

export const askRetaLimits = {
  questionChars: 2_000,
  historyTurns: 6,
  historyTurnChars: 2_000,
  draftChars: 8_000,
  planActions: 3,
  searchesPerAsk: 2,
  searchResults: 10,
  threadsRead: 3,
  messagesPerThread: 12,
  excerptChars: 1_200,
  citations: 12,
} as const;

export const askRetaInputSchema = z.object({
  question: z.string().trim().min(1).max(askRetaLimits.questionChars),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(askRetaLimits.historyTurnChars),
      }),
    )
    .max(askRetaLimits.historyTurns)
    .default([]),
  context: z
    .object({
      /** Thread currently open in the reader; ownership enforced server-side. */
      threadId: z.string().trim().max(200).optional(),
      /** Current unsent draft, as the composer sees it. */
      draft: z
        .object({
          subject: z.string().max(500).optional(),
          to: z.string().max(500).optional(),
          body: z.string().max(askRetaLimits.draftChars).optional(),
        })
        .optional(),
    })
    .default({}),
});

export type AskRetaInput = z.infer<typeof askRetaInputSchema>;

/** Model output 1 — the retrieval plan. Read-only actions ONLY, by construction. */
export const askRetaPlanSchema = z.object({
  actions: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('overview') }),
        z.object({
          type: z.literal('search'),
          query: z.string().trim().min(1).max(300),
          folder: z.string().trim().max(40).optional(),
        }),
        z.object({
          type: z.literal('read_thread'),
          target: z.enum(['open', 'top_results']),
        }),
      ]),
    )
    .max(askRetaLimits.planActions),
});

export type AskRetaPlan = z.infer<typeof askRetaPlanSchema>;

/**
 * Model output 2 — the grounded answer. Citation contract (v1, strict): every
 * cite MUST be `{ref, quote}` with a non-empty quote — the server then verifies
 * the quote is a substring of a MESSAGE source excerpt. Legacy string cites,
 * quote-less cites and malformed entries are DISCARDED at parse (the answer
 * survives with zero citations); metadata sources can never become evidence.
 */
/**
 * Substantial-evidence floor (re-review Codex 2026-08-01, P1): a one-character
 * "quote" is a substring of almost anything — it proves nothing. A quote must
 * be long enough and worded enough to be falsifiable evidence.
 */
export const askRetaEvidenceRules = {
  quoteMinChars: 24,
  quoteMinWords: 3,
} as const;

const askRetaCiteShape = z.object({
  ref: z.string().trim().min(1).max(16),
  quote: z
    .string()
    .trim()
    .min(askRetaEvidenceRules.quoteMinChars)
    .max(300)
    .refine(
      (quote) => quote.split(/\s+/).filter(Boolean).length >= askRetaEvidenceRules.quoteMinWords,
      { message: 'quote must contain at least 3 words' },
    ),
});

export type AskRetaCite = z.infer<typeof askRetaCiteShape>;

export const askRetaSynthesisSchema = z.object({
  answer: z.string().trim().min(1).max(8_000),
  cites: z
    .array(z.unknown())
    .max(32)
    .default([])
    .transform((entries) =>
      entries
        .flatMap((entry) => {
          const parsed = askRetaCiteShape.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        })
        .slice(0, askRetaLimits.citations),
    ),
  proposal: z
    .object({
      kind: z.enum(['reply', 'new']),
      to: z.string().max(500).optional(),
      subject: z.string().max(300).optional(),
      body: z.string().trim().min(1).max(12_000),
    })
    .optional(),
});

export type AskRetaSynthesis = z.infer<typeof askRetaSynthesisSchema>;

/** A retrieved element; `ref` is the only handle the model ever sees. */
export type AskRetaSource = {
  ref: string;
  /** 'metadata' = list row (subject/sender only); 'message' = real body text. */
  kind: 'metadata' | 'message';
  threadId: string;
  /** Present on message-kind sources only. */
  messageId?: string;
  subject: string;
  sender: string;
  date: string;
  excerpt: string;
  /** sha-256 of `excerpt` — audit trail that the citation matched mailbox content. */
  excerptHash: string;
};

/** v1: a citation is ALWAYS message-kind with a server-verified quote. */
export type AskRetaCitation = Omit<AskRetaSource, 'excerpt' | 'kind' | 'messageId'> & {
  kind: 'message';
  messageId?: string;
  /** Non-empty, verified as a substring of the source excerpt. */
  quote: string;
};

/** Metadata row of a search step — the exact thread set the search returned. */
export type AskRetaStepThread = {
  threadId: string;
  subject: string;
  sender: string;
  date: string;
};

export type AskRetaStep = {
  kind: 'overview' | 'search' | 'read_thread';
  detail: string;
  sourceRefs: string[];
  /** Search steps only: visible/replayable query + the exact metadata set. */
  search?: {
    query: string;
    folder?: string;
    threads: AskRetaStepThread[];
  };
};

/** NDJSON events of the slice-2 streaming transport (one JSON object per line). */
export type AskRetaStreamEvent =
  | { type: 'step'; step: AskRetaStep }
  | { type: 'result'; result: AskRetaResult }
  | { type: 'error'; message: string };

export type AskRetaProposal = {
  kind: 'reply' | 'new';
  to?: string;
  subject?: string;
  /** Sanitized through normalizeEmailRewriteHtml — safe for the composer. */
  bodyHtml: string;
  threadId?: string;
};

export type AskRetaResult = {
  answer: string;
  citations: AskRetaCitation[];
  proposal?: AskRetaProposal;
  steps: AskRetaStep[];
  model: AskRetaModelKey;
};
