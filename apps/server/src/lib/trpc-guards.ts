// lib/trpc-guards.ts — pure decision logic behind the tRPC auth/authorization procedure
// chain in trpc/trpc.ts (pitbull, axe Tests: 0% de couverture sur les gardes d'auth/
// autorisation du serveur). trpc.ts's procedures are entangled with hono's
// AsyncLocalStorage request context (the logging middleware every procedure goes through
// calls `getContext()`, which throws outside a live request) and can't be exercised in a
// unit test without scaffolding a whole fake request pipeline — which would end up
// testing the scaffolding, not the guard. The three decisions that actually gate access —
// no session -> reject, no resolvable active connection -> sign the caller out and
// reject, a downstream driver call fails for a permission/token reason -> reject or flag
// for reconnect — are extracted here as small, dependency-injected functions with the
// exact same inputs/outputs the original inline code used. trpc.ts calls them and its
// behavior is unchanged; only these functions are directly unit-tested.

import { AppError, resolveErrorCode, toTRPCError } from './errors';
import { TRPCError } from '@trpc/server';

export type SessionUser = { id: string; name: string; email: string };

/**
 * Guard body of `privateProcedure`: every private tRPC call must resolve a session user
 * from context first. Throws UNAUTHORIZED (fails closed) when none is present, otherwise
 * returns it unchanged.
 */
export function requireSessionUser(sessionUser: SessionUser | undefined): SessionUser {
  if (!sessionUser) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return sessionUser;
}

/**
 * `true` seulement si la cause PROUVE que la session ne peut plus porter de boîte valide.
 * `lib/connection-context.ts` lève des `AppError` typées pour ces deux cas (pas de
 * session, aucune connexion rattachée à l'utilisateur) ; tout le reste — un RPC de
 * Durable Object qui échoue, un timeout, un isolate recyclé — est une panne
 * d'infrastructure et ne dit RIEN de l'autorisation du porteur.
 */
export function isAuthorizationFailure(cause: unknown): boolean {
  return (
    cause instanceof AppError &&
    (cause.code === 'UNAUTHORIZED' ||
      cause.code === 'FORBIDDEN' ||
      cause.code === 'CONNECTION_EXPIRED' ||
      cause.code === 'NOT_FOUND')
  );
}

/**
 * Guard body of `activeConnectionProcedure`'s catch branch.
 *
 * Cette fonction déconnectait sur TOUTE erreur remontée par `getActiveConnection()` — y
 * compris un échec RPC transitoire du Durable Object ZeroDB. Une secousse d'infrastructure
 * d'une seconde éjectait donc de leur boîte tous les utilisateurs qui faisaient un appel à
 * cet instant, et leur cookie était réellement détruit : la panne devenait permanente
 * jusqu'à une reconnexion manuelle.
 *
 * Le `signOut` n'est désormais déclenché que sur une cause d'AUTORISATION avérée. Une
 * panne d'infrastructure renvoie un 503 rejouable, session intacte.
 */
export async function rejectWithoutActiveConnection(
  cause: unknown,
  signOut: () => Promise<unknown>,
): Promise<TRPCError> {
  if (!isAuthorizationFailure(cause)) {
    return toTRPCError(
      AppError.unavailable('Mailbox connection temporarily unavailable', { cause }),
    );
  }

  await signOut();
  return toTRPCError(
    AppError.unauthorized(
      cause instanceof Error ? cause.message : 'Failed to get active connection',
      { cause },
    ),
  );
}

const PERMISSION_ERROR_MARKERS = [
  'precondition check',
  'insufficient permission',
  'invalid credentials',
];

export type DriverFailureDeps = {
  /** Wipe the stored OAuth tokens for the active connection. */
  clearTokens: () => Promise<unknown>;
  /** Flag the connection for reconnect (sets the redirect response header). */
  setReconnectHeader: (connectionId: string) => void;
};

/**
 * Guard body of `activeDriverProcedure`: classifies a failed downstream provider call.
 * Missing OAuth scopes surface as BAD_REQUEST (the caller can't fix this by retrying).
 * An expired/revoked grant clears the stored tokens, flags the connection for reconnect,
 * and rejects with UNAUTHORIZED. Anything else returns undefined so the original error
 * propagates unchanged — this function must never widen what gets treated as an auth
 * failure, or unrelated errors would start signing users out / clearing valid tokens.
 */
export async function classifyDriverFailure(
  error: Error,
  connectionId: string,
  deps: DriverFailureDeps,
): Promise<TRPCError | undefined> {
  // 1) LE CODE D'ABORD. Un octroi sans jetons est détecté DANS le Durable Object
  // (`connectionToDriver` → `AppError.connectionExpired`), rendu en verdict typé par
  // `setName`, puis reconstruit en `AppError` par `getShardClient` — donc la classe est
  // encore là quand on arrive ici. Auparavant l'erreur traversait la frontière RPC en
  // `Error` nu, `getShardClient` la ré-emballait en `Shard initialization failed: …`, et
  // aucun marqueur ci-dessous ne la reconnaissait : plus aucun `X-Zero-Redirect`, donc
  // plus aucune proposition de reconnexion pour un utilisateur qui en avait besoin.
  //
  // Aucun élargissement : `resolveErrorCode` ne rend ces deux codes que pour une `AppError`
  // (directe ou en `cause` d'un `TRPCError`) — la table `TRPC_TO_APP` ne les produit jamais.
  const appCode = resolveErrorCode(error);
  if (appCode === 'MISSING_SCOPES') {
    return toTRPCError(AppError.missingScopes('Required scopes missing', { cause: error }));
  }
  if (appCode === 'CONNECTION_EXPIRED') {
    await deps.clearTokens();
    deps.setReconnectHeader(connectionId);
    return toTRPCError(
      AppError.connectionExpired('Connection expired. Please reconnect.', { cause: error }),
    );
  }

  const message = error.message.toLowerCase();

  // Ces deux comparaisons restent des tests de chaîne parce que la chaîne vient de
  // GOOGLEAPIS, pas de nous : c'est le point de TRADUCTION d'un message tiers vers un code
  // stable. À partir d'ici, et jusqu'au client, plus personne ne relit un message —
  // `errorFormatter` publie `MISSING_SCOPES` / `CONNECTION_EXPIRED` sur le fil.
  if (PERMISSION_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    return toTRPCError(AppError.missingScopes('Required scopes missing', { cause: error }));
  }

  if (message.includes('invalid_grant')) {
    await deps.clearTokens();
    deps.setReconnectHeader(connectionId);
    return toTRPCError(
      AppError.connectionExpired('Connection expired. Please reconnect.', { cause: error }),
    );
  }

  return undefined;
}
