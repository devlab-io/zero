# Rulings — security-triage-highs-01 (issue #37)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — adaptations triviales vs propriété de vague (2026-07-13)

#37 est le seul toucheur lockfile de V5 et merge EN PREMIER. Si une « adaptation triviale
imposée par un bump » tombe dans un fichier possédé par une autre issue V5 en vol
(#34 : mail data-layer/optimistic/composer/query-provider/use-settings ;
#35 : \*.test.ts nouveaux ; #36 : routes/agent/\*\* ; #42 : sites console
lib/driver/workflows/thread-workflow-utils/pipelines), NE PAS toucher : STATUS BLOCKED
partiel sur cette adaptation, liste exacte au rapport, l'orchestrateur arbitre.
Rappel gel : better-auth 1.6.x INTOUCHABLE ; jamais de bump majeur ; tout bump re-passe
tests auth/scopes + build + dry-run ×2 avec RC natifs.
