import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// P2 — voie WebSocket : l'indicateur de saisie doit DISPARAÎTRE de lui-même à
// l'échéance typingUntil (horloge locale), sans nouvel événement ni polling ;
// une fermeture 4403 (révocation) ne se reconnecte jamais.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  sockets: [] as FakeWebSocket[],
  invalidate: vi.fn(),
}));

class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(url: string) {
    this.url = url;
    h.sockets.push(this);
  }
  send(payload: string) {
    this.sent.push(payload);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

vi.mock('@/providers/query-provider', () => {
  // Singleton STABLE : le vrai useTRPC renvoie un proxy à identité constante ;
  // un objet neuf par rendu ferait boucler l'effet socket (cleanup → setState).
  const key = (path: string[]) => (input?: unknown) => [path, input];
  const trpc = {
    teams: {
      listComments: { queryKey: key(['teams', 'listComments']) },
      listThreads: { queryKey: key(['teams', 'listThreads']) },
      getShare: { queryKey: key(['teams', 'getShare']) },
      listAccess: { queryKey: key(['teams', 'listAccess']) },
      sharesForThread: { queryKey: key(['teams', 'sharesForThread']) },
    },
  };
  return { useTRPC: () => trpc };
});

vi.mock('@tanstack/react-query', () => {
  // Identités STABLES (comme les vrais hooks) — un client neuf par rendu
  // ferait boucler l'effet socket via ses useCallback.
  const queryClient = { invalidateQueries: h.invalidate };
  const query = { data: undefined };
  const mutation = { mutate: () => {} };
  return {
    useQueryClient: () => queryClient,
    useQuery: () => query,
    useMutation: () => mutation,
  };
});

vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'user-me' } } }),
}));

import { useTeamRealtime } from './use-teams';

let container: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useTeamRealtime> | null = null;

function Probe({ teamThreadId }: { teamThreadId: string }) {
  latest = useTeamRealtime(teamThreadId);
  return null;
}

beforeEach(() => {
  // Ne fake QUE setTimeout/Date : le scheduler interne de React (MessageChannel)
  // doit rester réel, sinon advanceTimersByTime cascade à l'infini (OOM).
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  h.sockets.length = 0;
  h.invalidate.mockClear();
  latest = null;
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.stubEnv('VITE_PUBLIC_BACKEND_URL', 'https://backend.test');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('useTeamRealtime — typing expiry sans nouvel événement', () => {
  it("l'indicateur disparaît SEUL à l'échéance typingUntil (timer local, pas de polling)", async () => {
    act(() => root.render(<Probe teamThreadId="tt-1" />));
    const socket = h.sockets[0]!;
    expect(socket.url).toBe('wss://backend.test/api/team-rt/tt-1');
    act(() => socket.open());
    act(() =>
      socket.message({
        type: 'presence',
        users: [
          { userId: 'user-me', typingUntil: null },
          { userId: 'user-b', typingUntil: Date.now() + 6000 },
        ],
      }),
    );
    expect(latest!.typingUserIds).toEqual(['user-b']);
    expect(latest!.othersPresent.map((u) => u.userId)).toEqual(['user-b']);

    // Aucun autre événement : l'échéance passe, l'indicateur tombe seul.
    await act(async () => {
      vi.advanceTimersByTime(6100);
    });
    expect(latest!.typingUserIds).toEqual([]);
    // La présence, elle, demeure (l'utilisateur regarde toujours le fil).
    expect(latest!.othersPresent.map((u) => u.userId)).toEqual(['user-b']);
  });

  it('révocation (close 4403) : marqué revoked, caches invalidés, AUCUNE reconnexion', async () => {
    act(() => root.render(<Probe teamThreadId="tt-1" />));
    const socket = h.sockets[0]!;
    act(() => socket.open());
    act(() => socket.close(4403));
    expect(latest!.revoked).toBe(true);
    expect(h.invalidate).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(h.sockets).toHaveLength(1);
  });

  it('coupure réseau banale : reconnexion avec backoff', async () => {
    act(() => root.render(<Probe teamThreadId="tt-1" />));
    const socket = h.sockets[0]!;
    act(() => socket.open());
    act(() => socket.close(1006));
    await act(async () => {
      vi.advanceTimersByTime(1_100);
    });
    expect(h.sockets.length).toBe(2);
  });

  it('typing émis throttlé sur le socket ouvert', () => {
    act(() => root.render(<Probe teamThreadId="tt-1" />));
    const socket = h.sockets[0]!;
    act(() => socket.open());
    act(() => {
      latest!.sendTyping();
      latest!.sendTyping();
    });
    expect(socket.sent.filter((s) => s.includes('typing'))).toHaveLength(1);
  });
});
