# Job — a6-zod-mail-01 (V7, manquant A6 −0,5)

*(Fiche transcrite par l'orchestrateur depuis le rapport SendMessage complet du builder
— précédent #38 ; contenu verbatim, zéro ajout. Le builder avait signalé l'absence du
fichier au gel et livré son rapport par message.)*

## PHASE 0
Worktree/HEAD/branche vérifiés (375d1003). Cible : apps/mail/wrangler.jsonc →
main: workers/spa-fallback.ts ; Env = seul binding ASSETS, aucun garde zod. Pattern
serveur étudié : env-schema.ts (module zod pur) + bootEnv (once-per-isolate) + tests
dédiés sur assert*, jamais sur bootEnv (piège d'état). zod résolvable depuis apps/mail
(zod@4.1.1 « catalog: » déjà déclaré) → aucun ajout de dep, lockfile hash identique
avant/après frozen install (6cbcc317…).

## Schéma — honnête, pas cosmétique
Le serveur valide 9 secrets string et exclut les bindings. Ce worker est l'inverse :
aucune var string, seule dépendance runtime = binding ASSETS déréférencé à chaque
requête. Transposition littérale = z.object({}) = théâtre. Garde honnête : présence +
forme fetcher du binding (z.custom, typeof v?.fetch === 'function'). Sans garde :
crash opaque « Cannot read properties of undefined (reading 'fetch') » ; avec : échec
LISIBLE au boot nommant ASSETS et pointant wrangler.jsonc. Dry-run confirme le binding
réel (env.ASSETS Assets).

## Livrables (3 fichiers, tous sous apps/mail/workers/)
- NEW env-schema.ts : requiredMailEnvSchema + assertMailEnv + type RequiredMailEnv.
- MOD spa-fallback.ts (+18) : bootEnv(env) once-per-isolate, 1ère ligne du fetch.
- MOD spa-fallback.test.ts (+32) : 5 cas ajoutés (schéma exact, env valide passe avec
  extras ignorés, ASSETS absent → erreur nommée, non-fetcher → erreur, message pointe
  wrangler.jsonc). Testés sur assertMailEnv directement (déterministe).

## Gates (RC natifs)
tsc mail RC=0 (0 erreur TOTALE, séquence complète) · vitest mail RC=0 (23 fichiers /
144 tests ; spa-fallback 6→11) · build RC=0 (SPA Fallback prérendu) · dry-run RC=0
(env.ASSETS Assets ; upload 124,66 KiB / gz 20,75).

## Boundaries
MAY respecté (3 changements sous apps/mail/workers/) ; lockfile intact ; artefacts
générés gitignorés ; aucun commit/push.

MIRROR: ORCHESTRATOR

STATUS: DONE — manquant A6 levé : validation zod honnête au boot démontrée pour les
DEUX workers (serveur : 9 vars via assertServerEnv/bootEnv ; mail : binding ASSETS
fetcher via assertMailEnv/bootEnv, échec lisible).
