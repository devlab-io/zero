import { invalidateSessionCache } from '@/lib/session-invalidation';
import { purgeClientIdentityHints } from '@/lib/cache-owner-hint';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { Auth } from '@zero/server/auth';

/**
 * Devlab (perf) : au boot, l'atome session de better-auth (useSession) et
 * authProxy (clientLoader, cf. auth-proxy.ts) appellent chacun
 * /api/auth/get-session sur ce même client — deux requêtes réseau
 * concurrentes pour la même donnée, la résolution de session coûtant 1,2 à
 * 2,5 s mesurés sur staging. Ce customFetchImpl coalesce les GET
 * /get-session concurrents en un seul aller-retour réseau et garde la
 * réponse 5 s ; toute autre requête (mutations, autres endpoints) passe au
 * fetch natif inchangé.
 */
const GET_SESSION_SUFFIX = '/get-session';
const GET_SESSION_DEDUP_TTL_MS = 5_000;

let inflightGetSession: Promise<Response> | null = null;
let cachedGetSession: { at: number; response: Response } | null = null;

function getRequestMethod(input: string | URL | Request, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function getRequestUrl(input: string | URL | Request): string {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return input.toString();
}

function isGetSessionRequest(input: string | URL | Request, init?: RequestInit): boolean {
  if (getRequestMethod(input, init) !== 'GET') return false;
  const urlWithoutQuery = getRequestUrl(input).split('?')[0];
  return urlWithoutQuery.endsWith(GET_SESSION_SUFFIX);
}

async function dedupedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (!isGetSessionRequest(input, init)) {
    return fetch(input, init);
  }

  if (cachedGetSession && Date.now() - cachedGetSession.at < GET_SESSION_DEDUP_TTL_MS) {
    // Devlab (perf) : une Response ne se lit qu'une fois — chaque appelant
    // doit recevoir son propre clone.
    return cachedGetSession.response.clone();
  }

  if (!inflightGetSession) {
    inflightGetSession = fetch(input, init)
      .then((response) => {
        cachedGetSession = { at: Date.now(), response };
        return response;
      })
      .finally(() => {
        inflightGetSession = null;
      });
  }

  const response = await inflightGetSession;
  return response.clone();
}

/** À appeler après une déconnexion : la prochaine résolution de session doit repartir du réseau. */
export const invalidateGetSessionDedup = () => {
  cachedGetSession = null;
  inflightGetSession = null;
};

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_PUBLIC_BACKEND_URL,
  fetchOptions: {
    credentials: 'include',
    customFetchImpl: dedupedFetch,
  },
  plugins: [phoneNumberClient()],
});

const { signIn, signUp, signOut: nativeSignOut, useSession, getSession, $fetch } = authClient;

/**
 * Devlab (perf) : wrapper autour du signOut natif qui vide, dans tous les cas
 * (succès ou échec), les caches de session en mémoire (dédup transport +
 * cache authProxy) ET les hints d'identité (cacheOwner + connexion active) —
 * sans quoi un signOut suivi d'un nouveau login réutiliserait la session, le
 * cacheOwner ou la connexion du compte précédent pendant leur fenêtre de
 * TTL/dédup respective.
 */
export const signOut: typeof nativeSignOut = (async (...args: Parameters<typeof nativeSignOut>) => {
  try {
    return await nativeSignOut(...args);
  } finally {
    invalidateSessionCache();
    invalidateGetSessionDedup();
    purgeClientIdentityHints();
  }
}) as typeof nativeSignOut;

export { signIn, signUp, useSession, getSession, $fetch };
export type Session = Awaited<ReturnType<Auth['api']['getSession']>>;
