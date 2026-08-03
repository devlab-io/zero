import { DurableObject } from 'cloudflare:workers';
import { getZeroDB } from '../lib/server-utils';
import type { HonoContext } from '../ctx';
import { logger } from '../lib/logger';
import type { ZeroEnv } from '../env';
import { Hono } from 'hono';

/**
 * Canal temps réel d'un fil partagé (P2) — WebSocket Hibernation, UN Durable
 * Object PAR teamThreadId (`idFromName(teamThreadId)`), donc AUCUNE room
 * globale : un socket ne voit jamais les événements d'un autre fil ni d'une
 * autre équipe.
 *
 * Contrat de sécurité :
 *  - l'upgrade n'atteint le DO qu'APRÈS session + resolveAccess(teamThreadId,
 *    sessionUserId) côté worker (le DO exige en défense en profondeur le
 *    header interne posé par cette route) ;
 *  - les broadcasts ne portent QUE des événements de collaboration
 *    (commentaire/réaction/typing/présence/invalidation) — jamais un corps de
 *    mail, une PJ ou un credential ; les clients refetchent via tRPC qui
 *    repasse l'ACL ;
 *  - une révocation d'accès (ou un unshare) COUPE immédiatement les sockets
 *    de l'utilisateur visé (code 4403) / de tous (4404) ;
 *  - typing est éphémère (TTL 6 s) et purgé à chaque broadcast de présence.
 *  - auto ping/pong via setWebSocketAutoResponse — le DO peut hiberner.
 */

export const TEAM_RT_USER_HEADER = 'x-zero-team-rt-user';
export const TEAM_RT_INTERACTIVE_HEADER = 'x-zero-team-rt-interactive';
export const TYPING_TTL_MS = 6_000;
/** P15 : « rédige une réponse » — TTL long, rafraîchi par le composeur ouvert. */
export const REPLYING_TTL_MS = 45_000;
export const CLOSE_ACCESS_REVOKED = 4403;
export const CLOSE_THREAD_UNSHARED = 4404;

export type TeamRealtimeServerEvent =
  | {
      type: 'presence';
      users: { userId: string; typingUntil: number | null; replyingUntil: number | null }[];
    }
  | { type: 'comments.invalidate' }
  | { type: 'thread.invalidate' }
  | { type: 'access.revoked'; userId: string };

type SocketAttachment = { userId: string; socketId: string; interactive: boolean };

export class TeamThreadRealtime extends DurableObject<ZeroEnv> {
  /** typingUntil par userId — éphémère : perdu à l'hibernation, sans gravité. */
  private typing = new Map<string, number>();
  /**
   * replyingUntil PAR SOCKET (P15, durci) : deux onglets du même utilisateur
   * sont indépendants — fermer un composeur (replying:false ou close) ne
   * coupe jamais le signal de l'autre onglet qui compose encore. L'agrégat
   * par utilisateur (max des sockets) n'est calculé qu'au snapshot. Le
   * payload ne transporte JAMAIS de corps ni de brouillon — uniquement des
   * horodatages. Purgé à la révocation et à l'unshare.
   */
  private replyingBySocket = new Map<string, { userId: string; until: number }>();

  override async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get(TEAM_RT_USER_HEADER);
    const interactive = request.headers.get(TEAM_RT_INTERACTIVE_HEADER) === '1';
    const upgrade = request.headers.get('Upgrade');
    if (!userId || !upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Bad Request', { status: 400 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Tag = userId : permet kickUser(userId) sans désérialiser chaque socket.
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({
      userId,
      socketId: crypto.randomUUID(),
      interactive,
    } satisfies SocketAttachment);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message !== 'string' || message.length > 256) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const kind = (parsed as { type?: unknown }).type;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.userId) return;
    // Un auditor reçoit les invalidations/presence en lecture seule mais ne
    // peut jamais publier typing/replying. Les changements de rôle expulsent
    // les sockets afin qu'un reconnect reprenne cette capacité fraîche.
    if (!attachment.interactive) return;
    if (kind === 'typing') {
      this.typing.set(attachment.userId, Date.now() + TYPING_TTL_MS);
      this.broadcastPresence();
    } else if (kind === 'replying') {
      const active = (parsed as { active?: unknown }).active === true;
      // Par SOCKET : l'onglet qui ferme son composeur ne parle que pour lui.
      if (active) {
        this.replyingBySocket.set(attachment.socketId, {
          userId: attachment.userId,
          until: Date.now() + REPLYING_TTL_MS,
        });
      } else {
        this.replyingBySocket.delete(attachment.socketId);
      }
      this.broadcastPresence();
    }
  }

  override async webSocketClose(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.socketId) this.replyingBySocket.delete(attachment.socketId);
    if (attachment?.userId && this.ctx.getWebSockets(attachment.userId).length <= 1) {
      this.typing.delete(attachment.userId);
    }
    this.broadcastPresence();
  }

  /** Publication depuis les mutations tRPC (déjà passées par l'ACL). */
  async publish(event: TeamRealtimeServerEvent) {
    this.broadcastRaw(JSON.stringify(event));
  }

  /** Révocation : notifie puis COUPE les sockets de l'utilisateur visé. */
  async kickUser(userId: string) {
    this.typing.delete(userId);
    for (const [socketId, entry] of this.replyingBySocket) {
      if (entry.userId === userId) this.replyingBySocket.delete(socketId);
    }
    for (const ws of this.ctx.getWebSockets(userId)) {
      try {
        ws.send(
          JSON.stringify({ type: 'access.revoked', userId } satisfies TeamRealtimeServerEvent),
        );
        ws.close(CLOSE_ACCESS_REVOKED, 'access revoked');
      } catch {
        // socket déjà fermé — rien à faire
      }
    }
    this.broadcastPresence();
  }

  /** Unshare/suppression : coupe TOUT le monde. */
  async closeAll() {
    this.typing.clear();
    this.replyingBySocket.clear();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(CLOSE_THREAD_UNSHARED, 'thread unshared');
      } catch {
        // socket déjà fermé
      }
    }
  }

  presenceSnapshot(): {
    userId: string;
    typingUntil: number | null;
    replyingUntil: number | null;
  }[] {
    const now = Date.now();
    for (const [userId, until] of this.typing) {
      if (until <= now) this.typing.delete(userId);
    }
    for (const [socketId, entry] of this.replyingBySocket) {
      if (entry.until <= now) this.replyingBySocket.delete(socketId);
    }
    // Agrégat par utilisateur : le MAX des sockets encore actifs.
    const replyingByUser = new Map<string, number>();
    for (const entry of this.replyingBySocket.values()) {
      const current = replyingByUser.get(entry.userId);
      if (current === undefined || entry.until > current) {
        replyingByUser.set(entry.userId, entry.until);
      }
    }
    const users = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.userId) continue;
      users.add(attachment.userId);
    }
    return [...users].map((userId) => ({
      userId,
      typingUntil: this.typing.get(userId) ?? null,
      replyingUntil: replyingByUser.get(userId) ?? null,
    }));
  }

  private broadcastPresence() {
    this.broadcastRaw(
      JSON.stringify({
        type: 'presence',
        users: this.presenceSnapshot(),
      } satisfies TeamRealtimeServerEvent),
    );
  }

  private broadcastRaw(payload: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // socket en cours de fermeture — ignoré
      }
    }
  }
}

type TeamRtEnvSlice = {
  TEAM_THREAD_RT?: {
    idFromName: (name: string) => unknown;
    get: (id: unknown) => {
      fetch: (request: Request) => Promise<Response>;
      publish?: (event: TeamRealtimeServerEvent) => Promise<void>;
      kickUser?: (userId: string) => Promise<void>;
      closeAll?: () => Promise<void>;
    };
  };
};

/**
 * Publication fire-and-forget vers le DO du fil — appelée APRÈS le succès
 * d'une mutation tRPC (l'ACL a déjà statué). Absence de binding (tests,
 * environnements sans le DO) = no-op silencieux.
 */
export async function publishTeamRealtime(
  env: TeamRtEnvSlice,
  teamThreadId: string,
  event: TeamRealtimeServerEvent,
) {
  try {
    const ns = env.TEAM_THREAD_RT;
    if (!ns) return;
    const stub = ns.get(ns.idFromName(teamThreadId));
    await stub.publish?.(event);
  } catch (error) {
    logger.warn('[team-rt] publish failed', { teamThreadId, error: String(error) });
  }
}

export async function kickTeamRealtimeUser(
  env: TeamRtEnvSlice,
  teamThreadId: string,
  userId: string,
) {
  try {
    const ns = env.TEAM_THREAD_RT;
    if (!ns) return;
    const stub = ns.get(ns.idFromName(teamThreadId));
    await stub.kickUser?.(userId);
  } catch (error) {
    logger.warn('[team-rt] kick failed', { teamThreadId, error: String(error) });
  }
}

export async function closeTeamRealtime(env: TeamRtEnvSlice, teamThreadId: string) {
  try {
    const ns = env.TEAM_THREAD_RT;
    if (!ns) return;
    const stub = ns.get(ns.idFromName(teamThreadId));
    await stub.closeAll?.();
  } catch (error) {
    logger.warn('[team-rt] close failed', { teamThreadId, error: String(error) });
  }
}

/**
 * Route d'upgrade — montée derrière le middleware de session de l'app `api`.
 * ACL résolue AVANT tout contact avec le DO : un non-membre ou un révoqué
 * reçoit 403/404 sans que le DO n'existe même pour lui.
 */
export const teamRealtimeRouter = new Hono<HonoContext>().get('/:teamThreadId', async (c) => {
  const sessionUser = c.var.sessionUser;
  if (!sessionUser) return c.text('Unauthorized', 401);
  if ((c.req.header('Upgrade') ?? '').toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }
  const teamThreadId = c.req.param('teamThreadId');
  if (!teamThreadId || teamThreadId.length > 64) return c.text('Bad Request', 400);
  let interactive = false;
  try {
    const db = await getZeroDB(sessionUser.id);
    const access = await db.resolveTeamThreadAccess(teamThreadId);
    interactive = access?.callerRole !== 'auditor';
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'not_found') return c.text('Not Found', 404);
    return c.text('Forbidden', 403);
  }
  const ns = (c.env as unknown as TeamRtEnvSlice).TEAM_THREAD_RT;
  if (!ns) return c.text('Realtime unavailable', 503);
  const stub = ns.get(ns.idFromName(teamThreadId));
  const forwarded = new Request(c.req.raw.url, c.req.raw);
  forwarded.headers.set(TEAM_RT_USER_HEADER, sessionUser.id);
  forwarded.headers.set(TEAM_RT_INTERACTIVE_HEADER, interactive ? '1' : '0');
  return await stub.fetch(forwarded);
});
