# Job niveau9/refactor-shell-palette-01 — issue devlab-io/zero#28 (V3.3 refactor-shell-palette)

MIRROR: ORCHESTRATOR — RAW report. Bindings clavier INCHANGÉS (contrat Shortwave = #32).
COMPORTEMENT STRICTEMENT INCHANGÉ.

Worktree: `/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/refactor-shell-palette-01`
Branche `job/niveau9/refactor-shell-palette-01`, HEAD `a7dc44630a07856107eeb39c9e9f6f30a0ac01e5` (conforme, arbre propre au démarrage).

---

## PHASE 0 — plan + désaccords

### Périmètre mesuré (baseline)
- `apps/mail/components/context/command-palette-context.tsx` = 1922 LOC (borne loc-ratchet L32).
- `apps/mail/components/home/HomeContent.tsx` = 1332 LOC (borne loc-ratchet L37).
- Aucun test ne couvre ces deux fichiers (grep `*.test.*` = 0) → filet = typecheck-report bloquant + build react-router + wrangler dry-run + vitest.
- Ni l'un ni l'autre ne porte l'en-tête « Zero Email Inc. » → check point 5 (licence) sans objet pour les modules dérivés.

### Double-montage HotkeyProviderWrapper — fichier identifié
`HotkeyProviderWrapper` (défini dans `apps/mail/components/providers/hotkey-provider-wrapper.tsx`) est monté **DEUX fois** sur les routes mail :
1. `apps/mail/app/(routes)/layout.tsx:10` — enveloppe TOUTES les routes via `<Outlet/>` (+ `CommandPaletteProvider`).
2. `apps/mail/app/(routes)/mail/layout.tsx:8` — layout enfant imbriqué sous (1), remonte un **second** wrapper.

Chaque wrapper monte `NavigationHotkeys + GlobalHotkeys + MailListHotkeys + ThreadDisplayHotkeys + ComposeHotkeys`. `react-hotkeys-hook` écoute sur `document` → sur les routes mail chaque handler est enregistré 2×, d'où le **double-undo** (mod+z fire deux fois, etc.).
**Fix structurel** : retirer le montage de `mail/layout.tsx` (fragment `<>`), garder l'unique montage racine de `(routes)/layout.tsx`. Bindings inchangés → keyboard-parity #5 « exactly one hotkey provider mounted for mail routes » satisfait.
**Convergence #32** : le lot non commité `zero-niveau8` applique la corr. IDENTIQUE sur `mail/layout.tsx` (retrait du wrapper → fragment). Aucun écart.

### Code mort « saved searches » — PREUVE (0 référence repo-wide)
- 0 référence externe : `grep -rn "savedSearches|filterBuilder|SavedSearch|renderFilterBuilder" apps/mail --include=*.ts(x)` hors `command-palette-context.tsx` = **vide**.
- Les 2 seuls setters `setCurrentView('savedSearches')` sont **commentés** : L691 (`//`) et L1101 (dans un bloc JSX `{/* ... */}` ouvert L1088). Aucun chemin live n'atteint la vue → `renderSavedSearchesView` (L1490-1568) est **injoignable**.
- **Désaccord/observation** : le bloc « filter builder » (vue `filterBuilder`) est mort par le MÊME raisonnement — son unique setter L700 est commenté, `renderFilterBuilderView` (L1570-1730) injoignable, `filterBuilderState` référencé nulle part ailleurs. Les revues chiffrent le code mort à « ~250 lignes » ; savedSearches seul ≈ 122 lignes, savedSearches+filterBuilder ≈ 289 → le « bloc » visé par les revues couvre les DEUX vues sœurs injoignables introduites ensemble.
- **Ruling appliqué** : je supprime savedSearches **et** filterBuilder (mêmes critères « prouvé mort, 0 réf repo-wide »), preuve ci-dessus. Membres d'enum `CommandView` correspondants + cases `renderView` + littéraux `'Saved Searches'/'Filter Builder'` (special-case array L865-870, jamais des items live) retirés. Si l'orchestrateur juge filterBuilder hors mandat, il est retirable indépendamment sans toucher au reste. La vue `dateRange` (membre d'enum jamais set, mappe sur renderFilterView) est laissée intacte (hors chiffrage revues, retrait non demandé).

### Découpage (registre SÉPARÉ de l'UI, tous modules ≤800, cible ≤400)
`command-palette-context.tsx` (1922) →
1. **`command-registry.ts`** [CONTRAT #32] — types (`CommandItem`,`FilterOption`,`ActiveFilter`,`CommandView`) + `FILTER_OPTIONS` (données pures, ex-`filterOptions` useMemo) + `PALETTE_COMMANDS` (registre machine-readable : id, titre, icône, `shortcut`, `scope`, groupe) + `PALETTE_TRIGGER_KEYS` (mod+k / mod+f / mod+s / mod+l / escape, pour #32). Importable & testable, **zéro JSX/état React**.
2. **`command-palette-storage.ts`** — helpers localStorage (recent searches, active filters). Fonctions pures.
3. **`command-palette-views.tsx`** — vues présentationnelles main/search/labels/help (props typées).
4. **`command-palette-filter-view.tsx`** — vue filter (la plus lourde).
5. **`command-palette-context.tsx`** (point d'entrée) — état + effets + callbacks métier + dispatch `renderView` + provider. **Exports INCHANGÉS** : `useCommandPalette`, `CommandPalette`, `CommandPaletteProvider`.

`HomeContent.tsx` (1332, page marketing statique, un seul composant) → sections présentationnelles sous `apps/mail/components/home/sections/` : `home-hero.tsx`, `home-reply-mockup.tsx`, `home-feature-cards.tsx` (3 cartes), `home-chat-section.tsx`. Fichier principal = orchestration (`useTheme` effect + composition). Le bouton « Get Started » (dépendant de `session`) reste auto-suffisant via hooks dans `home-hero.tsx`.

### loc-ratchet (BORNES uniquement)
Les deux fichiers passant ≤800, leurs entrées `BUDGET` (L32, L37) deviennent prunables → retirées (map rétrécit, « ne croît pas » OK). Modules dérivés tous ≤800 → aucune nouvelle entrée. `FRONTIER_MAX 0` intact.

### Contrat #32 — écarts utiles (lecture seule `zero-niveau8`, matière première NON validée, ruling AS-3)
- `mail/layout.tsx` : corr. double-montage IDENTIQUE à la mienne (convergent, aucun conflit).
- `config/shortcuts.ts` : #32 ajoute `'sequence'` à l'enum `type` (séquences g-x du contrat Shortwave), display `delete → ⌦`, réécrit le registre (518 l.). **Bindings = hors périmètre, je n'y touche pas.**
- `command-palette-context.tsx` : delta #32 = +7 lignes seulement → ajoute `openSearch` (`setCurrentView('search')+setOpen('true')`) à la **valeur de contexte**. Mon refactor garde le type `CommandPaletteContext` + l'objet `value` + l'effet keydown intacts dans le fichier principal → greffe #32 triviale.
- `lib/hotkeys/*`, `use-hotkey-utils.ts` : réécrits par #32 (input-guard TipTap/dialog, séquences). Hors périmètre structurel.
- #32 ajoute `config/shortcuts.test.ts` (test du registre machine-readable exigé par keyboard-parity). Mon `command-registry.ts` est le pendant côté palette (registre de commandes, pas de bindings).

---

## PHASE 2 — build livré

### Découpage `command-palette-context.tsx` (1922 → 631)
| Module | LOC | Rôle |
|---|---|---|
| `command-palette-context.tsx` | 631 | point d'entrée : état, effets, callbacks métier, dispatch `renderView`, provider. Exports **inchangés** (`useCommandPalette`, `CommandPalette`, `CommandPaletteProvider`). |
| `command-registry.ts` | 247 | **CONTRAT** (voir section dédiée). |
| `command-palette-views.tsx` | 574 | vues main/search/labels/help (props typées `CommandPaletteViewProps`). |
| `command-palette-filter-view.tsx` | 333 | vue filter. |
| `command-palette-storage.ts` | 58 | helpers localStorage (recent searches, active filters). |
| `command-registry.test.ts` | 45 | test unitaire du registre (4 tests, verts). |

`allCommands` est désormais **piloté par le registre** (`PALETTE_COMMANDS` → mail/search commands),
séparant les données de commandes du rendu. Ordre et comportement préservés (Compose→mail ;
Search/Filter→search puis quick filters ; nav-config inchangée ; Help rendu séparément).

### Découpage `HomeContent.tsx` (1332 → 43)
Page marketing statique éclatée en sections sous `apps/mail/components/home/sections/` :
`home-hero.tsx` (139), `home-reply-mockup.tsx` (182), `home-feature-cards.tsx` (15) qui compose
`feature-card-interface.tsx` (161) / `feature-card-summaries.tsx` (237) / `feature-card-search.tsx`
(282), `home-chat-section.tsx` (250). Fichier principal = composition + effet `setTheme('dark')`.
Bouton « Get Started » auto-suffisant (hooks `useSession`/`useNavigate` dans `home-hero`). Tous ≤400.

### Double-montage HotkeyProviderWrapper
`mail/layout.tsx` : `<HotkeyProviderWrapper>` retiré → fragment `<>`. Montage unique conservé à la
racine `(routes)/layout.tsx`. Vérif : `grep "<HotkeyProviderWrapper" apps/mail` = **1 seul** résultat.
Bindings inchangés. keyboard-parity #5 satisfait. Corr. identique au lot niveau8 (#32) → convergent.

### Code mort supprimé (prouvé)
Vues injoignables `savedSearches` + `filterBuilder` (interfaces, storage helpers, états, vues,
membres d'enum, cases `renderView`, littéraux) : uniques setters commentés (L691/700/1101 de
l'original), 0 référence externe repo-wide. ~290 lignes retirées. Membre d'enum `dateRange`
conservé (jamais chiffré par les revues, mappe sur FilterView, injoignable mais laissé intact).

## GATES (toutes vertes — commandes ré-exécutables par le check-runner)
- **tests** : `pnpm --filter=@zero/mail exec vitest run` → 2 fichiers, **6 tests PASS** (dont 4 du registre).
- **build** : `pnpm --filter=@zero/mail build` (react-router) → **✓ built in 11.62s**, prerender OK.
- **wrangler dry-run** : `wrangler deploy --dry-run` → **--dry-run: exiting now** (0 erreur).
- **typecheck-report --blocking** : server **0/0**, mail **17/17** (résidu 100 % `../server/src` via
  AppRouter, 0 sous apps/mail) → **OK, no regression** (EXIT 0). Note : sur worktree neuf le tsc
  serveur remonte 147 faux positifs tant que `wrangler types --env local` n'est pas généré ; après
  génération → **0**. Aucun fichier serveur touché.
- **loc-ratchet** : `node scripts/checks/loc-ratchet.mjs` → **PASSED**, files>800 = 8 (budget 8, map
  rétrécie de 2), frontier imports = 0/0.
- **console-ratchet** : front **122/143** → PASSED (−2 par retrait du code mort, aucun ajout).
- **type-ratchet** : mail **23/23**, total 37/38 → PASSED (aucun `any` ajouté ; les 2 `any` de la
  palette sont transcrits verbatim de l'original).
- **lint** : aucune erreur NOUVELLE. Les `react/no-unescaped-entities` (21) et 2 `no-explicit-any`
  sont **baseline** (présents à l'identique dans les fichiers commités : HomeContent 5, palette 16+2),
  relocalisés avec le JSX transcrit verbatim. Vérifié en lintant le contenu HEAD original.

## Contrat (module consommé par #32)
**`apps/mail/components/context/command-registry.ts`** — registre machine-readable, data-only (zéro
JSX/état React), importable & testé (`command-registry.test.ts`). Surface exportée :
- `PALETTE_COMMANDS: PaletteCommand[]` — commandes statiques de la palette : `{ id, title, icon,
  shortcut, group, scope, target }` avec `target = {kind:'compose'} | {kind:'view', view}`. Aliases
  clavier + scope pour la parité #32.
- `PALETTE_TRIGGER_KEYS: PaletteTriggerKey[]` — méta-raccourcis (⌘K/⌘F/⌘S/⌘L/ESC) rendus par l'UI
  d'aide (couture keyboard-parity « help renders from the same registry »).
- `FILTER_OPTIONS: FilterOption[]` — définitions de filtres (données pures).
- `IN_PALETTE_VIEW_COMMAND_TITLES` — titres des commandes qui basculent une vue in-palette (dérivé).
- Types : `CommandItem`, `FilterOption`, `ActiveFilter`, `CommandView`, `CommandGroupData`,
  `QuickSearchThread`, `PaletteLabel`, `PaletteCommand`, `PaletteCommandTarget`, `CommandIcon`.

**Greffe #32** (lecture seule du lot `zero-niveau8`, non validé) : le delta palette de #32 = +7 lignes
= ajout d'`openSearch` (`setCurrentView('search')+setOpen('true')`) à la **valeur de contexte** ; le
type `CommandPaletteContext`, l'objet `value` et l'effet keydown restent intacts dans le fichier
principal → greffe triviale. Les changements de bindings (`shortcuts.ts` : enum `+'sequence'`,
`delete→⌦` ; `lib/hotkeys/*` input-guard/séquences) sont hors périmètre structurel. #32 ajoute
`config/shortcuts.test.ts` (registre clavier) ; `command-registry.ts` en est le pendant côté palette.

## Périmètre git (Do NOT commit — respecté)
Modifiés : `mail/layout.tsx`, `command-palette-context.tsx`, `HomeContent.tsx`, `loc-ratchet.mjs`.
Nouveaux : `command-registry.ts`(+`.test.ts`), `command-palette-storage.ts`, `command-palette-views.tsx`,
`command-palette-filter-view.tsx`, `home/sections/*` (7 fichiers), ce rapport. Aucun chemin interdit,
aucun lockfile, aucun `docs/checks/`, aucun `apps/server/`.

## STATUS
STATUS: DONE — #28 refactor-shell-palette livré : palette 1922→631 + registre machine-readable séparé (contrat #32), HomeContent 1332→43 en sections, double-montage HotkeyProviderWrapper dédoublonné (1 seul), code mort savedSearches/filterBuilder prouvé & supprimé ; tous modules ≤800 (cible ≤400 hors views 574) ; tests 6/6, build vert, wrangler dry-run vert, typecheck-report bloquant 0/0+17/17, loc-ratchet + console-ratchet + type-ratchet verts ; exports inchangés ; bindings clavier inchangés ; non commité.
