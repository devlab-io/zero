# Check — migrations et cohérence des données (V1.4 migrations-repair)

Executor: bash

## RUN (mécanique — check-runner)
- RUN: `node scripts/checks/migrations-consistency.mjs` -> exit 0
- RUN: `ls apps/server/src/db/migrations/*.sql | wc -l` -> cohérent avec le journal (42 attendus, 0 orphelin non statué)

Règle de sécurité absolue : ne JAMAIS renuméroter, réécrire ou supprimer un fichier SQL de
migration potentiellement appliqué à une base réelle. On répare le journal et on documente ;
diff sur les `.sql` existants = vide (seuls méta/journal/docs bougent). Violation = FAIL.

1. **Réconciliation** : chaque fichier `.sql` de `apps/server/src/db/migrations/` est soit
   référencé par `meta/_journal.json`, soit statué dans `docs/solutions/migrations-drift.md`
   (orphelin : appliqué ? doublon de contenu ? mort ?) avec décision et preuve (diff de contenu
   contre la migration jumelle du même préfixe).
2. **Script CI** : `scripts/checks/migrations-consistency.mjs` échoue si : SQL non journalisé,
   entrée de journal sans fichier, préfixe dupliqué non documenté. Branché dans ci.yml (par
   l'orchestrateur si V0.2 est déjà mergée).
3. **Trou 0037 et doublons 0025/0029/0032/0035** : expliqués dans le doc de solution (origine
   git : merge/rebase), avec la règle de prévention (préfixes générés, jamais édités à la main).
4. **2ᵉ config drizzle** (`routes/agent/db/`) : fusionnée ou maintenue isolée par ADR — l'ADR
   explique le lien avec le SQLite des Durable Objects.
5. **Garde db:push** : le script `db:push` refuse de tourner si l'URL cible n'est pas
   locale/staging (guard testable, preuve d'exécution du refus).
6. **Vert de bout en bout** : `drizzle-kit generate` sur le schéma actuel ne produit aucune
   migration inattendue (drift schéma/migrations = 0) ; sortie conservée.
