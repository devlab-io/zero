import { runMcpDbOpWithFreshDb, type McpDbFactory } from './mcp-db-operation';
import { describe, expect, it, vi } from 'vitest';
import type { DB } from '../../db';

const makeFactory = () => {
  const db = {} as DB;
  const end = vi.fn().mockResolvedValue(undefined);
  const factory = vi.fn(() => ({ db, conn: { end } })) as McpDbFactory;
  return { db, end, factory };
};

describe('runMcpDbOpWithFreshDb', () => {
  it('creates and closes one client for a successful MCP database operation', async () => {
    const { db, end, factory } = makeFactory();
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(runMcpDbOpWithFreshDb('postgres://hyperdrive', operation, factory)).resolves.toBe(
      'ok',
    );

    expect(factory).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(db);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it('closes the client without masking an operation failure', async () => {
    const { end, factory } = makeFactory();
    const failure = new Error('query failed');
    const logSink = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      runMcpDbOpWithFreshDb(
        'postgres://hyperdrive',
        async () => {
          throw failure;
        },
        factory,
      ),
    ).rejects.toBe(failure);

    expect(end).toHaveBeenCalledWith({ timeout: 2 });
    expect(String(logSink.mock.calls[0]?.[0])).toContain('[mcp-db] operation failed');
  });
});
