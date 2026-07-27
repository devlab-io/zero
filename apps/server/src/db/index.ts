import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { logger } from '../lib/logger';
import * as schema from './schema';

const createDrizzle = (conn: Sql) => drizzle(conn, { schema });

export const createDb = (url: string) => {
  const conn = postgres(url);
  const db = createDrizzle(conn);
  return { db, conn };
};

export type DB = ReturnType<typeof createDrizzle>;

/**
 * Emprunte une connexion Postgres le temps de `run`, et la relâche DANS TOUS LES CAS.
 *
 * `createDb` ouvre une connexion ; sur les 19 sites qui l'appelaient, une minorité
 * seulement la refermait, et presque toujours sur le seul chemin nominal — un
 * `return` anticipé, une requête qui lève, un rejeu `pRetry` suffisaient à laisser la
 * connexion ouverte jusqu'à l'éviction de l'isolate. Sur Workers derrière Hyperdrive,
 * ces connexions abandonnées s'accumulent et finissent par saturer le pool.
 *
 * Le `finally` est le point non négociable : c'est lui, et non la discipline de chaque
 * appelant, qui garantit la libération.
 */
export const withDb = async <T>(url: string, run: (db: DB) => Promise<T>): Promise<T> => {
  const { db, conn } = createDb(url);
  try {
    return await run(db);
  } finally {
    // La libération ne doit jamais MASQUER l'erreur d'origine : un `conn.end()` qui
    // échoue dans un `finally` remplacerait l'exception que l'appelant doit voir par
    // une panne de fermeture sans intérêt diagnostique.
    await conn.end().catch((error: unknown) => {
      logger.error('[DB] échec de la libération de la connexion Postgres', error);
    });
  }
};
