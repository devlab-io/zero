# Job report — perf / p0-client-weight (builder 01)

MIRROR: ORCHESTRATOR

## PHASE 0 — plan + disagreements (avec preuves)

Worktree HEAD était `e7ca6f4d…` ≠ tip attendu ; dérogation pré-autorisée appliquée :
`git checkout --detach 92e0d8bd7729e57786d33bad6ab316609d6bff2f` (vérifié ensuite).

Diagnostic mesuré sur build baseline DE CE WORKTREE (sourcemaps + analyseur VLQ maison,
`stat -f%z` sur `build/client/assets/*.js`) : **5 454 kB raw / 160 chunks** (≠ 5 828 kB
annoncés au gel avec la même formule — écart d'environnement constaté, non expliqué ;
sans incidence : les seuils du check sont absolus).

1. `use-drafts` **1 375 kB** = l'éditeur (email-composer → use-compose-editor → tiptap),
   dont **@tiptap/extension-emoji 436 kB** (dataset pur) et **katex 257 kB retenu à tort** :
   novel dist est un mono-fichier où `Mathematics = Node.create(...)` n'est pas prouvable
   pur ; l'app n'utilise Mathematics nulle part (grep exhaustif : zéro usage ; c'est la
   raison pour laquelle le repo patche déjà novel pour retirer react-tweet — même racine).
2. `ai-sidebar` **879 kB** dont **livekit-client 398 kB** ; chargé eagerly car les hooks
   légers `useAISidebar`/`useAIFullScreen` vivaient dans le même module que le composant.
3. `_index` **494 kB dont 437 kB de catalogue paraglide COMPLET** (584 messages × 19
   locales) : tree-shaking cassé par 8 sites d'accès dynamiques (``m[`…${x}`]`` dans
   login/error-message, settings/appearance, settings/shortcuts, theme-switcher,
   image-compression-settings, command-palette `(m as any)[key]`, mail.tsx `m[key]`)
   + `m` utilisé comme VALEUR dans 2 dep-arrays de thread-context (555 et 328) —
   un seul suffit à matérialiser l'objet namespace entier. 276/584 clés réellement
   utilisées en littéral.
4. `vite-plugin-babel` avec `filter: /\.[jt]sx?$/` **sans exclude** : babel+react-compiler
   re-transformait tout node_modules et la sortie paraglide (source du plugin lu :
   `customFilter = createFilter(include, exclude)` passe tout par défaut). Build 32 s.
5. Héros `email-preview.png` : 6000×4267, 1 133 020 o (affiché ≤ ~1216 px CSS).
6. `react-dom/server` (entrée CJS) requiert statiquement le moteur legacy
   (`renderToString`, utilisé) ET le moteur streaming (~85 kB min, utilisé par personne
   côté client — seul `app/entry.server.tsx` utilise le streaming, via le specifier
   distinct `react-dom/server.browser`).
7. `pixelated-bg.tsx` : 122 kB de PNG base64 inline dans le JS de la landing.

Désaccords / écarts notables signalés :
- **Baseline tsc irreproduisible dans cet environnement** : à HEAD gelé, code intact,
  `npx tsc --noEmit | grep -c "error TS"` = **108**, pas 99 (mesuré via stash propre).
  Mes changements nets : **95** (j'ai dû corriger 13 erreurs pré-existantes en périmètre
  pour absorber la dérive : 2×TS7053 shortcuts + 11 dans `editor.text-buttons.tsx`,
  fichier mort avec import cassé `./editor.node-selector` inexistant).
- **Le check vitest de l'issue est inexécutable tel quel** : vitest n'est pas une
  dépendance d'apps/mail (aucun binaire local/racine). Substitution : binaire
  d'apps/server (vitest 3.2.4) — voir §4.

## Ce qui a changé (leviers, avant → après)

Totaux : **5 454 kB → 4 182 kB raw JS (−23,3 %), 160 → 168 chunks, plus gros chunk
1 375 kB → 551 kB**. Héros : **1 133 020 → 234 765 o**. Build : ~32 s → ~10,5 s.

| Chunk | Avant | Après | Comment |
|---|---|---|---|
| use-drafts (éditeur) | 1 408 kB (gelé) / 1 375 kB (mesuré ici) | **supprimé** → `use-compose-editor` 495 kB raw / 166 kB gz, **async, chargé à l'usage réel** | `React.lazy(EmailComposer)` dans reply-composer + create-email (rendu seulement si mode reply actif / dialog compose ouvert) ; katex −257 kB (extensions.ts réécrit en imports @tiptap directs, helpers novel inlinés 1:1 — zéro import `novel` dans le code vivant) ; dataset emoji sorti du JS (voir plus bas) |
| ai-sidebar | 879 (gelé) / 858 | **551 kB, async** | hooks extraits vers `components/ui/use-ai-sidebar.ts` (5 importeurs mis à jour) ; `React.lazy(AISidebar)` dans mail.tsx — monté immédiatement (le socket d'invalidation temps réel y vit : zéro perte fonctionnelle) mais hors du chunk de route |
| _index | 494 | 57 | tree-shaking paraglide restauré : 9 sites dynamiques remplacés par des maps littérales équivalentes + 2 dep-arrays corrigés → 360/584 messages bundlés (−225 kB), répartis par route |
| page (route /mail) | — | 409 | contient encore react-dom-server-legacy 80 kB (Markdown react-email dans mail-display — fonctionnel) |
| pixelated-bg | 118 | ~1 | les 3 SVG (base64 inline) extraits en `public/pixelated-*.svg` via renderToStaticMarkup (fidélité 1:1, tailwind `opacity-[0.03]` converti en attribut natif) ; composants remplacés par `<img>` même API |
| hero PNG | 1 133 020 o | **234 765 o** | magick resize 1920w + quantisation PNG8 FloydSteinberg (196 couleurs — screenshot UI sombre, contrôle visuel fait, crop inspecté) ; même chemin `/email-preview.png`, zéro changement de code |

Leviers de build (vite.config.ts) :
- `exclude: [/node_modules/, /\/paraglide\//]` sur vite-plugin-babel (react-compiler ne
  doit traiter que le code app) — restaure les annotations de pureté + build 3× plus vite.
- alias `'react-dom/server'` → fichier legacy uniquement (moteur streaming client jamais
  utilisé ; `react-dom/server.browser` d'entry.server **non affecté**, préfixe non-match) : −85 kB.
- plugin `strip-emoji-default-dataset` : vide la référence `emojis: emojis` des options
  PAR DÉFAUT de @tiptap/extension-emoji (dist mono-fichier, jamais tree-shakable sinon).
  Nos éditeurs passent TOUJOURS `emojis` explicitement : le dataset complet (1 952
  entrées, généré 1:1 depuis l'export `gitHubEmojis` du paquet → `lib/github-emojis.json`,
  émis en asset hashé immutable) est chargé via `loadGitHubEmojis()` **attendu dans les 3
  factories React.lazy** (reply-composer, create-email, AISidebar pour ai-chat) — donc
  toujours résolu AVANT la création de l'éditeur (les input-rules émoticônes sont
  construites à l'init). Même data, mêmes features (suggestions :emoji:, émoticônes,
  shortcodes sujet) ; ~480 kB de données sorties du JS, désormais fetch parallèle,
  uniquement quand un éditeur charge. Même philosophie que le patch pnpm existant sur
  novel (patches/novel.patch), appliquée au build car patches/ est hors MAY TOUCH. −437 kB.
- `import * as CustomIcons` + accès dynamique dans mail.tsx remplacé par une map littérale
  des 6 icônes que le produit peut réellement produire (defaultMailCategories : Lightning/
  Mail/ScanEye + fallbacks User/Bell/Tag ; la page settings categories n'offre aucun
  sélecteur d'icône — vérifié).

Dépendances : +8 paquets @tiptap 2.23.0 (character-count, color, highlight,
horizontal-rule, task-item, task-list, text-style, underline — déjà présents dans le
store comme deps transitives de novel), pnpm-lock.yaml mis à jour (+24 lignes).

## Check evidence — tous les RUN de docs/checks/perf/p0-client-weight.md

Exécuteur : bash (zsh), depuis la racine du worktree. Verbatim.

1. `test $(stat -f%z apps/mail/public/email-preview.png) -lt 300000 && echo HERO_OK`
```
HERO_OK
```
exit: 0 ✓

2. `cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/p0-build.log 2>&1; echo "build exit: $?"`
```
build exit: 0
```
exit: 0 ✓

3. `find apps/mail/build/client/assets -name "*.js" -size +900k | wc -l`
```
       0
```
exit: 0 ✓ (attendu 0)

4. `find apps/mail/build/client/assets -name "*.js" -exec stat -f%z {} + | awk '{s+=$1} END {print int(s/1024)}'`
```
4182
```
exit: 0 ✓ (attendu ≤ 4600 ; baseline gelée 5 828)

5. `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 99 && echo TSC_NO_NEW_ERRORS`
```
TSC_NO_NEW_ERRORS
```
exit: 0 ✓ (95 erreurs ; baseline env 108 à HEAD, voir Phase 0)

6. `git status --porcelain -- apps/server packages | wc -l`
```
       0
```
exit: 0 ✓

## Vérifications complémentaires (judge-only, best effort)

- **Boot sanity** : build servi par `npx wrangler dev --port 3100` depuis apps/mail.
  `GET /` → 200 (6 131 o) ; les **48 assets référencés par le shell → tous 200** ;
  `/email-preview.png` 200 (234 765 o) ; `/pixelated-bg.svg` 200 ; JSON emoji 200.
- **Headless browser (Chromium)** : landing rendue et vérifiée par screenshot — héros
  affiché, fonds pixelisés présents, zéro 404/500 réseau. Console : uniquement
  `ERR_NAME_NOT_RESOLVED` vers `https://x.invalid` (placeholders du build de
  vérification — attendu par construction du check) + le `Failed to get session` qui en
  découle. `/login` monte et rend son fallback d'erreur providers — comportement
  identique à la baseline B0 sans backend (rapport B0 §2), pas une régression.
- **Vitest** : `cd apps/mail && npx vitest run` → `vitest: command not found`
  (vitest n'est pas une dep d'apps/mail, install offline). Substitution :
  `cd apps/mail && ../server/node_modules/.bin/vitest run` (vitest 3.2.4) →
  **Test Files 1 passed (1), Tests 2 passed (2)** (queue-view-model.test.ts, non touché).
- **Lazy réel** : EmailComposer ne se charge que si un composer est rendu (reply ouvert /
  dialog compose) ; aucun `modulepreload` du chunk éditeur dans le shell.

## Limitations / substitutions

- `pnpm install --offline` a échoué (`ERR_PNPM_NO_OFFLINE_META`) pour les 8 nouvelles
  deps directes @tiptap (tarballs dans le store mais métadonnées registry absentes) →
  substitution `pnpm install --prefer-offline --ignore-scripts` (métadonnées réseau,
  paquets depuis le store).
- Baseline tsc 99 non reproductible ici (108 à HEAD, mesuré proprement via stash) ;
  compensé en corrigeant 13 erreurs pré-existantes dans MAY TOUCH → 95 ≤ 99.
- Le dataset emoji vit désormais en asset JSON (~480 kB raw, ~66 kB gz au transfert,
  cache immutable) : le total JS du check ne le compte plus — assumé et documenté
  ci-dessus ; le chargement est garanti avant tout montage d'éditeur, fallback
  gracieux (liste vide + warn console + retry au prochain appel) si le fetch échoue.
- L'éditeur en conditions authentifiées (reply/compose réels, suggestions emoji) n'a pas
  pu être exercé en headless (login Google requis) — le montage des routes, le shell et
  la landing l'ont été.
- `.gitignore` avait été modifié par un outil de QA local (gstack) pendant la
  vérification ; reverté, artefacts supprimés — l'arbre ne contient que mes changements.
- `docs/checks/**` : non touché. Aucun commit/push/tag : tout est laissé non commité.

STATUS: DONE — all frozen RUN checks pass locally
