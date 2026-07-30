# Better Auth : secondaryStorage Cloudflare natif (KV AUTH_CACHE)

**Contexte (2026-07-30).** Le staging tournait sans cache better-auth (Postgres
seul, ~1,15 s de latence évitable par requête authentifiée). Des secrets
`REDIS_URL`/`REDIS_TOKEN` pointant vers localhost ont été ajoutés par erreur et
ont cassé OAuth ; ils ont été supprimés. Ce document décrit le remplacement
Cloudflare natif.

## Architecture retenue

Cascade dans `apps/server/src/lib/auth-cache.ts` (`selectSecondaryStorage`) :

1. **KV dédié `AUTH_CACHE`** (jamais un KV Gmail) — adaptateur `get`/`put`/`delete`.
2. **Redis distant réel** sinon — `hasRemoteRedis` exige `https://` + token
   (les URLs `redis://`/localhost sont structurellement rejetées : régression
   de l'incident impossible).
3. **Rien** sinon — better-auth fonctionne sur Postgres seul.

## Cohérence : pourquoi KV seul ne suffit pas, et comment on le rend correct

KV est **eventual-consistent** : une écriture est visible immédiatement dans le
colo écrivain mais peut mettre jusqu'à ~60 s à se propager ailleurs. Deux flux
d'auth sont sensibles au read-after-write :

- **State OAuth** : écrit au `/sign-in/social`, relu au `/callback`. Le callback
  peut atterrir sur un autre colo (mobile, load balancing métro) → un miss KV
  ferait échouer le login. Par défaut better-auth 1.6.23 stocke la verification
  **uniquement** dans le secondaryStorage quand il existe.
  → **`verification.storeInDatabase: true`** : le state reste en Postgres, la
  consommation single-use est transactionnelle en DB (`consumeVerificationValue`
  passe par la branche DB) ; KV ne sert que de cache de lecture opportuniste.
- **Session fraîche** : par défaut, sessions **uniquement** en secondaryStorage.
  → **`session.storeSessionInDatabase: true`** : écrite en KV **et** Postgres ;
  `findSession` lit KV d'abord et retombe sur Postgres sur miss. Un miss de
  propagation juste après login est donc un simple détour DB, pas une déconnexion.

Avec ces deux options, KV est un **cache read-through strict** : Postgres reste
la source de vérité de tout ce qui exige la cohérence forte, KV absorbe le hot
path (validation de session à l'expiration du cookie cache, toutes les 5 min).

**Cookie cache** : le cookie signé `session_data` (maxAge 5 min) est posé dès le
callback — les lectures des 5 premières minutes post-login ne touchent aucun
storage. La fenêtre critique 0–60 s est donc couverte deux fois (cookie + fallback DB).

**Révocation** : sign-out supprime KV + Postgres. Un colo distant peut voir la
copie KV périmée ≤ 60 s, plus le cookie cache ≤ 5 min → fenêtre de révocation
bornée ~6 min au pire (équivalente à l'existant cookie-cache seul).

## Détails d'implémentation

- **TTL** : KV refuse `expirationTtl < 60 s` → clamp à 60 (`KV_MIN_TTL_SECONDS`).
  Sans risque : better-auth revalide `expiresAt` dans le payload.
- **Rate limiting** : avec un secondaryStorage, better-auth bascule par défaut
  sur `secondary-storage`. KV est inadapté (pas d'incrément atomique, ~1
  écriture/s/clé) → épinglé sur `memory` quand le backend est KV,
  `secondary-storage` quand c'est Redis.
- **Limite connue** : la liste `active-sessions-{userId}` en KV est
  read-modify-write (last-writer-wins) ; deux logins simultanés sur des colos
  différents peuvent en omettre une entrée (affecte `listSessions` côté cache,
  pas la vérité Postgres).
- `apps/server/src/trpc/trpc.ts` (rate limiter tRPC) gate désormais sur
  `hasRemoteRedis` — un futur REDIS_URL local redevient un no-op au lieu de casser.

## Configuration Cloudflare à appliquer (Codex)

```sh
# 1. Créer le namespace dédié (compte devlab-tahiti)
wrangler kv namespace create auth-cache-staging

# 2. Reporter l'id retourné dans apps/server/wrangler.jsonc, env "staging",
#    binding AUTH_CACHE (remplacer les deux placeholders id/preview_id).

# 3. Déployer zero-server en staging. Aucun secret à créer : le binding suffit.
```

- L'env `local` a déjà son binding (miniflare simule, id non contacté).
- **Production volontairement non câblée** : ajouter le binding après validation
  staging (le code tolère l'absence — fallback Postgres, zéro risque).
- Ne jamais recréer `REDIS_URL`/`REDIS_TOKEN` avec des valeurs locales ; un vrai
  Upstash distant (https) reste supporté et prioritaire sur rien, mais le KV
  dédié prime sur tout.
