import { beforeEach, describe, expect, it, vi } from 'vitest';

// Contrat r2 (Shortwave parity, sans IA) : le résumé de thread ne part JAMAIS
// sur le pipeline automatique d'arrivée de message — uniquement sur action
// utilisateur explicite (context.trigger === 'user').

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../lib/tracing', () => ({
  initTracing: () => ({
    startSpan: () => ({
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    }),
  }),
}));
vi.mock('../db/schema', () => ({ connection: {} }));
vi.mock('./index', () => ({ shouldGenerateDraft: vi.fn(async () => false) }));
vi.mock('./workflow-functions', () => ({
  workflowFunctions: {
    analyzeEmailIntent: vi.fn(async () => ({})),
    validateResponseNeeded: vi.fn(async () => ({})),
    generateAutomaticDraft: vi.fn(async () => ({})),
    createDraft: vi.fn(async () => ({})),
    cleanupWorkflowExecution: vi.fn(async () => ({})),
    findMessagesToVectorize: vi.fn(async () => ({})),
    vectorizeMessages: vi.fn(async () => ({})),
    upsertEmbeddings: vi.fn(async () => ({})),
    checkExistingSummary: vi.fn(async () => ({ existingSummary: null })),
    generateThreadSummary: vi.fn(async () => ({ summary: 'S' })),
    upsertThreadSummary: vi.fn(async () => ({ upserted: true })),
    getUserLabels: vi.fn(async () => ({ userAccountLabels: [] })),
    getUserTopics: vi.fn(async () => ({ userTopics: [] })),
    generateLabelSuggestions: vi.fn(async () => ({ suggestions: [], accountLabelsMap: {} })),
    syncLabels: vi.fn(async () => ({})),
  },
}));

const { createDefaultWorkflows, isUserTriggered } = await import('./workflow-engine');
const { workflowFunctions } = await import('./workflow-functions');
type WorkflowContext = import('./workflow-engine').WorkflowContext;

const makeContext = (trigger?: 'automatic' | 'user'): WorkflowContext =>
  ({
    connectionId: 'conn1',
    threadId: 't1',
    thread: {
      messages: [{ id: 'm1' }],
      latest: undefined,
      hasUnread: false,
      totalReplies: 1,
      labels: [],
    },
    foundConnection: {},
    trigger,
  }) as unknown as WorkflowContext;

const summarySpies = () =>
  [
    workflowFunctions.checkExistingSummary,
    workflowFunctions.generateThreadSummary,
    workflowFunctions.upsertThreadSummary,
  ] as unknown as ReturnType<typeof vi.fn>[];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('thread-summary — jamais sans action utilisateur', () => {
  it('pipeline automatique (trigger absent) : aucune étape résumé exécutée', async () => {
    const engine = createDefaultWorkflows();
    await engine.executeWorkflowChain(engine.getWorkflowNames(), makeContext());
    for (const spy of summarySpies()) expect(spy).not.toHaveBeenCalled();
  });

  it("trigger 'automatic' explicite : aucune étape résumé exécutée", async () => {
    const engine = createDefaultWorkflows();
    await engine.executeWorkflowChain(engine.getWorkflowNames(), makeContext('automatic'));
    for (const spy of summarySpies()) expect(spy).not.toHaveBeenCalled();
  });

  it("trigger 'user' : le workflow résumé tourne entièrement", async () => {
    const engine = createDefaultWorkflows();
    await engine.executeWorkflow('thread-summary', makeContext('user'));
    for (const spy of summarySpies()) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('isUserTriggered : user → true ; automatic/absent → false', () => {
    expect(isUserTriggered(makeContext('user'))).toBe(true);
    expect(isUserTriggered(makeContext('automatic'))).toBe(false);
    expect(isUserTriggered(makeContext())).toBe(false);
  });
});
