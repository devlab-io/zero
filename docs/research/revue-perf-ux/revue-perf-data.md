# Revue perf — couche data & runtime React (repo `zero`, branche `factory/perf`)

*Lecture seule. Aucun fichier modifié. Réf. baseline : `docs/research/perf-baseline.md` §6.*
*Chiffres réseau utilisateur (Tahiti, mesurés en B1) : RTT 150–200 ms ; TTFB API ~0,18 s (keep-alive) à ~0,6 s (connexion fraîche), ~1,6 s si isolate froid ; débit 44–340 kB/s.*
*Statut de chaque constat : **VÉRIFIÉ** (code lu ligne à ligne) / **PROBABLE** (déduit du code, non exécuté) / **HYPOTHÈSE**.*

---

## Synthèse en une phrase

Le vrai goulot de la couche data **n'est pas dans la liste P1–P6** : c'est un **N+1 sur l'hydratation de la liste de threads** (chaque ligne visible déclenche son propre `mail.get` — corps complet du fil — sans batching), doublé d'un **second N+1 de sanitisation HTML par ligne**. À côté de ça, **P2 (optimistic UI) est déjà implémenté à ~80 %** (toutes les actions liste/fil sauf l'envoi), et **P3 (préchargement fil suivant) est déjà un effet de bord** de la sur-hydratation actuelle. Le classement du baseline ne tient donc pas tel quel.

---

## 1. Constats matériels (triés par impact)

### A — [P0/P1] N+1 : chaque ligne de la liste refait un `mail.get` complet — VÉRIFIÉ
- **Serveur** : `listThreads` ne renvoie **que** `{ id, historyId, $raw? }` par fil — aucun contenu.
  - `apps/server/src/lib/driver/types.ts:122-136` (`IGetThreadsResponse` / schéma).
  - `apps/server/src/lib/server-utils.ts:394-454` (`getThreadsFromDB` → `agent.stub.getThreadsFromDB`, projection minimale).
  - Route : `apps/server/src/trpc/routes/mail.ts:74-195`.
- **Client** : chaque ligne `Thread` appelle `useThread(message.id)` = `useQuery(trpc.mail.get{ id })`, qui renvoie **tout le fil** (`messages[]`, `latest`, `labels`, `tags`, corps).
  - `apps/mail/components/mail/mail-list.tsx:62` (`useThread(message.id)` dans le composant de ligne).
  - `apps/mail/hooks/use-threads.ts:65-83` (`useThread` → `trpc.mail.get`, `staleTime` 1 h).
  - `apps/server/src/trpc/routes/mail.ts:62-73` (`get` → `IGetThreadResponse` complet, `types.ts:6-13`).
- **Pas de batching** : `httpBatchLink({ …, maxItems: 1 })` → chaque `mail.get` = **1 POST HTTP séparé**.
  - `apps/mail/providers/query-provider.tsx:91-106`.
- **Amplitude** : liste virtualisée `VList overscan={5} itemSize={100}` → ~8 visibles + 5 overscan ≈ **13 requêtes `mail.get` concurrentes au premier rendu**, +1 par nouvelle ligne au scroll.
  - `apps/mail/components/mail/mail-list.tsx:982-1003`.
- **Impact utilisateur** : chaque requête paie TTFB 0,18–0,6 s (1,6 s si froid) **et** télécharge le **corps complet de chaque fil** (`messages[]` avec `decodedBody`) sur un lien à 44–340 kB/s — alors que la ligne n'affiche que expéditeur + sujet + un extrait 2 lignes (`latest.body`, `mail-list.tsx:80`). En parallèle le mur d'horloge ≈ la plus lente, mais la **bande passante est saturée par des payloads que la liste ne montre jamais**. Coût récurrent : premier chargement d'un inbox « frais » (nouveaux fils, cache froid) **et** à chaque scroll.
- **Sévérité P0/P1 · Effort M–L.**
- **Reco (par ordre de ROI)** :
  1. **Grossir la projection `listThreads`** : renvoyer par fil les champs d'affichage (expéditeur, sujet, snippet, `hasUnread`, `tags`/labels, date, `totalReplies`) pour que la ligne se rende **directement depuis l'infinite query**, sans `mail.get` par ligne. Supprime N requêtes + N corps.
  2. À défaut : endpoint `mail.getMany(ids[])` **ou** retirer `maxItems: 1` (rétablir le batching tRPC) → les ~13 `get` fusionnent en 1 POST (masque le N×RTT, mais garde l'over-fetch des corps).
  3. Ne charger le **corps** (`messages[].decodedBody`) qu'à l'ouverture du fil, pas à la liste.

### B — [P1] Second N+1 : `processEmailContent` (sanitisation HTML) exécuté par ligne — VÉRIFIÉ (code) / runtime PROBABLE
- `useThread` embarque une query cachée `['email-content', latestMessage.id, …]` qui appelle la **mutation serveur** `trpc.mail.processEmailContent`, `enabled: !!latestMessage?.decodedBody && !!settings`.
  - `apps/mail/hooks/use-threads.ts:134-165` ; route `apps/server/src/trpc/routes/mail.ts:817`.
- Comme `useThread` est partagé par **chaque ligne**, dès que `mail.get` d'une ligne résout (donc `latest.decodedBody` présent), la ligne déclenche **un appel serveur de sanitisation du corps HTML complet** — alors que la liste n'affiche que `latest.body` (extrait), **jamais** le HTML traité.
- **Impact** : **double** les allers-retours par ligne (encore N appels serveur) + CPU de sanitisation, pour un résultat que la liste jette. (Résultat mis en cache `gcTime` 1 h → utile plus tard à l'ouverture, mais payé trop tôt et en masse.)
- **Sévérité P1 · Effort S–M.**
- **Reco** : passer un flag `isActive`/`enabled` à `useThread` pour que la query `email-content` ne tourne **que pour le fil ouvert** (thread-display), pas pour les lignes de liste.

### C — [P2 — DÉJÀ FAIT à ~80 %] Optimistic UI présent sur toutes les actions liste/fil — VÉRIFIÉ
- Hook central `useOptimisticActions` (`apps/mail/hooks/use-optimistic-actions.ts`) couvre :
  | Action | Fonction | Optimiste ? | Réf. |
  |---|---|---|---|
  | Lu | `optimisticMarkAsRead` | ✅ | `:186-215` |
  | Non-lu | `optimisticMarkAsUnread` | ✅ | `:217-243` |
  | Étoile | `optimisticToggleStar` | ✅ | `:245-272` |
  | Archiver / déplacer | `optimisticMoveThreadsTo` | ✅ (masqué via backgroundQueue) | `:274-335` |
  | Supprimer | `optimisticDeleteThreads` | ✅ | `:337-381` |
  | Important | `optimisticToggleImportant` | ✅ | `:383-412` |
  | Label | `optimisticToggleLabel` | ✅ | `:414-447` |
  | Snooze | `optimisticSnooze` | ✅ | `:449-476` |
  | Unsnooze | `optimisticUnsnooze` | ✅ | `:478-500` |
  | Suppr. brouillon | `optimisticDeleteDraft` | ✅ | `:502-524` |
- Mécanisme : `addOptimisticAction` (atom jotai) → reflet UI **immédiat**. `optimistic-thread-state.tsx:44-91` mappe l'action vers `displayStarred/Unread/Important/Labels/shouldHide` consommés par la ligne (`mail-list.tsx:78-137`, `544-556`). MOVE/DELETE/SNOOZE masquent la ligne via `backgroundQueue` (`store/backgroundQueue.ts`, filtré dans `use-threads.ts:47`).
- Détail notable : l'appel serveur réel est **différé jusqu'à la fermeture du toast Undo (5 s)** ou son rejet (`use-optimistic-actions.ts:161-181`). UI instantanée, sync serveur après la fenêtre d'annulation — pattern plus fort que `onMutate`+rollback pour la latence perçue.
- **Conclusion** : le gros de P2 est **déjà livré**. Reste seulement l'envoi (constat D).
- **Dette de propreté** (non bloquant) : `console.log('here …')` en boucle dans `createPendingAction` (`:101,104,108,135`) — bruit prod à retirer.

### D — [P2 restant] L'envoi n'est PAS optimiste + `await refetch()` bloquant — VÉRIFIÉ
- Réponse/transfert : `await sendEmail(...)` puis `await refetch()` de la liste.
  - `apps/mail/components/mail/reply-composer.tsx:193-222`.
- Compose neuf : idem `await sendEmail(...)`.
  - `apps/mail/components/create/create-email.tsx:108`.
- L'utilisateur attend l'aller-retour serveur avant tout retour (le toast Undo-send n'apparaît qu'**après** la réponse serveur — `hooks/use-undo-send.ts:63-127`). `setMode(null)` ferme bien le composer avant `refetch()`, mais le `await refetch()` remet une requête liste sur le chemin critique.
- **Impact** : ~0,18–0,6 s (jusqu'à ~1,6 s à froid) bloquants par envoi, + le coût du refetch liste.
- **Sévérité P2 · Effort M.**
- **Reco** : état « Envoi… » optimiste + fermeture immédiate ; retirer le `await refetch()` (laisser l'invalidation venir du websocket DO, cf. I).

### E — [P3 — largement REDONDANT] Aucun prefetch explicite, mais la sur-hydratation fait déjà office de préchargement — VÉRIFIÉ
- Aucun prefetch au hover / preload de route / `ensureQueryData`. Les seuls `onMouseEnter` sont cosmétiques (animations d'icônes) + un `CustomEvent('emailHover')` pour le ciblage clavier.
  - `apps/mail/components/mail/mail-list.tsx:225-230`.
- **Mais** : puisque chaque ligne visible a déjà chargé son `mail.get` complet (constat A), ouvrir un fil ou faire suivant/précédent lit **depuis le cache** → instantané. `handleNext` ne fait que `setThreadId(nextThread.id)`.
  - `apps/mail/components/mail/thread-display.tsx:202-219`.
- **Conclusion** : P3 en tant qu'optim isolée a une **valeur marginale quasi nulle tant que A n'est pas corrigé**. Le bon geste est **inverse** : alléger la liste (A/B) puis ajouter un prefetch **ciblé des seuls voisins du fil ouvert**, au lieu de tout précharger.
- **Sévérité P3 · Effort S** (à faire *après* A).

### F — [P1 upstream — OK, un bémol] Cache persistant : la liste est invalidée à chaque restauration — VÉRIFIÉ
- `PersistQueryClientProvider` persiste tout le client en IndexedDB, `maxAge` 24 h, `buster: CACHE_BURST_KEY`.
  - `apps/mail/providers/query-provider.tsx:122-128`.
- `onSuccess` (après restauration) : tronque l'infinite query threads à **3 pages** puis **`invalidateQueries`** la liste → refetch à l'accès.
  - `query-provider.tsx:129-146`.
- Conséquence : réouverture à froid → liste affichée **instantanément depuis le cache**, mais **1 requête `listThreads` systématique** derrière (stale-while-revalidate), même si les données sont encore fraîches. Les `mail.get` individuels (`staleTime` 1 h, `gcTime` 24 h global) **survivent** et ne sont pas invalidés → ouverture d'un fil déjà vu = **hors-ligne**.
- **Non couvert par le cache** : avatars/`BimiAvatar` et images distantes (toujours réseau), pièces jointes (`getAttachment`). Le HTML sanitizé (`email-content`) **est** caché (`gcTime` 1 h).
- **Sévérité P2 · Effort S.** Reco : conditionner l'invalidation `onSuccess` à la péremption réelle (ne pas payer 1 RTT si `dataUpdatedAt` < staleTime).

### G — [P4 — DÉJÀ FAIT, confirmé bon dernier] Virtualisation présente (virtua) — VÉRIFIÉ
- `VList` de `virtua`, `overscan={5}`, `itemSize={100}` → seules les lignes visibles+overscan sont montées.
  - `apps/mail/components/mail/mail-list.tsx:37, 982-1004`.
- Le coût par ligne montée est dominé par la **couche data** (constat A/B), pas par le rendu. La virtualisation borne déjà le nombre de lignes. **P4 mérite bien la dernière place.**
- Résidu : le poids **par ligne** est lourd en hooks (~10+ : `useThreads`, `useThread`, `useThreadLabels`, `useOptimisticThreadState`, `useOptimisticActions`, `useMail`, 3× `useQueryState`, `useParams`, `useAtom`) — cf. constat H.

### H — [P2/P3] Hotspots de re-render : atomes jotai globaux monolithiques — VÉRIFIÉ
- `useMail()` = **un seul** atom `configAtom` regroupant `selected` + `bulkSelected` + 3 flags composer + `showImages`. Chaque ligne y souscrit (`mail-list.tsx:192`) → **toute** modif de `bulkSelected` (une sélection) re-rend **toutes les lignes montées**.
  - `apps/mail/components/mail/use-mail.ts:12-19`.
- `focusedIndexAtom` : souscrit par ligne (`mail-list.tsx:64`) → chaque déplacement de focus re-rend toutes les lignes.
- `content` de la ligne = un `useMemo` géant (`mail-list.tsx:216-542`) dépendant de `optimisticState` **entier** → toute modif optimiste d'un champ reconstruit tout le sous-arbre de la ligne.
- `MailLabels` compare via `JSON.stringify` (`mail-list.tsx:1067`) — exécuté à chaque rendu ; code smell, coût mineur.
- `useThreads()` rappelé **dans chaque ligne** (`mail-list.tsx:60`) juste pour `handleNext` → une souscription supplémentaire à l'infinite query par ligne (données cachées, mais souscription en plus).
- **Sévérité P2 · Effort M.** Reco : découper `configAtom` (atomes séparés `selectedAtom`/`bulkSelectedAtom`) ou `selectAtom` jotai pour souscrire au slice utile ; passer `handleNext` par props/atom dédié plutôt que re-`useThreads` par ligne.

### I — [P5 — sync déjà efficace] Aucun polling ; live update par websocket DO — VÉRIFIÉ
- **Aucun** `refetchInterval` dans toute l'app mail (grep : 0 occurrence). Les défauts globaux sont sains : `retry: false`, `refetchOnWindowFocus: false`, `gcTime` 24 h ; pas de `staleTime` global (donc 0 = stale immédiat pour les queries qui n'en fixent pas).
  - `apps/mail/providers/query-provider.tsx:51-57`.
- Live sync (counts, `isSyncing`, storage) poussé via **websocket** `useAgent` (Agents SDK) → `setDoState`.
  - `apps/mail/components/ui/ai-sidebar.tsx:195, 232-240` ; état lu par `useStats` → `useDoState` (`components/mail/use-do-state.ts`), consommé par la sidebar (`nav-user.tsx:109`, `app-sidebar.tsx:44`).
- **Bémol (PROBABLE, hors périmètre perf pur)** : ce websocket vit **dans l'AISidebar lazy** (`mail.tsx:30`). Si l'AI sidebar n'est pas montée, `useDoState` (compteurs/sync) ne se met jamais à jour. Couplage à surveiller.
- **Config morte** : `refetchIntervalInBackground: true` sur `listThreads` sans aucun `refetchInterval` défini → **no-op**.
  - `apps/mail/hooks/use-threads.ts:33-36`.
- **Conclusion** : P5 (tuning sync) offre peu de gain — la sync est déjà push, sans polling gaspilleur.

### J — [P6 — confirmé faible] Skeletons
- Skeletons présents pour l'état intra-app (chargement liste : spinner `mail-list.tsx:961-964` ; brouillon en cours : `Draft` skeleton `mail-list.tsx:594-624`). Le blanc pré-JS (`ssr:false`) n'est **pas** adressable par des skeletons client. Rien à ajouter tant que A/B/le poids client dominent. Conforme au baseline.

### Divers (dette, non chiffré)
- `console.log`/`console.debug` en chemins chauds côté client (`use-optimistic-actions.ts`, `mail-list.tsx:783,796,808,823,842`) et serveur (`mail.ts` listThreads très verbeux `:91-193`) — à retirer en prod.
- `use-threads.ts:80` : commentaire « 1 minute » alors que `staleTime` = 1 h (le 1 h est intentionnel et correct ; corriger le commentaire).

---

## 2. Verdict sur le classement P2 > P3 > P5 > P6 > P4

**Il ne tient pas tel quel.** Raisons, code à l'appui :

1. **Le plus gros levier data-layer est absent de la liste P1–P6** : le N+1 d'hydratation de la liste (constat A) + la sanitisation par ligne (B). Sur le lien Tahiti (44–340 kB/s), télécharger le corps complet de chaque fil visible + le sanitiser, à chaque scroll et à chaque cold-load, est **le** coût dominant de la couche data. C'est un **nouveau P0/P1**, pas un raffinement.
2. **P2 est déjà livré à ~80 %** : toutes les actions liste/fil sont optimistes (constat C). Le « reste » de P2 se réduit à **l'envoi optimiste** (D) — utile, mais un chantier bien plus petit que ce que le rang n°1 suggérait.
3. **P3 est largement redondant** (constat E) : le préchargement du fil suivant est déjà un effet de bord de la sur-hydratation actuelle. Valeur marginale ~nulle avant de corriger A ; ensuite, petit ajout ciblé.
4. **P5** : sync déjà en websocket-push, sans polling (I) → gain faible.
5. **P6** : confirmé faible (J).
6. **P4** : virtualisation déjà en place (G) → **bon dernier confirmé**. Le résidu réel n'est pas « plus de virtualisation » mais le découpage des atomes (H).

### Classement révisé proposé

| Rang | Chantier | Justification |
|---|---|---|
| **0 (nouveau P0/P1)** | **Tuer le N+1 liste** : projection riche `listThreads` (ou `getMany`/retirer `maxItems:1`) + geler `processEmailContent` au fil actif (A + B) | Plus grand et plus sûr gain data-layer ; supprime N requêtes **et** N corps sur le lien lent, à chaque cold-load et scroll |
| **1** | **Envoi optimiste** (D) | Seule action utilisateur restée bloquante ; forte valeur perçue, effort M |
| **2** | **Découpage atomes / re-renders** (H) | Améliore scroll + sélection ; plus matériel que P4/P5/P6 |
| **3** | **P3 prefetch ciblé voisins** (E) | Seulement *après* A ; sinon redondant |
| **4** | Cache : invalidation conditionnelle à la restauration (F) | Économise 1 RTT à chaque réouverture fraîche |
| **5–7** | P5 / P6 / P4 | Déjà bons / faible gain (I, J, G) |

**Ce que je changerais en priorité, Thomas** : sortir « optimistic UI » du haut du classement (il est fait) et y mettre le **N+1 d'hydratation de la liste**, qui n'était pas identifié. C'est là que se cache le coût réseau récurrent sur le lien Tahiti.

---

*Limites : analyse 100 % statique (lecture de code), non exécutée — les amplitudes réseau sont déduites des chiffres B1 du baseline, pas re-mesurées. Les points marqués PROBABLE (runtime de B, couplage websocket/AISidebar de I) mériteraient une confirmation en session authentifiée.*
