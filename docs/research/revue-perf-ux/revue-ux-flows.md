# Revue UX — Parcours & interactions · Zero (fork Devlab)

**Repo** : `/Users/thomasverdenne/cc/zero` · branche `factory/perf`
**Front** : `apps/mail` (React Router 7 SPA, Tailwind + shadcn/ui)
**Staging** : https://zero-staging.devlab-tahiti.workers.dev (landing + /login testés ; inbox derrière Google OAuth, non dogfoodé — aucune session dans le profil navigateur)
**Méthode** : lecture code (read-only) + browse headless sur landing/login. Statuts : **[V]** vérifié code · **[P]** probable · **[H]** hypothèse.

---

## Synthèse exécutive

Zero a **l'ossature** d'un client keyboard-first à la Superhuman : triage `archive → fil suivant` câblé, command palette multi-vues, actions optimistes + undo send, autosave brouillon, schedule send, sélection par plage (shift-clic). Mais la **fiabilité clavier — qui EST la proposition de valeur Superhuman — est cassée à plusieurs endroits** : la réponse n'auto-remplit pas le destinataire, plusieurs raccourcis annoncés dans les réglages sont morts, les handlers de raccourcis sont montés en double, la découvrabilité est faible (pas d'overlay `?`), et la recherche n'a ni champ direct ni `/`. Le triage clavier est fonctionnel à ~70 % : la mécanique existe, mais les fuites de confiance (reply vide, doublons, touches inertes) sapent exactement le geste qu'on vend.

**Écart principal vs Superhuman** : Superhuman garantit la règle des 100 ms + un triage clavier sans friction où chaque geste est fiable et pré-câblé (reply pré-rempli, archive→next instantané, palette exhaustive, `?` overlay). Zero atteint la mécanique mais pas la **fiabilité perçue** : le clavier « marche presque », et « presque » est fatal pour un produit dont la promesse est la vitesse au clavier.

---

## 1. Raccourcis clavier

### Inventaire réel (`apps/mail/config/shortcuts.ts`)

| Scope | Touche | Action | Statut |
|---|---|---|---|
| navigation | `g d`/`g i`/`g t`/`g s`/`g a`/`g b` | drafts/inbox/sent/settings/archive/bin | OK |
| navigation | `shift+?` | aide (→ page /settings/shortcuts) | OK mais navigue au lieu d'un overlay |
| global | `mod+z` | undo | OK |
| global | `c` | compose | OK |
| global | `mod+k` | command palette | OK |
| global | `mod+shift+f` | clear filters | OK |
| global | `v` | openVoice | **MORT — aucun handler** (`global-hotkeys.tsx:14-21`) |
| mail-list | `r`/`a`/`f` | reply / reply-all / forward (cible survolée) | OK |
| mail-list | `d`/`e` | archive (done) | OK |
| mail-list | `h` | remind/snooze demain 8h | OK |
| mail-list | `m`/`u`/`i`/`s` | read / unread / important / star | OK |
| mail-list | `mod+backspace` | delete | OK |
| mail-list | `mod+a` | select all | OK |
| mail-list | `1`–`6` | catégories (important/all/perso/updates/promo/unread) | **MORTS — handlers commentés** (`mail-list-hotkeys.tsx:276-281`) |
| thread-display | `r`/`a`/`f`/`d`/`e`/`h`/`meta+backspace` | reply/replyAll/fwd/archive/remind/delete | OK |
| j / k / ↑ / ↓ / Enter / Esc | navigation liste | `use-mail-navigation.ts:199-207` | OK |
| compose | `mod+Enter` / `Esc` | send / close | OK (`email-composer.tsx:272`) |
| AI sidebar | `mod+0` | toggle | **hardcodé, hors config** (`ai-sidebar.tsx:313`) |

### Comparaison Gmail / Superhuman
- **Présents & conformes** : `c`, `r`, `a`, `f`, `e`, `m`, `u`, `s`, `g+i/t/…`, `mod+k`, `mod+z`, `j`/`k`, `↑`/`↓`. Bon socle. Le fork Devlab a délibérément ajouté `d`=done, `h`=snooze (style Superhuman) — commentaires explicites dans `shortcuts.ts:125,250`.
- **Absents vs standard** : `/` (focus recherche — **manquant**, cf. §5), `#` (delete — remplacé par `mod+backspace`, choix sûr et assumé), `!` (spam — commenté), `x` (select — remplacé par clic).

### Constats
- **[V] P2 — Raccourcis « morts » affichés à l'utilisateur.** `1`–`6` et `v` figurent dans `keyboardShortcuts` donc s'affichent dans `/settings/shortcuts`, mais ne déclenchent rien (handlers commentés/absents). L'utilisateur apprend des touches qui échouent en silence → érosion de confiance clavier. *Reco : soit rebrancher `switchCategoryByIndex`/`openVoice`, soit retirer ces entrées du catalogue. Effort S.*
- **[V] P2 — Actions destructives au survol sans sélection.** `getTargetIds()` (`mail-list-hotkeys.tsx:60-65`) priorise l'e-mail **survolé** : `d`/`e` (archive) et `mod+backspace` (delete) s'appliquent à la ligne sous le curseur sans sélection explicite. C'est le pattern Superhuman, mais combiné à la souris c'est un risque d'action accidentelle. Atténué par undo (`mod+z`) et toasts. *Reco : garder, mais s'assurer que l'undo couvre delete comme archive. Effort S.*
- **[V] P3 — `console.log(e)` sur chaque frappe de raccourci** (`use-hotkey-utils.ts:306`). Bruit console + coût à chaque keydown (cf. §perf).

---

## 2. Command palette

`apps/mail/components/context/command-palette-context.tsx` (1914 lignes). Ouverte via `⌘K` (double binding : global-hotkeys + listener capture-phase interne `:252-284`).

**Couvre** : compose, recherche (naturelle IA + exacte), filtres (from/to/subject/has/is/after/before/label), quick filters (unread/starred/attachments/7 j), navigation (via `navigationConfig`), labels, date range picker, aide syntaxe. Vues internes : `main/search/filter/dateRange/labels/savedSearches/filterBuilder/help`. Sous-raccourcis quand ouverte : `⌘F` filtres, `⌘S` recherche, `⌘L` labels, `Esc` retour.

### Constats
- **[V] P2 — Palette partiellement démantelée.** « Saved Searches » et « Filter Builder » sont **commentés** dans le menu (`:684-700`) alors que les vues `renderSavedSearchesView`/`renderFilterBuilderView` existent et fonctionnent (~250 lignes de code mort atteignable seulement par bug). Fonctionnalités construites mais non exposées. *Reco : réexposer ou supprimer. Effort S.*
- **[V] P3 — Aucun raccourci d'action dans la palette.** La palette ne montre pas de shortcut à droite des items (`CommandShortcut` commenté `:898-906`) — l'utilisateur ne découvre pas les touches via la palette (Superhuman/Linear les affichent systématiquement). *Effort S.*
- **[V] P3 — Pas d'actions sur fil dans la palette** (archive/snooze/label du fil courant). La palette fait navigation + recherche, pas « command » au sens Superhuman (agir sur la sélection). *Effort M.*

---

## 3. Triage flow

- **[V] Archive/delete/snooze depuis un fil ouvert → fil suivant.** `thread-display-hotkeys.tsx:32-45` et `thread-display.tsx:252-264` : `optimisticMoveThreadsTo(...)` puis `setMailNavigationCommand('next')` / `handleNext()`. **C'est le geste Superhuman, bien implémenté** (optimiste + avance). 
- **[V] Multi-select complet** (`mail-list.tsx:792-849`) : modes `single` / `mass` (⌘/ctrl+clic toggle) / `range` (**shift+clic** avec `anchorIndex`) / `selectAllBelow`. Select-all via `⌘A` et `select-all-checkbox.tsx`. Barre « N selected » + `Esc` pour sortir (`mail.tsx:500-518`). Bon.
- **[V] Split inbox / catégories** : `CategoryDropdown` (Google + inbox uniquement, `mail.tsx:495-497`) avec catégories Important/Personal/Updates/Promotions via labels. Existe mais piloté par la souris ; les raccourcis chiffrés qui devaient les commuter sont morts (§1).

### Constats
- **[P] P1 — `handleNext` peut sauter un fil après archive.** `thread-display.tsx:202-219` calcule `items[focusedIndex+1]` sur l'array **avant** que la suppression optimiste ne recompacte la liste ; `Math.max(1, focusedIndex+1)` force aussi un minimum à 1. Selon l'ordre de résolution optimiste, on peut atterrir sur l'avant-dernier au lieu du suivant, ou sauter un fil. À confirmer live (auth bloquée). *Reco : dériver le prochain à partir de l'array post-mutation (id, pas index). Effort M.*

---

## 4. Compose / reply

Éditeur : **TipTap/ProseMirror** chargé en lazy (`reply-composer.tsx:25-29` — sort l'éditeur du chunk mail initial, bon pour la perf). Envoi `⌘Enter` via keymap éditeur (`onModEnter` → `handleSend`, `email-composer.tsx:272`). Destinataires : `RecipientAutosuggest` (`components/ui/recipient-autosuggest.tsx`) avec autocomplete. Autosave brouillon debounce (`email-composer.tsx:539-545`). Schedule send (`ScheduleSendPicker`). Undo send (`use-undo-send.ts` — toast « Undo » 15 s, gated `undoSendEnabled`). Nudge « pièce jointe oubliée » si le mot est mentionné sans fichier (`:382-387`). `beforeunload` guard sur contenu non sauvé.

### Constats
- **[V] P1 — Réponse fraîche ouvre le champ « À » VIDE.** `EmailComposer` déclare la prop `replyingTo` (`email-composer.tsx:70`) **mais ne l'utilise JAMAIS** (aucune autre occurrence dans le fichier). Le seul remplissage de `to` est `defaultValues.to = initialTo` (`:227-228`), et `reply-composer.tsx:286` passe `initialTo={ensureEmailArray(draft?.to)}`. Pour une réponse **sans brouillon existant** (`draftId` null → `draft` undefined), `initialTo = []`. De plus le `useEffect` de `reply-composer.tsx:57-109` calcule bien les `to`/`cc` selon le mode mais **jette le résultat** (commentaire « happens in EmailComposer », qui ne le fait pas). → Presser `r`/`a`/`f` ouvre le composer sans destinataire pré-rempli. Vérifié en code ; impact runtime très probable, non confirmé live. **Pour un client de triage clavier, c'est le défaut le plus coûteux : le geste central (répondre vite) exige une saisie manuelle.** *Reco : consommer `replyingTo`/mode dans EmailComposer pour peupler `to`/`cc`/`subject`, ou passer `initialTo` calculé depuis `reply-composer`. Effort M.*
- **[V] P2 — Pas de drag-and-drop de pièces jointes dans le composer.** Aucun `onDrop`/`onDragOver` (grep vide) ; seulement input fichier (`#attachment-input`). Standard attendu (Gmail/Superhuman). *Effort M.*
- **[V] P2 — `⌘Enter` n'envoie que depuis le corps.** Le send est dans le keymap TipTap : focus dans « À »/« Objet » → `⌘Enter` n'envoie pas. *Reco : binding niveau formulaire. Effort S.*
- **[V] P3 — Reply-all pas par défaut** (`r`=reply, `a`=reply-all) : conforme Superhuman, à confirmer comme choix voulu.
- **[V] P3 — Fermeture compose incohérente sur `Esc`** : confirmation de sortie seulement si `!draftId` (`email-composer.tsx:321-328`) → un brouillon existant se ferme sans garde-fou. *Effort S.*
- Signature : « Sent via Zero » injectée si `zeroSignature` (`reply-composer.tsx:172-174`) — branding upstream (cf. §9).

---

## 5. Recherche

- **[V] Pas de champ de recherche direct.** La « barre de recherche » de l'inbox est un **bouton** qui ouvre la palette (`mail.tsx:450-493`, `onClick={handleOpenCommandPalette}`). Aucun input inline, **aucun raccourci `/`** (muscle-memory Gmail/Superhuman). Seul point d'entrée : `⌘K` → vue search. *Reco : brancher `/` sur la vue search + envisager un champ inline. Effort S-M.*
- **[V] Recherche = serveur (Gmail syntax), IA par défaut.** `handleSearch(..., useNaturalLanguage=true)` appelle `trpc.ai.generateSearchQuery` (langage naturel → requête Gmail) ; « Exact match » est secondaire. Syntaxe supportée : from/to/subject/has/is/after/before/label/older_than, combinables AND. Historique local (`localStorage` recent + saved searches).
- **[P] P3 — Latence IA sur la recherche.** Chaque recherche « smart » fait un aller-retour LLM avant de requêter Gmail → contraire à la règle des 100 ms. Le mode exact existe mais n'est pas le défaut. *Reco : défaut = requête directe, IA en fallback explicite. Effort M.*

---

## 6. Navigation & IA

**Routes** (`app/(routes)`) : `/mail/[folder]`, `/mail/compose`, `/mail/create`, `/settings/*`, `/queue`, `/developer`. État UI porté par query params (nuqs) : `threadId`, `mode`, `isComposeOpen`, `isCommandPaletteOpen`, `aiSidebar`, `draftId`… → **deep-links & back cohérents** (l'ouverture d'un fil = `?threadId=`, réversible par back). Bon.

**AI sidebar** (`ai-sidebar.tsx`, 407 l.) : vrai chat agentique (`useAgentChat` de `agents/ai-react`, Cloudflare DO), avec outils, prompts, gating Pro (jauge de crédits `useBilling`). Sert à : chatter avec l'inbox, résumer des fils, drafter, agir en langage naturel. Accès : bouton `ai-toggle-button.tsx` + `⌘0`.

### Constats
- **[V] P2 — Double montage de `HotkeyProviderWrapper`.** Monté dans `app/(routes)/layout.tsx:10` **et** `app/(routes)/mail/layout.tsx:8` (imbriqué). Sur `/mail/*`, deux instances de `GlobalHotkeys`/`NavigationHotkeys` cohabitent dans les scopes `global`+`navigation` (actifs par défaut) → **handlers double-enregistrés**. Risque de double-déclenchement de `undoLastAction` (`mod+z` défait 2 actions), double navigation, double `console.log`. Les scopes `mail-list`/`thread-display` échappent au bug (activés seulement sur le provider interne via `useHotkeysContext`, `mail.tsx:355-371`). Vérifié en code ; effet undo à confirmer live. *Reco : un seul provider (le layout racine suffit). Effort S.*
- **[V] P2 — `⌘0` (AI sidebar) non découvrable.** Hardcodé hors du catalogue de raccourcis → n'apparaît pas dans /settings/shortcuts. *Effort S.*
- **[V] P3 — `console.log` de debug sur le changement de scope** à chaque ouverture/fermeture de fil (`mail.tsx:357,361,367`) et sur chaque clic de liste (`mail-list.tsx:796,808,…`). *Effort S.*

---

## 7. Responsive / mobile

- Breakpoint mobile 768 (`hooks/use-mobile.tsx`), `isDesktop = min-width:768` (`mail.tsx:351`). Layout desktop = `ResizablePanelGroup` liste + thread ; sur étroit, `isDesktop && threadId && 'hidden lg:block'` (`mail.tsx:438`) → la liste se masque quand un fil est ouvert (empilement liste↔thread). Correct.
- **[V] Landing responsive OK** (screenshot mobile 375px : contenu empilé, lisible).

### Constats
- **[V] P2 — Panneau liste verrouillé à 35 %.** `ResizablePanel defaultSize/minSize/maxSize = 35` (`mail.tsx:432-435`) : la poignée de resize est présente mais **inerte** (min=max). Affordance trompeuse ; largeur non ajustable. *Reco : min/max réels (ex. 28–48) ou retirer la poignée. Effort S.*
- **[V] P2 — Aucun geste tactile.** Pas de `onTouchStart`/swipe (grep vide) : pas de swipe-to-archive/delete, standard mobile attendu. Le triage mobile repose sur des boutons. *Effort L.*

---

## 8. Onboarding

- **[V] Onboarding = modal marketing** (`components/onboarding.tsx`) : 6 étapes (welcome/chat inbox/AI compose/labels/coming soon/ready), GIFs `assets.0.email`, confetti à la fin, gated `localStorage.hasCompletedOnboarding`. Orienté « features », pas « mise en route ».
- **[V] Feedback de sync initiale = discret.** `SyncingStatusIndicator` (`nav-user.tsx:45-67`) : pastille pulsante orange (sync) → verte (fini) + liste des dossiers en cours, état issu du Durable Object (`ai-sidebar.tsx:222-223`). Tucked dans le pied de la sidebar.

### Constats
- **[V] P2 — Pas de feedback de progression pendant la première sync.** Un mailbox complet peut prendre du temps à indexer ; l'utilisateur voit une inbox partielle/vide + une simple pastille en bas de sidebar, sans barre de progression ni « X/Y dossiers, ~N mails ». Premier contact fragile. *Reco : état de sync visible (bandeau/skeleton avec compteur). Effort M.*
- **[V] P3 — Onboarding non aligné Devlab** : assets et copie 100 % upstream Zero. *Effort M.*

---

## Volet LIVE (staging)

- **[V] Landing** (`/`) : HTTP 200, **TTFB 725 ms, domReady 1551 ms**, 0 erreur console. Page marketing upstream Zero soignée (dark, screenshots produit, « Backed by Y Combinator », 10 674 stars GitHub). Rendu mobile 375px propre. Screenshots : `/tmp/zero-landing.png`, `/tmp/zero-landing-mobile.png`.
- **[V] Login** (`/login`) : HTTP 200, TTFB 194 ms. Un seul provider « Continue with Google » (Microsoft/Zero filtrés en prod). Design sobre mais **très vide** (titre + 1 bouton flottant, grand void vertical). Screenshot : `/tmp/zero-login2.png`.
  - **[V] P2 — Flash d'écran noir ~200 ms à l'hydratation.** Le contenu login (Suspense) apparaît après ~202 ms domReady ; capture initiale = écran `#111111` vide. Superhuman/Gmail rendent le login instantané. *Reco : SSR/prerender du login ou skeleton immédiat. Effort S-M.*
- **[V] Inbox non accessible** : `/mail/inbox` redirige vers `/login` (aucune session dans le profil). Conformément aux consignes, **aucune tentative OAuth**. Dogfooding inbox non réalisé.
- **[V] P3 — Branding upstream résiduel** sur landing/produit : « 0.email », « Zero Email Inc », « Backed by YC », « Sent via Zero ». Non-Devlab. *Effort S-M (landing) à M (signature).*

---

## Tableau récapitulatif (sévérité × effort)

| # | Constat | Fichier:ligne | Sév. | Effort | Statut |
|---|---|---|---|---|---|
| 1 | Réponse fraîche → champ « À » vide (`replyingTo` inutilisé) | email-composer.tsx:70 · reply-composer.tsx:286 | **P1** | M | V(code)/P(runtime) |
| 2 | `handleNext` peut sauter un fil après archive | thread-display.tsx:202-219 | P1 | M | P |
| 3 | Double montage HotkeyProviderWrapper (double undo/nav) | routes/layout.tsx:10 · mail/layout.tsx:8 | P2 | S | V(code)/P(effet) |
| 4 | Raccourcis morts affichés (`1-6`, `v`) | mail-list-hotkeys.tsx:276 · global-hotkeys.tsx:14 | P2 | S | V |
| 5 | Pas de champ recherche direct ni `/` | mail.tsx:450-493 | P2 | S-M | V |
| 6 | Recherche IA par défaut (latence LLM) | command-palette-context.tsx:530-559 | P2 | M | V/P |
| 7 | Pas de drag-drop pièces jointes | email-composer.tsx | P2 | M | V |
| 8 | Découvrabilité faible : pas d'overlay `?` en contexte | shortcuts.ts:192-198 (navigue vers page) | P2 | M | V |
| 9 | Panneau liste verrouillé 35 % (resize inerte) | mail.tsx:432-435 | P2 | S | V |
| 10 | Aucun geste tactile (swipe) mobile | components/mail/* | P2 | L | V |
| 11 | Pas de progression pendant sync initiale | nav-user.tsx:45-67 | P2 | M | V |
| 12 | `⌘0` AI sidebar hors catalogue | ai-sidebar.tsx:313 | P2 | S | V |
| 13 | Flash écran noir au login (~200 ms) | login-client.tsx:328-339 (Suspense) | P2 | S-M | V(live) |
| 14 | Actions destructives au survol sans sélection | mail-list-hotkeys.tsx:60-65 | P2 | S | V |
| 15 | Palette : saved searches / filter builder commentés | command-palette-context.tsx:684-700 | P3 | S | V |
| 16 | `console.log` prod sur frappe/clic/scope | use-hotkey-utils.ts:306 · mail.tsx:357 | P3 | S | V |
| 17 | Onboarding + branding 100 % upstream | onboarding.tsx · landing | P3 | M | V |
| 18 | `⌘Enter` n'envoie que depuis le corps | email-composer.tsx:272 | P3 | S | V |
| 19 | `Esc` compose : pas de garde-fou si draft existant | email-composer.tsx:321-328 | P3 | S | V |

---

## Recommandation de priorisation (angle CEO / vitesse perçue)

1. **Réparer la réponse (constat #1)** — sans destinataire pré-rempli, le geste clavier central est cassé. C'est le premier ROI.
2. **Dédoublonner les providers de raccourcis (#3)** — risque de double-undo = perte de données perçue, mine la confiance clavier.
3. **Nettoyer les raccourcis morts + overlay `?` (#4, #8)** — cohérence entre ce qu'on annonce et ce qui marche ; c'est la découvrabilité Superhuman.
4. **`/` recherche + recherche exacte par défaut (#5, #6)** — restaure le muscle-memory et la règle des 100 ms.
5. Le reste (mobile swipe, sync progress, branding) = P2/P3 selon la cible (mobile vs desktop-first, white-label Devlab vs upstream).
