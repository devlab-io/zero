import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P17-D — sessions/appareils révocables. On invoque les VRAIS resolvers du
 * router user avec un ctx fabriqué ; l'API better-auth est un fake. Les
 * invariants : le token de session ne sort JAMAIS, la session courante est
 * marquée, la révocation passe par l'API (jamais un DELETE SQL), l'id d'une
 * session étrangère est introuvable par construction (listSessions scopé).
 */

const procBuild = vi.hoisted(() => {
  const build = (partial: Record<string, unknown> = {}): any => ({
    use: () => build(partial),
    input: (inputSchema: unknown) => build({ ...partial, inputSchema }),
    query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
    mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
  });
  return build;
});

vi.mock('../trpc', () => ({
  router: (defs: unknown) => defs,
  privateProcedure: procBuild(),
}));

import { userRouter } from './user';

const authApi = {
  listSessions: vi.fn(),
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
};

const makeCtx = () => ({
  sessionUser: { id: 'user-1', name: 'Thomas', email: 'thomas@devlab.io' },
  c: {
    var: { auth: { api: authApi } },
    req: { raw: { headers: new Headers({ cookie: 'session=x' }) } },
    env: {},
  },
});

type Proc = { resolver: Function; inputSchema?: { parse: (v: unknown) => unknown } };
const call = (name: string, input?: unknown) => {
  const procedure = (userRouter as unknown as Record<string, Proc>)[name];
  if (!procedure) throw new Error(`unknown procedure ${name}`);
  const parsed = procedure.inputSchema ? procedure.inputSchema.parse(input) : undefined;
  return procedure.resolver({ ctx: makeCtx(), input: parsed });
};

const SESSIONS = [
  {
    id: 'sess-current',
    token: 'tok-CURRENT',
    userId: 'user-1',
    expiresAt: new Date('2026-08-10T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-03T00:00:00Z'),
    userAgent: 'Safari macOS',
    ipAddress: null,
  },
  {
    id: 'sess-phone',
    token: 'tok-PHONE',
    userId: 'user-1',
    expiresAt: new Date('2026-08-09T00:00:00Z'),
    createdAt: new Date('2026-07-30T00:00:00Z'),
    updatedAt: new Date('2026-08-02T00:00:00Z'),
    userAgent: 'Safari iOS',
    ipAddress: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  authApi.listSessions.mockResolvedValue(SESSIONS);
  authApi.getSession.mockResolvedValue({ session: { id: 'sess-current', token: 'tok-CURRENT' } });
  authApi.revokeSession.mockResolvedValue({ status: true });
  authApi.revokeOtherSessions.mockResolvedValue({ status: true });
});

describe('user.listSessions', () => {
  it('ne renvoie JAMAIS le token, marque la session courante, trie par activité', async () => {
    const { sessions } = await call('listSessions');
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ id: 'sess-current', current: true });
    expect(sessions[1]).toMatchObject({ id: 'sess-phone', current: false });
    expect(JSON.stringify(sessions)).not.toContain('tok-');
    expect(JSON.stringify(sessions)).not.toContain('token');
  });
});

describe('user.revokeSession', () => {
  it('résout le token CÔTÉ SERVEUR depuis l’id et révoque via l’API better-auth', async () => {
    await call('revokeSession', { sessionId: 'sess-phone' });
    expect(authApi.revokeSession).toHaveBeenCalledWith({
      body: { token: 'tok-PHONE' },
      headers: expect.any(Headers),
    });
  });

  it('session inconnue (ou d’un autre compte) → NOT_FOUND, aucune révocation', async () => {
    await expect(call('revokeSession', { sessionId: 'sess-dautrui' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(authApi.revokeSession).not.toHaveBeenCalled();
  });
});

describe('user.revokeOtherSessions', () => {
  it('délègue à l’API better-auth avec les en-têtes de la requête', async () => {
    const out = await call('revokeOtherSessions');
    expect(out).toEqual({ success: true });
    expect(authApi.revokeOtherSessions).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });
});
