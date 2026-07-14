# UX Trust — builder final

STATUS: COMPLETE

## Freeze et périmètre

- HEAD vérifié : `01559ffc2d7a8efa7882fa4dbfaf5d6b6360cced`.
- Freeze propriétaire intégré : `freeze/niveau10-v15` (`22a7c056`).
- Branche : `job/niveau10/ux-trust-01`.
- Spec et check gelés non modifiés.
- Aucun commit, push, tracker ou hot path serveur effectué par ce builder final.

Phase 0 avait établi que les exigences responsive, ordre Tab et autosave vivent dans le
composeur partagé, initialement hors du touch-set. Le ruling
`docs/jobs/niveau10/ux-trust-rulings.md` a autorisé uniquement les quatre coutures réelles :
`email-composer.tsx`, `email-composer.fields.tsx`, `create-email.tsx` et
`use-composer-draft-persistence.ts`.

Le freeze v14 apporte en amont le registre queue canonique et son fixture DOM compatible avec les
types Workers. La fusion UX conserve un seul `useShortcuts`, une map exhaustive typée par
`QUEUE_HANDLED_ACTIONS`, `resolveQueueSelectionId`, le focus DOM, le pending par item et les actions
mobiles. Le helper temporaire qui clonait les raccourcis `list` a été supprimé.

## Correction 2 — course autosave A/B

Le Judge 1 a démontré une course réelle : la sauvegarde A capturait un brouillon, l'édition B
arrivait pendant son attente réseau, puis le succès de A effaçait quand même le dirty bit et
annonçait « serveur ». B n'avait alors plus de prochain autosave.

La correction v15 place un compteur de révision monotone sur la vraie couture asynchrone du
composeur :

- chaque mutation du formulaire, du corps riche, du From ou des pièces jointes incrémente la
  révision synchronement ;
- une sauvegarde capture sa révision avant le premier `await` ;
- seul un succès de la révision courante peut produire l'état `server` et effacer le dirty bit ;
- un succès ou échec périmé conserve l'état `local`, dirty, sans faux acquittement ;
- `saveInFlightRef` interdit deux requêtes concurrentes, tandis que `snapshotTick` et
  `isSavingDraft` sont des dépendances explicites du scheduler : après A périmée, le passage
  in-flight → libre reprogramme B, même si un compilateur stabilise `saveDraft`.

La régression utilise la même fonction capture-before-await que la production, suspend réellement
A, édite B, résout A, prouve B encore dirty et planifiable, suspend B pour prouver qu'elle n'est pas
acquittée prématurément, puis ne constate `server` qu'après le succès propre de B.

## Résultat produit

| Surface          | Avant                                                                     | Après                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Liste / thread   | spinner ou fallback vide, erreur parfois confondue avec vide              | skeletons dimensionnés, erreur finie + retry, données périmées conservées et signalées                                       |
| Composeur        | largeur/hauteur rigides, contrôles retirés du Tab, autosave non explicite | 390/768/1440 fluide, safe-area et actions sticky, ordre To→Cc/Bcc→From→Subject→Body→actions, états local/serveur/échec-retry |
| Inbox            | ligne générique et actions seulement au hover                             | `article` nommé, activation Enter/Space, focus visible, actions révélées au focus, cibles 44/40 px                           |
| Queue            | pending global, IDs exposés, navigation non canonique                     | pending par item, IDs sous détails, registre canonique j/k/flèches/Enter/Space, sélection wrap + focus, barre mobile sticky  |
| Mouvement / typo | préférences système incomplètes                                           | reduced-motion respecté, aucune nouvelle `transition-all`, Geist conservé, compteurs tabulaires                              |

## RUNs gelés — preuve finale

### 1. Tests UX ciblés

COMMAND:
`pnpm --filter @zero/mail exec vitest run components/mail/ux-trust.test.tsx components/mail/mail-list-thread.test.ts components/queue/queue-review.test.tsx`

EXIT: 0

OUTPUT:

```text
RUN  v3.2.7 .../apps/mail
✓ components/mail/mail-list-thread.test.ts (6 tests) 2ms
stderr | components/queue/queue-review.test.tsx
KeyboardLayoutMap API is not supported in this browser
✓ components/queue/queue-review.test.tsx (4 tests) 2ms
✓ components/mail/ux-trust.test.tsx (6 tests) 10ms

Test Files  3 passed (3)
Tests       16 passed (16)
Duration    1.69s
```

### 2. ESLint touch-set UX

COMMAND:
`pnpm --filter @zero/mail exec eslint components/mail components/queue components/create/email-composer.tsx components/create/email-composer.fields.tsx components/create/create-email.tsx hooks/use-composer-draft-persistence.ts app/root.tsx app/'(routes)'/settings/shortcuts`

EXIT: 0

OUTPUT:

```text
Warning: React version not specified in eslint-plugin-react settings.

components/create/email-composer.tsx
  251:9  warning  handleAttachment changes useEffect dependencies
  457:9  warning  saveDraft changes useEffect dependencies
  554:9  warning  handleClose changes useEffect dependencies
components/mail/mail-display.research.tsx
   95:6, 101:6, 123:5  warning  existing exhaustive-deps diagnostics
components/mail/mail-display.tsx
  128:6, 244:5, 263:6  warning  existing exhaustive-deps diagnostics
components/mail/mail-list-draft.tsx
   28:6  warning  existing exhaustive-deps diagnostic
components/mail/mail-list-thread.tsx
  132:8, 441:6  warning  existing exhaustive-deps diagnostics
components/mail/mail-list.tsx
  118:7, 145:8, 187:7  warning  existing exhaustive-deps diagnostics
components/mail/mail.tsx
  349:6  warning  existing exhaustive-deps diagnostic
components/queue/queue-review.tsx
  135:9, 142:9, 319:8  warning  exhaustive-deps diagnostics
hooks/use-composer-draft-persistence.ts
   33:5  warning  exhaustive-deps diagnostic

✖ 20 problems (0 errors, 20 warnings)
```

### 3. Types Workers + ratchet TypeScript bloquant

COMMAND:
`pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`

EXIT: 0

OUTPUT:

```text
> @zero/server@ types
> wrangler types --env local
Generating project types...
Generating runtime types...
Runtime types generated.
✨ Types written to worker-configuration.d.ts

> @zero/mail@0.1.0 types
> wrangler types
Generating project types...
Generating runtime types...
Runtime types generated.
✨ Types written to worker-configuration.d.ts

Found 3 warnings and 0 errors.
Oxlint successfully finished.
✔ [paraglide-js] Compilation complete (message-modules)
typecheck-report [mode=blocking]
  server: 0 errors (baseline 0)
  mail:   0 errors (baseline 0)
typecheck-report OK — no regression above baseline.
```

Note de traçabilité : le premier passage sur le freeze v13 avait correctement échoué avec
`mail: 1` sur `lib/hotkeys/keyboard-runtime.test.tsx:301` (`Element.append` Workers, trois
arguments). Le propriétaire clavier a remplacé ce fixture par trois `appendChild`, a certifié le
freeze v14, puis le RUN exact ci-dessus a confirmé `server=0` et `mail=0`.

### 4. Build production mail

COMMAND:
`pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build`

EXIT: 0

OUTPUT:

```text
✔ [paraglide-js] Compilation complete (message-modules)
> @zero/mail@0.1.0 build
> react-router build
Using Vite Environment API (experimental)
vite v6.3.5 building for production...
Found 3 warnings and 0 errors.
Oxlint successfully finished.
components/ui/recipient-autosuggest.tsx: sourcemap location warning
[esbuild css minify] WARNING Unexpected ")" in existing CodeMirror selector
✓ 5560 modules transformed.
✓ built in 11.69s
vite v6.3.5 building SSR bundle for production...
Found 3 warnings and 0 errors.
Oxlint successfully finished.
✓ 1005 modules transformed.
✓ 10 assets cleaned from React Router server build.
✓ 1 asset moved from React Router server build to client assets.
Prerender (html): /manifest.webmanifest
Prerender (html): /
Prerender (html): SPA Fallback
✓ built in 8.04s
```

Les avertissements de taille de chunks, sourcemap, import statique/dynamique et sélecteur CSS sont
non bloquants et antérieurs à ce slice ; le build client puis SSR se termine avec exit 0.

### 5. Touch-set

COMMAND:
`git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(app\/root\.tsx|components\/mail\/.*|components\/queue\/.*|components\/create\/(email-composer\.tsx|email-composer\.fields\.tsx|create-email\.tsx)|hooks\/use-composer-draft-persistence\.ts|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/.*)|docs\/jobs\/niveau10\/ux-trust-01\.md)$/ {print; bad=1} END {exit bad}'`

EXIT: 0

OUTPUT: `<no output>` — tous les fichiers modifiés ou non suivis appartiennent au touch-set autorisé.

### 6. Aucune nouvelle transition-all

COMMAND:
`git diff -U0 -- apps/mail | grep -E '^\+.*transition-all' && exit 1 || exit 0`

EXIT: 0

OUTPUT: `<no output>`.

### 7. Hygiène diff

COMMAND:
`git diff --check`

EXIT: 0

OUTPUT: `<no output>`.

## JUDGE-ONLY navigateur authentifié

À vérifier après intégration sur une session connectée :

- `/mail/inbox` : skeleton liste/thread, stale/offline, focus ligne/actions, contraste et Axe ;
- ouvrir le composeur depuis la sidebar ou `/mail/compose` : Tab, autosave local/serveur/retry,
  restauration après reload et sticky actions ;
- `/queue` : j/k, flèches, Enter/Space, pending simultané sur deux items, détails IDs et barre
  mobile ;
- viewports `390×844`, `768×1024`, `1440×900` ;
- objectifs : feedback visible <100 ms, CLS <0,05, aucun overflow horizontal et aucune violation
  Axe critique.

Ces mesures sont explicitement JUDGE-ONLY dans le check gelé ; le builder n'a pas exécuté
Computer Use.
