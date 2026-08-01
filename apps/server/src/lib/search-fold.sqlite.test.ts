import { foldedLikeCondition, sqliteStringLiteral } from './search-fold';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
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

describe('tour 08 — limite Cloudflare DO : 100 paramètres liés max par requête', () => {
  // La condition EXACTE de buildTextSearchConditions (routes/agent/db) :
  // OR(subject, sender) — le cas prod qui dépassait 200 bindings.
  const twoColumnCondition = (needle: string) =>
    sql`SELECT subject, sender FROM t2 WHERE ${foldedLikeCondition(sql.raw('subject'), needle)} OR ${foldedLikeCondition(sql.raw('sender'), needle)}`;

  it('la condition deux-colonnes compile avec EXACTEMENT 4 paramètres liés (motif+escape ×2)', () => {
    const query = dialect.sqlToQuery(twoColumnCondition('réservation 100%'));
    expect(query.params).toHaveLength(4);
    // Seules les valeurs DÉRIVÉES DE L'UTILISATEUR sont liées : le motif
    // plié/neutralisé et le caractère ESCAPE — jamais l'alphabet de pliage.
    expect(query.params).toEqual(['%reservation 100\\%%', '\\', '%reservation 100\\%%', '\\']);
    expect(query.params.length).toBeLessThanOrEqual(100);
  });

  it('le SQL compilé reste très en dessous de 100 KB et chaque replace() a 3 arguments', () => {
    const query = dialect.sqlToQuery(twoColumnCondition('facture'));
    expect(query.sql.length).toBeLessThan(100_000);
    // Chaque replace( ... , ... , ... ) : l'exécution SQLite réelle ci-dessous
    // prouve l'arité ; on épingle aussi qu'aucune paire n'est devenue un
    // placeholder (l'alphabet est inline, en littéraux quotés).
    expect(query.sql).toContain('replace(');
    expect((query.sql.match(/\?/g) ?? []).length).toBe(4); // motif + escape, pour chacune des deux colonnes
  });

  it('la condition deux-colonnes S’EXÉCUTE sur SQLite réel : accents, %, _, backslash', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t2 (subject TEXT NOT NULL, sender TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO t2 (subject, sender) VALUES (?, ?)');
    insert.run('Facture Socredo', 'compta@socredo.pf');
    insert.run('Point équipe', 'Rémy <remy@chez-remy.pf>');
    insert.run('Remise 100% confirmée', 'ventes@x.pf');
    insert.run('rapport_final v2', 'ops@x.pf');
    insert.run('chemin a\\b réseau', 'infra@x.pf');

    const run = (needle: string) => {
      const query = dialect.sqlToQuery(twoColumnCondition(needle));
      return (
        db.prepare(query.sql).all(...(query.params as string[])) as { subject: string }[]
      ).map((row) => row.subject);
    };
    expect(run('socredo')).toEqual(['Facture Socredo']); // matche subject ET sender
    expect(run('rémy')).toEqual(['Point équipe']); // accent plié côté sender
    expect(run('100%')).toEqual(['Remise 100% confirmée']);
    expect(run('rapport_final')).toEqual(['rapport_final v2']);
    expect(run('a\\b')).toEqual(['chemin a\\b réseau']);
    db.close();
  });

  it("sqliteStringLiteral double les apostrophes et le littéral s'exécute tel quel", () => {
    expect(sqliteStringLiteral("l'avion")).toBe("'l''avion'");
    const db = new DatabaseSync(':memory:');
    const row = db.prepare(`SELECT ${sqliteStringLiteral("l'avion")} AS v`).get() as { v: string };
    expect(row.v).toBe("l'avion");
    db.close();
  });
});
