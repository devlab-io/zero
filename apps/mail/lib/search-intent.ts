/**
 * Classification déterministe de l'entrée de recherche (CUA 2026-07-30).
 *
 * Coût amont mesuré sur la voie palette : `handleSearch(query, true)` appelait
 * TOUJOURS `ai.generateSearchQuery` (aller-retour OpenAI) AVANT même de poser
 * `searchValue` — y compris pour une phrase littérale comme « Banque de
 * Tahiti ». Ce module décide si une requête peut COURT-CIRCUITER ce détour :
 * seule une phrase littérale simple est bypassée ; l'IA reste en place pour la
 * vraie intention naturelle (opérateurs Gmail, dates, mots d'intention,
 * négations, booléens).
 *
 * Asymétrie assumée des erreurs de classification :
 * - littéral classé « naturel » → statu quo (détour IA, plus lent, correct) ;
 * - naturel classé « littéral » → recherche plein-texte Gmail sur les mots
 *   tapés, résultats raisonnables mais non réécrits.
 * Le classifieur est donc CONSERVATEUR : au moindre signal d'intention, IA.
 */

/** Opérateur Gmail (`from:x`, `is:unread`, …) — un deux-points suivi d'un espace (« Re: sujet ») n'en est pas un. */
const GMAIL_OPERATOR = /(^|\s)[a-zA-Z_]+:[^\s]/;

/** Négation Gmail (`-facture`) en tête de mot. */
const NEGATION = /(^|\s)-\S/;

/** Booléens/joker de la syntaxe Gmail (majuscules exigées par Gmail). */
const BOOLEAN_SYNTAX = /\b(AND|OR|NOT)\b|[*{}()]/;

/** Signaux de date : 12/03, 2026-03-12, année seule, mois écrits (en/fr). */
const DATE_SIGNAL = new RegExp(
  String.raw`\b\d{1,2}[/-]\d{1,2}\b|\b(19|20)\d{2}\b|` +
    String.raw`\b(january|february|march|april|may|june|july|august|september|october|november|december|` +
    String.raw`janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b`,
  'i',
);

/**
 * Mots d'intention naturelle (en/fr). Volontairement SPÉCIFIQUES : pas de mots
 * grammaticaux courants (« de », « la », « with ») qui rendraient littéralement
 * imprononçable « Banque de Tahiti ». Les phrases (« pièce jointe », « non lu »)
 * sont testées comme sous-chaînes insensibles à la casse.
 */
const INTENT_WORDS = new RegExp(
  String.raw`\b(from|to|about|regarding|unread|starred|attachment|attachments|sent|received|` +
    String.raw`emails?|mails?|messages?|yesterday|today|tomorrow|last|week|month|year|before|after|since|between|newer|older|containing|` +
    String.raw`concernant|reçus?|recus?|envoyés?|envoyes?|hier|demain|semaine|mois|année|annee|derniers?|dernières?|dernieres?|avant|après|apres|depuis|entre|contenant)\b`,
  'i',
);

const INTENT_PHRASES = [
  'pièce jointe',
  'piece jointe',
  'pièces jointes',
  'pieces jointes',
  'non lu',
  'non lus',
  'à propos',
  'a propos',
  'de la part',
  "aujourd'hui",
];

const MAX_LITERAL_LENGTH = 80;
const MAX_LITERAL_WORDS = 8;

/**
 * true ⇔ la requête est une phrase littérale simple, exécutable telle quelle
 * (recherche exacte immédiate + préview projection) sans réécriture IA.
 */
export function isSimpleLiteralSearch(query: string): boolean {
  let text = query.trim();
  if (!text) return false;

  // Une phrase entre guillemets est littérale par déclaration ; on classifie
  // son contenu (un opérateur cité reste un opérateur pour Gmail).
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).trim();
    if (!text) return false;
  }

  if (text.length > MAX_LITERAL_LENGTH) return false;
  if (text.split(/\s+/).length > MAX_LITERAL_WORDS) return false;
  if (GMAIL_OPERATOR.test(text)) return false;
  if (NEGATION.test(text)) return false;
  if (BOOLEAN_SYNTAX.test(text)) return false;
  if (DATE_SIGNAL.test(text)) return false;
  if (INTENT_WORDS.test(text)) return false;

  const lower = text.toLowerCase();
  if (INTENT_PHRASES.some((phrase) => lower.includes(phrase))) return false;

  return true;
}
