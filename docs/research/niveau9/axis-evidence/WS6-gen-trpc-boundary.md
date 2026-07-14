# WS6 — Vérification gen-trpc-boundary (RAPPORT seulement, aucun fix)

commit gelé : `1c82b196` · générateur : `apps/server/scripts/gen-trpc-boundary.mjs`
snapshot committé : `apps/server/src/trpc/app-router.boundary.d.ts`

## Constat MESURÉ (fichier produit restauré après mesure — 0 ligne touchée côté serveur)
`node apps/server/scripts/gen-trpc-boundary.mjs` régénère le snapshot ; `git diff` = **1 fichier,
4 insertions / 4 suppressions**. Le delta est **exclusivement l'ORDRE DES CLÉS** de trois types
d'input, AUCUN champ ajouté/retiré, AUCUN type modifié :
- `drafts.list` input : `pageToken/maxResults/q` → `q/maxResults/pageToken`
- `mail.listThreads` input : position de `q` déplacée
- `mail.processEmailContent` input : `theme/html` → `html/theme`

## Attribution du divergent (post-#43)
- Le snapshot committé a été écrit pour la dernière fois à **`d10f2b39`** (w2a-list-projection, #30) —
  le commit #43 (`4780f78f`, ADR 0006) l'avait introduit juste avant.
- Le code SOURCE des inputs (`mail.ts` listThreads, `drafts.ts` list) est **IDENTIQUE** depuis
  `d10f2b39` (vérifié `git show d10f2b39:mail.ts` == HEAD). Ce n'est donc PAS un réordonnancement
  de code applicatif.
- Toolchain d'émission **inchangé** depuis `d10f2b39` : `typescript@5.8.3`, `@trpc/server@11.4.3`.
- Seule mutation du lockfile post-snapshot : **`3b17f7fb`** (#37 security-triage — bump better-auth
  1.6.23 + coverage-v8 + fermeture GHSA, deps NON-TS/tRPC). `86ac5775` (#35) n'a ajouté qu'un
  fichier de test (`mail.test.ts`), sans toucher aux schémas.

## Diagnostic
Le snapshot committé n'est **pas byte-reproductible** depuis la source + le toolchain gelés via le
générateur committé : la régénération produit un delta d'ORDRE DE CLÉS non sémantique. Source et
versions TS/tRPC étant constantes, la cause probable (NON isolée avec certitude) est une **instabilité
d'émission d'ordre de propriétés** de `tsc` dans le `.d.ts`, plausiblement perturbée par le bump de
graphe transitif de `3b17f7fb` (#37), le snapshot n'ayant pas été régénéré après ce bump.
Il n'existe **aucun gate CI de fraîcheur** du snapshot (ci.yml consomme le `.d.ts` committé pour
`tsc mail = 0` via ADR 0006 / typecheck-report.mjs, mais ne régénère jamais + ne diff jamais).

## Statut / ruling recommandé (le fix appartient au propriétaire — code+config hors périmètre)
Le contrat de TYPE est intact (delta ordre-seul → sémantiquement identique ; `tsc mail = 0`, 327 tests
et build inchangés). Recommandation : **régénérer + committer le snapshot** avec revue de delta de
surface confirmant « ordre seul » (sûr) ; ET/OU rendre le générateur déterministe (tri de clés stable) ;
ET ajouter un **gate CI de fraîcheur** (`gen-trpc-boundary` + `git diff --exit-code`) pour prévenir la
récidive. Risque de la divergence actuelle : **négligeable** (cosmétique), mais **non gaté**.
