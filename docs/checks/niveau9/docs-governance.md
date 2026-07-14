# Check — documentation, gouvernance, conformité (V6.1 docs-architecture-adr)

Executor: bash

## RUN (mécanique — check-runner)
- RUN: `grep -rl "Zero Email Inc" apps packages | wc -l` -> 9 (ou écart justifié dans LICENSE-NOTES.md)
- RUN: `grep -n "Next.js" README.md | wc -l` -> 0 mention comme stack courante (contexte historique toléré si explicite)
- RUN: `ls docs/adr/ | wc -l` -> ≥6

1. **ARCHITECTURE.md** : décrit apps/packages, couches serveur (Hono vs tRPC vs DO vs workflows),
   flux de données (sync Gmail → DO SQLite → projection → client), frontières et exports publics,
   environnements. Le juge vérifie 5 affirmations au hasard contre le code — 1 fausse = FAIL.
2. **ADRs** : ≥6 dans `docs/adr/`, chacun avec contexte/décision/conséquences, reflétant les
   décisions RÉELLEMENT prises pendant le run (routage consolidé, @zero/types, taxonomie
   d'erreurs, découpage du DO agent, posture licence, stratégie de tests, driver Microsoft).
   Un ADR contredit par le code = FAIL.
3. **README** : stack réelle (React Router 7 — plus aucune mention Next.js comme stack courante),
   getting-started fonctionnel (les commandes citées existent), lien vers ARCHITECTURE.md et
   docs/testing.md.
4. **FORK.md** : à jour des divergences du run (surface MCP, CI, structure).
5. **LICENSE-NOTES.md** : inventaire exact des fichiers à en-tête restrictif (vérifiable par
   `grep -rl "Zero Email Inc" apps packages` — 9 attendus au gel ; les docs qui citent la
   chaîne ne comptent pas), règle de préservation des en-têtes sur modules dérivés,
   interdiction de redistribution documentée aussi dans README/FORK.md, plan de sortie chiffré
   (options clean-room/accord upstream) si la redistribution devenait un objectif.
6. **Dette statuée** : @zero/testing (réutilisé/retiré — cohérent avec V0.1), @zero/cli
   (consommé par nizzy/postinstall — statut documenté), driver Microsoft (ADR garder/geler avec
   conséquence produit).
7. **docs/solutions/** : les diagnostics non triviaux du run (rulings, blockers, oddities) y sont
   consommés — aucun docs-debt listé sur la tracking issue ne reste orphelin.
