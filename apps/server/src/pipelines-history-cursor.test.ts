import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZeroEnv } from './env';

/**
 * Preuve que l'ÉCHEC de lecture du curseur d'historique ne peut plus faire avancer ce
 * curseur — c'est-à-dire ne peut plus perdre de mail.
 *
 * Constat corrigé (pipelines.ts, `runMainWorkflow`) : la lecture était enveloppée d'un
 * `Effect.orElse(() => Effect.succeed(null))`. Un échec devenait donc indiscernable d'un
 * curseur ABSENT, et `null` fait démarrer `history.list` au `nextHistoryId` de CETTE
 * notification. La plage d'historique de la notification était sautée, le run se terminait
 * en succès, et `completeHistoryNotification` avançait ensuite le curseur au-delà de cette
 * plage : les messages qu'elle portait n'étaient plus jamais lus.
 *
 * La forme d'erreur testée est celle que la PRODUCTION produit : `getLastProcessedHistoryId`
 * est un appel RPC sur le Durable Object `ShardRegistry` (lib/connection-registry.ts →
 * routes/agent/shard-registry.ts). Son mode de panne est le rejet de cette promesse — DO
 * injoignable, storage en erreur, échec de sérialisation RPC. Le double rejette donc, et
 * rien d'autre.
 */

const PROJECT_ID = 'zero-project';
const CONNECTION_ID = '123e4567-e89b-42d3-a456-426614174000';
const SUBSCRIPTION = `projects/${PROJECT_ID}/subscriptions/notifications__${CONNECTION_ID}`;

const getLastProcessedHistoryId = vi.fn(async (): Promise<string | null> => null);
const claimHistoryNotification = vi.fn(async () => ({ action: 'claim', reason: 'fresh' }));
const completeHistoryNotification = vi.fn(async () => undefined);
const releaseHistoryNotification = vi.fn(async () => undefined);
const captureServerException = vi.fn(async () => undefined);

vi.mock('./lib/connection-registry', () => ({
  getConnectionRegistry: () => ({
    getLastProcessedHistoryId,
    claimHistoryNotification,
    completeHistoryNotification,
    releaseHistoryNotification,
  }),
}));
vi.mock('./lib/factories/google-subscription.factory', () => ({
  getServiceAccount: () => ({ project_id: PROJECT_ID }),
}));
vi.mock('./lib/sentry', () => ({ captureServerException }));
vi.mock('./lib/tracing', () => ({
  initTracing: () => ({
    startSpan: () => ({
      setAttributes: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    }),
  }),
}));
vi.mock('./lib/server-utils', () => ({ getThread: vi.fn(), getZeroAgent: vi.fn() }));
vi.mock('./lib/bulk-delete', () => ({ bulkDeleteKeys: vi.fn(async () => ({})) }));
vi.mock('./thread-workflow-utils/workflow-engine', () => ({ createDefaultWorkflows: vi.fn() }));
vi.mock('./db', () => ({ withDb: vi.fn() }));
vi.mock('./lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { WorkflowRunner } = await import('./pipelines');

const makeRunner = () =>
  new WorkflowRunner(
    {} as DurableObjectState,
    {
      HYPERDRIVE: { connectionString: 'postgres://x' },
    } as unknown as ZeroEnv,
  );

const params = { providerId: 'google', historyId: '900', subscriptionName: SUBSCRIPTION };

beforeEach(() => {
  getLastProcessedHistoryId.mockClear();
  claimHistoryNotification.mockClear();
  completeHistoryNotification.mockClear();
  releaseHistoryNotification.mockClear();
  captureServerException.mockClear();
  getLastProcessedHistoryId.mockImplementation(async () => null);
});

describe('runMainWorkflow — une lecture de curseur en échec ne fait JAMAIS avancer le curseur', () => {
  it('fait échouer le run quand la lecture du curseur rejette, sans avancer le curseur', async () => {
    getLastProcessedHistoryId.mockImplementation(async () => {
      // Forme de production : le RPC vers le Durable Object rejette.
      throw new Error('Network connection lost.');
    });

    const runner = makeRunner();

    await expect(runner.runMainWorkflow(params)).rejects.toThrow();

    // Le point non négociable : le curseur n'est pas avancé.
    expect(completeHistoryNotification).not.toHaveBeenCalled();
    // Et le workflow zero n'a même pas démarré, donc aucune plage n'a été « traitée ».
    expect(claimHistoryNotification).not.toHaveBeenCalled();
  });

  it('signale l’échec à Sentry plutôt que de l’avaler en silence', async () => {
    getLastProcessedHistoryId.mockImplementation(async () => {
      throw new Error('Network connection lost.');
    });

    await expect(makeRunner().runMainWorkflow(params)).rejects.toThrow();

    expect(captureServerException).toHaveBeenCalledTimes(1);
    expect(captureServerException).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ transaction: 'WorkflowRunner.runMainWorkflow' }),
    );
  });

  it('transmet le curseur LU au workflow zero quand la lecture aboutit', async () => {
    getLastProcessedHistoryId.mockImplementation(async () => '800');

    const runner = makeRunner();
    const runZeroWorkflow = vi
      .spyOn(runner, 'runZeroWorkflow')
      .mockResolvedValue('Zero workflow completed successfully');

    await expect(runner.runMainWorkflow(params)).resolves.toBe('Workflow completed successfully');

    expect(runZeroWorkflow).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      historyId: '800',
      nextHistoryId: '900',
    });
  });

  it('un curseur ABSENT reste un cas nominal : la première notification part de son propre historyId', async () => {
    // Distinction essentielle : `null` rendu par une lecture RÉUSSIE (aucune notification
    // encore traitée pour cette connexion) n'est pas une panne et ne doit pas le devenir.
    getLastProcessedHistoryId.mockImplementation(async () => null);

    const runner = makeRunner();
    const runZeroWorkflow = vi
      .spyOn(runner, 'runZeroWorkflow')
      .mockResolvedValue('Zero workflow completed successfully');

    await expect(runner.runMainWorkflow(params)).resolves.toBe('Workflow completed successfully');

    expect(runZeroWorkflow).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      historyId: '900',
      nextHistoryId: '900',
    });
    expect(captureServerException).not.toHaveBeenCalled();
  });
});
