// Fixtures partagées pour les tests du transport Gmail : fakes multipart `batch` (zéro
// réseau) et deps de backoff instantanées. Réutilisées par gmail-batch et google-transport.
import type { BackoffDeps } from '../gmail-backoff';
import type { BatchHttp } from '../gmail-batch';

/** Deps de backoff déterministes : aucun timer réel, random figé. */
export const instantBackoffDeps: BackoffDeps = { sleep: async () => {}, random: () => 0.5 };

/** Nombre de sous-requêtes dans un corps multipart (compte les `Content-ID:`). */
export const countSubRequests = (body: string): number =>
  (body.match(/Content-ID:/g) || []).length;

/** Réponse multipart synthétique : n parties, toutes 200, corps JSON `{"i":k}`. */
export function buildFakeResponse(n: number, boundary: string): string {
  const parts = Array.from({ length: n }, (_, i) =>
    [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <response-item-${i}>`,
      '',
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      '',
      JSON.stringify({ i }),
    ].join('\r\n'),
  );
  return parts.join('\r\n') + `\r\n--${boundary}--\r\n`;
}

/**
 * Réponse multipart 200 dont CHAQUE sous-partie porte son propre status HTTP. Corps
 * `{data}` pour les pièces jointes ; sinon `{i}`. Sert les chemins d'erreur de sous-réponse.
 */
export function buildMixedResponse(
  statuses: number[],
  boundary: string,
  bodyFor?: (i: number, status: number) => unknown,
): string {
  const parts = statuses.map((status, i) => {
    const ok = status >= 200 && status < 300;
    const body = ok
      ? JSON.stringify(bodyFor ? bodyFor(i, status) : { i })
      : JSON.stringify({ error: { code: status } });
    return [
      `--${boundary}`,
      'Content-Type: application/http',
      `Content-ID: <response-item-${i}>`,
      '',
      `HTTP/1.1 ${status} X`,
      'Content-Type: application/json',
      '',
      body,
    ].join('\r\n');
  });
  return parts.join('\r\n') + `\r\n--${boundary}--\r\n`;
}

/** Status par sous-requête selon son path : contient `needle` → `badStatus`, sinon 200. */
export const statusByPath = (body: string, needle: string, badStatus: number): number[] =>
  [...body.matchAll(/(?:GET|POST) (\S+)/g)].map((m) => (m[1].includes(needle) ? badStatus : 200));

/**
 * Fabrique un `BatchHttp` fake qui renvoie systématiquement une réponse 200 multipart
 * avec autant de parties 200 que de sous-requêtes reçues. Capture chaque corps de requête
 * envoyé dans `capturedBodies` pour assertions (paths, format, quotaUser…).
 */
export function makeCapturingBatchHttp(): { http: BatchHttp; capturedBodies: string[] } {
  const capturedBodies: string[] = [];
  const http: BatchHttp = async (req) => {
    capturedBodies.push(req.body);
    const n = countSubRequests(req.body);
    return {
      status: 200,
      contentType: 'multipart/mixed; boundary=resp',
      text: buildFakeResponse(n, 'resp'),
    };
  };
  return { http, capturedBodies };
}
