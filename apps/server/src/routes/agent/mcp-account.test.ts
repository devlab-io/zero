import { describe, expect, it } from 'vitest';
import { ActiveAccountResolver, withManagedResource } from './mcp-account';

describe('MCP active-account and resource lifecycle', () => {
  it('resolves the agent again after switching from account A to account B', async () => {
    const accounts = [
      { id: 'conn-a', email: 'a@example.com', userId: 'user-1' },
      { id: 'conn-b', email: 'b@example.com', userId: 'user-1' },
      { id: 'conn-third-party', email: 'third@example.com', userId: 'user-2' },
    ];
    const resolver = new ActiveAccountResolver('user-1', {
      findFirstOwnedConnection: async (userId) => accounts.find((item) => item.userId === userId),
      findOwnedConnectionById: async (userId, id) =>
        accounts.find((item) => item.userId === userId && item.id === id),
      findOwnedConnectionByEmail: async (userId, email) =>
        accounts.find((item) => item.userId === userId && item.email === email),
      getAgent: async (connectionId) => ({ connectionId }),
    });

    await resolver.initialize();
    expect((await resolver.getActiveAgent()).agent.connectionId).toBe('conn-a');
    await resolver.setActiveByEmail('b@example.com');
    for (const operation of ['list', 'get', 'create']) {
      expect({ operation, connectionId: (await resolver.getActiveAgent()).agent.connectionId })
        .toMatchObject({ connectionId: 'conn-b' });
    }
    const thirdParty = resolver.setActiveByEmail('third@example.com');
    const absent = resolver.setActiveByEmail('absent@example.com');
    await expect(thirdParty).rejects.toThrow('Connection not found');
    await expect(absent).rejects.toThrow('Connection not found');
  });

  it('opens and closes a distinct DB resource for 25 sequential calls', async () => {
    let opens = 0;
    let closes = 0;
    const seen: number[] = [];

    for (let index = 0; index < 25; index += 1) {
      await withManagedResource(
        () => {
          const id = ++opens;
          return {
            value: { id, closed: false },
            close: async () => {
              closes += 1;
            },
          };
        },
        async (resource) => {
          seen.push(resource.id);
        },
      );
    }

    expect(seen).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(opens).toBe(25);
    expect(closes).toBe(25);
  });
});
