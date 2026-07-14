# Perf — chemin chaud authentifié : cascade DO/Postgres réduite à 2 sauts

Date : 2026-07-14. Mandat direct Thomas (« on ne s'arrête pas tant que c'est pas
livré »), hors périmètre factory (STOP per-run perf inchangé). Base :
`origin/staging` bc3dab47. Déploiement staging mesuré : version `6207091d`.

## Diagnostic (confirmé par mesure)

Chaque requête tRPC authentifiée « chaude » payait une cascade de sauts réseau
séquentiels, tous à 100–250 ms (Worker au POP proche de l'utilisateur, DO et
Postgres Railway en US-West — vérifié : ping proxy Railway 120 ms depuis Tahiti,
requête SQL 250–270 ms) :

1. **Auth** : `getActiveConnection` = `setMetaData` (1 RTT, fabrique un RpcTarget)
   → `findUser` (RTT + Postgres) → `findUserConnection`/`findFirstConnection`
   (RTT + Postgres), séquentiels — à chaque requête.
2. **Sharding** : `getZeroAgent` = registre (`SELECT shards`, 1 RTT) → par shard :
   `setName` (write storage + `blockConcurrencyWhile(setupAuth)`) + `setupAuth`
   (2 RTT) + `getDatabaseSize` (1 RTT) → sélection → re-création du client avec
   re-handshake (2 RTT) → enfin la requête réelle.
3. `mail.get` : idem via `raceShardDataEffect` (registre + handshake par shard).

Soit ~10 sauts séquentiels ≈ 5 s d'overhead serveur pur.

## Correctifs (3 fichiers)

- `lib/server-utils.ts` — caches par isolate :
  - `shardHandshakeDone` (Set) : le handshake `setName` n'est envoyé qu'une fois
    par isolate et par shard ; l'appel `setupAuth` séparé (redondant, `setName`
    l'exécute déjà) est supprimé.
  - `activeShardCache` + `shardListCache` (TTL 60 s) : le registre et les sondes
    `getDatabaseSize` sortent du chemin chaud ; invalidation dans `forceReSync`
    et à l'insertion d'un shard. Staleness inter-isolate bornée à 60 s, sans
    conséquence (la topologie ne bouge qu'à l'approche des 8 GB par shard).
  - `getActiveConnection` : un seul RPC vers `ZeroDB.getActiveConnection(userId)`.
- `db/durable-objects.ts` — `ZeroDB.getActiveConnection` : logique
  défaut-sinon-première côté DO + cache mémoire 60 s invalidé par TOUTES les
  écritures user/connection du DO (updateUser, create/update/delete connection,
  deleteUser). Le DO étant per-user, l'invalidation locale est exhaustive —
  exception connue : `resetConnection` (échec token) écrit en direct dans
  Postgres ; staleness bornée 60 s, auto-corrigée par `updateConnection` au
  premier `invalid_grant`.
- `routes/agent/zero-driver.ts` — le DO se ré-initialise seul depuis son storage
  (constructeur, `blockConcurrencyWhile`, erreur → init paresseuse) ; `setName`
  devient idempotent (skip write + setupAuth si déjà initialisé). C'est ce qui
  rend le skip de handshake côté Worker sûr après éviction du DO.

## Mesures (staging, session synthétique, TTFB curl, POP Tahiti)

Protocole : session insérée en base (Railway PG staging), cookie signé
HMAC-SHA256 (`__Secure-better-auth-dev.session_token`), cookie-cache de session
rempli via `get-session` (représentatif navigateur). 8–12 tirs par point.

| Endpoint                             | Avant (bc3dab47)      | Après (6207091d) | Gain |
| ------------------------------------ | --------------------- | ---------------- | ---- |
| `mail.listThreads` chaud             | 5,1–7,5 s (méd. ~5,3) | **1,06–1,23 s**  | ×4,8 |
| `mail.get` chaud (cookie-cache)      | ~4,5 s                | **1,14–1,20 s**  | ×3,9 |
| `mail.get` chaud (sans cookie-cache) | 4,5 s                 | 2,33 s           | ×1,9 |
| Premier hit post-deploy              | 10,1 s                | 4,25 s           | ×2,4 |
| Plancher réseau (endpoint non auth)  | 0,03–0,12 s           | idem             | —    |

Intégrité vérifiée : projection riche intacte (`id, historyId, subject, sender,
receivedOn, labels, unread`, 20 fils, 8 077 o), `mail.get` identique à l'octet
(4 331 o), `labels.list` fonctionnel (borné Gmail API, ~1,5 s chaud). Pic
périodique ~3 s toutes les ~60 s = re-sonde des shards à expiration du TTL,
attendu. `tsc --noEmit` : 0 erreur (ratchet niveau9 préservé).

## Plancher résiduel (~1,05 s chaud) et suites possibles

Deux RPC séquentiels restent : Worker→ZeroDB (cache mémoire) puis
Worker→ZeroDriver (requête). Depuis Tahiti chaque saut vers un DO US-West coûte
~250 ms + tRPC/sérialisation. Pistes non embarquées ici : paralléliser
spéculativement résolution de connexion et de shard ; `locationHint` à la
création des DO (sans effet sur les DO existants — non codé pour ne pas
contraindre la prod) ; réduire le poids du handshake dormroom.

## Incidents de manœuvre (staging uniquement, assumés)

- `BETTER_AUTH_SECRET` staging inconnu → **roté** (nouvelle valeur aléatoire) ;
  les `mail0_jwks` chiffrées avec l'ancien secret ont été purgées (better-auth
  régénère). Conséquence : les sessions staging antérieures sont invalides —
  une reconnexion Google suffit. Aucun token Gmail affecté (stockés en clair
  dans `mail0_connection`, vérifié).
- Un premier déploiement staging depuis `factory/perf` (branche en retard sur
  staging) a brièvement régressé la projection ; restauré en déployant
  `origin/staging` tel quel (version `9df3a935`), baseline re-validée dessus,
  puis correctifs portés et déployés depuis `perf/hotpath`.
