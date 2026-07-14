# Décomposition du closure critique 435,9 KiB + pistes de poids RÉEL (volet 2)

Mesure gelée reproduite exactement : `measure-critical.py apps/mail` = **446 350 o = 435,9 KiB gz**,
**110 chunks**, `CHUNKS >900 KiB : NONE`. Build HEAD `375d1003` (= code #44). **Aucune modification
de la mesure ni du barème.** Pistes seulement — exécution après ruling.

## Plancher IMMOBILE par ruling (36,7 % du closure)

| chunk | gz | nature | statut |
|---|---|---|---|
| `react-BH-yBEgs.js` | 84 050 | react/react-dom/scheduler (manualChunk `react`) | **SCELLÉ** (react core) |
| `chunk-KS7C4IRE-DAla6bF3.js` | 40 935 | react-router core | **SCELLÉ** (KS7C4IRE) |
| `page-BkbrVSUM.js` | 40 032 | `mail.tsx` rows (UI toujours-rendue au load inbox) | plancher légitime (lazifier = gaming f143abf9) |
| **sous-total immobile** | **164 017** | (36,7 %) | |

Cible de chasse = les **~282 k gz restants**.

## Chunks identifiés (empreinte binaire + trace d'import)

| chunk | gz | contenu identifié | froid légitime ? |
|---|---|---|---|
| `query-provider` | 19 656 | tRPC + TanStack Query provider | OUI (toujours nécessaire) |
| `utils-Cvo-ZYKo` | 19 651 | `lib/utils.ts` (631 l.) : cn/clsx/twMerge + date-fns(3 fns) + date-fns-tz + lz-string | majoritairement OUI |
| `app-sidebar` | 18 574 | sidebar (UI cold) | OUI |
| `types-BSfIYl1c` | **12 167** | **zod** (118 hits) + nanoid — via `lib/schemas.ts`/`email-utils.ts` | **NON → LEAD A** |
| `email-utils-BskbJXHl` | **11 863** | **DOMPurify + email-addresses** (+ Color) | partiel → LEAD A |
| `index-DHgGv0xz` | 10 249 | @floating-ui (+ virtua) | OUI (tooltips/dropdowns cold) |
| `proxy-DW4xm_nv` | 9 520 | better-auth (auth-client) | OUI (root signOut) |
| `index-C-yogrYb` | **9 432** | **`color` (npm)** — importé UNIQUEMENT par `email-utils.ts` | **NON → LEAD A** |
| `index.esm-JvvkO9EN` | **9 301** | **react-hook-form** — cold via nav-main→label-dialog | **NON → LEAD B** |
| `dropdown-menu` / `context-menu` / `tooltip` / `scroll-area` / `sidebar` | ~27 k | radix primitives (UI cold) | OUI |
| icônes (`*-icons` ×8 + lucide indiv.) | ~29 k | SVG inline custom + lucide | LEAD D (faible) |
| `onboarding-D4Gg30t_` | 6 992 | OnboardingWrapper (mail/layout, conditionnel) | LEAD E (hors-fence) |

## PISTES CHIFFRÉES (pour ruling — file/chunk, octets, risque, preuve)

### LEAD A — Split du god-module `email-utils` **(PRIMAIRE, HIGH confidence, LOW risk)**
**Constat prouvé** : `components/mail/mail-list-thread.tsx` (lignes de liste = FROID) importe
**uniquement `highlightText`** (fonction JSX pure, zéro dep) depuis `lib/email-utils.client.tsx`,
qui chaîne vers `lib/email-utils.ts` — un **god-module** mêlant helpers légers et deps lourdes :
`Color` (L4), `DOMPurify` (L3), **schémas zod** (L225-248), `email-addresses`. Le lecteur
`thread-display.tsx` (autre consommateur) est **LAZY** (`mail-lazy-surfaces.tsx:10`) → PAS froid.
Donc `highlightText` seul traîne dans le closure : **zod + Color + email-addresses**.
Les autres importeurs d'`email-utils.ts` (use-undo-send, *.print, create-email) sont
compose/reply-lazy ou action → **non froids**. `color` n'est importé QUE par email-utils.ts.

- **Fichiers** : `lib/email-utils.client.tsx`, `lib/email-utils.ts`, `components/mail/mail-list-thread.tsx` (1 import).
- **Correctif** : extraire `highlightText` (+ tout helper froid pur) dans un module léger
  sans dep ; laisser email-utils.client/.ts aux chemins lecteur/compose/print/send.
  **Pur déplacement de code, comportement identique. PAS de lazy-at-mount.**
- **Octets évitables** :
  - HIGH-confidence : `types`(zod) **12 167** + `index-C-yogrYb`(Color) **9 432** = **~21 600 gz**
    → **435,9 − 21,1 ≈ 414,8 KiB → SOUS 420.**
  - Upside : email-addresses (part du chunk email-utils 11,9k) + @react-email/renderToString
    si évincés → jusqu'à ~+8–11 k.
- **Réserve honnête** : **DOMPurify RESTE** — `components/ui/bimi-avatar.tsx` (FROID, ligne
  `mail-list-thread.tsx:283`) importe DOMPurify directement pour sanitiser un SVG BIMI non-fiable
  (sécurité XSS — non évinçable).
- **Risque** : LOW. **Preuve** : `measure-critical.py` avant/après ; trace réseau cold `/mail/inbox`
  = 0 requête de chunk zod/color ; tsc 0 ; tests verts.

### LEAD B — Évincer react-hook-form du cold **(MEDIUM confidence, MEDIUM risk — frôle anti-gaming)**
`index.esm` (9 301 gz) = react-hook-form. Cold via `components/ui/nav-main.tsx` → `label-dialog.tsx`
(`useForm`, L50). **À vérifier avant ruling** : si label-dialog ne se monte que sur INTENTION
(clic « nouveau label »), déferral intent-based légitime (patron palette #44) ; s'il est rendu
caché au mount, lazifier = gaming f143abf9. `form.tsx` (ui, +1 426 gz) suit RHF.
- **Octets** : ~9 300 (+1 400). **Risque** : MEDIUM. **Preuve** : trace réseau cold (aucun chunk
  RHF sans intention) + measure. **NE PAS exécuter sans confirmation du patron de rendu.**

### LEAD C — Cible de build moderne **(LOW-MEDIUM, marginal, global)**
vite 6.3.5, cible par défaut `baseline-widely-available`. `build.target: 'es2022'` (ou esnext)
supprime le down-leveling (helpers) sur le code app + deps non-prebundlées.
- **Fichier** : `apps/mail/vite.config.ts`. **Octets** : est. ~2–5 k gz. **Risque** : LOW
  (navigateurs modernes uniquement). **Preuve** : measure avant/après + smoke build.

### LEAD D — Familles d'icônes **(LOW confidence — NON recommandé)**
~29 k gz (8 barrels `*-icons` via `export *` depuis `icons.tsx`, importés par `config/navigation.ts`
+ lucide individuels). Tree-shaking **partiel** (action-icons 18→13 retenus, nav 12→9) : les icônes
retenues sont RÉELLEMENT atteignables depuis la nav/liste froide. Réduction = changement produit
(moins d'icônes au cold), pas du code motion. **Note, sans recommandation.**

### LEAD E — Onboarding **(hors-fence, noté)**
`onboarding` (6 992 gz) : OnboardingWrapper monté eager par `app/(routes)/mail/layout.tsx`, rendu
conditionnel (first-run). Éviction comportement-preservante possible (gate sur query needsOnboarding)
mais ruling final #44 l'a mis **HORS boundary**. Rappelé pour arbitrage.

## Synthèse pour ruling
- **LEAD A seul (HIGH, ~21,6 k, pur code-motion) fait passer 435,9 → ~414,8 KiB — SOUS le gate 420,
  légitimement (octets réseau réellement évincés du cold, DOMPurify honnêtement conservé).**
- LEAD C (~2–5 k) en complément sûr. LEAD B (~9 k) conditionné à une vérif de patron de rendu.
- INTERDITS respectés : aucun lazy-at-mount, react/KS7C4IRE non touchés, mesure/barème inchangés.
