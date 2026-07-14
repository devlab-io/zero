# Job a2-nonnull-01 — non-null assertions ≤10 + extension type-ratchet (V7b)

Builder LOCAL (aucun commit/push/deploy). Gel : `071b6bb3` (branche `job/niveau9/a2-nonnull-01`).
Rapport écrit incrémentalement. Statut : **LIVRÉ — 50→0 assertions en code produit, gates verts
hors any/a3 pré-existant (attribué). STAND-DOWN.**

## PHASE 0 — vérification d'entrée, baseline, plan

### (a) Vérification d'entrée
- `git rev-parse HEAD` = `071b6bb3bdfa2ea22adbf8cc07b2b2e3c07ec361` (= gel). ✓
- Branche = `job/niveau9/a2-nonnull-01`. ✓
- `git status --porcelain` = vide (arbre propre). ✓

### (b) Re-mesure baseline non-null (sur le gel)
Environnement de comptage : le ratchet tourne via Node `execSync` → `/bin/sh` → `/usr/bin/grep`
= **BSD grep 2.6.0-FreeBSD (GNU-compatible)**, PAS l'`ugrep` du shell interactif. Toutes les
mesures ci-dessous utilisent ce grep-là.

Deux méthodes de comptage, résultats divergents et instructifs :

**Méthode grep** (postfixe `!` hors `!=`), commande reproductible :
```
RE='[])A-Za-z0-9_$]!([^=]|$)'          # char de valeur, puis '!', puis (non-'=' | fin de ligne)
grep -roE "$RE" apps/mail/app apps/mail/components apps/mail/lib apps/mail/hooks apps/mail/store \
  apps/mail/providers apps/server/src --include=*.ts --include=*.tsx --exclude=*.d.ts --exclude=*.test.* | wc -l
```
→ **105 occurrences** (mail 69, providers 0, server 36).

**Méthode AST** (autoritative — `typescript@5.8.3` du repo, compte les nœuds `NonNullExpression`) :
→ **50 assertions non-null RÉELLES** (0 definite-assignment `!`).

**Écart = 55 FAUX POSITIFS grep**, tous irréductibles et non-assertions :
- modificateurs Tailwind `!important` dans des `className` (`h-9!`, `p-0!`, `text-black!`,
  `bg-[#424242]!`, `size-8!`, `max-w-none!`…) — ~50 sites (toast, ai-sidebar, sidebar, settings…) ;
- texte de strings finissant par `!` (data.tsx mock emails, "Signed out successfully!",
  "Zero Server is Up!", writing-style-service prose) ;
- 2 lignes commentées (thread-display:226, site-config:51).

**Conséquence méthodologique décisive** : un budget grep serait forcé à ~55+ (jamais ≤10), OU
devrait restreindre le trailing pour exclure Tailwind — ce qui masquerait aussi les vraies
assertions soft-trailing (`await autumn!\n`, `{ id: id! }`) et rendrait le ratchet MALHONNÊTE
(régression future non détectée). Grep ne peut pas distinguer un opérateur `!` d'un `!important`
Tailwind dans une string. → Voir (e), recommandation compteur AST.

### (c) Décomposition par fichier (AST, 50 réelles) + plan

Server (35) : `routes/autumn.ts` **11**, `lib/driver/google-drafts.ts` 6, `routes/ai.ts` 3,
`lib/driver/google-threads.ts` 2, `routes/agent/outbox.ts` 2, `routes/agent/sync.ts` 2,
`thread-workflow-utils/workflow-functions.ts` 1, `routes/agent/{projection,mcp,topics,chat-agent,
recipients}.ts` 1 ch., `routes/index.ts` 1, `trpc/boundary.test-d.ts` 1.

Mail (15) : `settings/labels/page.tsx` 2, `(full-width)/hr.tsx` 2, `ui/chart.tsx` 2,
`context/thread-context.tsx` 2, `mail/mail-display.tsx` 1, `labels/label-dialog.tsx` 1,
`queue/queue-review.tsx` 1, `lib/schemas.ts` 1, `lib/trpc-boundary.test-d.ts` 1,
`hooks/{use-drafts,use-threads,use-summary}.ts` 1 ch.

Helper proposé (assertion function, sans dépendance) :
```ts
export function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Invariant failed');
}
```
Emplacement : `apps/server/src/lib/invariant.ts` + `apps/mail/lib/invariant.ts` (mail et server
sont des cibles de build distinctes, aucun runtime partagé — d'où deux fichiers ~4 lignes ; le
fichier mail n'est créé que si un site mail exige un throw, la majorité étant narrowable).

Transformations représentatives :
- **THROW (invariant)** — `autumn!` ×11. Le middleware (autumn.ts:69-87) **return toujours** quand
  `AUTUMN_SECRET_KEY` est absent ; donc à l'exécution d'un handler `autumn` est garanti défini.
  Fix : `invariant(autumn, 'autumn client not initialized')` en tête de chaque handler → `autumn`
  sans `!`. Happy-path strictement identique ; chemin impossible = throw explicite. 11 → 0.
- **NARROWING (early-return dans le map)** — google-drafts.ts:300/301/307. `attachmentParts` est
  déjà filtré sur `part.body?.attachmentId` (l.292-294) mais TS ne narrow pas à travers `.filter`.
  Fix : `const attachmentId = part.body?.attachmentId; if (!attachmentId) return null;` (le callback
  retourne déjà `null` dans son catch). Idem `draft.message?.id`. 5→0.
- **NARROWING (capture post-guard)** — thread-context.tsx:82/116. `if (!labels || !thread) return null`
  (l.76) narrow déjà `thread`, mais le `!` subsiste dans des closures où le narrowing const ne se
  propage pas. Fix : capturer la valeur narrowée dans une const et l'utiliser dans les closures. 2→0.

Cible : je vise 0 en code produit ; ≤10 avec marge confortable. Les 2 sites `.test-d.ts` sont des
tests de types (le `!` fait partie de l'assertion testée) — cf. (e) sur leur exclusion.

### (d) Fichiers différés anti-collision a8 — comptage sites `!`
- `apps/mail/lib/email-utils.ts` : **0**
- `apps/mail/lib/email-utils.client.tsx` : **0**
- `apps/mail/components/mail/mail-list-thread.tsx` : **0**
- `apps/mail/vite.config.ts` : **0**
→ **Aucun différé.** ≤10 atteignable sans résiduel anti-collision.

### (e) Désaccords / découvertes (preuves fichier:ligne)

**E1 — BLOQUANT hors-fence : le type-ratchet `any` est DÉJÀ ROUGE au gel.**
`node scripts/checks/type-ratchet.mjs` → `any(server)=17/15  any(total)=40/38` FAILED. Cause :
le merge a3 (`3a809685`) a ajouté `apps/server/src/lib/driver/__fixtures__/google-http-fake.ts`
(lignes 24, 53, 77 = 3 `any`), non exclu par la commande gelée (`__fixtures__` ≠ `*.test.*`).
Server hors `__fixtures__` = 14 (conforme au commentaire ratchet « 23 + 14 »). Budgets `any`
INTOUCHABLES + fichier a3 = hors de ma fence. Le gate « type-ratchet PASSED » ne peut passer sans
décision. Options soumises à l'orchestrateur : (i) typage des 3 `any` fixture par a3/toi ;
(ii) m'autoriser à typer ces 3 `any` ; (iii) évaluer mes nouveaux compteurs indépendamment du
sous-budget any legacy. Je ne contourne pas.

**E2 — Méthodologie compteur nonNull : recommander AST, pas grep.** Cf. (b). Grep = 105 (55 FP
Tailwind/prose) → ≤10 inatteignable honnêtement en grep. Je recommande un compteur `nonNull`
par AST (`typescript` du repo, aucune dépendance, ~30 lignes) qui compte exactement les
`NonNullExpression` — seule méthode rendant « ≤10 » vraie. Les compteurs `@ts-expect-error`
(budget 4) et `@ts-ignore` (budget 1) RESTENT en grep verbatim (directives de commentaire, exact,
style identique aux compteurs `any`).

**E3 — Sites `.test-d.ts`.** 2 sites (`boundary.test-d.ts`, `trpc-boundary.test-d.ts`) sont des
tests de types où `!` est l'assertion testée. Je propose de les exclure du compteur nonNull
(cohérent avec l'exclusion des tests dans les ratchets console/loc). Sans impact sur ≤10.

### Baseline des gates au gel (arbre intact — seul ce rapport est non-tracké)
Séquence env exécutée (install --frozen --ignore-scripts, server/mail wrangler types,
react-router typegen — tous RC=0) :
- `tsc` server = **0 erreur** ; `tsc` mail = **0 erreur** (résidu ../server transféré déjà
  résorbé par #25) → **0/0 propre**.
- `console-ratchet` = PASSED (server 8/8, front 6/6).
- `loc-ratchet` = PASSED (4 fichiers >800, frontier 0).
- `type-ratchet` (any) = **FAILED** au gel : any(server)=17/15, any(total)=40/38 (cf. E1,
  fixtures a3). Pré-existant, hors fence.
- Comptes de référence : non-null AST=50 · @ts-expect-error=4 · @ts-ignore=1.

Toute la prep est faite ; exécution prête dès réception du ruling E1/E2/E3.

## PHASE 1 — EXÉCUTION (post-ruling e106b9ba : E1 hors-charge, E2 AST approuvé, E3 exclusion
approuvée, helper aux deux emplacements approuvé, plan approuvé tel quel)

Décision d'exécution sur le helper : `apps/mail/lib/invariant.ts` N'A PAS été créé — tous les
fix mail se sont faits par narrowing pur (aucun throw requis), créer un helper mail inutilisé
aurait été du code mort (esprit A1). Seul `apps/server/src/lib/invariant.ts` existe, effectivement
consommé. Signature : `invariant(condition, message?): asserts condition` → throw explicite.

### 50 → 0 assertions en code produit — transformations par site

SERVER (35 → 0) :
| Fichier | Sites | Technique |
|---|---|---|
| routes/autumn.ts | 11 | `invariant(autumn, …)` par handler (middleware garantit la présence) |
| lib/driver/google-drafts.ts | 6 | early-return `null` dans le `.map` (déjà filtré body?.attachmentId) |
| routes/ai.ts | 3 | `defaultConnectionId ?? ''` (null réel, capté par le OR) ; hoist `const caller` |
| lib/driver/google-threads.ts | 2 | prédicat de type dans `.filter` (+ eslint-disable supprimé) ; garde `&& message.id` |
| routes/agent/outbox.ts | 2 | `invariant(current.gmailDraftId, …)` (impossible d'envoyer sans id) |
| routes/agent/sync.ts | 2 | capture `const connection` (invariant) ; capture `const agent` dans `if(this.agent)` |
| routes/agent/projection.ts | 1 | capture `const driver` (invariant) |
| routes/agent/mcp.ts | 1 | capture `const connectionId` (invariant) |
| routes/agent/topics.ts | 1 | capture `const agent` dans `if(this.agent)` |
| routes/agent/chat-agent.ts | 1 | capture `const body` (invariant — body null impossible pour un flux) |
| routes/agent/recipients.ts | 1 | restructure `.has()`+`.get()!` → `.get()` + null-check |
| routes/index.ts | 1 | capture `const authHeader` (invariant — throw préservé, message propre) |
| thread-workflow-utils/workflow-functions.ts | 1 | `invariant(latestMessage, …)` |

MAIL (15 → 0) :
| Fichier | Sites | Technique |
|---|---|---|
| app/(routes)/settings/labels/page.tsx | 2 | ternaire narrowé `editingLabel && editingLabel.id` ; garde onClick |
| app/(full-width)/hr.tsx | 2 | `.filter(Boolean)` → filter à prédicat de type `o is NonNullable<…>` |
| components/ui/chart.tsx | 2 | garde `if (!item) return null` (payload.length déjà ≥1) |
| components/context/thread-context.tsx | 2 | capture `const currentThread` post-guard (closures) |
| components/mail/mail-display.tsx | 1 | capture `const connectionEmail` post-guard (closure filter) |
| components/labels/label-dialog.tsx | 1 | ternaire narrowé `isControlled && onOpenChange` |
| components/queue/queue-review.tsx | 1 | capture `const scheduledSendAt` dans le `if` (closure updater) |
| lib/schemas.ts | 1 | `split(',')[1] ?? ''` (inerte ; data URL a toujours une virgule) |
| hooks/use-drafts.ts, use-threads.ts, use-summary.ts | 3 | `id ?? ''` / `threadId ?? ''` (query désactivée par `enabled`) |

Résiduel : 2 sites en `.test-d.ts` (boundary.test-d.ts:28, trpc-boundary.test-d.ts:19) — assertions
de type intentionnelles, EXCLUES du compteur (E3). AST recount code produit = **0**.

### Extension type-ratchet.mjs
- Compteurs `any` (23/15/38) INCHANGÉS (fonction, regex, budgets identiques au verbatim).
- `@ts-expect-error` : grep verbatim, budget 4 (les 4 sites nominatifs).
- `@ts-ignore` : grep verbatim, budget 1 (email-processor.ts:1).
- `nonNull` : AST (`typescript@5.8.3` du repo, `NonNullExpression`), exclusions *.d.ts/*.test.*/
  *.test-d.ts, budget **0** (valeur post-job mesurée). Header documente la réconciliation
  grep⇄AST (105 = 50 réelles + 55 FP) et porte les deux chiffres pour le juge (84 grep c80d4bf4
  ère / 50 AST au gel).

### Gates (RC natifs)
- `tsc` server = **0** (RC=0) ; `tsc` mail = **0** (RC=0) → 0/0 propre, inchangé vs baseline.
- `type-ratchet` : @ts-expect-error=4/4, @ts-ignore=1/1, nonNull=0/0 — mes 3 compteurs PASSENT ;
  échec résiduel = **any(server)=17/15, any(total)=40/38** → **rouge any pré-existant attribué
  (fixture a3, correctif en cours par builder-a3-driver-01)**. Jamais un PASSED global tant que
  a3 n'a pas mergé.
- `console-ratchet` = PASSED (server 8/8, front 6/6).
- `loc-ratchet` = PASSED (aucun fichier franchi, frontier 0).
- vitest server run 1 = 23 fichiers / 298 tests PASSÉS (dont drivers touchés : google-threads 21,
  google-drafts 12, projection 9, mcp-tools 20). Runs ×2 + mail ×2 en cours.

### Boundaries (git status --porcelain)
25 modifiés (11 mail + 13 server + scripts/checks/type-ratchet.mjs) + 2 nouveaux
(apps/server/src/lib/invariant.ts, ce rapport). Aucun fichier MUST-NOT touché : ni docs/checks,
ni measure-critical.py, ni package.json/lock, ni migrations/ci.yml/config build, ni les 4 fichiers
anti-collision a8, ni la fixture a3.
