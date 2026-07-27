import type { authClient } from '@/lib/auth-client';

/**
 * Devlab (perf) : état du cache de session (dédup + TTL 10 s, cf.
 * auth-proxy.ts) extrait dans un module neutre pour casser le cycle d'import
 * auth-client.ts ↔ auth-proxy.ts. auth-client.ts doit vider ce cache dans son
 * wrapper `signOut` ; auth-proxy.ts doit l'alimenter via `authClient` (défini
 * dans auth-client.ts). Sans ce fichier neutre, l'un des deux importerait
 * l'autre en boucle. Ni auth-client.ts ni auth-proxy.ts ne dépendent l'un de
 * l'autre pour ce cache : seul auth-proxy.ts dépend des deux.
 */
export type SessionData = Awaited<ReturnType<typeof authClient.getSession>>['data'];

export const sessionCacheState: {
  inflight: Promise<SessionData> | null;
  cached: { at: number; value: SessionData } | null;
} = {
  inflight: null,
  cached: null,
};

/** À appeler après une déconnexion ou un changement de compte. */
export const invalidateSessionCache = () => {
  sessionCacheState.cached = null;
  sessionCacheState.inflight = null;
};
