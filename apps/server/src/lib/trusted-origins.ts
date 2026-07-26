// lib/trusted-origins.ts — origines que better-auth accepte pour une requête authentifiée.
//
// La liste vivait en dur dans lib/auth.ts et contenait quatre domaines de l'AMONT
// (`https://0.email`, `app.`, `sapi.`, `staging.0.email`) plus `http://localhost:3000` et
// `:3001`, appliqués en PRODUCTION. Une origine de confiance peut porter des requêtes
// authentifiées contre nos utilisateurs : quatre tiers, sur une infrastructure que nous ne
// contrôlons pas, en avaient le droit — et `http://localhost` rendait exploitable tout ce
// qui tourne sur la machine d'un utilisateur.
//
// Règle retenue : l'origine de l'application, celle du backend, et rien d'autre. Les origines
// locales ne sont ajoutées qu'en développement local. `BETTER_AUTH_TRUSTED_ORIGINS` reste le
// point d'extension EXPLICITE (liste séparée par des virgules), pour qu'un déploiement qui a
// besoin d'une origine supplémentaire la déclare plutôt que de la trouver héritée.

const LOCAL_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

type TrustedOriginsEnv = {
  NODE_ENV?: string;
  VITE_PUBLIC_APP_URL?: string;
  VITE_PUBLIC_BACKEND_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
};

/** Origine canonique d'une URL (`https://a.test/x?y` → `https://a.test`). */
const toOrigin = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

export function resolveTrustedOrigins(env: TrustedOriginsEnv): string[] {
  // `local` seulement : `development` est le NODE_ENV du déploiement de STAGING, qui est
  // joignable depuis Internet et n'a rien à faire d'une origine localhost.
  const isLocal = env.NODE_ENV === 'local';

  const declared = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const candidates = [
    env.VITE_PUBLIC_APP_URL ?? '',
    env.VITE_PUBLIC_BACKEND_URL ?? '',
    ...declared,
    ...(isLocal ? LOCAL_ORIGINS : []),
  ];

  const origins: string[] = [];
  for (const candidate of candidates) {
    const origin = toOrigin(candidate);
    if (origin && !origins.includes(origin)) origins.push(origin);
  }

  return origins;
}
