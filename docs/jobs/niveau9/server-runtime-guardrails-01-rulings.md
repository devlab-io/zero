# Rulings — niveau9/server-runtime-guardrails-01 (issue #29) — append-only, orchestrateur

## RULING 2026-07-13 — PHASE 0 + points d attention du rapport
- D1 : ni waiver ni correction cross-frontière — le RUN « catch vides = 0 » est
  jugé sur le périmètre V3.4 (hors agent/driver) où le compte est 0 ; le résidu
  unique (lib/driver/google-threads.ts:181) est dette NOMINALE de #42, qui devra
  le corriger réellement (log avec contexte). Le juge ne FAIL pas sur ce site.
- Sentry : ADR 0005 ACCEPTÉ — client minimal au protocole enveloppe ; le SDK
  @sentry/cloudflare réintroduit la pathologie dormroom (triple-slash reference
  écrasant l Env généré, +15 erreurs tsc hors périmètre, preuve au rapport).
  Le check gelé exige « Sentry actif (init+capture+release) », pas un package.
  Retour au SDK tracé dans l ADR quand l alignement workers-types upstream le
  permettra.
- D2-D6 approuvés tels que plaidés. Extensions de frontière consignées :
  .gitignore (+1 négation .dev.vars.example), apps/server/scripts/
  db-push-guard.mjs (nouveau), apps/server/src/env-schema.ts (nouveau).
- ADDENDUM env.ts (découplage graphe profond, demandé en cours de job pour la
  gate de #25) : NON exécuté par ce job — transféré à une issue corrective
  dédiée (env-decouple), fichier env.ts re-délégué à cette issue après merge.
  Sans impact sur les gates propres de #29.
- Forme : la ligne STATUS du rapport dit « PASS » — lue comme
  COMPLETE_WITH_CONCERNS (le verdict appartient au juge froid).
