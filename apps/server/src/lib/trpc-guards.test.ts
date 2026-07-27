import {
  requireSessionUser,
  rejectWithoutActiveConnection,
  classifyDriverFailure,
  isAuthorizationFailure,
} from './trpc-guards';
import { AppError, resolveErrorCode } from './errors';
import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

/**
 * Unit proof of the tRPC auth/authorization gates (pitbull, axe Tests — 0% de couverture
 * avant ce fichier). These functions are the extracted decision bodies of
 * `privateProcedure`, `activeConnectionProcedure` and `activeDriverProcedure`
 * (trpc/trpc.ts): every private procedure in the app router runs through them, so a bug
 * here is a bug in every authenticated endpoint. The regressions this pins: an anonymous
 * caller must never reach a resolver (UNAUTHORIZED), a session with no working mailbox
 * connection must be signed out rather than merely refused (a stale/broken connection
 * shouldn't let the client keep silently retrying with the same cookie), a missing-scope
 * driver error must not be misclassified as an expired grant (that would wrongly wipe
 * valid OAuth tokens), and — the most safety-critical property — any error that is
 * neither a permission error nor an invalid_grant must leave the auth state alone and
 * propagate unchanged, or unrelated failures would start signing users out.
 */

describe('requireSessionUser', () => {
  it('throws UNAUTHORIZED when no session user resolved', () => {
    expect(() => requireSessionUser(undefined)).toThrow(TRPCError);
    try {
      requireSessionUser(undefined);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('returns the session user unchanged when present', () => {
    const user = { id: 'u1', name: 'Ann', email: 'ann@x.co' };
    expect(requireSessionUser(user)).toBe(user);
  });
});

/**
 * P4 — cette fonction déclenchait un `signOut` sur TOUTE erreur remontée par
 * `getActiveConnection()`, y compris un échec RPC transitoire du Durable Object ZeroDB.
 * Une secousse d'infrastructure d'une seconde déconnectait donc tous les utilisateurs qui
 * appelaient à cet instant, et détruisait réellement leur cookie : la panne devenait
 * permanente jusqu'à une reconnexion manuelle. Le contrat est désormais : `signOut`
 * UNIQUEMENT sur une cause d'autorisation avérée, 503 rejouable sur une panne d'infra.
 */
describe('rejectWithoutActiveConnection — cause d’autorisation', () => {
  it('signs the caller out and rejects with the cause message', async () => {
    const signOut = vi.fn(async () => {});
    const error = await rejectWithoutActiveConnection(
      AppError.unauthorized('no connection row'),
      signOut,
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('no connection row');
  });

  it('porte un code applicatif stable, lisible par le client sans relire le message', async () => {
    const error = await rejectWithoutActiveConnection(
      AppError.unauthorized('No connections found for user'),
      vi.fn(async () => {}),
    );
    expect(resolveErrorCode(error)).toBe('UNAUTHORIZED');
  });

  it('awaits sign-out before resolving (caller cannot race ahead of it)', async () => {
    const order: string[] = [];
    const signOut = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('signed-out');
    });

    await rejectWithoutActiveConnection(AppError.unauthorized('x'), signOut);
    order.push('rejected');

    expect(order).toEqual(['signed-out', 'rejected']);
  });

  it('reconnaît les deux causes réellement levées par getActiveConnection', () => {
    expect(isAuthorizationFailure(AppError.unauthorized('Session Not Found'))).toBe(true);
    expect(isAuthorizationFailure(AppError.unauthorized('No connections found for user'))).toBe(
      true,
    );
    expect(isAuthorizationFailure(AppError.connectionExpired())).toBe(true);
  });
});

describe('rejectWithoutActiveConnection — panne d’infrastructure (P4)', () => {
  it('un échec RPC de Durable Object NE déconnecte PAS', async () => {
    const signOut = vi.fn(async () => {});
    const error = await rejectWithoutActiveConnection(
      new Error('Network connection lost.'),
      signOut,
    );

    expect(signOut).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(TRPCError);
  });

  it('renvoie un 503 rejouable, pas un 4xx définitif', async () => {
    const error = await rejectWithoutActiveConnection(
      new Error('Durable Object reset because its code was updated.'),
      vi.fn(async () => {}),
    );

    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(resolveErrorCode(error)).toBe('UNAVAILABLE');
  });

  it('une valeur levée non-Error est traitée comme une panne, pas comme une preuve d’autorisation', async () => {
    const signOut = vi.fn(async () => {});
    const error = await rejectWithoutActiveConnection('weird throw', signOut);

    expect(signOut).not.toHaveBeenCalled();
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('ne fuite pas le détail interne de la panne dans le message client', async () => {
    const error = await rejectWithoutActiveConnection(
      new Error('postgres://user:pw@internal-host/db unreachable'),
      vi.fn(async () => {}),
    );
    expect(error.message).not.toContain('pw@internal-host');
  });

  it('isAuthorizationFailure refuse tout ce qui n’est pas une AppError d’autorisation', () => {
    expect(isAuthorizationFailure(new Error('Session Not Found'))).toBe(false);
    expect(isAuthorizationFailure(AppError.unavailable('rpc down'))).toBe(false);
    expect(isAuthorizationFailure(AppError.internal('boom'))).toBe(false);
    expect(isAuthorizationFailure(undefined)).toBe(false);
  });
});

describe('classifyDriverFailure', () => {
  const deps = () => ({
    clearTokens: vi.fn(async () => {}),
    setReconnectHeader: vi.fn(),
  });

  it.each(['precondition check', 'insufficient permission', 'invalid credentials'])(
    'maps a %s error to BAD_REQUEST without touching tokens or the connection',
    async (marker) => {
      const d = deps();
      const failure = await classifyDriverFailure(new Error(`Gmail: ${marker} failed`), 'c1', d);

      expect(failure).toBeInstanceOf(TRPCError);
      expect(failure?.code).toBe('BAD_REQUEST');
      expect(failure?.message).toBe('Required scopes missing');
      // P7 — le client discriminait sur ce message exact, à travers le réseau. Le code
      // stable le remplace ; le message reste inchangé pour l'affichage.
      expect(resolveErrorCode(failure)).toBe('MISSING_SCOPES');
      expect(d.clearTokens).not.toHaveBeenCalled();
      expect(d.setReconnectHeader).not.toHaveBeenCalled();
    },
  );

  it('matches permission markers case-insensitively', async () => {
    const d = deps();
    const failure = await classifyDriverFailure(new Error('INSUFFICIENT PERMISSION'), 'c1', d);
    expect(failure?.code).toBe('BAD_REQUEST');
  });

  it('clears tokens and flags the connection for reconnect on invalid_grant', async () => {
    const d = deps();
    const failure = await classifyDriverFailure(new Error('invalid_grant: token revoked'), 'c1', d);

    expect(failure).toBeInstanceOf(TRPCError);
    expect(failure?.code).toBe('UNAUTHORIZED');
    expect(failure?.message).toBe('Connection expired. Please reconnect.');
    expect(resolveErrorCode(failure)).toBe('CONNECTION_EXPIRED');
    expect(d.clearTokens).toHaveBeenCalledTimes(1);
    expect(d.setReconnectHeader).toHaveBeenCalledWith('c1');
  });

  it('clears tokens before flagging reconnect (client must not see the redirect before tokens are gone)', async () => {
    const order: string[] = [];
    const d = {
      clearTokens: vi.fn(async () => {
        order.push('cleared');
      }),
      setReconnectHeader: vi.fn(() => order.push('flagged')),
    };
    await classifyDriverFailure(new Error('invalid_grant'), 'c1', d);
    expect(order).toEqual(['cleared', 'flagged']);
  });

  it('leaves an unrelated error untouched: no token wipe, no reconnect flag, no thrown error', async () => {
    const d = deps();
    const failure = await classifyDriverFailure(new Error('upstream timeout'), 'c1', d);

    expect(failure).toBeUndefined();
    expect(d.clearTokens).not.toHaveBeenCalled();
    expect(d.setReconnectHeader).not.toHaveBeenCalled();
  });

  it('does not misfire on a message that merely contains a similar-looking substring', async () => {
    const d = deps();
    const failure = await classifyDriverFailure(
      new Error('grant application invalid: form incomplete'),
      'c1',
      d,
    );
    // "invalid_grant" (with the underscore) must not match "invalid... grant" prose.
    expect(failure).toBeUndefined();
    expect(d.clearTokens).not.toHaveBeenCalled();
  });
});
