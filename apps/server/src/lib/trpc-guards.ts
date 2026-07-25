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
 * Guard body of `activeConnectionProcedure`'s catch branch: a session with no resolvable
 * active mailbox connection is treated as invalid, not merely absent — the caller is
 * signed out (their cookie can no longer be trusted to imply a working connection) before
 * the request is rejected with BAD_REQUEST carrying the original error's message.
 */
export async function rejectWithoutActiveConnection(
  cause: unknown,
  signOut: () => Promise<unknown>,
): Promise<TRPCError> {
  await signOut();
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: cause instanceof Error ? cause.message : 'Failed to get active connection',
  });
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
  const message = error.message.toLowerCase();

  if (PERMISSION_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Required scopes missing',
      cause: error,
    });
  }

  if (message.includes('invalid_grant')) {
    await deps.clearTokens();
    deps.setReconnectHeader(connectionId);
    return new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Connection expired. Please reconnect.',
      cause: error,
    });
  }

  return undefined;
}
