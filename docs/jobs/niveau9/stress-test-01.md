# Stress-test décomposition niveau9 — rapport (agent read-only, 2026-07-13)

HEAD vérifié : `140a6cf7` sur `factory/niveau9`. Ruling orchestrateur : commentaire batch sur #13.
Non vérifié (install requis) : comptes tsc ~108 mail / ~81 server (le juge baseline a mesuré 135/83).

## BLOQUANT

**B1 — A1 palier 7 littéralement inatteignable.** Palier 7 sans clause d'exception, or 2 fichiers
>1200 LOC sans owner de refactor : `apps/mail/components/icons/icons.tsx` 1783 (aucune issue),
`apps/server/src/lib/driver/microsoft.ts` 1294 (délibérément conservé, ADR A10). Palier 9 cassé
en plus par 5 god files sans owner : contributors.tsx 1032, trpc/routes/mail.ts 879, pipelines.ts
873, mail.tsx 852, note-panel.tsx 829. → RULING R1 : clause d'exception au palier 7, issue
loc-outliers (icons/contributors/note-panel), microsoft.ts en exception ADR, #30/#31 sortent
leur fichier principal ≤800 ou exception justifiée.

**B2 — A5 inatteignable : 126 console.* sans owner.** Mesuré : apps/server/src = 465 dont
routes/agent/** = 81 et lib/driver/** = 45, zones exclues du may-touch de #29 dont la promesse
(« traités par leurs issues V4 respectives ») était fausse. Best case après #29 : 126 > palier 7
(≤60). → RULING R2 : issue server-console-sweep (V5), commandes A5 gelées hors tests/générés.

**B3 — #25 shared-types : 3 des 5 imports percés hors périmètre.** `ParsedDraft` et
`IGetThreadResponse` définis dans `lib/driver/types.ts` (possédé par #23, même vague) ;
`SummarizeMessage/SummarizeThread/ReSummarizeThread` = valeurs runtime dans
`lib/brain.fallback.prompts.ts`. `EPrompts`/`Tools` = enums runtime. → RULING R3 : edge #23→#25,
may-touch élargi (ré-exports), @zero/types émet du runtime (ADR).

## MAJEUR

- **M1** grep de frontière `'\.\./\.\./\.\?\.\?/server'` rate l'import 2-niveaux de
  `use-threads.ts:3` (4/5 matchés) et diverge du barème → pattern unifié `(\.\./)+server/src`.
- **M2** A2 any≤40 : non possédé, commande non gelée, `worker-configuration.d.ts` (165 any
  générés) pollue → commande gelée hors `.d.ts`/tests, cibles #20 mail ≤25 / #21 server ≤15.
- **M3** `check-agent-surface.mjs` lit en dur `tools.ts`/`mcp.ts` avec `.includes()` littéraux :
  érosion silencieuse si #22 déplace le registre ; cassage si #36 sort les littéraux de mcp.ts
  → #22 peut adapter le script avec preuve de non-vacuité (violation semée) ; #36 averti.
- **M4** cible console FRONT sans commande/chemins gelés (mesuré 143 sur app+components+lib+
  hooks+store) → commande gelée au barème.
- **M5** la commande console comptait les tests → gonflée par #35 → exclusion `*.test.*`.

## MINEUR

- m1 : #34/#38 collisionnent sur fr.json/en.json → clause « si disjoints » retirée, strictement
  séquencé. · m2 : grep licence auto-référentiel (14 matches dont 5 docs) → épinglé
  `apps packages` (9 réels). · m3 : oxlint `@latest` survivait dans ci.yml + script precommit
  racine → scope #17 précisé. · m4 : #40 manquait l'edge #29 (et #38) → ajoutés. · m5 : claim
  cold-start −1 s faiblement falsifiable sans deploy → harnais local défini (10 itérations,
  médiane, variance). · m6 : google.ts = 1487 (annoncé 1491), négligeable.

## Faits vérifiés conformes

5 imports percés confirmés · check-agent-surface.mjs présent · ci.yml = base durcie niveau8 ·
3 tests orphelins présents (9 cas) · god files LOC conformes · migrations 42 vs 40 + orphelins
confirmés + 0032 doublé + trou 0037 · 9 en-têtes licence · public/ 75M, GIFs 18/18/9,9M ·
`deploy-to-prod-command.yml:44` force-push sans gate confirmé.

## Dispatchables sans amendement
#16 #17 #18 #19 #20 #21 #24 #26 #27 #28 #30 #31 #32 #33 #34 #35 #37 (amendements légers par
commentaires RULING pour #17 #20 #21 #30 #31).
