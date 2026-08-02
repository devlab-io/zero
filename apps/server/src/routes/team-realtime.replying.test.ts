import { TeamThreadRealtime, CLOSE_ACCESS_REVOKED } from './team-realtime';
import { describe, expect, it, vi } from 'vitest';

/**
 * Test COMPORTEMENTAL du DO realtime (P15 durci) : replying est PAR SOCKET,
 * agrégé par utilisateur — fermer un onglet (message replying:false ou close)
 * ne coupe jamais le signal d'un autre onglet du même utilisateur. La
 * révocation et l'unshare purgent tout. Le DO est instancié avec un ctx
 * factice, comme ask-reta-rate-do.test.ts.
 */

type Attachment = { userId: string; socketId: string };

class FakeSocket {
  attachment: Attachment | null = null;
  sent: string[] = [];
  closed: Array<{ code: number }> = [];
  serializeAttachment(value: Attachment) {
    this.attachment = value;
  }
  deserializeAttachment() {
    return this.attachment;
  }
  send(message: string) {
    this.sent.push(message);
  }
  close(code: number) {
    this.closed.push({ code });
  }
}

const makeHarness = () => {
  const sockets: FakeSocket[] = [];
  const ctx = {
    acceptWebSocket: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: (tag?: string) =>
      sockets.filter((socket) => !tag || socket.attachment?.userId === tag),
  };
  const realtime = new TeamThreadRealtime(ctx as never, {} as never);
  const connect = (userId: string) => {
    const socket = new FakeSocket();
    socket.serializeAttachment({ userId, socketId: crypto.randomUUID() });
    sockets.push(socket);
    return socket;
  };
  const disconnect = async (socket: FakeSocket) => {
    sockets.splice(sockets.indexOf(socket), 1);
    await realtime.webSocketClose(socket as never);
  };
  const lastPresence = (socket: FakeSocket) => {
    const presence = [...socket.sent]
      .reverse()
      .map((raw) => JSON.parse(raw) as { type: string; users?: Array<Record<string, unknown>> })
      .find((event) => event.type === 'presence');
    return presence?.users ?? [];
  };
  return { realtime, connect, disconnect, lastPresence };
};

const replying = (active: boolean) => JSON.stringify({ type: 'replying', active });

describe('TeamThreadRealtime — replying par socket, multi-onglets', () => {
  it('closing ONE tab (replying:false) does not cut the signal of the other tab of the SAME user', async () => {
    const { realtime, connect, lastPresence } = makeHarness();
    const tabA = connect('u1');
    const tabB = connect('u1');
    const watcher = connect('u2');

    await realtime.webSocketMessage(tabA as never, replying(true));
    await realtime.webSocketMessage(tabB as never, replying(true));
    let u1 = lastPresence(watcher).find((user) => user['userId'] === 'u1');
    expect(u1?.['replyingUntil']).toBeTruthy();

    // L'onglet A ferme SON composeur — B compose encore.
    await realtime.webSocketMessage(tabA as never, replying(false));
    u1 = lastPresence(watcher).find((user) => user['userId'] === 'u1');
    expect(u1?.['replyingUntil']).toBeTruthy();

    // B ferme aussi → le signal tombe.
    await realtime.webSocketMessage(tabB as never, replying(false));
    u1 = lastPresence(watcher).find((user) => user['userId'] === 'u1');
    expect(u1?.['replyingUntil']).toBeNull();
  });

  it('a SOCKET CLOSE of one tab keeps the other tab replying', async () => {
    const { realtime, connect, disconnect, lastPresence } = makeHarness();
    const tabA = connect('u1');
    const tabB = connect('u1');
    const watcher = connect('u2');
    await realtime.webSocketMessage(tabA as never, replying(true));
    await realtime.webSocketMessage(tabB as never, replying(true));
    await disconnect(tabA);
    const u1 = lastPresence(watcher).find((user) => user['userId'] === 'u1');
    expect(u1?.['replyingUntil']).toBeTruthy();
  });

  it('revocation kicks the user, purges replying and CLOSES the sockets', async () => {
    const { realtime, connect, lastPresence } = makeHarness();
    const tab = connect('u1');
    const watcher = connect('u2');
    await realtime.webSocketMessage(tab as never, replying(true));
    await realtime.kickUser('u1');
    expect(tab.closed[0]?.code).toBe(CLOSE_ACCESS_REVOKED);
    const u1 = lastPresence(watcher).find((user) => user['userId'] === 'u1');
    expect(u1?.['replyingUntil'] ?? null).toBeNull();
  });

  it('unshare (closeAll) purges everything and closes everyone', async () => {
    const { realtime, connect } = makeHarness();
    const tab = connect('u1');
    await realtime.webSocketMessage(tab as never, replying(true));
    await realtime.closeAll();
    expect(tab.closed.length).toBe(1);
    expect(realtime.presenceSnapshot().every((user) => user.replyingUntil === null)).toBe(true);
  });

  it('the presence payload only ever carries userId + timestamps', async () => {
    const { realtime, connect, lastPresence } = makeHarness();
    const tab = connect('u1');
    const watcher = connect('u2');
    await realtime.webSocketMessage(tab as never, replying(true));
    for (const user of lastPresence(watcher)) {
      expect(Object.keys(user).sort()).toEqual(['replyingUntil', 'typingUntil', 'userId']);
    }
  });
});
