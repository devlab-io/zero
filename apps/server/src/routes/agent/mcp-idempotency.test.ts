import { describe, expect, it } from 'vitest';
import {
  IdempotencyConflictError,
  PayloadBoundIdempotency,
  type AtomicIdempotencyStorage,
  type IdempotencyTransaction,
} from './mcp-tools';

const memoryStorage = (): AtomicIdempotencyStorage => {
  const values = new Map<string, unknown>();
  const transaction: IdempotencyTransaction = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      values.set(key, value);
    },
  };
  return {
    ...transaction,
    transaction: async (closure) => closure(transaction),
  };
};

describe('payload-bound MCP idempotency', () => {
  it('creates one effect for 20 concurrent calls with the same connection, key, and payload', async () => {
    const idempotency = new PayloadBoundIdempotency(memoryStorage());
    let creates = 0;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        idempotency.execute({
          connectionId: 'conn-1',
          idempotencyKey: 'same-key',
          payload: { operation: 'createDraft', subject: 'Hello', message: 'Body' },
          effect: async () => {
            const id = `draft-${++creates}`;
            await Promise.resolve();
            return { id };
          },
        }),
      ),
    );

    expect(creates).toBe(1);
    expect(new Set(results.map((result) => result.value.id))).toEqual(new Set(['draft-1']));
    expect(results.filter((result) => result.deduped)).toHaveLength(19);
  });

  it('rejects the same connection and key with a different payload before any second effect', async () => {
    const idempotency = new PayloadBoundIdempotency(memoryStorage());
    let effects = 0;
    await idempotency.execute({
      connectionId: 'conn-1',
      idempotencyKey: 'same-key',
      payload: { operation: 'createDraft', subject: 'First' },
      effect: async () => ({ id: `draft-${++effects}` }),
    });

    await expect(
      idempotency.execute({
        connectionId: 'conn-1',
        idempotencyKey: 'same-key',
        payload: { operation: 'createDraft', subject: 'Different' },
        effect: async () => ({ id: `draft-${++effects}` }),
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(effects).toBe(1);
  });

  it('scopes the same key independently to each active connection', async () => {
    const idempotency = new PayloadBoundIdempotency(memoryStorage());
    let effects = 0;
    const run = (connectionId: string) =>
      idempotency.execute({
        connectionId,
        idempotencyKey: 'shared-key',
        payload: { operation: 'createDraft', subject: 'Same' },
        effect: async () => ({ id: `${connectionId}-${++effects}` }),
      });

    const [first, second] = await Promise.all([run('conn-a'), run('conn-b')]);
    expect(first.value.id).toMatch(/^conn-a-/);
    expect(second.value.id).toMatch(/^conn-b-/);
    expect(effects).toBe(2);
  });
});
