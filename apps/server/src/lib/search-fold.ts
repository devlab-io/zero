/**
 * Normalisation déterministe de la recherche projection (contrat
 * shortwave-parity, item 2) : accents pliés vers l'ASCII, casse abaissée,
 * espaces réduits — des DEUX côtés de la comparaison LIKE.
 *
 * SQLite (DO) : `LIKE` n'est insensible à la casse que pour l'ASCII et ne plie
 * jamais les accents — « réservation » ne trouvait ni « Réservation » ni
 * « Restaurant Chez Rémy ». Aucune UDF n'est enregistrable dans le SQLite des
 * Durable Objects : le pliage colonne est donc une chaîne de `replace()` SQL
 * générée depuis LA MÊME table que le pliage JS de l'aiguille
 * ({@link foldSearchText}), garantissant l'accord des deux sémantiques.
 * `lower()` SQL ne pliant que l'ASCII, la table porte explicitement les deux
 * casses de chaque caractère accentué.
 *
 * Le client applique la même normalisation dans
 * apps/mail/lib/search-fold.ts : les deux fichiers doivent évoluer ensemble.
 */
import { sql, type SQL } from 'drizzle-orm';

/**
 * Caractère accentué → ASCII, les deux casses listées explicitement (couverture
 * latin-1 + œ/æ, l'alphabet réel des boîtes FR/EN visées). La décomposition NFD
 * de l'aiguille JS couvre davantage ; un caractère hors table ne matchait pas
 * avant et ne matche toujours pas — jamais de faux positif nouveau.
 */
export const SEARCH_FOLD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['à', 'a'],
  ['â', 'a'],
  ['ä', 'a'],
  ['á', 'a'],
  ['ã', 'a'],
  ['À', 'a'],
  ['Â', 'a'],
  ['Ä', 'a'],
  ['Á', 'a'],
  ['Ã', 'a'],
  ['ç', 'c'],
  ['Ç', 'c'],
  ['é', 'e'],
  ['è', 'e'],
  ['ê', 'e'],
  ['ë', 'e'],
  ['É', 'e'],
  ['È', 'e'],
  ['Ê', 'e'],
  ['Ë', 'e'],
  ['î', 'i'],
  ['ï', 'i'],
  ['í', 'i'],
  ['Î', 'i'],
  ['Ï', 'i'],
  ['Í', 'i'],
  ['ñ', 'n'],
  ['Ñ', 'n'],
  ['ô', 'o'],
  ['ö', 'o'],
  ['ó', 'o'],
  ['õ', 'o'],
  ['Ô', 'o'],
  ['Ö', 'o'],
  ['Ó', 'o'],
  ['Õ', 'o'],
  ['ù', 'u'],
  ['û', 'u'],
  ['ü', 'u'],
  ['ú', 'u'],
  ['Ù', 'u'],
  ['Û', 'u'],
  ['Ü', 'u'],
  ['Ú', 'u'],
  ['ÿ', 'y'],
  ['Ÿ', 'y'],
  ['ý', 'y'],
  ['Ý', 'y'],
  ['œ', 'oe'],
  ['Œ', 'oe'],
  ['æ', 'ae'],
  ['Æ', 'ae'],
];

/** Séparateurs de sujet qui doivent se comporter comme des frontières de mots. */
export const SEARCH_SEPARATOR_PAIRS: ReadonlyArray<readonly [string, string]> = [['/', ' ']];

/** Pliage JS de l'aiguille : accents → ASCII (NFD + table), minuscules, espaces réduits. */
export function foldSearchText(text: string): string {
  let folded = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  folded = folded.toLowerCase();
  folded = folded.replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  for (const [from, to] of SEARCH_SEPARATOR_PAIRS) {
    folded = folded.replaceAll(from, to);
  }
  return folded.replace(/\s+/g, ' ').trim();
}

/**
 * Motif LIKE `%needle%` avec métacaractères SQLite neutralisés (`%`, `_`, et
 * `\` lui-même) — à utiliser avec {@link foldedLikeCondition}, qui déclare
 * `ESCAPE '\'`. Le motif est TOUJOURS un substring littéral.
 */
export function toLikePattern(foldedNeedle: string): string {
  return `%${foldedNeedle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Littéral chaîne SQLite pour CONSTANTES INTERNES UNIQUEMENT (quotes simples
 * doublées). JAMAIS pour une donnée utilisateur : l'aiguille et le caractère
 * ESCAPE restent des paramètres liés — seul l'alphabet de pliage hardcodé
 * ci-dessus passe par ce chemin.
 */
export const sqliteStringLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/**
 * Expression SQL pliant une colonne texte avec la même table que
 * {@link foldSearchText}. Les paires sont insérées comme LITTÉRAUX SQL
 * statiques, pas comme paramètres liés (tour 08) : le SQLite des Durable
 * Objects plafonne à 100 paramètres liés par requête — ~54 paires × 2 params
 * × 2 colonnes (subject OR sender) dépassaient 200 bindings et CHAQUE
 * recherche projection échouait en production (le node:sqlite local, plus
 * permissif, ne le montrait pas). La condition compilée complète ne lie plus
 * que le motif utilisateur et le caractère ESCAPE.
 */
export function foldedColumn(column: SQL | SQL.Aliased | unknown): SQL {
  let expr = sql`${column}`;
  for (const [from, to] of SEARCH_FOLD_PAIRS) {
    expr = sql`replace(${expr}, ${sql.raw(sqliteStringLiteral(from))}, ${sql.raw(sqliteStringLiteral(to))})`;
  }
  for (const [from, to] of SEARCH_SEPARATOR_PAIRS) {
    expr = sql`replace(${expr}, ${sql.raw(sqliteStringLiteral(from))}, ${sql.raw(sqliteStringLiteral(to))})`;
  }
  // SQLite has no regexp replace in Durable Objects. Three deterministic
  // passes collapse runs up to eight spaces, enough for adjacent separators
  // while keeping the expression portable and index-free.
  for (let pass = 0; pass < 3; pass += 1) {
    expr = sql`replace(${expr}, '  ', ' ')`;
  }
  return sql`trim(lower(${expr}))`;
}

/**
 * Condition `colonne LIKE %aiguille%` insensible aux accents/casse, aiguille
 * traitée littéralement (ESCAPE). L'aiguille est pliée ici : passer le texte brut.
 *
 * ESCAPE doit être UN SEUL caractère en SQLite. L'ancien template émettait
 * `ESCAPE '\\'` dans le SQL final — DEUX backslashes entre quotes — et SQLite
 * rejetait chaque recherche avec « ESCAPE expression must be a single
 * character » (la panne prod phase=search kind=dependency, tour 07). Le
 * caractère d'échappement est désormais un PARAMÈTRE LIÉ : exactement un
 * backslash, zéro subtilité de quoting SQL, injection impossible par
 * construction. La neutralisation de `%`, `_` et `\` dans l'aiguille
 * ({@link toLikePattern}) est inchangée.
 */
export function foldedLikeCondition(column: SQL | SQL.Aliased | unknown, rawNeedle: string): SQL {
  return sql`${foldedColumn(column)} LIKE ${toLikePattern(foldSearchText(rawNeedle))} ESCAPE ${'\\'}`;
}
