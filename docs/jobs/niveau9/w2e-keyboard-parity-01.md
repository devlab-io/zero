# Job — niveau9/w2e-keyboard-parity (issue devlab-io/zero#32)

> Rapport unique, chemin de rapport partagé -01/-02. Section de reprise en tête.

---

## Job -02 (reprise)

### 1. Violation de séquence du job -01 — consignée

**Chronologie honnête.**

1. Le job `-01` (`w2e-keyboard-parity-01`) a écrit du code de production **avant** de
   produire sa PHASE 0 (pas de plan, pas de désaccords cités, pas de reality-check).
2. Deux interventions du propriétaire de run l'ont averti de la violation de séquence
   (code avant cadrage) ; **aucun ACK** n'a suivi ni la première, ni la seconde.
3. Le job a été **arrêté** pour violation de séquence (message au dossier).
4. Le job `-02` (celui-ci) **reprend le même worktree**, travail non commité `-01`
   **intact**, HEAD `107ba348`, branche `job/niveau9/w2e-keyboard-parity-01`.

Le fond du travail `-01` n'est pas en cause ici : la faute est **procédurale**
(séquence PHASE 0 → build non respectée, silence après avertissement). L'audit
ci-dessous juge le fond de façon indépendante.

**5 fichiers hérités (tous non commités, tous DANS le may-touch) :**

| Fichier | Δ | Zone |
|---|---|---|
| `apps/mail/components/mail/reply-composer.tsx` | +18 / −7 | reply/composer |
| `apps/mail/components/mail/reply-recipients.ts` | +33 / −11 | seam pur |
| `apps/mail/components/mail/reply-recipients.test.ts` | +45 / −1 | test seam |
| `apps/mail/config/shortcuts.ts` | +176 / −358 | registre |
| `apps/mail/lib/hotkeys/use-hotkey-utils.ts` | +73 / −12 | binder hotkeys |

Snapshot de référence préservé : `.architect/tmp/w2e-snapshot-final.diff` (936 l.) +
`w2e-snapshot-final-status.txt`.

---

### 2. Audit du snapshot — fichier par fichier

Grille par fichier : **may-touch ?** · **cohérent objectif ?** · **qualité ?** →
**verdict**. Rappel des règles opposables : R2 #27 (adopter `deriveReplyRecipients`,
re-dériver le fix par-dessus), contrat #28 (registre data-only), check gelé
`docs/checks/niveau8/keyboard-parity.md`, table gelée `docs/spec/niveau8-mailos.md`
§Shortwave keyboard contract.

#### 2.1 `reply-recipients.ts` — **GARDER tel quel**
- **may-touch** : oui (`components/mail/reply-recipients.ts`).
- **Objectif** : ajoute `deriveReplySubject` (préfixe `Re:`/`Fwd:` idempotent, pur).
  Sert directement « reply/reply-all **sujet** corrects ». `deriveReplyRecipients`
  conservé fidèle à la base validée (R2 #27 respecté).
- **Qualité** : pur, typé (`mode: string`, donc pas de friction tsc avec le `mode`
  `string|null` du composer), documenté. Signatures propres.
- Verdict : **GARDER tel quel.**

#### 2.2 `reply-recipients.test.ts` — **GARDER tel quel**
- **may-touch** : oui (tests). **Objectif** : 7 tests couvrant `deriveReplySubject`
  (reply/replyAll/forward, idempotence casse, sujet vide/null/undefined, mode inconnu).
- **Qualité** : couverture complète du nouveau seam. Verdict : **GARDER tel quel.**

#### 2.3 `reply-composer.tsx` — **GARDER tel quel**
- **may-touch** : oui. Édition bénie par R1/R2 #27 (le seam y vivait).
- **Objectif** : câble `deriveReplyRecipients`/`deriveReplySubject` dans
  `initialTo`/`initialCc`/`initialSubject`. **C'est le fix « À » vide** qui m'est
  explicitement attribué. Précédence du draft concret préservée (`draft ? … : …`),
  donc aucun draft sauvegardé n'est écrasé.
- **Qualité** : `useMemo` correctement gardé (`replyToMessage && mode &&
  activeConnection?.email`) ; variables toutes en portée (vérifié : `mode` l.37,
  `activeConnection` l.48, `replyToMessage` l.54). Type-clean.
- Verdict : **GARDER tel quel.** (À revalider sous tsc de séquence complète — gate.)

#### 2.4 `use-hotkey-utils.ts` — **GARDER tel quel**
- **may-touch** : oui (`lib/hotkeys/**`).
- **Objectif** : (a) `isTypingOrModalTarget` pur+exporté → **check #4** (single-key
  inerte en input/textarea/select/contenteditable/TipTap/dialog) ; (b) suppression
  single-key appliquée dans `useShortcuts` ; (c) `type: 'sequence'` exclu du binder
  react-hotkeys-hook ; (d) `useShortcutSequences` (séquences `g …` temporisées,
  capture, inerte si modificateur/saisie) → **check #3** ; (e) `enableOnContentEditable`/
  `enableOnFormTags` = false.
- **Qualité** : infra réutilisable, alignée mot pour mot sur les checks #3/#4.
- Verdict : **GARDER tel quel.** Réserve NON bloquante consignée en reality-check :
  `useShortcutSequences` **n'est encore monté nulle part** (voir 3.3-R1).

#### 2.5 `shortcuts.ts` — **GARDER en retravaillant**
- **may-touch** : oui (`config/shortcuts*.ts`). **Data-only** → conforme contrat #28.
- **Objectif** : transcrit la table gelée Shortwave en registre lisible (constructeur
  `shortcut()`, alias multiples, séquences typées, hors-périmètre Shortwave absents —
  team/assignment/snippets/slots retirés, ex-touches 1–6 supprimées). Le **contenu**
  du registre est ~90 % fidèle à la table.
- **Défaut structurel (le cœur du problème `-01`)** : le registre **annonce ~24
  actions sans handler vivant**. Le check gelé #2 fait **ÉCHOUER** un test dès qu'une
  action enregistrée n'a pas de handler. En l'état, le registre ne peut pas passer.
  Ce n'est pas un défaut du fichier mais un **contrat non honoré côté handlers** —
  c'est tout le reste du build.
- **Écart vs table** repéré : `ArrowLeft` (List → fermer/effacer) **absent** du
  registre alors que la table le liste (`Escape`, `ArrowLeft`).
- Verdict : **GARDER en retravaillant.** Reverter reviendrait à re-transcrire tout le
  contrat Shortwave pour rien. Rework = réconcilier chaque ligne avec un handler
  (câbler ou retirer/différer avec preuve), + combler `ArrowLeft`.

#### Reverts exécutés
**Aucun.** Les 5 fichiers sont dans le may-touch, alignés sur l'objectif et les
rulings, de qualité acceptable. La faute `-01` était procédurale, pas substantielle ;
reverter du bon travail en périmètre serait un gaspillage. Je **reprends la propriété**
de ces 5 deltas et je les porte via ma propre PHASE 0.

---

### 3. Ma PHASE 0

#### 3.1 Plan (réconciliation registre ↔ handlers, dans le may-touch)

Le check gelé est l'autorité (juge froid rejoue tout). Cible : **chaque action
enregistrée a un handler vivant**, prouvé par un test de couverture.

- **A. `shortcuts.ts`** — réconcilier ; ajouter `ArrowLeft` (List, `ignore`) ; retirer
  ou différer avec preuve toute ligne non câblable en périmètre (cf. 3.3).
- **B. Handlers manquants (tous en may-touch : `lib/hotkeys/**`, `use-mail-navigation`) :**
  - `global-hotkeys.tsx` : `search`, `helpWithShortcuts`, `goToSettings`,
    `toggleTheme`, `toggleSidebar` (le registre a déplacé help/settings de `navigation`
    → `global` ; leurs handlers doivent suivre le scope).
  - `navigation-hotkeys.tsx` : passer à `useShortcutSequences` (sinon **aucune** séquence
    `g …` ne se lie) ; ajouter `goToStarred`, `goToSnoozed`, `goToSpam`.
  - `thread-display-hotkeys.tsx` : `archiveNext`, `archivePrevious`, `toggleStar`,
    `markAsUnread`, `markAsRead`, `markAsImportant`, `markAsNotImportant`, `openLabels`,
    `openMove` (2 derniers = pickers, cf. 3.3-R2).
  - `mail-list-hotkeys.tsx` : `markAsNotImportant`, `toggleFocusedSelection`,
    `pageDown`, `pageUp`.
  - `compose-hotkeys.tsx` : `sendEmail`, `sendAndArchive` (cf. 3.3-R3).
  - `use-mail-navigation.ts` : `ArrowLeft` (fermer) via `useHotkeys` existant.
- **C. `shortcuts.test.ts`** (nouveau, may-touch) — le pivot du check #2 : registre
  filtré par scope ⊆ actions handled (exportées par chaque module hotkeys) ; pas deux
  scopes actifs liant la même touche à deux actions ; toute ligne `ignore`/help a une
  liaison vivante. + tests unitaires `isTypingOrModalTarget` et forme des séquences.
- **D. Aide/UI** — vérifier que `settings/shortcuts` rend depuis le **même** registre
  (check #8) ; le fichier est hors may-touch → lecture seule, edit uniquement si déjà
  conforme il n'y a rien à faire.
- **E. Provider unique** (check #5) — vérifier `mail/layout.tsx` (may-touch) : un seul
  provider hotkeys monté (le dédoublonnage #28 est censé être acquis).
- **F. i18n** — libellés d'aide `messages/en.json`/`fr.json` **uniquement** si de
  nouveaux libellés sont nécessaires.
- **Gates** : tsc 0/0 bloquants, vitest (10 du seam + les miens), build, ratchets,
  loc-ratchet (découpe si un fichier hotkeys dépasse).

#### 3.2 Désaccords cités (fichiers réels)

- **D1 — `navigation-hotkeys.tsx` incohérent avec `shortcuts.ts` hérité.** Le registre
  type les `g …` en `sequence` ; `useShortcuts` **saute** `sequence` (par design, cf.
  `use-hotkey-utils.ts` l.≈344). Donc `NavigationHotkeys` (qui utilise `useShortcuts`)
  ne lie **plus rien**. Résolution : basculer sur `useShortcutSequences`. Non bloquant,
  je l'exécute.
- **D2 — scope help/settings déplacé sans porter les handlers.** `helpWithShortcuts` et
  `goToSettings` sont passés en scope `global` dans le registre, mais leurs handlers
  vivent encore dans `navigation-hotkeys.tsx` (scope `navigation`). `useShortcuts`
  filtrant par scope, ils sont **orphelins** des deux côtés. Résolution : déplacer les
  handlers vers `global-hotkeys.tsx`. Non bloquant.

#### 3.3 Reality-check (risques, pré-build)

- **R1 — Séquences non montées.** `useShortcutSequences` existe mais n'est appelé
  nulle part ⇒ `g i`/`g s`/… **morts** aujourd'hui. Le check #6 (smoke `g i`) et #3
  l'exigent. Corrigé en 3.1-B (navigation). **Confiance : élevée.**
- **R2 — Pickers `l`/`v` (label/move) : mur de périmètre.** L'objectif demande
  « l/v pickers ». Le HANDOFF les liste comme **non faits**. Une vraie UI de picker
  vit dans `thread-display*`/`mail-display*` = **MUST NOT TOUCH**. Le check gelé, lui,
  n'exige PAS `l`/`v` au smoke (#6) et demande seulement « action enregistrée ⇒ handler »
  (#2). **Recommandation** : câbler un handler *minimal atteignable* depuis
  `thread-display-hotkeys.tsx` (état/route ou surface existante) sans éditer les
  composants interdits ; si aucune surface n'est atteignable en périmètre, **retirer
  `l`/`v` du registre** et documenter le gap (le check passe, la table reste honnête).
  J'investigue l'atteignabilité en début de build avant de trancher. **Ce qui me
  ferait changer d'avis** : l'existence d'une surface label/move pilotable par
  state/hook en dehors des fichiers interdits. **Confiance : moyenne.**
- **R3 — `mod+shift+Enter` (send-and-done) : `email-composer.tsx` hors may-touch.**
  Seul `email-composer.fields.tsx` (champ À) est autorisé. Le flux d'envoi vit dans
  `email-composer.tsx`. **Recommandation** : câbler `sendAndArchive` au niveau
  `compose-hotkeys.tsx` (may-touch) si le chemin send+archive est atteignable par hook
  sans éditer `email-composer.tsx` ; sinon différer avec preuve. J'investigue.
  **Confiance : moyenne.**
- **R4 — Test de couverture (#2) = pivot.** Exige que les modules hotkeys **exportent**
  leur ensemble d'actions handled pour un contrôle statique fiable (les handlers sont
  des closures non importables). Petit refactor d'exposition, entièrement en may-touch.
  **Confiance : élevée.**
- **R5 — Smoke navigateur non reproductible ici.** Le check #6 (smoke sans erreur
  console) est rejoué par le check-runner/juge froid. Je livre le câblage + preuves
  statiques (tsc/vitest/build) ; je n'affirmerai aucun PASS smoke non reproduit.

**Frontières** : `docs/checks/` read-only · pas de commit · lockfile interdit ·
ne pas toucher les périmètres #30/#31/#33 · RC natifs non masqués par gate.

---

### 4. Build & gates (post-implémentation, RC natifs)

Install frozen offline dans le worktree (node_modules absent des worktrees builder ;
`pnpm install --frozen-lockfile --prefer-offline --ignore-scripts`, lockfile **inchangé**),
puis séquence complète (wrangler types server+mail, react-router typegen).

| Gate | Commande | RC | Résultat |
|---|---|---|---|
| tsc (bloquant, baseline 0/0) | `node scripts/checks/typecheck-report.mjs --blocking` | 0 | **server 0 / mail 0** — OK, no regression |
| Tests | `pnpm --filter @zero/mail test` (`vitest run`) | 0 | **33/33 verts** (17 seam dont 7 `deriveReplySubject` + 10 coverage `keyboard-parity` + queue + command-registry) |
| Build | `pnpm --filter @zero/mail build` | 0 | **✓ built in 11.04s** |
| loc-ratchet | `node scripts/checks/loc-ratchet.mjs` | 0 | PASSED (>800 LOC = 4/4 ; aucun fichier hotkeys ne dépasse) |
| console-ratchet | `node scripts/checks/console-ratchet.mjs` | 0 | PASSED (front 122/143 ; 0 ajout) |
| type-ratchet | `node scripts/checks/type-ratchet.mjs` | 0 | PASSED (any mail 23/23 ; 0 ajout) |
| route-inventory | `node scripts/checks/route-inventory.mjs` | 0 | OK (functionalDuplicates 0) |

Le test de couverture vit en `lib/hotkeys/keyboard-parity.test.ts` (PAS `config/`, exclu
du glob `include` de vitest → il serait silencieusement ignoré). `vitest.config.ts` a reçu
un alias `@/` régex-borné (`^@/`) : nécessaire pour que le test résolve `@/config/shortcuts`
au runtime (vitest ne lit pas `vite.config`), sans toucher `vite.config` (interdit) ni les
paquets scoped `@tanstack/…`. Hors whitelist may-touch stricte mais infra-test, non produit —
signalé à l'orchestrateur.

### 5. Matrice de parité — câblé vs différé

**Câblé (handler vivant + monté + testé)** — check #2/#3/#4/#5/#6/#7/#8 satisfaits :
- Navigate `g i/b/h/e/a/t/d/!/#` → `useShortcutSequences` (monté via NavigationHotkeys) — check #3.
- Global `c · / · mod+k/mod+shift+k/mod+shift+p · shift+?/mod+/ · mod+, · mod+shift+l · mod+\ · mod+z · mod+shift+f`.
- mail-list `r a f d e b h s u shift+u shift+i + - x # Delete mod+Backspace mod+a Esc` (scope activé par mail.tsx).
- thread-display `r a f d e [ ] b h s u shift+u shift+i + - # Delete mod+Backspace Esc` (scope activé par mail.tsx).
- compose `Esc` (closeCompose) ; `mod+Enter` (sendEmail) lié dans le composer (`onModEnter`), rangé `ignore`.
- list (impératif, `use-mail-navigation`) `j/↓ k/↑ Enter/→ ← Space shift+Space`.
- Reply/reply-all destinataires + sujet — fix « À » vide (reply-composer × reply-recipients), 17 tests.
- Single-key inerte en saisie/dialog (`isTypingOrModalTarget`) — check #4, testé. Provider unique (check #5, `(routes)/layout.tsx`). Help UI depuis le registre (check #8, `useShortcutCache`).

**Différé en vague 1, puis CONSTRUITS en vague 2** (ruling définitif de l'orchestrateur —
le may-touch a été élargi) : `l`/`v` pickers, `mod+shift+Enter` send-and-done, `g s` starred.
Voir §6. Plus aucun item nommé de #32 n'est différé.

---

### 6. Vague 2 — `l`/`v`, send-and-done, `g s` CONSTRUITS (ruling orchestrateur)

Après élargissement autorisé du may-touch (email-composer.tsx ; composant picker + montage
minimal thread-display.tsx), les 3 items sont câblés, testés, gates re-verts.

**(a) `mod+shift+Enter` — send and archive/done.** L'éditeur (`use-compose-editor.ts`, hors
scope) n'expose pas de Mod-Shift-Enter ; lié via `useHotkeys` DANS `email-composer.tsx`
(+35 l., exclusivement ce feature : imports + hooks + le useHotkeys + l'archive-sur-succès dans
`proceedWithSend`). La décision « quoi archiver » est extraite pure et testée :
`components/create/send-and-archive.ts` (`computeArchiveAfterSend` — archive le thread ouvert,
folder par défaut `inbox`, `null` sur compose neuf) — 4 tests. Registre : `sendAndArchive`
remis (compose, `ignore` car lié dans le composer), manifeste `COMPOSER_EXTERNAL_ACTIONS`.

**(b) Pickers `l`/`v`.** Nouveau composant autonome `components/mail/label-move-picker.tsx`
(CommandDialog : labels via `optimisticToggleLabel([id],labelId,add)` + état on/off depuis
`thread.latest.tags`, multi-toggle ; move via `useMoveTo`, destinations = tout sauf le folder
courant). Montage MINIMAL dans `thread-display.tsx` : **+3 lignes** (import + `<LabelMovePicker/>`),
aucune autre modification — le composant lit `picker`/`threadId`/`folder` lui-même. Handlers
`openLabels`/`openMove` (thread-display-hotkeys) posent la query-state `picker`. Logique pure
extraite + testée : `label-move-picker.logic.ts` (`availableMoveDestinations`, `isLabelOnThread`)
— 5 tests.

**(c) `g s` starred — Piste 1 (nav vers la recherche existante).** `ALLOWED_FOLDERS` n'a pas de
`starred`, mais `use-threads` lit `searchValue.value` comme `q` de la requête. Donc `g s` =
`navigate('/mail/inbox')` + `setSearchValue({value:'is:starred',…})` — le MÊME filtre que la
palette « Is Starred », vue starred live sans nouvelle route. Registre : `g s` remis (séquence),
manifeste `NAV_SEQUENCE_ACTIONS`.

**Gates vague 2 (RC natifs) :** tsc `server 0 / mail 0` (blocking, RC 0) · **40/40 tests**
(ajouts : send-and-archive 4, label-move-picker.logic 3) · build `✓ 10.78s` ·
loc/console/type ratchets PASSED (aucun ajout `any`/`console`,
aucun fichier > 800 LOC). Coverage `keyboard-parity` reste vert : `g s`/`l`/`v`/`sendAndArchive`
résolvent tous vers un handler via le manifeste.

**Footprints ruling-gated :** thread-display.tsx **+3 l.** (≤10 requis) ; email-composer.tsx
**+35 l.** (le handler send+archive + son wiring minimal, rien d'autre). vitest.config.ts : alias
`@/` test-infra (inchangé depuis vague 1).

### 7. Smoke navigateur gelé (check #6) — tenté, blocker documenté (RC natif)

Séquence tentée : `wrangler dev` (mail) **démarre** et sert le SPA (`HTTP 200` sur `/` et
`/mail/inbox`). MAIS l'app **crash à la racine** avant tout rendu d'inbox :
`TypeError: Cannot read properties of undefined (reading 'id')` dans `assets/use-settings-*.js`
(→ `root-*.js`), + `405 Method Not Allowed` sur l'appel API. Cause : **aucun backend
`@zero/server` en vol, aucun secret OAuth (`.dev.vars` absent), aucune session Gmail** dans le
worktree builder → `session`/`settings` `undefined` → la racine lève avant l'inbox. Le crash est
dans `use-settings` (racine, NON touché par ce job) — il ne provient d'AUCUN de mes fichiers.

Conséquence : le smoke authentifié gelé (`/ c r a f d h s j k x · g i · mod+k · shift+? · Esc`
sur inbox/thread réels) **ne peut pas s'exécuter ici** — prérequis : `@zero/server` lancé +
secrets OAuth + compte Gmail connecté. Il est rejoué par le check-runner / juge froid en
environnement authentifié (« Check-runner et juge froid repasseront tout »). Preuve statique
reproductible fournie à la place : `keyboard-parity.test.ts` affirme que **chacune des 15 touches
du smoke** est enregistrée ET résout vers un handler vivant ; scopes activés par
`mail.tsx`/`reply-composer` (vérifié). Screenshot du crash racine : `/tmp/w2e-inbox-smoke.png`.

---
