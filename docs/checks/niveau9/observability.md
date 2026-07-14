# Check — observabilité et gestion d'erreurs (V3.4 server-runtime-guardrails, V5.6 server-console-sweep)

Executor: bash

## RUN (mécanique — check-runner)
- RUN: `grep -rE "console\." apps/server/src --include='*.ts' --exclude='*.test.*' --exclude='*.d.ts' | wc -l` -> ≤20 au final (V3.4 : ≤146 = 465 − 319 adressables ; V5.6 : ≤20)
- RUN: `grep -rE "console\." apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store --include='*.ts' --include='*.tsx' --exclude='*.test.*' --exclude='*.d.ts' | wc -l` -> ≤40 au final
- RUN: `grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" apps/server/src --include='*.ts' | wc -l` -> 0

1. **Logger structuré** : les chemins serveur passent par le logger (logging-service ou
   remplaçant justifié), aux commandes gelées du barème A5 (tests et générés exclus).
   V3.4 traite tout apps/server/src HORS `routes/agent/**` et `lib/driver/**` (ces zones
   appartiennent à V5.6 server-console-sweep) ; au final serveur ≤20 (baseline 465), front ≤40
   (baseline ~143), liste résiduelle justifiée site par site dans le rapport.
2. **Catch-swallow zéro** : l'inventaire des catch silencieux (établi au dispatch dans l'issue)
   est traité à 100 % — chaque catch loggue avec contexte (opération, identifiants non sensibles)
   ou rethrow une erreur typée. 0 `catch {}` vide (grep).
3. **Taxonomie** : module central d'erreurs (codes + mapping TRPCError + réponses Hono
   normalisées) ; testé unit (au moins : erreur métier → code stable, erreur inconnue → 500
   générique sans fuite de stack au client).
4. **Sentry Worker** : init côté serveur avec release ; une erreur de test capturée en dev
   apparaît dans la sortie du transport (preuve locale acceptée, aucun deploy).
5. **Tracing statué** : `lib/tracing.ts` implémenté (spans réels sur le chemin tRPC) OU supprimé
   avec ADR ; pas de stub mort restant.
6. **Env** : schéma zod des variables requises exécuté au boot des 2 workers ; variable manquante
   → échec immédiat avec message nommant la clé ; testé unit ; `.dev.vars.example` synchronisé.
7. **Ratchet console** : `scripts/checks/console-ratchet` passe et est branché en CI.
