import { authClient } from '@/lib/auth-client';
import { log } from '@/lib/log';

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>['data'];

/**
 * Devlab (perf) : la résolution de session coûte 1,2 à 2,5 s mesurées sur
 * staging, et chaque `clientLoader` la redemandait sur son propre client
 * better-auth — d'où deux appels `/api/auth/get-session` concurrents au boot,
 * le second sérialisé derrière le premier. On partage désormais le client
 * singleton, on déduplique les appels en vol et on garde le résultat quelques
 * secondes : une navigation racine → /mail/inbox ne paie plus qu'un aller-retour.
 *
 * Sûr côté fuite de données : tous les appelants sont des `clientLoader`
 * (navigateur uniquement), ce cache est donc par onglet, jamais partagé entre
 * utilisateurs.
 */
const SESSION_TTL_MS = 10_000;

let inflight: Promise<SessionData> | null = null;
let cached: { at: number; value: SessionData } | null = null;

const requestSession = (headers: Headers): Promise<SessionData> => {
  if (inflight) return inflight;

  inflight = authClient
    .getSession({ fetchOptions: { headers, credentials: 'include' } })
    .then((session) => {
      if (session.error) {
        log.error(`Failed to get session: ${session.error}`, session);
        return null;
      }
      cached = { at: Date.now(), value: session.data };
      return session.data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

export const authProxy = {
  api: {
    getSession: async ({ headers }: { headers: Headers }): Promise<SessionData> => {
      if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.value;
      return requestSession(headers);
    },
  },
};

/** À appeler après une déconnexion ou un changement de compte. */
export const invalidateSessionCache = () => {
  cached = null;
  inflight = null;
};
