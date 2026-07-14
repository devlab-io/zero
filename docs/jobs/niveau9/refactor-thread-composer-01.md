# Job niveau9/refactor-thread-composer-01 — Issue devlab-io/zero#27

MIRROR: ORCHESTRATOR
RAW report. Une seule ligne STATUS finale.

Worktree: `/Users/thomasverdenne/cc/zero/.architect/wt/niveau9/refactor-thread-composer-01`
Branche: `job/niveau9/refactor-thread-composer-01` — HEAD `a7dc44630a07856107eeb39c9e9f6f30a0ac01e5` (vérifié, arbre propre). Do NOT commit.

---

## PHASE 0 — Plan & désaccords (tête de rapport, MIRROR: ORCHESTRATOR)

### Objectif
Découper 3 monolithes en modules par responsabilité, **comportement STRICTEMENT inchangé** :
- `mail-display.tsx` 1736 → point d'entrée mince + modules dérivés
- `thread-display.tsx` 1062 → idem
- `email-composer.tsx` 1169 → idem

Bornes finales (loc-ratchet, BORNES uniquement) resserrées vers les valeurs mesurées post-refactor ; aucun module dérivé >800 (cible ≤400).

### Découpage prévu (tous adjacents, aucun sous-dossier, matchent `mail-display*`/`thread-display*` ou `components/create/**`)

**mail-display.tsx →**
- `mail-display.print.ts` — `printMail` (template HTML d'impression, ~200 LOC hors CSS partagé)
- `mail-display.attachments.tsx` — `getFileIcon`, `formatFileSize`, `downloadAttachment`, `openAttachment`, `handleDownloadAllAttachments`, `ThreadAttachments`
- `mail-display.research.tsx` — `StreamingText`, `MoreAboutPerson`, `MoreAboutQuery`
- `mail-display.labels.tsx` — `MailDisplayLabels`
- `mail-display.parts.tsx` — `AiSummary`, `ActionButton`
- reste : `MailDisplay` (hooks + render + `renderPerson` + `people`) → **`export default memo(MailDisplay)` conservé** (seul consommateur : thread-display).

**thread-display.tsx →**
- `thread-display.print.ts` — `printThread`
- `thread-display.demo.tsx` — `ThreadDemo` (**re-exporté** depuis thread-display.tsx pour snapshot identique)
- `thread-display.action-button.tsx` — `ThreadActionButton`
- `thread-display.message-list.tsx` — `MessageList` (+ `MessageListProps`)
- reste : `ThreadDisplay` (conservé + exporté ; consommé par mail.tsx).

**email-composer.tsx →**
- `email-composer.types.ts` — `ThreadContent`, `EmailComposerProps`, `schema`, `buildThreadContent(emailData)` (memo pur extrait)
- `email-composer.content-preview.tsx` — `ContentPreview` + `animations`
- `email-composer.attachments.tsx` — panneau pièces jointes (Popover) présentational
- `email-composer.fields.tsx` — champs To/Cc/Bcc + Subject + From (présentational, props explicites)
- `email-composer.dialogs.tsx` — dialogues « Discard » + « Attachment Warning »
- reste : `EmailComposer` (**export nommé conservé** ; lazy-importé par reply-composer & create-email).

**Module partagé impression :**
- `print-styles.ts` (components/mail) — constante `PRINT_STYLES` partagée par les deux modules print. Les deux blocs CSS ne diffèrent qu'au niveau de **3 lignes inertes** (2 commentaires + 1 ligne vide, cf. PHASE 1) — dédup **output-neutre** (rendu imprimé identique, aucun test n'inspecte le HTML d'impression). Évite ~190 LOC de copier-coller entre modules dérivés (gate 3 découpage).

**Module « Contrat » (seam #32) :** cf. section Contrat ci-dessous.

### Désaccords / RULINGS soumis à l'orchestrateur (MIRROR: ORCHESTRATOR)

**R1 — Périmètre `reply-composer.tsx` (adjacent, hors des 3 fichiers).** La logique destinataires
reply/reply-all EXIGÉE en module testable par l'acceptation vit dans
`apps/mail/components/mail/reply-composer.tsx`, qui n'est PAS l'un des 3 fichiers de l'issue mais
EST un module adjacent de thread-display (importé par lui, ni note-panel* ni mail-list*, non détenu
par un builder en vol). Je le traite comme **adjacent in-scope** et l'édite au **strict minimum** :
suppression du `useEffect` de dérivation destinataires **actuellement MORT** (il calcule `to`/`cc`
puis les jette — racine du bug « À » vide de #32), la logique étant extraite à l'identique vers le
module Contrat. **Comportement inchangé** : `initialTo` reste `ensureEmailArray(draft?.to)` (« À »
reste vide — bug NON corrigé). Si l'orchestrateur juge `reply-composer.tsx` hors périmètre, repli :
créer le module Contrat seul sans toucher reply-composer (le code mort y reste, à la charge de #32).

**R2 — Collision garantie avec le lot clavier niveau8 (#32, non commité, LECTURE SEULE).** Le
worktree `/Users/thomasverdenne/cc/zero-niveau8` (branche `factory/niveau8`) a des modifications non
commitées sur `reply-composer.tsx` ET `email-composer.tsx` qui **réécrivent la même région** que R1.
Écarts constatés (détaillés en PHASE 1) : #32 remplace le `useEffect` mort par un `useMemo`
`replyDefaults` qui (a) **câble** `initialTo = draft ? … : replyDefaults.to` [LE fix « À »],
(b) ajoute une dérivation de **sujet** `Re:`/`Fwd:` (comportement NOUVEAU, absent de la base validée),
(c) **dédup** via `unique()`, (d) retire la prop morte `replyingTo`. Mon extraction (fidèle au
comportement actuel, SANS sujet ni dedup ni câblage) diverge donc volontairement de #32 : le module
Contrat est la **primitive testée** que #32 câblera. Conflit textuel à la fusion **attendu** ; la
partie qui rebase adopte le module. Signalé comme demandé.

**R3 — Sujet reply/reply-all.** La base validée ne contient **aucune** dérivation de sujet
(placeholder mort `// Set subject based on mode` suivi de rien ; le composer reçoit
`initialSubject={draft?.subject}`). « Refactor pur » ⇒ je n'invente pas de logique de sujet. Le module
Contrat porte la **responsabilité** destinataires (+ sujet documenté comme point d'extension #32),
mais n'expose que la sémantique existante (destinataires). Fidélité > complétude spéculative.

---

## PHASE 1 — Constats read-only

### Snapshot exports AVANT (contrat public — gate 2)
```
mail-display.tsx    : export default memo(MailDisplay)      (default)
thread-display.tsx  : export function ThreadDemo            (named)
thread-display.tsx  : export function ThreadDisplay         (named)
email-composer.tsx  : export function EmailComposer         (named)
reply-composer.tsx  : export default function ReplyCompose  (default)
```
Consommateurs externes : `MailDisplay`←thread-display uniquement ; `ThreadDemo`←aucun (export public
conservé par re-export) ; `EmailComposer`←reply-composer + create-email (lazy) ; `ThreadDisplay`←mail.tsx ;
helpers internes (ContentPreview, MoreAbout*, MailDisplayLabels, ThreadAttachments, MessageList) : aucun
consommateur externe → déplaçables. **Cible : snapshot APRÈS identique.**

### Licence (gate 5)
Aucun des 3 fichiers (ni reply-composer) ne porte l'en-tête « Zero Email Inc. » →
modules dérivés sans en-tête requis. N/A.

### Templates d'impression — diff CSS (thread vs mail)
Blocs `<style>` : thread 190 lignes / mail 193 lignes. Diff = **3 ajouts inertes côté mail** :
1 ligne vide + `/* Remove any default borders */` + `/* Ensure clean page breaks */`. Rendu imprimé
identique. → dédup via `PRINT_STYLES` sûre (R-plan).

### Gates & outillage
- Tests : `vitest run` (`apps/mail`), env `happy-dom`, include `{app,components,lib,hooks,store}/**/*.test.{ts,tsx}`.
  → module Contrat testé via `apps/mail/components/mail/reply-recipients.test.ts` (unitaire pur).
- Typecheck report bloquant : `tsc --noEmit` server 0/0, mail baseline 17 (résidu `../server/src` via AppRouter).
  → mon refactor doit rester 0 erreur nouvelle côté mail.
- Build mail : `react-router build`.
- loc-ratchet : THRESHOLD 800, FRONTIER_MAX 0. Bornes à resserrer (mesure post-refactor).

---

## Contrat (module seam pour #32 keyboard-parity)

**Module :** `apps/mail/components/mail/reply-recipients.ts`
**Test :** `apps/mail/components/mail/reply-recipients.test.ts`

**Signature :**
```ts
deriveReplyRecipients(args: {
  mode: string;                                   // 'reply' | 'replyAll' | 'forward' | autre
  message: Pick<ParsedMessage, 'sender' | 'to' | 'cc'>;
  userEmail: string;
}): { to: string[]; cc: string[] }
```

**Sémantique (extraction FIDÈLE du comportement actuel de reply-composer.tsx, bug « À » vide inclus) :**
- `reply` : `to` = [sender] si sender ≠ user ; sinon [premier `to`] si présent. `cc` = [].
- `replyAll` : `to` = [sender si ≠ user] + (`message.to` filtrés ≠ user et ≠ sender) ; `cc` = (`message.cc`
  filtrés ≠ user et absents de `to`).
- `forward` / autre / args incomplets : `{ to: [], cc: [] }`.
- **Aucune** dérivation de sujet, **aucun** dedup case-insensitive supplémentaire (fidélité base validée — cf. R3).

**Statut de câblage :** le résultat n'est **pas** appliqué à `initialTo`/`initialCc` (« À » reste vide).
#32 câblera `deriveReplyRecipients` dans `initialTo`/`initialCc` pour corriger le bug + layerera le sujet.

---

## PHASE 2 — Exécution

### Modules produits (tous ≤400 = cible ; aucun >800)
```
apps/mail/components/mail/
  mail-display.tsx            1736 -> 774   (entrée mince : MailDisplay + Props + helpers)
  mail-display.print.ts             208     printMail
  mail-display.attachments.tsx      224     getFileIcon/formatFileSize/download*/openAttachment/ThreadAttachments
  mail-display.research.tsx         218     StreamingText/MoreAboutPerson/MoreAboutQuery
  mail-display.labels.tsx            88     MailDisplayLabels
  mail-display.parts.tsx             76     AiSummary/ActionButton
  thread-display.tsx          1062 -> 530   (entrée mince : ThreadDisplay + re-export ThreadDemo)
  thread-display.print.ts           215     printThread
  thread-display.demo.tsx            57     ThreadDemo (+ ThreadDisplayProps)
  thread-display.action-button.tsx   46     ThreadActionButton
  thread-display.message-list.tsx    58     MessageList
  print-styles.ts                   202     PRINT_STYLES (CSS d'impression partagé)
  reply-recipients.ts                77     deriveReplyRecipients  ← module « Contrat » (seam #32)
  reply-recipients.test.ts           —      10 tests unitaires (verts)
apps/mail/components/create/
  email-composer.tsx          1170 -> 729   (entrée mince : EmailComposer)
  email-composer.types.ts            77     ThreadContent/EmailComposerProps/schema/ComposerFormValues/buildThreadContent
  email-composer.content-preview.tsx 116     ContentPreview + animations
  email-composer.fields.tsx         185     ComposerHeader (To/Cc/Bcc/Subject/From)
  email-composer.attachments.tsx    141     ComposerAttachments
  email-composer.dialogs.tsx         83     ComposerDialogs
```
Édition minimale hors 3 cibles (RULING R1) : `reply-composer.tsx` — suppression du `useEffect` mort
(no-op, comportement identique) ; logique reply/replyAll extraite dans le module Contrat.
Bornes loc-ratchet resserrées (BORNES uniquement) : 3 entrées prunées (1736/1062/1170 → <800).

### Preuves exécutées (worktree, deps `--frozen-lockfile`)
- **Tests** : `pnpm --filter @zero/mail run test` → **12 passed** (dont 10 pour `deriveReplyRecipients`). VERT.
- **Typecheck mail (gate bloquant ≤17)** : `tsc --noEmit` → **17 erreurs, toutes `../server/src`** (baseline AppRouter),
  **0 en périmètre mail**. Baseline mail 17 respectée. VERT.
- **Build mail** : `react-router build` → **✓ built** (chunk `email-composer` bundlé). VERT.
- **wrangler deploy --dry-run** (mail) → **✓** (exit 0). VERT.
- **loc-ratchet** : `node scripts/checks/loc-ratchet.mjs` → **PASSED** (7 fichiers >800 tous budgétés ; 3 cibles sorties du budget). VERT.
- **Frontière étanche** : `grep -rnE "(\.\./)+server/src" apps/mail` → **0**. VERT.
- **console-ratchet** → **PASSED** (console.* déplacés, count global inchangé). VERT.
- **Snapshot exports (Gate 2)** : identique — mail-display `default`, thread-display `ThreadDemo`(re-export)+`ThreadDisplay`,
  email-composer `EmailComposer`, reply-composer `default`. (Le comptage `ThreadDisplay` 2→1 = substring `ThreadDisplayProps`
  déplacé, pas un export ; build vert prouve la résolution de `ThreadDisplay` par mail.tsx.)
- **Licence (Gate 5)** : N/A — aucun des fichiers sources parents ne porte l'en-tête « Zero Email Inc. ».
- **Dédup impression (Gate 3)** : ~190 LOC de CSS dupliquées entre les 2 print factorisées dans `PRINT_STYLES`
  (diff = 3 lignes inertes ; rendu imprimé identique ; aucun test n'inspecte le HTML d'impression).

### Réserve — typecheck SERVER (hors périmètre)
`typecheck-report --blocking` local : **mail 17/17 (PASS)**, **server 13 > baseline 0 (FAIL)**. Ces 13 erreurs
sont **100% environnementales** (types de bindings `Env` Cloudflare — HYPERDRIVE/VECTORIZE/AI/… — et un module
`.sql` de migration non générés localement ; pas de script `typegen` côté server, codegen orchestré par le
check-runner). **Aucune** ne référence un fichier modifié (0 match sur mail-display/thread-display/email-composer/
reply-recipients/reply-composer) et **aucun** fichier `apps/server/**` ou `packages/**` n'a été touché (git). En
environnement complet (celui du check-runner / juge froid, baseline server 0 posée par #21) → server 0. Non imputable
à #27, qui est intégralement `apps/mail`.

STATUS: DONE — #27 refactor pur : mail-display 1736→774, thread-display 1062→530, email-composer 1170→729, modules dérivés ≤224 (cible ≤400), seam Contrat reply-recipients.ts (deriveReplyRecipients, 10 tests) ; tests 12/12, typecheck mail 17/17 (0 nouvelle), build ✓, wrangler dry-run ✓, loc-ratchet ✓ (frontier 0), console-ratchet ✓, snapshot exports identique ; server tsc 13 env-only (0 dans mes fichiers, 0 fichier server touché) — non imputable. Do NOT commit.
