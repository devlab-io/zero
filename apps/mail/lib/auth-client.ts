import { clearSessionPrime, consumeSessionPrime } from '@/lib/session-prime';
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

// r9b : époque monotone du transport get-session. Chaque requête capture
// l'époque à son DÉMARRAGE ; une invalidation (logout) l'incrémente AVANT de
// vider les références. Une requête partie sous une époque antérieure peut
// finir, mais devient sans effet observable : elle ne remplit jamais le cache
// et ne libère jamais l'in-flight d'une requête plus récente — sans cela, le
// then/finally d'une promesse pré-logout pouvait recacher l'ANCIENNE session
// après la purge (fenêtre élargie par l'amorce HTML du cold boot r9).
let getSessionEpoch = 0;
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
    // r9 (cold boot) : le <head> prérendu a peut-être DÉJÀ lancé ce même
    // aller-retour au parse du HTML (lib/session-prime.ts) — le consommer
    // évite de payer la RTT session APRÈS le chargement du bundle. Amorce
    // absente/périmée/échouée → requête normale inchangée.
    const primed = consumeSessionPrime();
    const issuedEpoch = getSessionEpoch;
    const tracked: Promise<Response> = (
      primed ? primed.then((response) => response ?? fetch(input, init)) : fetch(input, init)
    )
      .then((response) => {
        // r9b : une réponse émise avant une invalidation (logout) ne remplit
        // JAMAIS le cache — elle porterait l'ancienne session.
        if (issuedEpoch === getSessionEpoch) {
          cachedGetSession = { at: Date.now(), response };
        }
        return response;
      })
      .finally(() => {
        // r9b : ne libère l'in-flight que si CETTE requête le détient encore
        // sous la MÊME époque — le finally d'une requête pré-logout ne doit
        // jamais déloger la requête suivante déjà partie.
        if (issuedEpoch === getSessionEpoch && inflightGetSession === tracked) {
          inflightGetSession = null;
        }
      });
    inflightGetSession = tracked;
  }

  const response = await inflightGetSession;
  return response.clone();
}

/** À appeler après une déconnexion : la prochaine résolution de session doit repartir du réseau. */
export const invalidateGetSessionDedup = () => {
  // Époque incrémentée AVANT de vider les références : toute requête encore
  // en vol devient immédiatement sans effet observable (cache + in-flight).
  getSessionEpoch += 1;
  cachedGetSession = null;
  inflightGetSession = null;
  // Une amorce jamais consommée ne doit pas survivre à un logout.
  clearSessionPrime();
};

/** Couture de test UNIQUEMENT : la dédup transport get-session (voir tests r9b). */
export { dedupedFetch as __getSessionTransportForTests };

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
