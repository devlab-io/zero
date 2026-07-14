# Job niveau9/refactor-mail-list-data-01 — V3.1 refactor-mail-list-data

Issue devlab-io/zero#26. MIRROR: ORCHESTRATOR. RAW.

Worktree: `.architect/wt/niveau9/refactor-mail-list-data-01`
Branch: `job/niveau9/refactor-mail-list-data-01`
HEAD à l'ouverture: `a7dc44630a07856107eeb39c9e9f6f30a0ac01e5` (== consigne, intégrité OK).

---

## PHASE 0 — Plan + désaccords (cités sur fichiers réels)

### Périmètre mesuré (avant)
- `apps/mail/components/mail/mail-list.tsx` = **1096 LOC** (budget ratchet 1111). Conflà
  TROIS responsabilités : présentation (rows `Thread` 51-566, `Draft` 568-706, `MailLabels`
  1009-1054 + helpers), consommation data (`MailList` 708-1007 destructure `useThreads()` +
  `useIsFetching(mail.get)`), sélection (`anchorIndex`, `getSelectMode`, `handleSelectMail`,
  `handleMailClick` 715-875).
- `apps/mail/hooks/use-threads.ts` = 168 LOC : `useThreads` (liste, 15-63) + `useThread`
  (thread unique, 65-168). C'est **déjà** la couche data primitive.
- `apps/mail/hooks/use-mail-navigation.ts` = 290 LOC : navigation clavier (non re-découpé, voir
  désaccord D2).

### Contrat public à préserver (snapshot exports)
- `mail-list.tsx` : `MailList`, `MailLabels` — inchangés (consommateurs : `mail.tsx` importe
  `MailList` ; `create/ai-chat.tsx` importe `MailLabels`, territoire #27).
- `use-threads.ts` : `useThreads`, `useThread` — **inchangés** (9 + 9 importeurs cross-job).
- `use-mail-navigation.ts` : `focusedIndexAtom`, `mailNavigationCommandAtom`,
  `UseMailNavigationProps`, `useMailNavigation` — non touchés.

### Cible — carte des modules (3 couches)
Data-layer (couture unique) :
- `apps/mail/hooks/use-mail-list-data.ts` (NEW) — `interface MailListData` + `useMailListData()`.
  **LE contrat** (section Contrat plus bas). Enveloppe `useThreads()` et expose données +
  états loading/fetching/error/stale + pagination. Couture #30 (projection) / #34 (états réseau).

Sélection :
- `apps/mail/hooks/use-mail-selection.ts` (NEW) — `useMailSelection(itemsRef)` : `anchorIndex`,
  `getSelectMode`, `handleSelectMail`, effet Escape. Logique de modes (mass/range/selectAllBelow/
  single) extraite verbatim.

Présentation :
- `apps/mail/components/mail/mail-list-thread.tsx` (NEW) — row `Thread` (applique
  `useOptimisticThreadState` par ligne — ruling #30 préservé).
- `apps/mail/components/mail/mail-list-thread-actions.tsx` (NEW) — `ThreadHoverActions` (barre
  star/important/archive/bin, leaf JSX pur extrait pour resserrer la LOC de la row).
- `apps/mail/components/mail/mail-list-draft.tsx` (NEW) — row `Draft` (applique
  `useOptimisticThreadState`).
- `apps/mail/components/mail/mail-list-labels.tsx` (NEW) — `MailLabels` + `getLabelIcon` +
  `getDefaultBadgeStyle`.
- `apps/mail/components/mail/mail-list-utils.ts` (NEW) — `cleanNameDisplay` (partagé Thread+Draft,
  zéro copier-coller).
- `apps/mail/components/mail/mail-list.tsx` (MODIFIÉ) — orchestrateur `MailList` (shell VList +
  empty/loading state) consommant `useMailListData()` + `useMailSelection()` ; **ré-exporte**
  `MailLabels` (barrel, préserve le snapshot).

### Désaccords / notes de conception (MIRROR: ORCHESTRATOR)
- **D1 — Thread garde `useThreads()` en direct (pas la couture data).** La row lit `threads`
  pour `handleNext` (mail-list.tsx:60). La router via `useMailListData()` exécuterait
  `useIsFetching(mail.get)` PAR LIGNE = régression perf (N hooks réseau). La couture unique vise
  la consommation de LISTE (`MailList`) ; la row lit le primitif `useThreads`. Comportement et
  perf inchangés.
- **D2 — `use-threads.ts` non re-scindé physiquement.** Il est déjà la couche data (deux hooks
  distincts). Scinder `useThread` dans un fichier séparé imposerait un re-export barrel et
  toucherait 9 importeurs cross-job (thread-display, mail-display, reply-composer, email-composer,
  ai-chat, thread-context, thread-display-hotkeys — hors périmètre #27/#28/#43) pour **zéro** gain
  LOC (168 < 800). Régression > valeur : déféré. La séparation « en data-layer » est réalisée par
  la couture `useMailListData` qui devient l'unique point de consommation de la liste.
- **D3 — Aucune modification `store/**` ni `use-mail.ts`.** L'état de sélection existe déjà
  (`bulkSelected` dans `useMail`, `anchorIndex` local). Le hook sélection le réutilise ; pas de
  nouvelle slice (moins de surface de régression).
- **D4 — Borne ≤400 = cible, ≤800 = gate.** Priorité absolue au comportement inchangé. Les rows
  JSX volumineuses sont resserrées par extraction de leaves purs (D-actions) ; valeurs finales
  mesurées plus bas.

### Contrat (couture data — consommée par 2 issues V4/V5)
Nom de l'interface : **`MailListData`**, hook **`useMailListData()`** (voir section « Contrat »
détaillée après implémentation).

---

## Contrat (couture data-layer — consommée par 2 issues V4/V5)

Fichier : `apps/mail/hooks/use-mail-list-data.ts`.

Interface **`MailListData`** — l'unique point de consommation de la liste par la présentation
(`MailList` la lit exclusivement via `useMailListData()` ; 0 accès direct à `useThreads()` ou
react-query dans l'orchestrateur, prouvé plus bas).

```ts
export type MailListItem = ReturnType<typeof useThreads>[1][number];

export interface MailListData {
  items: MailListItem[];              // données — payload liste (forme inchangée ; #30 la reshapera à la SOURCE)
  isLoading: boolean;                 // 1er chargement, pas de données
  isFetching: boolean;                // fetch liste en vol (fg/bg)
  isFetchingNextPage: boolean;        // pagination en vol
  isFetchingThreadBodies: boolean;    // ≥1 corps de thread (mail.get) en vol
  isError: boolean;                   // ── couture #34 (états d'erreur) ──
  error: unknown;                     // ── couture #34 ──
  isStale: boolean;                   // ── couture #34 (revalidation) ──
  hasNextPage: boolean;               // pagination
  isReachingEnd: boolean | undefined; // pagination
  loadMore: () => Promise<void>;      // pagination
  refetch: () => Promise<unknown>;    // rafraîchissement
}

export function useMailListData(): MailListData;
```

- **Couture #30 (W2-A, projection serveur)** : la forme des lignes est `MailListItem`, dérivée de
  `useThreads()`. #30 reshapera la donnée à la source (tRPC/`useThreads`) ; `MailListData.items`
  reste le seul canal que la présentation lit — aucune présentation à retoucher.
- **Couture #34 (W2-B, états réseau)** : `isError` / `error` / `isStale` / `isFetching*` sont déjà
  exposés (dérivés de la query, comportement inchangé, non encore consommés par la présentation).
  #34 les branchera sur les vues loading/empty/stale/error sans élargir le contrat.
- **Sélection** : `apps/mail/hooks/use-mail-selection.ts` → `useMailSelection(itemsRef)` renvoie
  `{ anchorIndex, setAnchorIndex, getSelectMode, handleSelectMail }` (interface `MailSelection`).

## Carte finale des modules (LOC mesurées)

| Fichier | LOC | Couche | ≤800 | ≤400 (cible) |
|---|---|---|---|---|
| `components/mail/mail-list.tsx` | **247** | présentation (orchestrateur + ré-export MailLabels) | ✓ | ✓ |
| `components/mail/mail-list-thread.tsx` | 451 | présentation (row Thread) | ✓ | ✗ (voir note) |
| `components/mail/mail-list-draft.tsx` | 154 | présentation (row Draft) | ✓ | ✓ |
| `components/mail/mail-list-thread-actions.tsx` | 135 | présentation (leaf ThreadHoverActions) | ✓ | ✓ |
| `components/mail/mail-list-labels.tsx` | 88 | présentation (MailLabels + helpers) | ✓ | ✓ |
| `components/mail/mail-list-utils.ts` | 7 | présentation (cleanNameDisplay partagé) | ✓ | ✓ |
| `hooks/use-mail-list-data.ts` | 71 | data-layer (Contrat) | ✓ | ✓ |
| `hooks/use-mail-selection.ts` | 109 | sélection | ✓ | ✓ |

`mail-list.tsx` : **1096 → 247 LOC** (`1 file changed, 25 insertions(+), 874 deletions(-)`).
Note row Thread (451) : seul module au-dessus de la CIBLE ≤400 (le GATE ≤800 est tenu avec marge).
La row est un rendu de présentation cohésif ; la fragmenter davantage (avatar/résumé en micro-
composants à ~14 props) nuirait à la lisibilité pour −51 LOC. Extraction déjà faite du leaf
`ThreadHoverActions`. Décision assumée : lisibilité > cosmétique de borne (gate respecté).

## Preuves reproductibles (commandes gelées + sorties)

Baseline (HEAD `a7dc4463`, worktree fraîchement installé `pnpm install --frozen-lockfile`) :
- `loc-ratchet` : `files > 800 = 10 (budget 10)`, frontier `0` — PASSED.
- typecheck (séquence `wrangler types` ×2 + `react-router typegen`, puis
  `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs`) : **server 0 (baseline 0) /
  mail 17 (baseline 17)** — OK.

Après refactor :
- **Snapshot exports (identique)** :
  `mail-list.tsx` avant `{MailList, MailLabels}` → après `{MailLabels (ré-export), MailList}` = même
  surface. `use-threads.ts` / `use-mail-navigation.ts` : `git diff --stat` VIDE (non touchés).
- **loc-ratchet** : `files > 800 = 9 (budget 9)`, frontier `0 (max 0)` — **PASSED** (exceptions
  10→9, ne croît pas ; borne `mail-list.tsx: 1111` prunée car 247 ≤ 800).
- **frontière** : `grep -rnE "(\.\./)+server/src" apps/mail … | wc -l` = **0**.
- **typecheck** : `TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs` → **server 0 /
  mail 17** — OK (inchangé). Contrôle d'origine : `pnpm --filter @zero/mail exec tsc --noEmit` →
  17 erreurs, **0 sous `apps/mail/`**, **0 sur mes fichiers** (100 % résidu `../server/src`,
  transféré à `trpc-type-boundary`).
- **build mail** : `pnpm --filter @zero/mail build` → `✓ built in 10.25s` (exit 0).
- **tests** : `pnpm test` (turbo) → `@zero/mail 2/2`, `@zero/server 23/23`, `Tasks: 2 successful`
  (exit 0, non cachés).
- **overlay optimiste (ruling #30)** : `mail-list-thread.tsx:53 useOptimisticThreadState(idToUse ?? '')`,
  `mail-list-draft.tsx:22 useOptimisticThreadState(message.id)` — chaque ligne rendue l'applique.
- **couture unique** : `grep -c useThreads mail-list.tsx` = **0** (l'orchestrateur consomme la liste
  exclusivement via `useMailListData`).
- **licence** : `mail-list.tsx` et dérivés ne portent aucun en-tête « Zero Email Inc. » — le fichier
  source n'en portait pas (`grep -c "Zero Email Inc" mail-list.tsx` = 0) ; check 5 sans objet.
- **frontières périmètre** : `git status` — seuls `mail-list*.tsx`(+dérivés), `use-mail-list-data.ts`,
  `use-mail-selection.ts`, `loc-ratchet.mjs` (bornes), et ce rapport. Surfaces interdites
  (thread-display/mail-display/create/context/home/hotkeys/trpc/providers/server/packages/lock/
  tsconfig/.github/docs/checks) : **aucune touchée**.

## Mapping acceptation → statut
- Data-layer = interface UNIQUE typée (données + loading/error/stale + pagination) consommée par la
  présentation, nommée `MailListData` — **OK**.
- `mail-list.tsx` ≤800 (247, borne resserrée) ; aucun module dérivé >800 (max 451) — **OK** (cible
  ≤400 : 7/8 modules, row Thread 451 assumée).
- Overlay optimiste préservé par ligne — **OK**.
- Snapshot exports identique ; tests verts ; build mail vert ; typecheck server 0 / mail 17 ;
  loc-ratchet vert (bornes resserrées) — **OK**.
- Hors scope respecté : forme des données (#30) et états d'erreur (#34) non modifiés, seulement
  câblés en coutures.

STATUS: PASS — #26 refactor-mail-list-data livré : mail-list.tsx 1096→247, couche data `MailListData`/`useMailListData` (couture #30/#34), sélection `useMailSelection`, overlay optimiste par ligne préservé ; exports identiques, typecheck server 0/mail 17, build mail vert, tests 25/25 verts, loc-ratchet vert (exceptions 10→9), frontière 0, aucune surface interdite touchée.
