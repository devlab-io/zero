# Session hors du chemin critique — correctifs et mesures (2026-07-25)

_Suite de `perf-recertif-v2-2026-07-25.md`, qui a établi que le verrou du
parcours authentifié n'est pas les procédures tRPC (44–96 ms serveur) mais la
résolution de session. Branche `perf/session-critical-path`, base
origin/staging `6cd92d99`. Déployée sur staging : worker `zero-server-staging`
`5567f701`, worker `zero-staging` `eac9b751`._

## Ce qui a été corrigé

### 1. Trois déconnexions automatiques sur erreur transitoire

Le parcours contenait trois `signOut` déclenchables par un simple hoquet, sans
qu'aucune session ne soit réellement invalide. Aucun n'a de rapport avec la
perf ; ils sont sortis du bois parce que les requêtes partent désormais plus
tôt, mais ils étaient déjà là.

| Emplacement                           | Déclencheur                               | Traitement                                                                                  |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `trpc.ts` `activeConnectionProcedure` | **toute** erreur de `getActiveConnection` | retiré — redondant avec le cas légitime déjà traité en aval                                 |
| `server-utils` `getActiveConnection`  | un `null` du DO (froid, cache local vide) | confirmation contre Postgres avant révocation ; sinon erreur transitoire, session conservée |
| `use-billing`                         | `if (error) signOut()` sur l'API Autumn   | journalisé, repli sur `DEFAULT_FEATURES`                                                    |

Le troisième est le plus sévère : un incident chez le prestataire de
facturation déconnectait tous les utilisateurs.

### 2. Session hors du chemin critique

`(routes)/mail/[folder]/page.tsx` faisait `await authProxy.api.getSession()`
avant de rendre la route. La garde subsiste mais s'exécute en parallèle.
`authProxy` partage désormais le client better-auth singleton, déduplique les
appels en vol et cache 10 s (cache par onglet : tous les appelants sont des
`clientLoader`, jamais de partage entre utilisateurs).

## Mesures

Chrome headless 1440×900 depuis Tahiti, session synthétique en bearer, trois
chargements successifs dans le même contexte, 4 passes. Médianes.

| Scénario                        | Avant  | Après     |                |
| ------------------------------- | ------ | --------- | -------------- |
| Première visite (profil vierge) | 12,9 s | **4,1 s** | −68 %          |
| Deuxième chargement             | 4,0 s  | **0,9 s** | variance forte |
| Régime établi                   | 2,8 s  | **2,7 s** | inchangé       |

Preuve du mécanisme : le batch tRPC de la liste part à **97–180 ms** au lieu de
**2 537 ms**.

**Le régime établi ne bouge pas**, et c'est le résultat honnête : deux verrous
subsistent. Un second `/api/auth/get-session` est toujours émis par le hook
`useSession` (mécanisme distinct de `authProxy`, non couvert par la
déduplication), et la liste attend encore une seconde vague de requêtes tRPC
avant de peindre.

## Fausses pistes — à ne pas refaire

**Un worktree neuf ne construit pas une app utilisable.** `pnpm install` y
exécute `postinstall → nizzy env`, qui crée un `.env` **vide**. Vite inline
`import.meta.env.VITE_PUBLIC_BACKEND_URL` au build : sans lui, l'app appelle sa
propre origine, tout `/api/*` répond 404, et les symptômes se déguisent en bugs
applicatifs (déconnexions, redirections vers `/mail/undefined/login`). Deux
diagnostics erronés ont été tirés de builds ainsi cassés avant que la cause ne
soit vue. **Toujours** construire avec les variables explicites puis vérifier :

```sh
VITE_PUBLIC_APP_URL=https://zero-staging.devlab-tahiti.workers.dev \
VITE_PUBLIC_BACKEND_URL=https://zero-server-staging.devlab-tahiti.workers.dev \
  pnpm run --filter=@zero/mail build
grep -rl "zero-server-staging" apps/mail/build/client/assets/ | wc -l   # doit être > 0
```

**Les URL de prévisualisation `wrangler versions upload` ne servent à rien pour
l'auth.** L'origine `<id>-zero-staging.devlab-tahiti.workers.dev` n'est pas dans
les `trustedOrigins` de better-auth : la session échoue par construction, quel
que soit l'état du code. Tester sur l'URL réelle, avec `wrangler rollback` prêt.

**`factory/perf` est 225 commits derrière `staging`.** Le worker staging se
déploie depuis `staging` ; construire depuis `factory/perf` régresse tout.
Ce chantier a donc été mené dans un worktree basé sur `origin/staging`.

## Incident

Trois déploiements staging successifs ont servi un build cassé (cause : le
`.env` vide ci-dessus), pendant environ vingt minutes cumulées. Détecté par la
mesure elle-même, `wrangler rollback` à chaque fois vers `572fb8b5`, service
rétabli et vérifié. Les sessions réelles de Thomas n'ont jamais été perdues
(vérifié en base à chaque étape) ; la session synthétique du run a survécu.

## Reste à faire

1. Le second `get-session` du hook `useSession`.
2. La seconde vague tRPC avant peinture de la liste.
3. Cookie-cache effectif sur toutes les voies (−1,15 s par requête mesuré), ou
   cache de session côté DO/KV plutôt que Postgres.
4. `forceSync` en double-buffer (fenêtre de 40 s à inbox vide).
5. Frame de présentation du clic sur un fil (426 ms).
