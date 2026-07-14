# Frozen checks — perf / p0-client-weight

Executor: bash
Spec pointer: docs/spec/perf-baseline.md (+ classement B1, docs/research/perf-baseline.md)
Run: perf · Slice: p0-client-weight
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baselines au gel (B0 + tree factory/perf) : client 5,59 MB raw / 160 chunks ;
plus gros chunk `use-drafts` 1 408 kB raw (368 gz) ; `ai-sidebar` 879 kB ;
héros landing `public/email-preview.png` 1 133 020 octets ; tsc mail = 99 erreurs.

## Runnable checks

- RUN: `test $(stat -f%z apps/mail/public/email-preview.png) -lt 300000 && echo HERO_OK` -> expected output `HERO_OK` (héros < 300 kB, format optimisé accepté si le .png est remplacé — le check suit le fichier réellement référencé par HomeContent.tsx; renommage autorisé si HomeContent est mis à jour, alors adapter via un fichier .png de même chemin ou laisser un png optimisé)
- RUN: `cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/p0-build.log 2>&1; echo "build exit: $?"` -> expected output `build exit: 0`
- RUN: `find apps/mail/build/client/assets -name "*.js" -size +900k | wc -l` -> expected output `0` (plus aucun chunk JS > 900 kB raw)
- RUN: `find apps/mail/build/client/assets -name "*.js" -exec stat -f%z {} + | awk '{s+=$1} END {print int(s/1024)}'` -> expected: <= 4600 (total JS ≤ ~4,6 MB kB, vs 5 828 kB baseline JS-only ; le du global était pollué par 4,5 MB de SVG hors levier)
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 99 && echo TSC_NO_NEW_ERRORS` -> expected output `TSC_NO_NEW_ERRORS`
- RUN: `git status --porcelain -- apps/server packages | wc -l` -> expected output `0` (mail uniquement)

## Judge-only checks (orchestrator-graded)

- La réduction vient de vrais leviers : dynamic import / lazy des surfaces
  lourdes (éditeur de use-drafts, ai-sidebar), image compressée — pas de
  suppression de fonctionnalité ni d'exclusion de build artificielle.
- Le chemin critique login/inbox ne régresse pas fonctionnellement (routes
  montent, aucune erreur console au boot en serve local).
- Aucun asset requis n'est cassé (héros affiché sur la landing).
