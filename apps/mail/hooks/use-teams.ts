import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useSession } from '@/lib/auth-client';

/**
 * Collaboration d'équipe — hooks data + canal temps réel.
 *
 * Temps réel (P2) : la voie PRIMAIRE est le WebSocket authentifié par fil
 * partagé (`/api/team-rt/:teamThreadId`, DO à hibernation, ACL avant
 * upgrade). Le polling ne subsiste qu'en FALLBACK quand le socket est
 * indisponible. Une fermeture 4403/4404 (révocation / unshare) ne se
 * reconnecte JAMAIS et invalide les caches.
 */

export const TEAM_RT_CLOSE_REVOKED = 4403;
export const TEAM_RT_CLOSE_UNSHARED = 4404;
const TYPING_SEND_THROTTLE_MS = 2_000;
const HEARTBEAT_MS = 25_000;
const FALLBACK_COMMENTS_POLL_MS = 15_000;
const FALLBACK_PRESENCE_POLL_MS = 30_000;
const RECONNECT_STEPS_MS = [1_000, 2_000, 5_000, 10_000];

export const useMyTeams = () => {
  const trpc = useTRPC();
  return useQuery(trpc.teams.list.queryOptions(undefined, { staleTime: 60_000 }));
};

export const useTeamMembers = (teamId: string | null) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.listMembers.queryOptions(
      { teamId: teamId ?? '' },
      { enabled: !!teamId, staleTime: 60_000 },
    ),
  );
};

export const useMyInvites = () => {
  const trpc = useTRPC();
  return useQuery(trpc.teams.myInvites.queryOptions(undefined, { staleTime: 30_000 }));
};

/** Partages visibles depuis un fil OUVERT de ma boîte (panneau Équipe). */
export const useSharesForThread = (threadId: string | null) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.sharesForThread.queryOptions(
      { threadId: threadId ?? '' },
      { enabled: !!threadId, staleTime: 30_000 },
    ),
  );
};

export const useTeamThreads = (
  teamId: string | null,
  filter: {
    status?: 'open' | 'closed';
    assignee?: 'me' | 'unassigned' | { userId: string };
    labelId?: string;
  },
) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.listThreads.queryOptions(
      { teamId: teamId ?? '', ...filter },
      { enabled: !!teamId, staleTime: 15_000 },
    ),
  );
};

export const useTeamComments = (teamThreadId: string | null, live: boolean) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.listComments.queryOptions(
      { teamThreadId: teamThreadId ?? '' },
      {
        enabled: !!teamThreadId,
        staleTime: 5_000,
        // Fallback UNIQUEMENT : le socket invalide en direct quand il est là.
        refetchInterval: live ? false : FALLBACK_COMMENTS_POLL_MS,
      },
    ),
  );
};

export const useTeamNotificationsBadge = () => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.unreadNotificationCount.queryOptions(undefined, {
      staleTime: 30_000,
      refetchInterval: 60_000,
    }),
  );
};

export const useTeamNotifications = (options: { unreadOnly: boolean; limit: number }) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.listNotifications.queryOptions(options, {
      staleTime: 15_000,
    }),
  );
};

export const useMarkTeamNotificationsRead = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.teams.markNotificationsRead.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.teams.listNotifications.queryKey() });
        void queryClient.invalidateQueries({
          queryKey: trpc.teams.unreadNotificationCount.queryKey(),
        });
      },
    }),
  );
};

export const useCollabThreadSets = (enabled: boolean) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.teams.myCollabThreadSets.queryOptions(undefined, {
      enabled,
      staleTime: 30_000,
    }),
  );
};

export type TeamPresenceUser = {
  userId: string;
  typingUntil: number | null;
  /** P15 : « rédige une réponse » — horodatage seul, jamais de contenu. */
  replyingUntil?: number | null;
};

type RealtimeState = {
  connected: boolean;
  presence: TeamPresenceUser[];
  revoked: boolean;
};

/**
 * Canal WebSocket d'un fil partagé. Invalide les requêtes ciblées à la
 * réception des événements ; expose présence/typing et l'émission de typing.
 */
export const useTeamRealtime = (teamThreadId: string | null) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    presence: [],
    revoked: false,
  });
  // Horloge locale : re-rend à la PROCHAINE échéance typingUntil pour que
  // l'indicateur disparaisse de lui-même après le TTL, sans nouvel événement
  // (le DO ne re-broadcast pas à l'expiration).
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const deadlines = state.presence
      .flatMap((user) => [user.typingUntil, user.replyingUntil ?? null])
      .filter((until): until is number => until !== null && until > now);
    if (deadlines.length === 0) return;
    const next = Math.min(...deadlines);
    const timer = setTimeout(() => setClock(Date.now()), Math.max(next - now + 20, 20));
    return () => clearTimeout(timer);
  }, [state.presence, clock]);
  const socketRef = useRef<WebSocket | null>(null);
  const lastTypingSentRef = useRef(0);
  const reconnectStepRef = useRef(0);

  const invalidateComments = useCallback(() => {
    if (!teamThreadId) return;
    void queryClient.invalidateQueries({
      queryKey: trpc.teams.listComments.queryKey({ teamThreadId }),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.listThreads.queryKey() });
  }, [queryClient, trpc, teamThreadId]);

  const invalidateThread = useCallback(() => {
    if (!teamThreadId) return;
    void queryClient.invalidateQueries({
      queryKey: trpc.teams.getShare.queryKey({ teamThreadId }),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.teams.listAccess.queryKey({ teamThreadId }),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.listThreads.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.sharesForThread.queryKey() });
  }, [queryClient, trpc, teamThreadId]);

  useEffect(() => {
    if (!teamThreadId || typeof WebSocket === 'undefined') return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      const base = import.meta.env.VITE_PUBLIC_BACKEND_URL as string | undefined;
      if (!base) return;
      const url = `${base.replace(/^http/, 'ws')}/api/team-rt/${teamThreadId}`;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => {
        reconnectStepRef.current = 0;
        setState((prev) => ({ ...prev, connected: true }));
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        let parsed: { type?: string; users?: TeamPresenceUser[]; userId?: string };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (parsed.type === 'presence' && Array.isArray(parsed.users)) {
          setState((prev) => ({ ...prev, presence: parsed.users ?? [] }));
        } else if (parsed.type === 'comments.invalidate') {
          invalidateComments();
        } else if (parsed.type === 'thread.invalidate') {
          invalidateThread();
        } else if (parsed.type === 'access.revoked' && parsed.userId === myUserId) {
          setState((prev) => ({ ...prev, revoked: true }));
          invalidateThread();
        }
      };
      socket.onclose = (event) => {
        socketRef.current = null;
        setState((prev) => ({ ...prev, connected: false, presence: [] }));
        if (disposed) return;
        if (event.code === TEAM_RT_CLOSE_REVOKED || event.code === TEAM_RT_CLOSE_UNSHARED) {
          // Révocation/unshare : ne JAMAIS se reconnecter, purger les caches.
          setState((prev) => ({ ...prev, revoked: true }));
          invalidateThread();
          return;
        }
        scheduleReconnect();
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const step = Math.min(reconnectStepRef.current, RECONNECT_STEPS_MS.length - 1);
      reconnectStepRef.current += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_STEPS_MS[step]);
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current = null;
      try {
        socket?.close();
      } catch {
        // déjà fermé
      }
      setState({ connected: false, presence: [], revoked: false });
    };
  }, [teamThreadId, myUserId, invalidateComments, invalidateThread]);

  const sendTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_SEND_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    try {
      socket.send(JSON.stringify({ type: 'typing' }));
    } catch {
      // socket en cours de fermeture
    }
  }, []);

  /** P15 : signal « rédige une réponse » — un booléen, JAMAIS de contenu. */
  const sendReplying = useCallback((active: boolean) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ type: 'replying', active }));
    } catch {
      // socket en cours de fermeture
    }
  }, []);

  const othersPresent = useMemo(
    () => state.presence.filter((user) => user.userId !== myUserId),
    [state.presence, myUserId],
  );
  const typingUserIds = useMemo(
    () =>
      othersPresent
        .filter((user) => user.typingUntil !== null && user.typingUntil > Date.now())
        .map((user) => user.userId),
    // `clock` force le recalcul à l'échéance du typing le plus proche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [othersPresent, clock],
  );

  const replyingUserIds = useMemo(
    () =>
      othersPresent
        .filter((user) => (user.replyingUntil ?? null) !== null && user.replyingUntil! > Date.now())
        .map((user) => user.userId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [othersPresent, clock],
  );

  return {
    connected: state.connected,
    revoked: state.revoked,
    othersPresent,
    typingUserIds,
    replyingUserIds,
    sendTyping,
    sendReplying,
  };
};

/**
 * Présence côté DB : heartbeat périodique tant que le panneau est ouvert
 * (vérité pour les clients en fallback polling) + lecture fallback quand le
 * socket est absent.
 */
export const useTeamPresenceFallback = (
  teamThreadId: string | null,
  open: boolean,
  socketConnected: boolean,
) => {
  const trpc = useTRPC();
  const heartbeat = useMutation(trpc.teams.heartbeat.mutationOptions());
  const heartbeatRef = useRef(heartbeat.mutate);
  heartbeatRef.current = heartbeat.mutate;

  useEffect(() => {
    if (!teamThreadId || !open) return;
    heartbeatRef.current({ teamThreadId, typing: false });
    const interval = setInterval(() => {
      heartbeatRef.current({ teamThreadId, typing: false });
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [teamThreadId, open]);

  return useQuery(
    trpc.teams.listPresence.queryOptions(
      { teamThreadId: teamThreadId ?? '' },
      {
        enabled: !!teamThreadId && open && !socketConnected,
        refetchInterval: FALLBACK_PRESENCE_POLL_MS,
        staleTime: 10_000,
      },
    ),
  );
};
