# Check — search-triage

Executor: bash

Spec: `docs/spec/niveau10-mailos.md` section 2 et critères recherche/triage.

## RUN

- RUN: `pnpm --filter @zero/mail exec vitest run components/context/command-palette-context.test.tsx components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx` -> exit 0
- RUN: `pnpm --filter @zero/mail exec eslint components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx components/mail/thread-display.action-button.tsx components/mail/mail-list.tsx components/mail/mail-list-thread.tsx components/mail/mail.tsx hooks/use-labels-search.ts hooks/use-mail-navigation.ts lib/hotkeys/global-hotkeys.tsx lib/hotkeys/thread-display-hotkeys.tsx && pnpm exec prettier apps/mail/components/context/command-palette-context.test.tsx apps/mail/components/context/command-palette-context.tsx apps/mail/components/context/command-palette-dialog.tsx apps/mail/components/context/command-palette-views.tsx apps/mail/components/context/command-palette-search.test.tsx apps/mail/components/context/command-registry.ts apps/mail/components/mail/mail.tsx apps/mail/components/mail/mail-list.tsx apps/mail/components/mail/mail-list-thread.tsx apps/mail/components/mail/thread-display.tsx apps/mail/components/mail/thread-display.action-button.tsx apps/mail/components/mail/thread-display.triage.tsx apps/mail/components/mail/thread-triage.test.tsx apps/mail/hooks/use-labels-search.ts apps/mail/hooks/use-mail-navigation.ts apps/mail/lib/hotkeys/global-hotkeys.tsx apps/mail/lib/hotkeys/thread-display-hotkeys.tsx --check` -> exit 0
- RUN: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs` -> server 0 et mail 0
- RUN: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(components\/context\/(command-palette-context(\.test)?\.tsx|command-palette-dialog\.tsx|command-palette-views\.tsx|command-palette-search\.test\.tsx|command-registry\.ts)|components\/mail\/(mail\.tsx|mail-list\.tsx|mail-list-thread\.tsx|thread-display(\.[^.]+)?\.tsx|thread-triage\.test\.tsx)|hooks\/(use-labels-search|use-mail-navigation)\.ts|lib\/hotkeys\/(global-hotkeys|thread-display-hotkeys)\.tsx)|docs\/jobs\/niveau10\/search-triage-01\.md)$/ {print; bad=1} END {exit bad}'` -> aucune sortie ; touch-set respecté
- RUN: `git diff --check` -> exit 0

## ACCEPTANCE

1. `/` ouvre et focus la recherche lexicale directe ; Enter ne lance aucune recherche IA
   avant sélection explicite d'une commande IA.
2. Les résultats rapides utilisent `sender`, affichent l'expéditeur réel et ouvrent
   `/mail/inbox?threadId=…` ; 20 cas déterministes ouvrent le bon fil.
3. Reset nettoie simultanément texte, labels, catégorie, activeFilters et persistance
   locale ; boîte vide et aucun résultat ont des états distincts.
4. Sur jeux de 1, 2 et 20 fils, archive/snooze/navigation successifs ne sautent ni ne
   doublonnent : successeur, focus et URL restent synchrones, dernier fil déterministe.
5. Le toast important reflète le résultat réel succès/échec. Les actions du header ont
   des noms accessibles et des cibles d'au moins 40 px desktop / 44 px mobile.
6. Le test de recherche instrumente `keydown → input focus` et exige p75 <100 ms sur 20
   ouvertures cache chaud dans happy-dom ; la mesure navigateur finale reste JUDGE-ONLY.
7. Le builder réutilise l'action `search` déjà liée par `GlobalHotkeys` et ne crée aucun
   listener clavier parallèle. Dans `command-registry.ts`, seule l'interface de projection
   `QuickSearchThread` peut évoluer de `from` vers `sender` ; aucune définition de commande,
   aucun raccourci et aucun binder ne changent. La spec et les checks restent intouchables ;
   le builder ne commit/push rien.
