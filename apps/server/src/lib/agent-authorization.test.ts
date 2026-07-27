import { LEGACY_SHARED_AGENT_NAME, personalAgentName } from '@zero/types';

import { authorizeAgentAccess } from './agent-authorization';
import { describe, it, expect, vi } from 'vitest';

/**
 * Unit proof of the agents Durable Object guard (pitbull A1, axe 4). The regression it
 * pins: `/agents/zero-agent/<connectionId>/*` used to answer without any session on the
 * HTTP branch, and accepted any cookie-bearing caller on the WebSocket branch — the DO
 * name is the connectionId whose mailbox the agent tools can read and write.
 */
const request = (init?: RequestInit) =>
  new Request('https://server.test/agents/zero-agent/c1', init);

const deps = (over: Partial<Parameters<typeof authorizeAgentAccess>[2]> = {}) => ({
  resolveUserId: vi.fn(async () => 'user-1' as string | undefined),
  ownsConnection: vi.fn(async () => true),
  ...over,
});

describe('authorizeAgentAccess', () => {
  it('refuses an anonymous caller with 401', async () => {
    const d = deps({ resolveUserId: vi.fn(async () => undefined) });
    const res = await authorizeAgentAccess(request(), { name: 'c1' }, d);
    expect(res?.status).toBe(401);
    expect(d.ownsConnection).not.toHaveBeenCalled();
  });

  it('refuses an anonymous WebSocket upgrade with 401', async () => {
    const d = deps({ resolveUserId: vi.fn(async () => undefined) });
    const res = await authorizeAgentAccess(
      request({ headers: { Upgrade: 'websocket' } }),
      { name: 'c1' },
      d,
    );
    expect(res?.status).toBe(401);
  });

  it('lets a session through to a connection it owns', async () => {
    const d = deps();
    await expect(authorizeAgentAccess(request(), { name: 'c1' }, d)).resolves.toBeUndefined();
    expect(d.ownsConnection).toHaveBeenCalledWith('user-1', 'c1');
  });

  it("refuses another user's connection with 403", async () => {
    const d = deps({ ownsConnection: vi.fn(async () => false) });
    const res = await authorizeAgentAccess(request(), { name: 'victim-connection' }, d);
    expect(res?.status).toBe(403);
  });

  it("refuse désormais l'ancien nom PARTAGÉ `general`", async () => {
    // Il était exempté du contrôle de propriété sans regarder ni propriétaire ni locataire,
    // et `partyserver` fait du nom l'identité du stockage : tous les utilisateurs
    // partageaient la même instance de Durable Object. Il est traité comme n'importe quel
    // autre nom — personne ne possède de connexion qui s'appelle ainsi.
    const d = deps({ ownsConnection: vi.fn(async () => false) });
    const res = await authorizeAgentAccess(request(), { name: LEGACY_SHARED_AGENT_NAME }, d);
    expect(res?.status).toBe(403);
    expect(d.ownsConnection).toHaveBeenCalledWith('user-1', LEGACY_SHARED_AGENT_NAME);
  });

  it('accorde son PROPRE nom personnel, sans recherche de propriété', async () => {
    const d = deps();
    await expect(
      authorizeAgentAccess(request(), { name: personalAgentName('user-1') }, d),
    ).resolves.toBeUndefined();
    expect(d.ownsConnection).not.toHaveBeenCalled();
  });

  it("refuse le nom personnel d'un AUTRE utilisateur avec 403", async () => {
    const d = deps({ ownsConnection: vi.fn(async () => false) });
    const res = await authorizeAgentAccess(request(), { name: personalAgentName('victime') }, d);
    expect(res?.status).toBe(403);
  });

  it("porter le PRÉFIXE personnel n'accorde rien : l'égalité doit être exacte", async () => {
    const d = deps({ ownsConnection: vi.fn(async () => false) });
    const res = await authorizeAgentAccess(request(), { name: 'user-autre-chose' }, d);
    expect(res?.status).toBe(403);
  });

  it('fails closed when the session lookup throws', async () => {
    const d = deps({
      resolveUserId: vi.fn(async () => {
        throw new Error('auth down');
      }),
    });
    const res = await authorizeAgentAccess(request(), { name: 'c1' }, d);
    expect(res?.status).toBe(503);
  });

  it('fails closed when the ownership lookup throws', async () => {
    const d = deps({
      ownsConnection: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    const res = await authorizeAgentAccess(request(), { name: 'c1' }, d);
    expect(res?.status).toBe(503);
  });
});
