import { createDb, type DB } from '../../db';

type CloseableConnection = {
  end(options: { timeout: number }): Promise<unknown>;
};

export type McpDbFactory = (connectionString: string) => {
  db: DB;
  conn: CloseableConnection;
};

/**
 * Run one MCP database operation with a connection owned by that invocation.
 *
 * Cloudflare Workers does not allow postgres.js sockets created in an earlier
 * request to be reused by a later Durable Object RPC. MCP handlers therefore
 * must never capture the client opened by `init()`.
 */
export async function runMcpDbOpWithFreshDb<T>(
  connectionString: string,
  operation: (db: DB) => Promise<T>,
  factory: McpDbFactory = createDb,
): Promise<T> {
  const { db, conn } = factory(connectionString);
  try {
    return await operation(db);
  } finally {
    await conn.end({ timeout: 2 }).catch(() => {});
  }
}
