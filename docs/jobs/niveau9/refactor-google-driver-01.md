# Job niveau9/refactor-google-driver-01 — V2.2 refactor-google-driver (issue #23)

MIRROR: ORCHESTRATOR

## Contrats en tête (consommés par d'autres issues)

- **types.ts — chemin canonique INCHANGÉ (contrat #25).** Le fichier
  `apps/server/src/lib/driver/types.ts` n'est ni déplacé, ni rencommé, ni modifié
  par ce job. Chemin canonique confirmé : `apps/server/src/lib/driver/types.ts`.
  Tous les nouveaux modules importent le contrat depuis `./types` (inchangé). #25
  (shared-types) peut continuer à dépendre de ce chemin sans coordination.
- **Transport (contrat #31)** — voir section « Contrat » en bas. Point unique
  d'exécution des requêtes Gmail HTTP : `GmailTransport.execute(fn)` dans
  `apps/server/src/lib/driver/google-transport.ts`.

## Observation baseline bloquante (MIRROR: ORCHESTRATOR)

Le check gelé `scripts/checks/loc-ratchet.mjs` est **DÉJÀ ROUGE au HEAD du run
(437c7c5a)**, avant toute modification de ce job, sur deux fichiers **hors
périmètre #23** :

```
GREW past budget: apps/mail/app/(full-width)/contributors.tsx = 1040 LOC > budget 1032
GREW past budget: apps/mail/components/context/command-palette-context.tsx = 1922 LOC > budget 1913
```

Ces deux fichiers sont sous `apps/mail/**`, que ce job a interdiction de toucher
(BOUNDARIES). Le job #23 ne peut donc pas rendre `loc-ratchet` vert à lui seul :
la régression provient d'autre travail mergé dans l'arbre, pas du driver Google.
Ce que ce job garantit et démontre plus bas : **zéro régression loc-ratchet
côté driver** — `google.ts` passe de 1487 LOC à un point d'entrée, et aucun
module driver résultant ne dépasse 800 LOC (ni 400 cible). Ruling orchestrateur
requis pour la borne mail (out of scope ici).

---

## PHASE 0 — Plan + désaccords

### Décision d'architecture (pas de désaccord bloquant avec l'objectif)

Aucun désaccord de fond avec l'objectif de #23. Trois décisions de découpage à
divulguer, chacune citant des fichiers réels :

1. **Façade déléguante conservée dans `google.ts` (point d'entrée).** L'interface
   `MailManager` (`apps/server/src/lib/driver/types.ts`) exige un objet unique
   portant les 30 méthodes ; `index.ts` fait `new GoogleMailManager(config)`.
   `GoogleMailManager` reste donc défini dans `google.ts`, mais réduit à une
   façade de délégation pure (aucune logique métier) vers des sous-modules par
   domaine. C'est le « point d'entrée » autorisé par l'acceptation. Les
   consommateurs (`index.ts` → `createDriver`) ne bougent pas d'une ligne.

2. **Sept modules de domaine, pas cinq.** L'objectif liste « threads, messages,
   labels, drafts, transport » *à titre illustratif* (« par domaine »).
   J'ajoute deux modules pour tenir la borne <400 LOC cible et garder des
   domaines cohérents :
   - `google-parse.ts` — helpers PURS de (dé)sérialisation MIME/message
     (`parseMessage`, `parseOutgoing`, `findAttachments`), partagés par threads,
     messages et drafts. Les isoler évite la duplication et sort ~290 LOC de
     logique pure des modules réseau.
   - `google-account.ts` — opérations compte/OAuth (`getTokens`, `getUserInfo`,
     `getEmailAliases`, `revokeToken`) qui ne relèvent ni de threads/messages/
     labels/drafts ni du transport HTTP Gmail.
   `count()` est classé dans `labels` (il énumère les labels et leurs compteurs).

3. **Couture transport = fonction `execute(fn)`, pas seulement l'exposition du
   client.** Pour donner à #31 UN point unique à surcharger (et non « enveloppe
   le client quelque part »), chaque requête Gmail HTTP du driver est routée par
   `this.transport.execute((gmail) => gmail.users.X.Y(...))`. Aujourd'hui
   `execute(fn) = fn(this.gmail)` — stratégie requête-par-requête strictement
   inchangée (passe-plat, comportement réseau identique, types préservés par
   généricité). #31 branchera batch/backoff en surchargeant cette seule méthode.

### Plan d'exécution

- PHASE 1 (fait) : lecture read-only des checks gelés + terrain ; baseline
  mesuré sur l'arbre inchangé (tsc, tests, wrangler dry-run, loc-ratchet, any).
- PHASE 2 : extraction verbatim des corps de méthode vers 7 modules ;
  `google.ts` → façade déléguante. Aucun changement de logique. `this.gmail.*`
  → `this.transport.execute(...)` ; appels croisés via refs de modules.
- Vérif : tsc server 0, tests verts, wrangler dry-run vert, loc-ratchet sans
  régression driver, any server ≤15, @ts-nocheck 0 — avant/après.

### Frontières respectées

MAY TOUCH uniquement : `apps/server/src/lib/driver/**` +
`docs/jobs/niveau9/refactor-google-driver-01.md`. Aucun autre builder (#22
routes/agent, #24 main.ts+routes) n'est touché. `types.ts` non modifié.
`console.*` du driver conservés verbatim (RULING #23 → #42). En-tête licence :
`google.ts` n'en porte pas (vérifié : `grep -rln "Zero Email Inc"
apps/server/src/lib/driver/` = vide) — modules dérivés sans en-tête, conforme.

---

## Baseline (arbre inchangé, HEAD 437c7c5a, worktree fraîchement installé)

| Mesure | Commande | Résultat |
|---|---|---|
| tsc server | `pnpm --filter @zero/server exec tsc --noEmit` (après `pnpm --filter @zero/server types`) | **0 erreur** (exit 0) |
| any server | `grep -rE ":\s*any\b\|as any\|<any>\|\bany\[\]" apps/server/src …` | **14** (gate ≤15) |
| @ts-nocheck server | `grep -rn "@ts-nocheck" apps/server …` | **0** |
| wrangler dry-run server | `wrangler deploy --dry-run --env local` | **exit 0** |
| loc-ratchet | `node scripts/checks/loc-ratchet.mjs` | **exit 1** — 2 régressions `apps/mail/**` préexistantes, 0 côté driver |
| google.ts | `wc -l` | **1487 LOC** |
| tests | `pnpm test` (turbo) | **exit 0** — server 7/7 (2 fichiers), mail 2/2 (1 fichier), 3 fichiers hérités |

> Note : la cible « ≥120 tests » est celle de V5.2 (tests-core-coverage), une
> autre issue ; au HEAD du run seuls les 3 fichiers hérités existent. Gate #23 =
> « tous les tests existants passent avant ET après » → satisfait (exit 0).

Sorties verbatim conservées : voir section « Sorties verbatim ».

---

## PHASE 2 — Carte de découpage (LOC après refactor)

`google.ts` : **1487 → 155 LOC** (façade/point d'entrée, délégation pure).
Aucun module >400 (cible) ni >800 (dure). Total driver Google éclaté en 8 fichiers :

| Module | LOC | Domaine | Méthodes |
|---|---|---|---|
| `google.ts` | **155** | point d'entrée | façade `GoogleMailManager implements MailManager` (30 délégations) |
| `google-threads.ts` | 363 | threads | `list`, `get`, `listHistory`, `markAsRead/Unread`, `normalizeIds`, `deleteAllSpam`, `getThreadMetadata` (priv), + `normalizeSearch` (fn export) |
| `google-drafts.ts` | 335 | brouillons | `createDraft`, `getDraft`, `listDrafts`, `deleteDraft`, `sendDraft`, `parseDraft` (priv) |
| `google-labels.ts` | 324 | labels | `getUserLabels`, `getLabel`, `createLabel`, `updateLabel`, `deleteLabel`, `modifyLabels`, `modifyThreadLabels`, `count`, `resolveLabelId` (priv) ; état `labelIdCache`/`systemLabelIds` |
| `google-parse.ts` | 308 | (dé)sérialisation (pur) | `parseMessage`, `parseOutgoing`, `findAttachments` — fonctions pures, zéro appel réseau |
| `google-messages.ts` | 134 | messages | `getAttachment`, `getMessageAttachments`, `create`, `delete`, `getRawEmail` |
| `google-transport.ts` | 105 | **transport (couture #31)** | `execute`, `withErrorHandler`, `withSyncErrorHandler`, `getScope`, `getQuotaUser` ; possède `auth` + client `gmail` |
| `google-account.ts` | 83 | compte/OAuth | `getTokens`, `getUserInfo`, `getEmailAliases`, `revokeToken` |

Graphe de dépendances (acyclique) : `transport` ← {messages, labels, account} ;
`threads` ← {transport, messages, labels} ; `drafts` ← {transport, messages} +
fonction `normalizeSearch` de threads ; tous les modules réseau ← `parse` (pur).
`google.ts` assemble le tout et délègue.

**Comportement inchangé — preuve de préservation**
- Corps de méthode extraits VERBATIM ; seules substitutions mécaniques :
  `this.gmail.users.X.Y(...)` → `this.transport.execute((gmail) => gmail.users.X.Y(...))`
  (passe-plat, cf. Contrat), et appels croisés `this.helper(...)` →
  `this.<module>.helper(...)` / fonction pure importée.
- Deux hoists type-safe requis par le narrowing TS (une valeur `string | null`
  perdait son narrowing dans la nouvelle arrow imbriquée) : `const draftId =
  draft.id` (listDrafts) et `const draftId = data.id` (createDraft, branche
  update). Aucun changement de logique runtime — mêmes valeurs passées.
- `console.*` du driver conservés à l'identique (RULING #23 → #42).

---

## Contrat

### Transport (contrat consommé par #31 — batch/backoff Gmail)

- **Module** : `apps/server/src/lib/driver/google-transport.ts`
- **Classe** : `GmailTransport`
- **Point UNIQUE de branchement** :

  ```ts
  execute<T>(fn: (gmail: gmail_v1.Gmail) => Promise<T>): Promise<T>
  ```

  Implémentation actuelle (stratégie requête-par-requête, INCHANGÉE) :
  `execute(fn) { return fn(this.gmail); }` — passe-plat strict, un appel HTTP par
  invocation. **Les 27 sites de dispatch Gmail HTTP du driver** passent par cette
  méthode (0 accès direct au client hors transport — vérifié : `this.gmail`
  n'apparaît que dans `google-transport.ts`). #31 branchera batch/backoff en
  surchargeant `execute` (coalescence via `gmail.users.*.batchModify`, backoff)
  et/ou le client `gmail` que possède le transport — un seul point d'entrée,
  aucun module de domaine à modifier.
- **Portée** : `execute` couvre les requêtes **Gmail REST** (`gmail.users.*`).
  Les endpoints OAuth token (`auth.getToken`/`revokeToken`) et People API
  (`people.get`) restent hors couture — ce sont d'autres APIs Google, pas la
  surface batch Gmail visée par #31. Le transport les possède néanmoins (via
  `auth`) pour rester le propriétaire unique de l'accès réseau.

### types.ts (contrat consommé par #25 — shared-types)

- **Chemin canonique INCHANGÉ** : `apps/server/src/lib/driver/types.ts`.
- Fichier **non modifié, non déplacé, non renommé** par ce job (confirmé :
  absent du `git status` des fichiers modifiés). Les 7 nouveaux modules importent
  `MailManager`/`ManagerConfig`/`ParsedDraft` depuis `./types` (inchangé). #25
  peut dépendre de ce chemin sans coordination supplémentaire.

---

## Vérification finale (après refactor, mêmes commandes que le check-runner)

| Gate (structure.md / typecheck.md) | Baseline | Après | Verdict |
|---|---|---|---|
| tsc server = 0 (`… exec tsc --noEmit`) | 0 | **0** (exit 0) | ✓ |
| tests (`pnpm test`) | exit 0 (9) | **exit 0 (9)** | ✓ inchangé |
| wrangler dry-run server (`… --dry-run --env local`) | exit 0 | **exit 0** | ✓ |
| any server (grep, gate ≤15) | 14 | **14** | ✓ |
| @ts-nocheck (gate 0) | 0 | **0** | ✓ |
| Aucun module >800 (dure) / >400 (cible) | — | **max 363** | ✓ |
| google.ts → point d'entrée | 1487 | **155** | ✓ |
| Interface MailManager inchangée | — | **types.ts non modifié** | ✓ |
| Consommateurs (`index.ts` → createDriver) | — | **non modifié** | ✓ |
| Licence (`grep -rL "Zero Email Inc"` modules dérivés) | — | **s/o (google.ts sans en-tête)** | ✓ |
| loc-ratchet côté driver | 0 régression | **0 régression** (google.ts prunable) | ✓ |
| loc-ratchet global | **exit 1 (apps/mail préexistant)** | exit 1 (identique) | ⚠ hors #23 |

Snapshot contrat public (gate 2 structure.md) : la surface exportée de `google.ts`
est **identique** avant/après — `export class GoogleMailManager` (implémente
`MailManager`). `index.ts` importe toujours `{ GoogleMailManager } from './google'`.
Les 7 nouveaux fichiers sont des modules internes additifs, non consommés hors
`driver/`.

---

## Sorties verbatim

### tsc server (après)

```
$ pnpm --filter @zero/server exec tsc --noEmit ; echo exit=$?
exit=0
(0 ligne de diagnostic)
```

### tests (après)

```
@zero/server:test:  Test Files  2 passed (2)
@zero/server:test:       Tests  7 passed (7)
@zero/mail:test:  Test Files  1 passed (1)
@zero/mail:test:       Tests  2 passed (2)
TEST_EXIT=0
```

### wrangler deploy --dry-run --env local (server, après)

```
$ pnpm --filter @zero/server exec wrangler deploy --dry-run --env local --outdir <tmp>
… (bindings + Environment Variables listés)
env.DD_SITE ("datadoghq.com")                                Environment Variable

--dry-run: exiting now.
WRANGLER_EXIT=0
```

### loc-ratchet (après)

```
loc-ratchet: files > 800 LOC = 16 (budget entries 17)
loc-ratchet: cross-app frontier imports = 5 (max 5)
loc-ratchet: 1 budget entry prunable (info):
  - apps/server/src/lib/driver/google.ts (now 155 <= 800)

loc-ratchet FAILED (2):
  - GREW past budget: apps/mail/app/(full-width)/contributors.tsx = 1040 LOC > budget 1032
  - GREW past budget: apps/mail/components/context/command-palette-context.tsx = 1922 LOC > budget 1913
```

Baseline identique à `files > 800 LOC = 17` (google.ts encore à 1487) ; après :
16 (google.ts sorti). Les 2 FAILED sont inchangés baseline↔après.

→ Les 2 échecs sont **préexistants** (identiques au baseline, avant toute
modification #23) et **hors périmètre** (`apps/mail/**`, MUST NOT TOUCH). Côté
driver : `google.ts` passe en « prunable » (155 ≤ 800) — amélioration, 0
régression. Ruling orchestrateur requis pour la borne mail.

### module LOC (après)

```
     363 google-threads.ts
     335 google-drafts.ts
     324 google-labels.ts
     308 google-parse.ts
     155 google.ts
     134 google-messages.ts
     105 google-transport.ts
      83 google-account.ts
```

### frontières (git status — MAY TOUCH respecté)

```
 M apps/server/src/lib/driver/google.ts
?? apps/server/src/lib/driver/google-account.ts
?? apps/server/src/lib/driver/google-drafts.ts
?? apps/server/src/lib/driver/google-labels.ts
?? apps/server/src/lib/driver/google-messages.ts
?? apps/server/src/lib/driver/google-parse.ts
?? apps/server/src/lib/driver/google-threads.ts
?? apps/server/src/lib/driver/google-transport.ts
?? docs/jobs/niveau9/refactor-google-driver-01.md
```

Aucun fichier hors `driver/**` + rapport. `types.ts` et `index.ts` non modifiés.
Non touché : trpc, routes, main.ts, apps/mail, packages, scripts, .github,
docs/checks, wrangler.jsonc, pnpm-lock.yaml. #22/#24 non impactés.

---

STATUS: PASS — google.ts 1487→155 (point d'entrée) éclaté en 7 modules ≤363 LOC ; interface MailManager/types.ts/consommateurs inchangés ; couture transport `GmailTransport.execute` isolée pour #31 ; tsc server 0, tests exit 0, wrangler dry-run 0, any 14/≤15, 0 régression loc-ratchet driver — AVANT/APRÈS ; loc-ratchet global rouge préexistant sur apps/mail (hors #23, ruling orchestrateur requis) ; NON COMMITÉ.
