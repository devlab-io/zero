// lib/agent-authorization.ts — authorisation guard for the agents Durable Object
// namespace (pitbull A1, axe 4).
//
// `hono-agents` routes `/agents/:namespace/:name/*` straight to a DO instance whose
// name IS the connectionId, and the agent's tools (routes/agent/tools.ts) act on that
// connection's mailbox. Before this module the only guard was an `onBeforeConnect` that
// checked the mere PRESENCE of a Cookie header, and no `onBeforeRequest` at all — so the
// HTTP half of the namespace (e.g. `/agents/zero-agent/<id>/get-messages`) answered 200
// with no authentication whatsoever, and the WebSocket half accepted any cookie-bearing
// caller regardless of who owned the connection.
//
// Two checks, applied to BOTH branches (partyserver calls `onBeforeConnect` on an Upgrade
// request and `onBeforeRequest` otherwise; returning a Response short-circuits the route):
//   1. a valid session must resolve from the request headers;
//   2. the DO name must be a connection owned by that session's user.
//
// Dependencies are injected so the policy is unit-testable without better-auth or a DO
// binding; routes/index.ts supplies the real `createAuth()` / `getZeroDB()` lookups.

import { personalAgentName } from '@zero/types';

import { logger } from './logger';

/** Lobby shape handed to the partyserver hooks; only the DO name matters here. */
export type AgentLobby = { name: string };

export type AgentAuthorizationDeps = {
  /** Resolve the caller's user id from request headers, or undefined when anonymous. */
  resolveUserId: (headers: Headers) => Promise<string | undefined>;
  /** True when `connectionId` belongs to `userId`. */
  ownsConnection: (userId: string, connectionId: string) => Promise<boolean>;
};

const deny = (status: 401 | 403 | 503, body: string) => new Response(body, { status });

/**
 * Returns a Response to refuse the request, or undefined to let it through.
 * Every failure path fails CLOSED, including transient lookup errors.
 */
export async function authorizeAgentAccess(
  request: Request,
  lobby: AgentLobby,
  deps: AgentAuthorizationDeps,
): Promise<Response | undefined> {
  let userId: string | undefined;
  try {
    userId = await deps.resolveUserId(request.headers);
  } catch (error) {
    logger.error('agent authorization: session lookup failed', error);
    return deny(503, 'Service Unavailable');
  }

  if (!userId) return deny(401, 'Unauthorized');

  // Instance PERSONNELLE de l'appelant : accordée sur l'égalité EXACTE avec le nom dérivé
  // de SA session, jamais sur un préfixe. Proposer `user-<autre-utilisateur>` retombe donc
  // sur la vérification de propriété ci-dessous, qui ne trouve aucune connexion de ce nom
  // et refuse (403).
  //
  // Il n'y a plus d'exemption pour un nom PARTAGÉ. `general` exemptait autrefois tout
  // porteur de session sans regarder ni propriétaire ni locataire, et `partyserver` fait
  // du nom l'identité du stockage : tous les utilisateurs se retrouvaient dans la même
  // instance de Durable Object, donc dans la même table de messages. Ce nom est désormais
  // traité comme n'importe quel autre — aucun utilisateur ne possède de connexion qui
  // s'appelle ainsi, il est donc refusé.
  if (lobby.name === personalAgentName(userId)) return undefined;

  let owned: boolean;
  try {
    owned = await deps.ownsConnection(userId, lobby.name);
  } catch (error) {
    logger.error('agent authorization: connection ownership lookup failed', error);
    return deny(503, 'Service Unavailable');
  }

  return owned ? undefined : deny(403, 'Forbidden');
}
