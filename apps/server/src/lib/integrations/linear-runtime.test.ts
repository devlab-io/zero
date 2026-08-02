import { LinearApiError, type LinearIssueClient } from './linear-client';
import { withSingleAuthRetry } from './linear-runtime';
import { describe, expect, it, vi } from 'vitest';

const stubClient = (issueCreate: LinearIssueClient['issueCreate']): LinearIssueClient => ({
  issueCreate,
  findIssueByIdentifier: vi.fn(async () => null),
  listTeams: vi.fn(async () => []),
  listWorkflowStates: vi.fn(async () => []),
  listUsers: vi.fn(async () => []),
  organization: vi.fn(async () => ({ id: 'ws', name: 'WS' })),
});

describe('withSingleAuthRetry — UNE relance après refresh forcé, jamais de boucle', () => {
  it('401 → rebuild (refresh) puis relance qui réussit', async () => {
    const first = stubClient(
      vi.fn(async () => {
        throw new LinearApiError('linear_api_failed:401', 'unauthorized');
      }),
    );
    const second = stubClient(
      vi.fn(async () => ({ id: 'i1', identifier: 'ENG-1', url: 'https://linear.app/x' })),
    );
    const rebuild = vi.fn(async () => second);
    const client = withSingleAuthRetry(first, rebuild);
    await expect(client.issueCreate({ teamId: 'lt', title: 'T' })).resolves.toMatchObject({
      identifier: 'ENG-1',
    });
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('401 persistant après refresh → propagé FAIL CLOSED, rebuild UNE seule fois', async () => {
    const always401 = stubClient(
      vi.fn(async () => {
        throw new LinearApiError('linear_api_failed:401', 'unauthorized');
      }),
    );
    const rebuild = vi.fn(async () => always401);
    const client = withSingleAuthRetry(always401, rebuild);
    await expect(client.issueCreate({ teamId: 'lt', title: 'T' })).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    // Deuxième appel : le retry est déjà consommé — plus aucun rebuild.
    await expect(client.issueCreate({ teamId: 'lt', title: 'T' })).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('les erreurs NON-401 ne déclenchent JAMAIS le refresh', async () => {
    const failing = stubClient(
      vi.fn(async () => {
        throw new LinearApiError('linear_api_failed:graphql', 'unknown');
      }),
    );
    const rebuild = vi.fn();
    const client = withSingleAuthRetry(failing, rebuild as never);
    await expect(client.issueCreate({ teamId: 'lt', title: 'T' })).rejects.toMatchObject({
      kind: 'unknown',
    });
    expect(rebuild).not.toHaveBeenCalled();
  });
});
