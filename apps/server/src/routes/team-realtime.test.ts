import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Canal realtime P2 : le DO n'accepte que les upgrades DÉJÀ autorisés par la
// route (session + resolveAccess) ; les broadcasts ne portent que des
// événements de collaboration ; la révocation coupe les sockets.

const harness = vi.hoisted(() => ({
  resolveTeamThreadAccess: vi.fn(),
  getZeroDB: vi.fn(),
}));

vi.mock('../lib/server-utils', () => ({
  getZeroDB: harness.getZeroDB,
}));

import {
  CLOSE_ACCESS_REVOKED,
  CLOSE_THREAD_UNSHARED,
  TeamThreadRealtime,
  TYPING_TTL_MS,
  publishTeamRealtime,
  teamRealtimeRouter,
} from './team-realtime';

type FakeSocket = {
  attachment: unknown;
  sent: string[];
  closed: { code: number; reason: string } | null;
  tags: string[];
  send: (payload: string) => void;
  close: (code: number, reason: string) => void;
  serializeAttachment: (value: unknown) => void;
  deserializeAttachment: () => unknown;
};

const makeSocket = (userId: string): FakeSocket => {
  const socket: FakeSocket = {
    attachment: { userId },
    sent: [],
    closed: null,
    tags: [userId],
    send: (payload) => {
      if (socket.closed) throw new Error('closed');
      socket.sent.push(payload);
    },
    close: (code, reason) => {
      socket.closed = { code, reason };
    },
    serializeAttachment: (value) => {
      socket.attachment = value;
    },
    deserializeAttachment: () => socket.attachment,
  };
  return socket;
};

const makeDo = () => {
  const sockets: FakeSocket[] = [];
  const ctx = {
    getWebSockets: (tag?: string) =>
      sockets.filter((s) => !s.closed && (tag === undefined || s.tags.includes(tag))),
    acceptWebSocket: (ws: FakeSocket, tags: string[]) => {
      ws.tags = tags;
      sockets.push(ws);
    },
    setWebSocketAutoResponse: () => {},
  };
  const rt = new TeamThreadRealtime(ctx as never, {} as never);
  return { rt, sockets, ctx };
};

const lastEvent = (socket: FakeSocket) => JSON.parse(socket.sent[socket.sent.length - 1]!);

beforeEach(() => {
  vi.clearAllMocks();
  harness.getZeroDB.mockResolvedValue({
    resolveTeamThreadAccess: harness.resolveTeamThreadAccess,
  });
  harness.resolveTeamThreadAccess.mockResolvedValue({ id: 'tt-1' });
});

describe('configuration Durable Object — stockage SQLite requis', () => {
  it('déclare TeamThreadRealtime en new_sqlite_classes dans chaque environnement', () => {
    const wrangler = readFileSync(
      decodeURIComponent(new URL('../../wrangler.jsonc', import.meta.url).pathname),
      'utf8',
    );

    expect(wrangler).not.toContain('"new_classes": ["TeamThreadRealtime"]');
    expect(wrangler.match(/"new_sqlite_classes": \["TeamThreadRealtime"\]/g)).toHaveLength(3);
  });
});

describe('route d’upgrade — handshake refusé sans ACL', () => {
  const makeApp = (sessionUser: { id: string } | undefined, envSlice: unknown = {}) => {
    const { Hono } = require('hono') as typeof import('hono');
    const app = new Hono();
    app.use(async (c, next) => {
      c.set('sessionUser' as never, sessionUser as never);
      await next();
    });
    app.route('/team-rt', teamRealtimeRouter);
    return (path: string, headers: Record<string, string> = { Upgrade: 'websocket' }) =>
      app.request(path, { headers }, envSlice as never);
  };

  it('non authentifié → 401, resolveAccess jamais appelé', async () => {
    const request = makeApp(undefined);
    const res = await request('/team-rt/tt-1');
    expect(res.status).toBe(401);
    expect(harness.resolveTeamThreadAccess).not.toHaveBeenCalled();
  });

  it('membre révoqué / non membre → 403, AUCUN contact avec le DO', async () => {
    harness.resolveTeamThreadAccess.mockRejectedValue(new Error('forbidden'));
    const get = vi.fn();
    const request = makeApp(
      { id: 'user-revoked' },
      { TEAM_THREAD_RT: { idFromName: vi.fn(), get } },
    );
    const res = await request('/team-rt/tt-1');
    expect(res.status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it('fil inconnu/départagé → 404', async () => {
    harness.resolveTeamThreadAccess.mockRejectedValue(new Error('not_found'));
    const request = makeApp({ id: 'user-x' });
    const res = await request('/team-rt/tt-gone');
    expect(res.status).toBe(404);
  });

  it('sans header Upgrade → 426, resolveAccess jamais appelé', async () => {
    const request = makeApp({ id: 'user-a' });
    const res = await request('/team-rt/tt-1', {});
    expect(res.status).toBe(426);
    expect(harness.resolveTeamThreadAccess).not.toHaveBeenCalled();
  });

  it('autorisé → la requête est transmise au DO du fil EXACT avec le header interne', async () => {
    const doFetch = vi.fn(async (req: Request) => {
      expect(req.headers.get('x-zero-team-rt-user')).toBe('user-a');
      return new Response('ok', { status: 200 });
    });
    const idFromName = vi.fn().mockReturnValue('id-tt-1');
    const request = makeApp(
      { id: 'user-a' },
      { TEAM_THREAD_RT: { idFromName, get: vi.fn().mockReturnValue({ fetch: doFetch }) } },
    );
    const res = await request('/team-rt/tt-1');
    expect(res.status).toBe(200);
    expect(idFromName).toHaveBeenCalledWith('tt-1');
    expect(doFetch).toHaveBeenCalledTimes(1);
  });
});

describe('TeamThreadRealtime — présence, typing, isolation par instance', () => {
  it('chaque connexion diffuse une présence sans corps de mail ni credentials', async () => {
    // La route fetch() est testée séparément ; ici on pousse directement un
    // socket accepté puis on diffuse.
    const { rt, sockets } = makeDo();
    const a = makeSocket('user-a');
    sockets.push(a);
    await rt.publish({ type: 'comments.invalidate' });
    expect(lastEvent(a)).toEqual({ type: 'comments.invalidate' });
    for (const payload of a.sent) {
      expect(payload).not.toMatch(/body|processedHtml|accessToken|refreshToken/);
    }
  });

  it('typing : message client → présence avec typingUntil, expiré après TTL', async () => {
    vi.useFakeTimers();
    try {
      const { rt, sockets } = makeDo();
      const a = makeSocket('user-a');
      const b = makeSocket('user-b');
      sockets.push(a, b);
      await rt.webSocketMessage(a as never, JSON.stringify({ type: 'typing' }));
      const presence = lastEvent(b);
      expect(presence.type).toBe('presence');
      const userA = presence.users.find((u: { userId: string }) => u.userId === 'user-a');
      expect(userA.typingUntil).toBeGreaterThan(Date.now());
      // Expiration : après le TTL, le snapshot purge le typing.
      vi.advanceTimersByTime(TYPING_TTL_MS + 1);
      const snapshot = rt.presenceSnapshot();
      expect(snapshot.find((u) => u.userId === 'user-a')?.typingUntil).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('message non-JSON ou trop long : ignoré sans crash', async () => {
    const { rt, sockets } = makeDo();
    const a = makeSocket('user-a');
    sockets.push(a);
    await rt.webSocketMessage(a as never, 'not-json');
    await rt.webSocketMessage(a as never, JSON.stringify({ type: 'typing' }).padEnd(300, ' '));
    expect(
      rt.presenceSnapshot().find((u) => u.userId === 'user-a')?.typingUntil ?? null,
    ).toBeNull();
  });

  it('deux instances DO (deux fils) sont totalement étanches', async () => {
    const one = makeDo();
    const two = makeDo();
    const a = makeSocket('user-a');
    const b = makeSocket('user-b');
    one.sockets.push(a);
    two.sockets.push(b);
    await one.rt.publish({ type: 'thread.invalidate' });
    expect(a.sent.length).toBe(1);
    expect(b.sent.length).toBe(0);
  });
});

describe('révocation — coupe immédiate', () => {
  it('kickUser ferme les sockets de l’utilisateur visé (4403) et pas les autres', async () => {
    const { rt, sockets } = makeDo();
    const a = makeSocket('user-a');
    const b = makeSocket('user-b');
    sockets.push(a, b);
    await rt.kickUser('user-a');
    expect(a.closed?.code).toBe(CLOSE_ACCESS_REVOKED);
    expect(JSON.parse(a.sent[0]!)).toEqual({ type: 'access.revoked', userId: 'user-a' });
    expect(b.closed).toBeNull();
    // b reçoit la présence rafraîchie sans user-a.
    const presence = lastEvent(b);
    expect(presence.users.map((u: { userId: string }) => u.userId)).not.toContain('user-a');
  });

  it('closeAll (unshare) ferme tout le monde (4404)', async () => {
    const { rt, sockets } = makeDo();
    const a = makeSocket('user-a');
    const b = makeSocket('user-b');
    sockets.push(a, b);
    await rt.closeAll();
    expect(a.closed?.code).toBe(CLOSE_THREAD_UNSHARED);
    expect(b.closed?.code).toBe(CLOSE_THREAD_UNSHARED);
  });
});

describe('publishTeamRealtime — publication tolérante', () => {
  it('sans binding : no-op silencieux', async () => {
    await expect(
      publishTeamRealtime({}, 'tt-1', { type: 'comments.invalidate' }),
    ).resolves.toBeUndefined();
  });

  it('avec binding : publie sur le DO du fil exact', async () => {
    const publish = vi.fn();
    const idFromName = vi.fn().mockReturnValue('id-tt-1');
    const get = vi.fn().mockReturnValue({ publish });
    await publishTeamRealtime({ TEAM_THREAD_RT: { idFromName, get } }, 'tt-1', {
      type: 'thread.invalidate',
    });
    expect(idFromName).toHaveBeenCalledWith('tt-1');
    expect(publish).toHaveBeenCalledWith({ type: 'thread.invalidate' });
  });
});
