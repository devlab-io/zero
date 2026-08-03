import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

const createDrizzle = (conn: Sql) => drizzle(conn, { schema });

/** Cloudflare Hyperdrive's documented Postgres.js contract for Workers. */
export const POSTGRES_CONNECTION_OPTIONS = {
  max: 5,
  fetch_types: false,
  prepare: true,
} as const;

export const createDb = (url: string) => {
  const conn = postgres(url, POSTGRES_CONNECTION_OPTIONS);
  const db = createDrizzle(conn);
  return { db, conn };
};

export type DB = ReturnType<typeof createDrizzle>;
