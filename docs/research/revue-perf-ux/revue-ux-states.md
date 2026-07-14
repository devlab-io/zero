# Revue UX — Inventaire des états UI & feedback perçu (Zero / apps/mail)

**Branche** : `factory/perf` · **Périmètre** : `apps/mail` (React Router 7 SPA, ssr:false, React Query + tRPC, paraglide i18n)
**Réalité cible** : Tahiti — RTT 150–200 ms, débit 44–340 kB/s, réseau instable, échecs fréquents.
**Méthode** : lecture du code (LECTURE SEULE, aucun fichier modifié). Statuts : **[VÉRIFIÉ]** = code lu ; **[PROBABLE]** = déduit du code sans exécution ; **[HYPOTHÈSE]** = à confirmer.

---

## 1. Verdict d'ensemble

Le socle « optimistic UI » (P2 du baseline) est **largement présent et de bonne facture** : mark read/unread, star, important, move (archive/spam/bin), delete, label, snooze, undo-send. La **queue/outbox** (`queue-review.tsx`) est le **gold standard** du repo : loading + erreur+retry + vide, tout i18n.

Mais trois défauts transverses cassent l'expérience précisément dans les conditions Tahiti :

1. **`retry: false` global** sur toutes les requêtes de lecture → une seule coupure réseau = échec immédiat, sans reprise.
2. **Les erreurs de requête sont silencieuses** (`console.error` seulement) → un échec réseau se **déguise en boîte vide** ou en **skeleton infini**.
3. **i18n en trompe-l'œil** : `fr.json` est complet (659 clés, à parité avec `en`), mais **62 toasts + les états vides + tout l'onboarding sont en anglais codé en dur**, hors du système paraglide. Un utilisateur français voit massivement de l'anglais aux moments de feedback.

Le baseline avait raison sur « P6 skeletons » : la **liste de threads n'a pas de skeleton** (petit spinner) et le **corps du mail n'a aucun placeholder** pendant son traitement serveur.

---

## 2. Réglages transverses (les plus structurants)

### 2.1 — `retry: false` sur toutes les lectures · P1 · effort M
`providers/query-provider.tsx:53` — `defaultOptions.queries.retry: false`.
Aucune surface de lecture ne le ré-active (vérifié : seul override = `email-verification-badge.tsx:22` `retry:1`).
**Impact Tahiti** : à 150–200 ms de RTT sur réseau instable, une requête qui échoue (drop TCP, timeout) n'est **jamais retentée**. La liste, le thread, les settings, le corps du mail échouent au premier raté. C'est le multiplicateur de tous les autres problèmes ci-dessous.
**Reco** : `retry: 2` (ou 3) avec `retryDelay` exponentiel plafonné, au moins sur les lectures. React Query gère nativement le backoff.

### 2.2 — Erreurs de requête silencieuses · P1 · effort M
`providers/query-provider.tsx:33-49` — le `QueryCache.onError` global ne fait que `console.error` sauf pour les erreurs de scope. Aucun toast, aucune bannière.
**Impact** : combiné à `retry:false`, une lecture qui échoue laisse l'UI dans son état « vide » ou « chargement » sans jamais signaler l'erreur. L'utilisateur croit sa boîte vide.
**Reco** : bannière globale « connexion perdue / réessayer » sur erreur réseau, distincte des vraies boîtes vides.

### 2.3 — Aucune détection offline · P2 · effort M
Recherche exhaustive : **0 occurrence** de `navigator.onLine`, listener `offline/online`, ou `OnlineManager` custom (vérifié sur `components hooks app lib providers`).
React Query en `networkMode:'online'` (défaut) **met les mutations en pause** hors-ligne — donc les actions ne « échouent » pas franchement, mais **rien n'informe l'utilisateur** qu'il est hors-ligne, et une coupure *en cours de requête* (≠ offline complet, cas courant à Tahiti) tombe sous `retry:false` = échec sec.
**Reco** : indicateur offline global + file d'attente visible des actions en attente.

### 2.4 — `HydrateFallback` commenté → écran blanc à l'hydratation · P1 · effort S
`app/root.tsx:83-89` — le `HydrateFallback` (spinner plein écran) est **commenté**.
**Impact Tahiti** : app SPA `ssr:false`, le bundle JS doit être téléchargé+parsé avant tout rendu. Sans fallback, l'utilisateur voit un **écran blanc** pendant tout le chargement initial du JS (le plus long à 44–340 kB/s). Aucun signe de vie.
**Reco** : réactiver un HydrateFallback minimal (logo + spinner), inliné dans le HTML.

### 2.5 — ErrorBoundary global brut et anglais · P2 · effort S
`app/root.tsx:95-178` — l'`ErrorBoundary` affiche `JSON.stringify(error, null, 2)` (l.153) et des chaînes **en dur anglais** : « Something went wrong! », « See the console for more information. » (l.151-152). Seul `NotFound` (l.180) est i18n.
**Impact** : un crash montre un dump JSON technique en anglais au CEO/utilisateur final. Pas de boundary par-route → n'importe quelle erreur de rendu fait tomber toute la vue sur cet écran.
**Reco** : message i18n compréhensible, masquer le JSON hors DEV, boundaries plus granulaires (liste / thread / compose).

---

## 3. Cartographie surface par surface

### 3.1 — Liste de threads · `components/mail/mail-list.tsx`
- **Chargement** [VÉRIFIÉ] : `isLoading` → **petit spinner** `h-4 w-4` centré dans `h-32` (l.961-964). **PAS de skeleton** alors que `mail-skeleton.tsx` existe (il ne sert qu'au panneau de lecture). → layout shift, faible perception. **P1 · S** — brancher un skeleton de liste.
- **Vide** [VÉRIFIÉ] : « It's empty here / Search for another email or clear filters » **en dur anglais** (l.970-976), non i18n. Message **identique** que la boîte soit vraiment vide ou qu'une recherche ne rende rien → propose toujours « clear filters ». **P2 · S**.
- **Erreur** [VÉRIFIÉ] : `useThreads` (`hooks/use-threads.ts:23`, `useInfiniteQuery`) **n'expose pas `isError`** ; la liste ne gère aucun état d'erreur. Avec `retry:false`, un `listThreads` en échec → `isLoading=false`, `items=[]` → **affiche l'état vide** « It's empty here ». **Un échec réseau se déguise en boîte vide.** **P1 · M** — surface d'erreur distincte + retry.
- **Offline/timeout** [PROBABLE] : cache persistant idb 24 h (voir 4.6) permet la lecture hors-ligne des 3 dernières pages ; au-delà, échec silencieux.
- **Pagination** [VÉRIFIÉ] : spinner en bas de liste pendant `isFetchingNextPage` (l.927-931, l.1010-1013). Correct.
- **Bruit** [VÉRIFIÉ] : `console.log` de debug laissés en prod (l.783, 796, 808, 813, 823, 826, 830, 842). **P3 · S**.

### 3.2 — Vue thread / message · `thread-display.tsx`, `mail-display.tsx`, `mail-content.tsx`
- **Chargement panneau** [VÉRIFIÉ] : `MailDisplaySkeleton` (`mail-skeleton.tsx`) affiché tant que `!emailData || isLoading` (`thread-display.tsx:768-774`). Bon skeleton (3 messages simulés).
- **Erreur thread = skeleton infini** [VÉRIFIÉ] : `useThread` n'expose pas `isError` (grep : aucun `isError` dans `thread-display.tsx`, seulement `isLoading`). Avec `retry:false`, un fetch de thread en échec → `isLoading=false` + `emailData=undefined` → la condition `!emailData` reste vraie → **le skeleton s'affiche indéfiniment**, sans erreur ni retry. **P1 · M**. Piège réel à Tahiti : on clique un thread, la requête rate, skeleton éternel.
- **Corps du mail sans placeholder** [VÉRIFIÉ] : `mail-content.tsx:69-107` — le HTML est traité **côté serveur** (`processEmailContent`, aller-retour tRPC) puis injecté en **Shadow DOM**. **Aucun état de chargement** : tant que `processedData` est absent, le shadow root est vide → **zone de corps blanche** à chaque première ouverture (staleTime 30 min ensuite). `TextShimmer` existe mais n'est câblé que sur l'IA (« Thinking… » l.135, « Summary » l.329). **P1 · M** — shimmer/skeleton pendant le traitement. Si le traitement échoue (`retry:false` hérité), corps blanc définitif, aucune erreur. **P2**.
- **Vide (aucun thread sélectionné)** [VÉRIFIÉ] : « It's empty here / Choose an email to view details » + boutons « Zero chat » / « Send email » **en dur anglais** (`thread-display.tsx:737-761`). **P2 · S**.
- **Images distantes** [VÉRIFIÉ] : bloquées par défaut, bannière i18n « images cachées / afficher / faire confiance » (`mail-content.tsx:159-182`). Correct (privacy + perf).
- **Avatars** [VÉRIFIÉ] : `BimiAvatar` dégrade proprement BIMI → gravatar → initiales sur `onError` (`bimi-avatar.tsx:30-46`). Bien fait.

### 3.3 — Compose · `create/email-composer.tsx` · Reply/Forward · `mail/reply-composer.tsx`
- **Autosave brouillon** [VÉRIFIÉ] : debounce 3 s (`email-composer.tsx:539-544`). Existe. **Mais** ne sauve pas si `to`, `subject` ou message vides (l.451) → un corps rédigé sans sujet/destinataire n'est **pas** persisté. **P2 · S**.
- **Perte de brouillon au démontage** [VÉRIFIÉ/PROBABLE] : le cleanup de démontage ne fait qu'un `console.warn('Email composer unmounting with unsaved content')` (l.524-534) — **il ne sauve pas**. Une confirmation existe sur Escape/close (`showLeaveConfirmation`) mais pas sur les démontages implicites (changement de thread/route). Contenu non sauvé → perdu. **P1 · M**.
- **Double-submit** [VÉRIFIÉ] : `proceedWithSend` garde `if (isLoading || isSavingDraft) return` (l.337) et bouton `disabled={isLoading…}` (l.775). Correct.
- **Éditeur chargé en lazy** [VÉRIFIÉ] : `reply-composer.tsx:25-29` lazy-load tiptap + Suspense fallback = spinner (l.269-274). Bonne maîtrise du poids initial.
- **i18n toasts incohérent** [VÉRIFIÉ] : le composer principal utilise des chaînes **en dur** (« Recipient is required » l.343, « Failed to send email » l.373, « Failed to save draft » l.475, « Please choose a valid date & time… » l.348, etc.) alors que le reply utilise l'i18n `m['pages.createEmail.failedToSendEmail']()` (`reply-composer.tsx:235`). **P2 · M**.
- **Bruit** [VÉRIFIÉ] : `console.log('timeout set')` (l.540). **P3**.
- **Envoi sans feedback si fenêtre undo courte** [VÉRIFIÉ] : `use-undo-send.ts:74` — si `timeRemaining <= 5000 ms`, **aucun toast** n'est montré → envoi silencieux (pas de « Email sent »). **P3 · S**.

### 3.4 — Recherche / Command palette · `context/command-palette-context.tsx`
- **Chargement** [VÉRIFIÉ] : spinners `Loader2` pendant `isLoading` (l.845, 953). Correct.
- **Vide / pas de résultat** [VÉRIFIÉ] : `CommandEmpty` présents mais **en dur anglais** : « No results found, press ENTER to search for emails » (l.848), « Type to search your emails… » (l.958), « No filters found » (l.1140). Placeholders idem : « Type a command or search… » (l.831), « Search your emails… » (l.941). **P2 · S**.
- **Erreur** [VÉRIFIÉ] : `toast.error('Failed to process search')` en dur (l.599), `toast.error('Failed to open email')` (l.988). **P2**.
- **Debounce** [HYPOTHÈSE] : pas de debounce explicite repéré côté palette ; la recherche part sur ENTER (langage naturel) — acceptable pour limiter les requêtes à Tahiti.

### 3.5 — Sidebar / navigation / labels
- **Feedback** [VÉRIFIÉ] : toasts en dur anglais dans `nav-user.tsx` (« Cache cleared successfully » l.121, « Connection ID copied to clipboard » l.126), `context/thread-context.tsx` (« Failed to mark as read » l.266), `select-all-checkbox.tsx` (« Failed to select all conversations » l.88). **P2**.
- **Labels** [VÉRIFIÉ] : rendu optimiste des labels dans la liste (`mail-list.tsx:96-119`). Correct.

### 3.6 — Settings · `app/(routes)/settings/*`
- **Connections** [VÉRIFIÉ] : **vrais skeletons** pendant `isLoading` (`connections/page.tsx:63-77`). Une des rares surfaces avec skeleton propre. Refetch dispo.
- **Autres pages** [PROBABLE] : la plupart consomment `useSettings()` déjà résolu au niveau provider ; états de chargement peu visibles. À vérifier au cas par cas si besoin.

### 3.7 — Onboarding · `components/onboarding.tsx`
- **100% anglais en dur** [VÉRIFIÉ] : tous les libellés (« Welcome to Zero Email! », « Chat with your inbox », « Go back », « Next », « Get Started »… l.8-42, 121-124), aucun `m[...]`. C'est le **premier écran** vu par un nouvel utilisateur français. **P2 · M**.
- **Médias externes lourds sans placeholder** [VÉRIFIÉ] : GIFs/PNG servis depuis `https://assets.0.email/*` (l.10-41), `loading="eager"`, fond `bg-muted` sans shimmer. À 44–340 kB/s les GIFs (`step1/2/3.gif`) sont lentes ; si `assets.0.email` est injoignable → images cassées, aucun `onError`. **P2 · S**.
- **DialogTitle vide** [VÉRIFIÉ] : `<DialogTitle></DialogTitle>` (l.74) → dialog sans nom accessible. **P3 · S**.

### 3.8 — Connexion de compte · `components/connection/add.tsx`
- **i18n partiel** [VÉRIFIÉ] : titres/descriptions i18n (l.63-137) mais le bloc upsell free-tier est **en dur anglais** (« You can only connect 1 email in the free tier », « Start 7 day free trial » l.77-84) et `toast.promise` (« Redirecting to payment… », « Failed to process upgrade… » l.47-48). **P2**.
- **Pas d'état pending sur OAuth** [VÉRIFIÉ] : clic provider → `authClient.linkSocial` async sans indication de chargement (l.112-118) ; double-clic possible sous latence. **P3 · S**.

### 3.9 — AI sidebar / chat · `components/ui/ai-sidebar.tsx`
- **Streaming** [VÉRIFIÉ] : `useChat` (AI SDK) gère le flux. Erreur → `toast.error('Error, please try again later')` **en dur** (l.260) ; certains handlers ne font que `console.log(e)` (l.236). **P2**.

### 3.10 — Queue / Outbox · `components/queue/queue-review.tsx` — ✅ RÉFÉRENCE
- **Chargement** [VÉRIFIÉ] : `StateMessage title={m['queue.loading']()}` (l.342-343).
- **Erreur + retry** [VÉRIFIÉ] : `StateMessage` + bouton refetch i18n (l.344-353).
- **Vide** [VÉRIFIÉ] : `StateMessage` titre+description i18n (l.354-358).
- **Statuts** [VÉRIFIÉ] : libellés/descriptions i18n (l.59-79), undo par item avec compte à rebours (l.109, 379-389).
> À utiliser comme patron pour refactorer liste/thread/compose.

---

## 4. Feedback des actions

| Action | Optimiste | Toast | Undo (durée) | Disabled pendant mutation | i18n toast |
|---|---|---|---|---|---|
| Marquer lu/non-lu | ✅ (`use-optimistic-actions.ts:186/217`) | ✅ | ✅ 5 s | n/a | ❌ en dur (l.211,241) |
| Star / Unstar | ✅ (l.245) | ✅ | ✅ 5 s | n/a | ✅ `m[...]` (l.266-268) |
| Important | ✅ (l.383) | ✅ | ✅ 5 s | n/a | ❌ en dur (l.408) |
| Archive/Spam/Bin (move) | ✅ (l.274) | ✅ | ✅ 5 s | n/a | ✅ `m[...]` (l.297-304) |
| Delete thread | ✅ (l.337) | ✅ | ✅ 5 s | n/a | ✅ (l.379) |
| Label add/remove | ✅ (l.414) | ✅ | ✅ 5 s | n/a | ❌ en dur (l.444-445) |
| Snooze / Unsnooze | ✅ (l.449/478) | ✅ | ✅ 5 s | n/a | ❌ en dur (l.473,497) |
| Delete draft | ✅ (l.502) | ✅ | ✅ 5 s | ✅ `aria-busy`+disabled (`mail-list.tsx:640,649` | ❌ en dur (l.522) |
| Envoyer email | — | ✅ | ✅ **15 s** (`use-undo-send.ts:88`) | ✅ (`email-composer.tsx:337,775`) | ❌ en dur composer (l.373) / ✅ reply |
| Sauvegarde brouillon | — | erreur seule | — | ✅ `isSavingDraft` | ❌ en dur (l.475) |

**Points d'attention feedback :**
- **4.1 — Le « succès » optimiste précède la confirmation serveur, sans reprise** · P1 [VÉRIFIÉ] : `createPendingAction.doAction` exécute la mutation à la **fermeture du toast** (l.163-167) ; en cas d'échec, `toast.error('Action failed')` (l.157, en dur) + revert de l'état optimiste. **Aucun retry.** À Tahiti : on archive, toast de succès 5 s, puis l'action échoue silencieusement et le mail **réapparaît**. Confusion. **P1 · M**.
- **4.2 — Action perdue si démontage < 5 s** · P2 [PROBABLE] : la mutation n'est déclenchée que par `onAutoClose`/`onDismiss` du toast (l.161-178). Si l'utilisateur navigue/ferme l'onglet dans les 5 s, `doAction` ne s'exécute peut-être jamais → l'action optimiste **n'est jamais persistée** côté serveur. À confirmer par test. **P2 · M**.
- **4.3 — Undo-send solide** [VÉRIFIÉ] : 15 s, ré-ouvre le compose et restaure pièces jointes via localStorage (`use-undo-send.ts:99-115`). Bon.
- **4.4 — Libellé « Undo » en dur** [VÉRIFIÉ] : `use-optimistic-actions.ts:170`, `use-undo-send.ts:77`. **P2**.
- **4.6 — Cache local-first** [VÉRIFIÉ] : `PersistQueryClientProvider` + `idb-keyval`, `maxAge`/`gcTime` 24 h, buster (`query-provider.tsx:16-153`). Conserve 3 pages de threads (l.138-141). C'est le P1 « local-first cache » déjà livré — bon pour la lecture hors-ligne.

---

## 5. Perception de latence

- **5.1 — Hydratation initiale = écran blanc** · P1 [VÉRIFIÉ] : `HydrateFallback` commenté (`root.tsx:83-89`). Voir 2.4. Le pire moment à Tahiti (bundle JS long).
- **5.2 — Liste sans skeleton** · P1 [VÉRIFIÉ] : petit spinner au lieu d'un skeleton (`mail-list.tsx:961`). Voir 3.1.
- **5.3 — Corps du mail blanc pendant traitement serveur** · P1 [VÉRIFIÉ] : voir 3.2. Aller-retour tRPC sans shimmer.
- **5.4 — Transitions de route** [PROBABLE] : SPA client-side, pas de suspense/indicateur global de transition repéré hors `mail.tsx:580` (`Suspense fallback={null}`) → potentiels « blancs » silencieux entre vues. À confirmer visuellement. **P2**.
- **5.5 — Positifs** : éditeur reply lazy + Suspense spinner (3.3) ; avatars à fallback gracieux (3.2) ; pagination avec spinner (3.1).

---

## 6. i18n

- **6.1 — Parité des clés** [VÉRIFIÉ] : `fr.json` = 659 clés, `en.json` = 659, `fr.json` plus volumineux (31,9 ko vs 28,0 ko). Les clés traduites sont **complètes** en français. 1 seule occurrence suspecte (TODO/vide) dans `fr.json`.
- **6.2 — Contournement massif de paraglide** · P1 [VÉRIFIÉ] : **62 toasts en anglais codés en dur** (`grep toast.(error|success|info)('…')` hors `m[...]`), répartis sur composer, palette, thread-context, nav-user, mail-display, snooze, templates, setup-phone, ai-sidebar, etc. + états vides (mail-list, thread-display) + **onboarding entier** + upsell connexion + ErrorBoundary. **Le feedback au moment critique est en anglais.** **P1 · L** (volume) — router toutes ces chaînes via `m[...]`.
- **6.3 — Formats localisés** [VÉRIFIÉ] : la queue utilise `Intl.DateTimeFormat(undefined, …)` (`queue-review.tsx:87`) = locale navigateur, correct. `formatDate` custom dans `lib/utils` pour la liste — à auditer pour la cohérence fr (jj/mm, 24 h). **P3**.

---

## 7. Accessibilité fonctionnelle

- **7.1 — Boutons-icônes sans nom accessible** · P2 [VÉRIFIÉ] : seulement **9 `aria-label`** dans tout `components/`. Les actions de survol de la liste (star/important/archive/trash, `mail-list.tsx:252-333`) n'ont qu'un `Tooltip` (visuel, **non lu** par lecteur d'écran) — seul « Delete draft » a un `aria-label` (l.648). **P2 · M** — ajouter `aria-label` sur tous les boutons-icônes.
- **7.2 — Aucune annonce live** · P2 [VÉRIFIÉ] : **0 `aria-live`** custom. Les spinners (`animate-spin`) n'annoncent rien. Les toasts reposent sur les valeurs par défaut de Sonner (`components/ui/toast.tsx`, `unstyled:true`) — annonce probable mais non garantie avec le markup custom. **P2 · S**.
- **7.3 — DialogTitle vide (onboarding)** · P3 [VÉRIFIÉ] : `onboarding.tsx:74`. Dialog sans nom accessible.
- **7.4 — Contrastes muted** · P3 [HYPOTHÈSE] : usage intensif de `text-[#8C8C8C]` / `text-[#929292]` / `opacity-60-70` sur fond clair (ex. `mail-list.tsx:347,470,490`) — sous le seuil AA probable pour du texte secondaire. À mesurer. **P3**.
- **7.5 — Positifs** : 23 `sr-only` (ex. skeleton header `mail-skeleton.tsx:142`), 19 `role=`, navigation clavier riche dans la liste (`use-mail-navigation`) et raccourcis (scopes hotkeys).

---

## 8. Tableau récapitulatif — Surface × État

Légende : ✅ OK · 🟡 partiel · ❌ manquant/défaillant · — non applicable

| Surface | Chargement | Vide | Erreur | Offline/timeout | Feedback action | i18n | A11y |
|---|---|---|---|---|---|---|---|
| **Liste threads** | ❌ spinner (pas skeleton) | 🟡 en dur EN, ambigu | ❌ se déguise en vide | 🟡 cache 24 h / puis muet | ✅ optimiste | ❌ EN dur | 🟡 clavier ok, aria-label ❌ |
| **Thread / message** | ✅ skeleton | 🟡 en dur EN | ❌ **skeleton infini** | 🟡 cache / muet | ✅ | 🟡 corps ok, vide EN | 🟡 |
| **Corps du mail (body)** | ❌ blanc (pas shimmer) | — | ❌ blanc si échec | ❌ | — | ✅ (bannière images) | 🟡 |
| **Compose** | ✅ (lazy+suspense) | — | 🟡 toast EN | 🟡 autosave partiel, perte au démontage | ✅ double-submit ok | ❌ EN dur | 🟡 |
| **Reply / Forward** | ✅ spinner | — | ✅ toast i18n | 🟡 | ✅ undo-send 15 s | ✅ | 🟡 |
| **Recherche / palette** | ✅ spinner | 🟡 EN dur | 🟡 toast EN | 🟡 | ✅ | ❌ EN dur | 🟡 |
| **Sidebar / labels** | 🟡 | — | 🟡 toast EN | 🟡 | ✅ optimiste | ❌ EN dur | 🟡 |
| **Settings / connections** | ✅ **skeleton** | 🟡 | 🟡 refetch | 🟡 | ✅ | 🟡 | 🟡 |
| **Onboarding** | 🟡 bg-muted, médias externes | — | ❌ pas d'onError img | ❌ dépend assets.0.email | ✅ | ❌ **100% EN** | 🟡 DialogTitle vide |
| **Connexion compte** | ❌ pas de pending OAuth | — | 🟡 toast.promise EN | 🟡 | 🟡 | 🟡 (upsell EN) | ✅ aria-hidden ok |
| **AI sidebar** | ✅ streaming | 🟡 | 🟡 toast EN | 🟡 | ✅ | ❌ EN dur | 🟡 |
| **Queue / Outbox** | ✅ | ✅ | ✅ **+ retry** | 🟡 | ✅ undo/retry | ✅ | 🟡 |
| **App shell (hydratation)** | ❌ **écran blanc** | — | ✅ ErrorBoundary (brut EN) | ❌ | — | 🟡 (404 i18n, reste EN) | 🟡 |

---

## 9. Backlog priorisé

**P1 (bloquant l'expérience Tahiti)**
1. `retry: false` → réactiver retry + backoff sur les lectures (§2.1) · M
2. Erreurs de requête silencieuses → bannière réseau globale (§2.2) · M
3. Liste : erreur déguisée en boîte vide → état d'erreur + retry (§3.1) · M
4. Thread : skeleton infini sur échec de fetch → état d'erreur (§3.2) · M
5. Corps du mail : shimmer/skeleton pendant traitement serveur (§3.2) · M
6. Liste : skeleton au lieu du spinner (§3.1) · S
7. `HydrateFallback` : réactiver (écran blanc initial) (§2.4) · S
8. Perte de brouillon au démontage → sauver au unmount (§3.3) · M
9. Action optimiste : échec silencieux sans retry → retry + toast i18n (§4.1) · M
10. i18n : router les 62 toasts + états vides + onboarding via paraglide (§6.2) · L

**P2**
11. États vides en dur (liste, thread, palette) → i18n + distinguer « vide » vs « pas de résultat » · S/M
12. Onboarding : i18n + placeholder médias + héberger les assets en local · M
13. A11y : `aria-label` sur boutons-icônes + `aria-live` sur chargements · M
14. Détection offline + file d'actions en attente visible (§2.3) · M
15. Autosave : sauver aussi les brouillons sans sujet/destinataire (§3.3) · S
16. ErrorBoundary : message i18n, masquer le JSON hors DEV (§2.5) · S

**P3**
17. Retirer les `console.log` de debug (mail-list, optimistic-actions, composer) · S
18. Contrastes des tokens muted à mesurer (§7.4) · S
19. DialogTitle vide onboarding (§7.3) · S
20. Pending OAuth sur connexion de compte (§3.8) · S
