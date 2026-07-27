import { sessionCacheState, invalidateSessionCache } from '@/lib/session-invalidation';
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
 * L'état du cache vit dans session-invalidation.ts (module neutre) pour
 * pouvoir être vidé depuis auth-client.ts sans créer de cycle d'import.
 *
 * Sûr côté fuite de données : tous les appelants sont des `clientLoader`
 * (navigateur uniquement), ce cache est donc par onglet, jamais partagé entre
 * utilisateurs.
 */
const SESSION_TTL_MS = 10_000;

const requestSession = (headers: Headers): Promise<SessionData> => {
  if (sessionCacheState.inflight) return sessionCacheState.inflight;

  sessionCacheState.inflight = authClient
    .getSession({ fetchOptions: { headers, credentials: 'include' } })
    .then((session) => {
      if (session.error) {
        log.error(`Failed to get session: ${session.error}`, session);
        return null;
      }
      sessionCacheState.cached = { at: Date.now(), value: session.data };
      return session.data;
    })
    .finally(() => {
      sessionCacheState.inflight = null;
    });

  return sessionCacheState.inflight;
};

export const authProxy = {
  api: {
    getSession: async ({ headers }: { headers: Headers }): Promise<SessionData> => {
      const cached = sessionCacheState.cached;
      if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.value;
      return requestSession(headers);
    },
  },
};

/** À appeler après une déconnexion ou un changement de compte. */
export { invalidateSessionCache };
