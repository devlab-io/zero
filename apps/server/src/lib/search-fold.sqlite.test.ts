import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { foldedLikeCondition } from './search-fold';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { sql } from 'drizzle-orm';

/**
 * Intégration SQLite RÉELLE (tour 07, cause racine prod) : le SQL drizzle de
 * foldedLikeCondition est COMPILÉ puis EXÉCUTÉ contre un vrai moteur SQLite
 * (node:sqlite) — la même sémantique LIKE/ESCAPE que le SQLite des Durable
 * Objects. L'ancien template émettait `ESCAPE '\\'` (deux backslashes) et
 * SQLite rejetait CHAQUE recherche : « ESCAPE expression must be a single
 * character ».
 */

const dialect = new SQLiteSyncDialect();

const ROWS = [
  'Facture Socredo',
  'RÉSERVATION Restaurant Chez Rémy',
  'Remise 100% confirmée',
  'Remise 100 pourcent confirmée',
  'rapport_final v2',
  'rapportXfinal v2',
  'chemin a\\b réseau',
  'chemin ab réseau',
];

const searchWith = (needle: string): string[] => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (subject TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO t (subject) VALUES (?)');
  for (const row of ROWS) insert.run(row);

  const condition = foldedLikeCondition(sql.raw('subject'), needle);
  const query = dialect.sqlToQuery(sql`SELECT subject FROM t WHERE ${condition}`);
  const rows = db.prepare(query.sql).all(...(query.params as string[])) as { subject: string }[];
  db.close();
  return rows.map((row) => row.subject);
};

describe('foldedLikeCondition — exécution SQLite réelle', () => {
  it('le SQL compilé lie ESCAPE en paramètre : UN SEUL backslash', () => {
    const query = dialect.sqlToQuery(
      sql`SELECT 1 WHERE ${foldedLikeCondition(sql.raw('subject'), 'facture')}`,
    );
    expect(query.sql).toContain('ESCAPE ?');
    const escapeParam = query.params[query.params.length - 1];
    expect(escapeParam).toBe('\\');
    expect((escapeParam as string).length).toBe(1);
  });

  it('REPRO du bug prod : un littéral SQL à deux backslashes est rejeté par SQLite', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => db.prepare("SELECT 'a' LIKE '%a%' ESCAPE '\\\\'").get()).toThrow(
      /single character/,
    );
    db.close();
  });

  it('aiguille ordinaire : la recherche EXÉCUTE et matche', () => {
    expect(searchWith('facture')).toEqual(['Facture Socredo']);
  });

  it('accents/casse pliés des deux côtés', () => {
    expect(searchWith('réservation rémy')).toEqual([]);
    expect(searchWith('restaurant chez remy')).toEqual(['RÉSERVATION Restaurant Chez Rémy']);
    expect(searchWith('RÉSERVATION')).toEqual(['RÉSERVATION Restaurant Chez Rémy']);
  });

  it('% est littéral : « 100% » ne matche jamais « 100 pourcent »', () => {
    expect(searchWith('100%')).toEqual(['Remise 100% confirmée']);
  });

  it('_ est littéral : « rapport_final » ne matche jamais « rapportXfinal »', () => {
    expect(searchWith('rapport_final')).toEqual(['rapport_final v2']);
  });

  it('le backslash est littéral : « a\\b » matche la ligne au backslash, pas « ab »', () => {
    expect(searchWith('a\\b')).toEqual(['chemin a\\b réseau']);
  });
});
