# Rulings — niveau9/shared-types-package-01 (issue #25) — append-only, orchestrateur

## RULING 2026-07-13 — cascade (freeze/niveau9-v4, #13)
Gate « tsc mail = 0 TOTAL » PROUVÉ hors de portée du périmètre (ADR 0004 +
contre-preuve #29 : découplage env.ts non viable, pistes Cloudflare.Env
0→76/17→97 et stubs bloqués par sync.ts:99/pipelines.ts). Transfert NOMINAL
— 2ᵉ et dernier — vers #43 trpc-type-boundary (blocked-by #25+#29).
#25 est jugé sur son périmètre livré : package @zero/types (runtime enums +
prompts + types), 5 imports percés éliminés, frontière relative = 0 + règle
ESLint no-restricted-imports prouvée par violation semée, FRONTIER_MAX 5→0,
BASELINE.mail maintenu à 17 (correct — l abaisser eût été faux).
ADR renuméroté 0002→0004 par le builder (anti-collision) : acté.
Re-mesure post-rebase due avant jugement (base 13911b6b antérieure aux
merges #22/#24/#29/#41).
