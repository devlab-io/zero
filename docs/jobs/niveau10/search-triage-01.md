MIRROR: ORCHESTRATOR

## PHASE 0

- Inputs lus intégralement : check gelé, spec section recherche/triage, rulings et rapport
  builder 1.
- Désaccord constaté et corrigé : le checkpoint builder 1 ajoutait un listener `keydown` natif
  pour `/`, contrairement au ruling. La correction supprime ce listener et fait porter
  l'ouverture/focus par l'action `search` déjà liée par `GlobalHotkeys`.
- Aucun raccourci, commande ou binder n'a été modifié. Dans `command-registry.ts`, le seul
  changement fonctionnel consommé reste `QuickSearchThread.from` vers `sender` ; l'autre diff est
  le tri d'import imposé par Prettier.
- Frontière à juger : le chemin `ThreadDisplayHotkeys` / `use-mail-navigation`, propriétaire du
  snooze clavier, est hors may-touch. Cette correction n'élargit pas la frontière ; elle fournit
  et consomme la transition identité -> successeur/index dans les chemins autorisés
  `thread-display` et `mail-list-thread`.

## Résultat produit

- `/` traverse le registre global, demande d'abord la vue lexicale puis ouvre la palette ; aucune
  écoute parallèle n'existe. Le test envoie 20 vrais `KeyboardEvent`, exige une seule écriture de
  chaque état, vérifie le focus à chaque ouverture et `p75 < 100 ms` cache chaud.
- Enter reste lexical (`useAI=false`) ; l'IA n'est appelée qu'après sélection de la commande
  `Smart Search`.
- 20 cas déterministes affichent `sender` et ouvrent exactement
  `/mail/inbox?threadId=<id>`.
- Le reset existant efface recherche, filtres actifs et persistance ; l'état boîte vide n'affiche
  plus l'action de reset réservée à l'état sans résultat.
- La transition de triage cherche le fil courant par identité avant mutation et retourne l'index
  du successeur après retrait. Les tests parcourent 1, 2 et 20 fils sans skip/dup, avec identité URL
  et focus synchrones puis fermeture finale déterministe.
- Le feedback important est émis après mutation + refresh réels ; l'échec ne peut plus produire
  un faux succès. Les cibles du header restent 44 px mobile / 40 px desktop et nommées.
- Le garde `idToUse` de `mail-list-thread.tsx` est conservé.

## RUN 1

`pnpm --filter @zero/mail exec vitest run components/context/command-palette-context.test.tsx components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx`

exit: 0

```text
 RUN  v3.2.7 .../apps/mail

 ✓ components/mail/thread-triage.test.tsx (5 tests) 4ms
stderr | components/context/command-palette-search.test.tsx
KeyboardLayoutMap API is not supported in this browser

 ✓ components/context/command-palette-search.test.tsx (22 tests) 84ms
 ✓ components/context/command-palette-context.test.tsx (6 tests) 18ms

 Test Files  3 passed (3)
      Tests  33 passed (33)
   Duration  1.06s
```

## RUN 2

`pnpm --filter @zero/mail exec eslint components/context/command-palette-search.test.tsx components/mail/thread-triage.test.tsx components/mail/thread-display.action-button.tsx components/mail/mail-list.tsx components/mail/mail-list-thread.tsx lib/hotkeys/global-hotkeys.tsx && pnpm exec prettier apps/mail/components/context/command-palette-dialog.tsx apps/mail/components/context/command-palette-views.tsx apps/mail/components/context/command-palette-search.test.tsx apps/mail/components/context/command-registry.ts apps/mail/components/mail/mail-list.tsx apps/mail/components/mail/mail-list-thread.tsx apps/mail/components/mail/thread-display.tsx apps/mail/components/mail/thread-display.action-button.tsx apps/mail/components/mail/thread-triage.test.tsx apps/mail/lib/hotkeys/global-hotkeys.tsx --check`

exit: 0

```text
Warning: React version not specified in eslint-plugin-react settings.

apps/mail/components/mail/mail-list-thread.tsx
  132:8  warning  React Hook useMemo has a missing dependency: 'getThreadData?.latest?.body'
  437:6  warning  React Hook useMemo has missing dependencies

apps/mail/components/mail/mail-list.tsx
  113:7  warning  React Hook useCallback has a missing dependency: 'setAnchorIndex'
  135:8  warning  React Hook useEffect has a missing dependency: 'searchValue'
  177:7  warning  React Hook useCallback has a missing dependency: 'Comp'

5 problems (0 errors, 5 warnings)

Checking formatting...
All matched files use Prettier code style!
```

## RUN 3

`pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`

exit: 0

```text
> @zero/server@ types
> wrangler types --env local
Generating project types...
Generating runtime types...
Runtime types generated.
Types written to worker-configuration.d.ts

> @zero/mail@0.1.0 types
> wrangler types
Generating project types...
Generating runtime types...
Runtime types generated.
Types written to worker-configuration.d.ts

Found 3 warnings and 0 errors.
Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
```

## RUN 4

`git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(components\/context\/(command-palette-dialog\.tsx|command-palette-views\.tsx|command-palette-search\.test\.tsx|command-registry\.ts)|components\/mail\/(mail-list\.tsx|mail-list-thread\.tsx|thread-display(\.[^.]+)?\.tsx|thread-triage\.test\.tsx)|lib\/hotkeys\/global-hotkeys\.tsx)|docs\/jobs\/niveau10\/search-triage-01\.md)$/ {print; bad=1} END {exit bad}'`

exit: 0

```text
```

## RUN 5

`git diff --check`

exit: 0

```text
```

STATUS: COMPLETE — 5/5 RUNs gelés passent ; aucun commit ni push effectué.
