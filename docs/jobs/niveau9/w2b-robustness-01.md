# Job report — w2b-robustness-01 (issue #34, niveau9 V5.1)

Worktree : `.architect/wt/niveau9/w2b-robustness-01`, branche `job/niveau9/w2b-robustness-01`,
HEAD gel = `5331ac6a7aa916b7ff1f68edb72dc57226a2def2` (vérifié).

---

## PHASE 0 — Plan, désaccords, décisions (écrit AVANT tout code)

### Lecture du check (docs/checks/niveau8/robustness.md) → coutures réelles

| # | Exigence du check | Couture réelle | État avant |
|---|---|---|---|
| 1 | Liste non-cachée 500/offline ⇒ erreur explicite + retry, jamais « vide » | `components/mail/mail-list.tsx` | **MENSONGE** : `!items \|\| items.length===0` affiche « It's empty here » même en erreur ; `isError/error/isStale` exposés par la couture mais **non consommés** |
| 2 | Refresh d'une liste cachée échoué ⇒ lignes cachées gardées + note stale/offline | `mail-list.tsx` (cache local-first PersistQueryClient déjà en place) | Aucune note ; skeleton/empty possible |
| 3 | Thread actif 500/offline ⇒ état d'erreur fini + retry/back, jamais skeleton infini | `components/mail/thread-display.tsx` | **SKELETON INFINI** : `!emailData \|\| isLoading` ⇒ skeleton ; avec retry OFF, un fetch échoué laisse `emailData=undefined`,`isLoading=false`,`isError=true` ⇒ skeleton **perpétuel** |
| 4 | Lectures retry ≤2 (expo+jitter capé) ; mutations non-idempotentes non | `providers/query-provider.tsx` | `queries.retry:false`, `mutations` sans retry. **Aucun retry** de lecture |
| 5 | Brouillon survit unmount, pagehide/reload, autosave échoué | `components/create/email-composer.tsx` | Autosave serveur 3 s + `beforeunload` (warn) ; unmount = `console.warn` seul ; **échec autosave met `hasUnsavedChanges=false` (perte du signal)** ; aucune persistance locale |
| 6 | Échec optimiste (archive/star/read/snooze) ⇒ action de reprise + réconciliation | `hooks/use-optimistic-actions.ts` | catch = `console.error`+`toast.error('Action failed')` sans retry ; **BUG latent : MOVE/DELETE échoué ne vide PAS le backgroundQueue ⇒ le fil reste caché à jamais** |
| 7 | Outbox create/retry idempotent sous requête dupliquée | serveur `lib/draft-outbox/*` | **DÉJÀ SATISFAIT** (voir décision D1) |
| 8 | Soak 30 min : 0 rejet non-capté, 0 shortcut dupliqué, 0 fuite timer/listener, pas de boucle de requêtes croissante | transverse | À prouver par harness (décision D5) |

Plus le ruling 1 : crash `hooks/use-settings.ts:11` (`session?.user.id` non gardé).

### Désaccords / déviations vs la spec (conformité silencieuse = défaut)

**D1 — Point 7 (idempotence outbox) : je NE touche PAS le serveur. Aucun ruling requis.**
La spec autorise l'`endpoint idempotence si strictement nécessaire, le signaler et ATTENDRE le ruling`.
Après lecture, ce n'est **pas** nécessaire — l'idempotence est déjà complète côté serveur (hors de mon
périmètre) :
- `enqueueDraftJob` (create) : clé `idempotencyKey` = SHA-256 du payload +
  `.onConflictDoNothing({ target: draftOutbox.idempotencyKey })` et renvoie la ligne existante ⇒
  une requête dupliquée **ne crée pas** de second job (`lib/draft-outbox/index.ts:115-154`).
- `retryDraftOutboxJob` : `persistDraftOutboxItemTransition` fait un UPDATE **gardé**
  `WHERE id=… AND status=current.status` (concurrence optimiste) et `retryDraftOutboxItem` exige
  `status:'failed'` ⇒ un retry dupliqué voit un statut déjà transité et échoue/no-op, **jamais** de double
  exécution (`index.ts:191-216`, `state-machine.ts:148-163`).
- Déjà couvert par les tests serveur existants `state-machine.test.ts` (« allows retry from failed only »,
  « prevents idempotent double-send … terminal state guard »).
- Côté client, `queue-review.tsx` désactive les boutons pendant `isMutating` (anti double-submit UI) et
  react-query n'auto-retry pas les mutations.
➡️ Décision : **verify, don't build**. Point 7 satisfait sans modification serveur ; aucune attente de ruling.

**D2 — Crash jumeau hors périmètre : je le SIGNALE, je ne le corrige pas silencieusement.**
Le même crash `session?.user.id` (second hop non gardé) existe à l'identique dans :
- `hooks/use-drafts.ts:11` — **HORS may-touch** ⇒ je NE le touche PAS. À router (orchestrateur) comme le
  ruling 1 l'a fait pour use-settings.
- `hooks/use-threads.ts:82` (`useThread`) — j'estime ce fichier **DANS** le may-touch (« data-layer/états de
  mail-list & thread »), et il porte directement l'état honnête du thread (point 3). Je le garde donc AUSSI,
  décision **déclarée** ici (pas d'ajout silencieux). Si l'orchestrateur juge use-threads hors périmètre,
  révert trivial (une ligne).

**D3 — Envoi optimiste (W2-H) : fermeture immédiate SANS fermer-avant-await (hazard de cycle de vie).**
La spec dit « fermeture immédiate du composer ». Fermer le composer (`setMode(null)`) **avant** le
`await sendEmail` démonterait `<ReplyCompose>`/`EmailComposer` **pendant** que `proceedWithSend`
(email-composer) est encore sur son `await onSendEmail`, faisant tourner ses lignes post-await
(`editor.clearContent`, `form.reset`) sur un éditeur détruit ⇒ **bug de correction**. Je livre donc
l'intention W2-H sûrement : (a) **retrait de l'`await refetch()` bloquant** → `void refetch()`
(le vrai gain mesuré du cold-path 6,7 s) ; (b) état **« Envoi… »** via `toast.loading` dismiss au settle ;
(c) fermeture **immédiatement après** résolution du send (plus aucune attente réseau dans le chemin de
fermeture). Déviation assumée et justifiée.

**D4 — Découpage en coutures pures (contrainte LOC + testabilité).**
`email-composer.tsx` = 764 LOC ; seuil ratchet = 800 et ce fichier n'est PAS budgété ⇒ le pousser ≥800 =
FAIL. La logique nouvelle vit donc dans des modules purs testables (`lib/*`, `hooks/*`), les composants ne
font que consommer :
- `lib/mail-list-state.ts` — `selectMailListState()` (points 1,2)
- `lib/thread-view-state.ts` — `selectThreadViewState()` (point 3)
- `lib/query-retry.ts` — `shouldRetryRead()` + `readRetryDelay()` (point 4), **source unique** partagée
  par query-provider ET le soak (pas de réimplémentation)
- `lib/draft-storage.ts` + `hooks/use-composer-draft-persistence.ts` + `lib/composer-flush.ts` (point 5)
- `lib/optimistic-recovery.ts` — `buildOptimisticFailureToast()` (point 6)

**D5 — Soak : harness déterministe reproductible, pas un navigateur live.**
Le sandbox n'a ni backend ni credentials ; un soak « navigateur live » ne serait reproductible ni ici ni par
le juge froid. Le check accepte « automated OR browser fault injection ». Je livre un soak **automatisé**
(`vitest.soak.config.ts` + `scripts/soak-robustness.ts`, exclu du gate normal) qui, sur 30 min réelles
(`SOAK_MINUTES`, défaut 30), exerce les **primitives réelles** (retry policy, draft-storage, composer-flush,
shortcut dedup) et prouve les 4 invariants : 0 `unhandledRejection`/`uncaughtException`, balance
add/removeListener nulle (0 fuite), boucle de retry bornée ≤ (1+2) (pas de croissance monotone), 1 seule
exécution par shortcut. Log heartbeat conservé dans `.architect/tmp/soak/soak.log`.

### Contraintes ratchet mesurées (baseline, avant tout code) — RC natifs plus bas
- `any(mail)=23/23` → **ZÉRO marge** : le code mail nouveau n'introduit **aucun** `any`.
- `console(front)=122/143` → 21 de marge ; additions nettes minimales.
- `loc` : 4 fichiers >800 (budget 4) ; email-composer.tsx doit rester <800.

### Plan d'exécution
1. Coutures pures + tests (mail-list-state, thread-view-state, query-retry, draft-storage, optimistic-recovery).
2. Câblage composants : mail-list, thread-display, query-provider, use-optimistic-actions, reply-composer,
   email-composer (+ hook persistance), use-settings (+ use-threads garde D2), i18n en/fr.
3. Soak harness ; validation courte puis run 30 min.
4. Gates (install→types→typegen→tsc×2→vitest→ratchets×3→soak) en RC natifs, tous au rapport.

---

## Baseline des gates (AVANT modifications)

```
pnpm install --frozen-lockfile --ignore-scripts   → RC=0
pnpm --filter @zero/server types                   → RC=0
pnpm --filter @zero/mail types                      → RC=0
pnpm --filter @zero/mail exec react-router typegen  → RC=0  (génère aussi ./paraglide)
pnpm --filter @zero/mail exec tsc --noEmit          → RC=0
pnpm --filter @zero/server exec tsc --noEmit        → RC=0
node scripts/checks/loc-ratchet.mjs      → RC=0  (files>800 = 4/4 ; frontier 0/0)
node scripts/checks/type-ratchet.mjs     → RC=0  (any mail=23/23, server=14/15, total=37/38)
node scripts/checks/console-ratchet.mjs  → RC=0  (server=132/132, front=122/143)
pnpm --filter @zero/mail exec vitest run → RC=0  (8 files, 51 tests)
```

---

## Ce qui a été construit (par point du check)

- **Points 1 & 2 (liste)** — couture pure `lib/mail-list-state.ts` (`selectMailListState`) consommée par
  `components/mail/mail-list.tsx`. Fin du « It's empty here » mensonger : un échec non-caché rend un état
  d'erreur explicite + bouton retry ; un refresh échoué avec cache garde les lignes + bannière stale/offline
  + retry. Connectivité live via `hooks/use-online-status.ts` (`useSyncExternalStore`, listeners nettoyés).
- **Point 3 (thread)** — couture pure `lib/thread-view-state.ts` (`selectThreadViewState`) consommée par
  `components/mail/thread-display.tsx`. Le skeleton infini est mort : un fetch échoué (`isError`, `!data`)
  rend un état d'erreur FINI avec « Réessayer » (refetchThread) et « Retour ». Skeleton uniquement pendant
  un chargement réel.
- **Point 4 (retry)** — couture pure `lib/query-retry.ts` (`shouldRetryRead` ≤2 + `readRetryDelay` expo capé
  30 s + full jitter) câblée dans `providers/query-provider.tsx` sur `queries`. `mutations` gardent 0 retry
  (commenté explicitement) → mutations non-idempotentes jamais rejouées.
- **Point 5 (brouillon)** — `lib/draft-storage.ts` (localStorage best-effort, ne throw jamais) +
  `lib/composer-flush.ts` (listeners pagehide/visibility équilibrés) + `hooks/use-composer-draft-persistence.ts`
  (restore à l'ouverture ≤7 j, persist à chaque changement, flush sur pagehide/visibility-hidden/unmount),
  câblés dans `components/create/email-composer.tsx`. Durabilité indépendante du réseau ⇒ survit à un autosave
  serveur échoué. Effet mort `console.warn('… unmounting …')` retiré (remplacé par la vraie persistance).
- **Point 6 (reprise optimiste)** — `lib/optimistic-recovery.ts` (`buildOptimisticFailureToast`) +
  refonte du catch de `createPendingAction` dans `hooks/use-optimistic-actions.ts` : sur échec, `undo()`
  réconcilie la vue (retire le masque optimiste ET vide le backgroundQueue MOVE/DELETE — correction du BUG
  latent « fil caché à jamais »), `reconcileFailedAction()` invalide `mail.listThreads`, et un toast d'erreur
  offre « Réessayer » (chaque action passe un `retry` re-appliquant l'intention).
- **FINDING #35 routé (ruling orchestrateur) — INTÉGRÉ.** Dans `use-optimistic-actions.ts`, le chemin SUCCÈS
  lisait `typeActions.size === 1` APRÈS `pendingActionsByType.get(type).delete(...)` sur le MÊME Set → pour
  une action unique la taille était déjà 0, donc le `refreshData()` + `removeOptimisticAction()` de succès
  étaient MORTS (fuite : le masque optimiste ne se levait jamais). Fix : capture de la taille AVANT le delete
  via la couture pure `isLastPendingOfType()` (`lib/optimistic-recovery.ts`). Test de non-régression ajouté
  dans `lib/optimistic-recovery.test.ts` (modélise l'ordre du bug + le cas bulk « refresh au dernier seul »).
  Cohérent avec le point 6. #35 rebasera et re-prouvera (discipline stale-base actée).
- **Point 7 (idempotence outbox)** — VÉRIFIÉ, aucun code (voir D1). Idempotence déjà complète côté serveur.
- **Point 8 (soak)** — `scripts/soak-robustness.ts` + `vitest.soak.config.ts` (voir D5). Exclu du gate normal.
- **Ruling 1 / D2 (d5f48acd) + extension 3 (b6876bb9) — classe « session transitoire » CLOSE, 6 guards** :
  tous les `session?.user.id` non gardés de `apps/mail` passés à `session?.user?.id` (vérifié exhaustif :
  `grep -rn "session?.user.id" apps/mail | grep -v "user?.id"` ⇒ NONE) :
  1. `hooks/use-settings.ts:11` (ruling 1) — état géré : query désactivée pendant l'indéterminé (pas de
     valeur success-shaped).
  2. `hooks/use-threads.ts:82` (D2 in-scope)
  3. `hooks/use-drafts.ts:11` (D2 ruling d5f48acd)
  4. `app/page.tsx:8` (extension b6876bb9) — chemin boot login : plus de redirect sur session indéterminée.
  5. `components/ui/app-sidebar.tsx:51` (extension b6876bb9)
  6. `hooks/use-attachments.ts:11` (extension b6876bb9)
  Guards une-ligne uniquement pour 4/5/6 (aucun autre changement dans ces fichiers).

## Commandes de gate — verbatim, RC natifs

Baseline (avant tout code) et après build. Chaque commande : `cmd > log 2>&1; echo RC=$?` (RC non masqué).

| Commande | RC baseline | RC après build |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 | 0 |
| `pnpm --filter @zero/server types` | 0 | — |
| `pnpm --filter @zero/mail types` | 0 | — |
| `pnpm --filter @zero/mail exec react-router typegen` | 0 | — |
| `pnpm exec paraglide-js compile …` (régén clés `states.*`) | — | 0 |
| `pnpm --filter @zero/mail exec tsc --noEmit` | 0 | **0** |
| `pnpm --filter @zero/server exec tsc --noEmit` | 0 | **0** |
| `pnpm --filter @zero/mail exec vitest run` (gate normal) | 0 (8 files/51) | **0 (14 files/81)** |
| `node scripts/checks/loc-ratchet.mjs` | 0 (>800 = 4/4) | **0 (4/4 ; email-composer 787<800)** |
| `node scripts/checks/type-ratchet.mjs` | 0 (any mail 23/23) | **0 (any mail 23/23, server 14/15, total 37/38)** |
| `node scripts/checks/console-ratchet.mjs` | 0 (front 122/143) | **0 (front 121/143, server 132/132)** |
| `vitest run --config vitest.soak.config.ts` (`SOAK_MINUTES=1`, validation) | — | **0 (60 iters, 0 rejet, 0 fuite, maxAttempts=3)** |

Logs conservés sous `.architect/tmp/{env,gates,soak}/`. `any(mail)` inchangé à 23/23 : le code mail nouveau
n'introduit AUCUN `any`. `console(front)` a BAISSÉ (122→121) via le retrait de l'effet mort.

## Inventaire des fichiers

**Modifiés (14, tous MAY TOUCH après rulings) :** `providers/query-provider.tsx`,
`components/mail/mail-list.tsx`, `components/mail/thread-display.tsx`, `components/mail/reply-composer.tsx`,
`components/create/email-composer.tsx`, `hooks/use-optimistic-actions.ts` (+ fix #35),
`hooks/use-settings.ts` (ruling 1), `hooks/use-threads.ts` (D2), `hooks/use-drafts.ts` (d5f48acd),
`app/page.tsx` (b6876bb9), `components/ui/app-sidebar.tsx` (b6876bb9), `hooks/use-attachments.ts` (b6876bb9),
`messages/en.json`, `messages/fr.json`.

**Nouveaux (coutures + hooks + tests + soak + rapport) :**
`lib/query-retry.ts`(+`.test.ts`), `lib/mail-list-state.ts`(+`.test.ts`), `lib/thread-view-state.ts`(+`.test.ts`),
`lib/draft-storage.ts`(+`.test.ts`), `lib/composer-flush.ts`(+`.test.ts`), `lib/optimistic-recovery.ts`(+`.test.ts`),
`hooks/use-online-status.ts`, `hooks/use-composer-draft-persistence.ts`,
`scripts/soak-robustness.ts`, `vitest.soak.config.ts`, `docs/jobs/niveau9/w2b-robustness-01.md`.

Aucun nom de test réservé #35 utilisé. Aucun fichier MUST NOT TOUCH touché (vérifié : ni vite.config, ni
public, ni serveur, ni lockfile, ni docs/checks, ni worktrees tiers).

## MIRROR: ORCHESTRATOR

1. **Serveur non touché (D1).** Point 7 (idempotence outbox) déjà satisfait par
   `lib/draft-outbox/index.ts` (`onConflictDoNothing` sur `idempotencyKey` + `persistDraftOutboxItemTransition`
   à UPDATE gardé) et couvert par `state-machine.test.ts`. Aucun ruling d'endpoint requis. Si tu veux une
   preuve client dédiée « duplicate → une seule mutation », signale-le : `queue-review.tsx` désactive déjà les
   boutons pendant `isMutating`.
2. **Classe « session transitoire better-auth » CLOSE en une livraison (extension b6876bb9).**
   J'ai détecté par grep exhaustif 3 siblings du crash hors périmètre initial ; l'orchestrateur a étendu mon
   may-touch (guards une-ligne). Les 6 occurrences `session?.user.id` de `apps/mail` sont désormais gardées
   (`grep -rn "session?.user.id" apps/mail | grep -v "user?.id"` ⇒ NONE). Plus aucune dette de cette classe.
3. **Envoi optimiste (D3).** J'ai livré l'intention W2-H (retrait de l'`await refetch()` bloquant → `void`,
   état « Envoi… », fermeture immédiate post-send) SANS fermer-avant-await, pour ne pas démonter le composer
   pendant que `email-composer.proceedWithSend` finit son `await` (hazard `editor` détruit). Si tu exiges la
   fermeture strictement avant le send, il faut déplacer la séquence dans `proceedWithSend` (email-composer,
   partagé avec le compose autonome) — je le signale plutôt que de l'imposer silencieusement.
4. **Soak = harness déterministe (D5), pas navigateur live** (pas de backend/creds dans le sandbox ; non
   reproductible par le juge froid autrement). Exerce les primitives réelles ; log heartbeat conservé.

## Soak 30 min — résultat (check point 8)

Commande : `SOAK_MINUTES=30 SOAK_LOG=…/soak.log vitest run --config apps/mail/vitest.soak.config.ts`
→ **RC=0**. Log complet conservé : `.architect/tmp/soak/soak.log` (+ run : `.architect/tmp/soak/soak-30min-run.log`).

```
2026-07-13T18:54:45Z SOAK START minutes=30 deadline=2026-07-13T19:24:45Z
… heartbeats toutes les 30 s (rejections=0 uncaught=0 listeners(win=0,doc=0) maxAttempts=3) …
2026-07-13T19:24:45Z SOAK PASS iterations=1797 rejections=0 uncaught=0 maxAttempts=3 listenerBalance(win=0,doc=0)
```
Durée mesurée : 1801 s (30 min réelles). Les 4 invariants prouvés sur toute la durée :
- **0** unhandledRejection / uncaughtException (handlers process actifs).
- **0** fuite listener : balance add/remove nulle (win & doc) sur 1797 cycles register/cleanup.
- **maxAttempts=3** constant = 1 + READ_RETRY_MAX ⇒ pas de boucle de requêtes croissante.
- **1** exécution par shortcut sous churn de 25 registrations ⇒ pas de double exécution.

## Gate final de clôture (séquence CI complète, post-tous-rulings) — RC natifs séquentiels

```
pnpm install --frozen-lockfile --ignore-scripts     → RC=0
pnpm --filter @zero/server types                    → RC=0
pnpm --filter @zero/mail types                       → RC=0
pnpm --filter @zero/mail exec react-router typegen   → RC=0
pnpm --filter @zero/mail exec tsc --noEmit           → RC=0
pnpm --filter @zero/server exec tsc --noEmit         → RC=0
pnpm --filter @zero/mail exec vitest run             → RC=0  (14 files / 84 tests)
pnpm --filter @zero/server exec vitest run           → RC=0  (9 files / 70 tests — inclut
                                                              state-machine.test.ts : idempotence outbox, point 7)
node scripts/checks/loc-ratchet.mjs                  → RC=0  (>800 = 4/4 ; frontier 0/0)
node scripts/checks/type-ratchet.mjs                 → RC=0  (any mail 23/23, server 14/15, total 37/38)
node scripts/checks/console-ratchet.mjs              → RC=0  (server 132/132, front 121/143)
node scripts/security/check-agent-surface.mjs        → RC=0  (least scopes, bounded session cache, draft-only MCP)
vitest run --config apps/mail/vitest.soak.config.ts  → RC=0  (SOAK PASS, 1797 iters, 1801 s — §dédié ci-dessus)
git rev-parse HEAD → 5331ac6a… (INCHANGÉ — aucun commit ; l'orchestrateur commite après vérif)
```
Logs : `.architect/tmp/gates/CLOSE-*.log` + `.architect/tmp/soak/soak.log`.

`any(mail)` reste à 23/23 (aucun `any` introduit) ; `console(front)` a BAISSÉ 122→121 (effet mort retiré).

## Verdict de conformité (auto-évaluation — le verdict appartient à l'architecte/humain)

Les 8 points du check `docs/checks/niveau8/robustness.md` sont adressés et reproductibles :
1-2 liste (selectMailListState + tests) · 3 thread (selectThreadViewState + tests) · 4 retry (query-retry + tests)
· 5 brouillon (draft-storage/composer-flush/hook + tests) · 6 reprise+réconciliation (optimistic-recovery +
fix #35 + tests) · 7 idempotence outbox (vérifié serveur, tests existants) · 8 soak 30 min (PASS, log conservé).
Plus la classe « session transitoire » close (6 guards). Le check-runner et le juge froid peuvent tout rejouer.

STATUS: COMPLETE

