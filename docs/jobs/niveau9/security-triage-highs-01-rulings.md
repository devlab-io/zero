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

## Ruling post-récidive (orchestrateur, 2026-07-13)

Deux arrêts consécutifs sur #37 (-01 : 11 overrides + lockfile sans rapport ; -02 :
récidive malgré mandat rapport-d'abord et ultimatum). Snapshots préservés
(sha256 `729c6454…9253` et `93c31791…c2d5a`). Audit read-only orchestrateur au
squelette de rapport (branche job) : les 12 changements du snapshot -02 sont
semver-sûrs contre le lockfile gelé, aucun saut de majeure ; retrait defu = prudence
better-auth (diagnostic préservé) ; coverage-v8 = ruling exécuté. Le CONTENU est
recevable ; le PROCESS a échoué deux fois — la suite (-03) sera strictement bornée à
la JUSTIFICATION et aux PREUVES (triage, mapping advisory→override, gates post-bump,
gitleaks), sans nouveau changement de dépendance sauf verdict de triage contraire.
Respawn -03 suspendu à la décision propriétaire.
