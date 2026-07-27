// Fixtures partagées pour les tests du CLASSEMENT d'un échec d'envoi.
//
// Même philosophie que ses voisines (`batch-http-fake`, `google-http-fake`) : on injecte
// une fausse I/O, jamais un faux comportement produit. Ici l'I/O est l'erreur que rend la
// pile Google, et le « comportement produit » est l'enveloppe du driver.
//
// RAISON D'ÊTRE. Deux corrections successives de ce chemin ont été réfutées pour le même
// vice : des tests nourris de `{ code: 429 }`, une forme que le chemin d'ENVOI ne produit
// jamais. Ce module rend impossible de recommencer, en ne fabriquant que deux choses, et
// les deux sont réelles :
//
//   1. `gmailHttpFailure` / `gmailTransportFailure` construisent une VRAIE `GaxiosError` du
//      paquet installé (gaxios 6.7.1, une seule version dans le store pnpm, atteinte par la
//      réexportation `google-auth-library` — la même instance que celle d'@googleapis/gmail).
//   2. `envelopedSendFailure` la passe par la VRAIE enveloppe de production,
//      `new StandardizedError(err, operation)`, qui est mot pour mot ce que jette
//      `GmailTransport.withErrorHandler` (google-transport.ts : `throw new
//      StandardizedError(err, operation, context)`).
//
// VÉRIFIÉ dans node_modules/.pnpm/gaxios@6.7.1/.../build/src/common.js, constructeur de
// `GaxiosError` : `this.status = this.response.status` n'est posé que SI une réponse HTTP
// existe (ligne 79), et `this.code = error.code` uniquement sous
// `if (error && 'code' in error && error.code)` (ligne 82), c'est-à-dire seulement pour une
// panne de TRANSPORT. Un 429, un 403-quota ou un 400 de Gmail arrivent donc SANS `code` et
// AVEC `status` — l'inverse exact de ce que supposaient les fixtures réfutées.
//
// `send-failure-envelope.test.ts` démontre en outre que le passage par le vrai
// `withErrorHandler` produit bien la même enveloppe que `envelopedSendFailure` : les tests
// qui consomment ce module héritent donc de cette preuve sans avoir à monter le transport.
import { gaxios } from 'google-auth-library';
import { StandardizedError } from '../utils';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/**
 * Ce qu'une `GaxiosError` porte réellement, vu du code qui la classe. `status` et `code`
 * sont tous deux optionnels parce que la production ne pose JAMAIS les deux à la fois.
 */
type ProviderError = Error & { status?: number; code?: string };

/**
 * Verdict HTTP rendu par Gmail : la requête a été reçue et refusée.
 * Porte `status`, ne porte PAS `code`.
 */
export function gmailHttpFailure(
  status: number,
  reasons: string[] = [],
  // Gaxios compose lui-même `Request failed with status code N`. L'override n'existe que
  // pour UN usage, déclaré comme tel là où il sert : pincer la règle de PRÉCÉDENCE entre le
  // statut et l'heuristique de libellé réseau. Il ne fabrique pas une forme d'erreur — la
  // forme reste celle du vrai `GaxiosError` —, il ne choisit qu'une chaîne de message.
  message = `Request failed with status code ${status}`,
  // En-têtes de la RÉPONSE, exposés par gaxios sous `err.response.headers` — le seul endroit
  // où `parseRetryAfterMs` va chercher un `Retry-After` serveur.
  headers: Record<string, string> = {},
): ProviderError {
  return new gaxios.GaxiosError(
    message,
    { url: SEND_URL, method: 'POST' } as never,
    {
      status,
      statusText: 'error',
      headers,
      config: {},
      request: {},
      data: reasons.length
        ? {
            error: {
              code: status,
              message: 'refused',
              errors: reasons.map((reason) => ({ reason })),
            },
          }
        : {},
    } as never,
  );
}

/**
 * Panne de TRANSPORT : aucune réponse, donc aucun statut — mais un `code` machine hérité
 * de la cause undici. C'est le seul cas où la production pose un `code`.
 */
export function gmailTransportFailure(code = 'ECONNRESET'): ProviderError {
  const cause = Object.assign(new Error('socket hang up'), { code });
  return new gaxios.GaxiosError(
    'request to https://gmail.googleapis.com failed, reason: socket hang up',
    { url: SEND_URL, method: 'POST' } as never,
    undefined,
    cause,
  );
}

/**
 * L'erreur telle qu'elle SORT du driver : une `GaxiosError` réelle passée par l'enveloppe
 * de production. C'est exactement la valeur que `withErrorHandler` jette, et donc la seule
 * forme que `classifySendFailure` puisse rencontrer sur le chemin d'envoi.
 */
export function envelopedSendFailure(
  status: number,
  reasons: string[] = [],
  message?: string,
  operation = 'sendDraft',
): StandardizedError {
  return new StandardizedError(gmailHttpFailure(status, reasons, message), operation);
}

/** Idem, pour une panne de transport (`code` machine, aucun statut). */
export function envelopedTransportFailure(
  code = 'ECONNRESET',
  operation = 'sendDraft',
): StandardizedError {
  return new StandardizedError(gmailTransportFailure(code), operation);
}
