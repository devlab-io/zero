/**
 * Chemin RAPIDE de GET /api/auth/get-session (r14).
 *
 * Preuve CUA staging r13 : la RTT get-session authentifiée coûte 1,12-1,54 s
 * alors que bundle+route+liste tiennent en ~200 ms. Cause serveur : le
 * middleware global de l'app /api exécutait createAuth() PUIS
 * auth.api.getSession() pour TOUTE requête — y compris /auth/get-session,
 * dont le handler better-auth résolvait ensuite la session une DEUXIÈME fois.
 *
 * Ici : UNE seule résolution. La route dédiée (enregistrée AVANT le
 * middleware global dans routes/index.ts) appelle createAuth() puis délègue
 * directement au handler better-auth — le MÊME handler, avec plugins,
 * cookieCache et cookies inchangés : la réponse est identique octet pour
 * octet à celle d'avant (c'était déjà lui qui la produisait), on retire
 * seulement la pré-résolution redondante et le tracing par-requête.
 *
 * Rien d'affaibli : les autres /auth/* (OAuth, callbacks, sign-out) gardent
 * le middleware complet ; tRPC garde sa pré-auth exactement comme avant ;
 * le fallback bearer de la pré-auth n'alimentait que c.var.sessionUser (tRPC),
 * jamais la réponse du handler /auth/* — sémantique inchangée.
 *
 * Server-Timing (staging-safe : durées uniquement, aucune donnée) découpe
 * create-auth / handler / total pour la lecture CUA.
 */

type AuthLike = {
  handler: (request: Request) => Promise<Response>;
};

export async function handleGetSessionFast(
  createAuthFn: () => Promise<AuthLike>,
  request: Request,
): Promise<Response> {
  const startedAt = Date.now();
  const auth = await createAuthFn();
  const authReadyAt = Date.now();
  const upstream = await auth.handler(request);
  const handledAt = Date.now();

  // Copie mutable : préserve status/statusText/headers (Set-Cookie compris).
  const response = new Response(upstream.body, upstream);
  response.headers.append(
    'Server-Timing',
    `create-auth;dur=${authReadyAt - startedAt}, handler;dur=${handledAt - authReadyAt}, total;dur=${handledAt - startedAt}`,
  );
  return response;
}
