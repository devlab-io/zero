// tests/stubs/sqlite-sql-storage.ts — substrat SQL réel pour tester un Durable Object en
// Node.
//
// Ce n'est PAS une simulation du comportement testé : c'est le moteur en dessous. Le
// module fournit une implémentation de l'interface `SqlStorage` de Cloudflare adossée à
// `node:sqlite` (SQLite, le même moteur que le stockage SQL d'un Durable Object). Les
// propriétés que les tests exercent — PRIMARY KEY, `ON CONFLICT ... DO UPDATE ... WHERE`,
// `rowsWritten`, exécution SYNCHRONE d'un `exec` — sont celles de SQLite, pas des nôtres.
//
// Ce qui reste hors substrat : la sérialisation des invocations concurrentes par le
// runtime des DO. C'est justement pourquoi `reserveScheduledSend` n'en dépend pas — son
// écriture est un compare-and-set (`WHERE`) dont le résultat est vérifié via
// `rowsWritten`. Un test peut donc entrelacer deux appels et constater qu'un seul gagne.

import { DatabaseSync } from 'node:sqlite';

type Bindings = unknown[];

export interface SqlCursorLike<T> {
  toArray(): T[];
  one(): T;
  columnNames: string[];
  rowsRead: number;
  rowsWritten: number;
  [Symbol.iterator](): IterableIterator<T>;
}

function isSelectLike(query: string): boolean {
  const head = query.trim().replace(/^\(+/, '').slice(0, 12).toLowerCase();
  return head.startsWith('select') || head.startsWith('pragma') || head.startsWith('with');
}

/**
 * `SqlStorage` de Cloudflare adossé à SQLite. `exec` est synchrone, comme dans le runtime :
 * c'est cette propriété qui rend possible un couple lecture/écriture sans point d'await.
 */
export function createSqliteSqlStorage() {
  const db = new DatabaseSync(':memory:');
  /** Compteur d'appels, pour tracer les entrelacements dans un test de concurrence. */
  const calls: string[] = [];

  const exec = <T>(query: string, ...bindings: Bindings): SqlCursorLike<T> => {
    calls.push(query.trim().split('\n')[0]);
    const statement = db.prepare(query);
    const params = bindings.map((b) => (b === undefined ? null : b)) as never[];

    if (isSelectLike(query)) {
      const rows = statement.all(...params) as T[];
      const cursor: SqlCursorLike<T> = {
        toArray: () => rows,
        one: () => rows[0],
        columnNames: rows.length > 0 ? Object.keys(rows[0] as object) : [],
        rowsRead: rows.length,
        rowsWritten: 0,
        [Symbol.iterator]: () => rows[Symbol.iterator](),
      };
      return cursor;
    }

    const info = statement.run(...params);
    const written = Number(info.changes ?? 0);
    const cursor: SqlCursorLike<T> = {
      toArray: () => [],
      one: () => undefined as unknown as T,
      columnNames: [],
      rowsRead: 0,
      rowsWritten: written,
      [Symbol.iterator]: () => [][Symbol.iterator]() as IterableIterator<T>,
    };
    return cursor;
  };

  return { db, calls, sql: { exec } };
}

/**
 * `DurableObjectState` minimal : la seule surface qu'un DO `@Migratable`/`@Queryable`
 * touche à la construction est `ctx.storage.sql`.
 */
export function createDurableObjectCtx() {
  const storage = createSqliteSqlStorage();
  return { ctx: { storage: { sql: storage.sql } }, storage };
}
