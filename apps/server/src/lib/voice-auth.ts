// lib/voice-auth.ts — garde du secret partagé des routes vocales (pitbull A7, axe 4).
//
// Le garde d'origine s'écrivait `env.VOICE_SECRET !== c.req.header('X-Voice-Secret')`.
// `VOICE_SECRET` n'est pas dans le schéma d'environnement requis au boot : là où il n'est
// pas défini, la comparaison devenait `undefined !== undefined`, donc FAUSSE — le garde
// laissait passer. Il ne restait qu'un numéro de téléphone (`X-Caller`) d'un utilisateur
// vérifié, qui n'est pas un secret, pour exécuter les outils de l'agent sur sa boîte mail.
//
// Deux règles ici : refuser d'abord quand le secret n'est pas configuré (fail-closed), et
// comparer en temps constant pour ne pas rendre le secret devinable octet par octet.

/** Comparaison à temps constant. `crypto.timingSafeEqual` n'existe pas sur Workers. */
export const secretsMatch = (expected: string, provided: string | undefined | null): boolean => {
  if (typeof provided !== 'string') return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(provided);

  // La longueur fuit de toute façon par le temps de l'encodage ; on ne sort pas tôt sur le
  // contenu, ce qui est la propriété qui compte.
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }

  return mismatch === 0;
};

/**
 * Vrai seulement si un secret vocal est configuré ET que l'appelant présente exactement
 * celui-ci. Un secret absent ou vide DÉSACTIVE la route au lieu de l'ouvrir.
 */
export const isAuthorizedVoiceCaller = (
  expected: string | undefined | null,
  providedHeader: string | undefined | null,
): boolean => {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  return secretsMatch(expected, providedHeader);
};
