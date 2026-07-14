# Audit triage — security-triage-highs-01 (issue #37, V5.5)

Produit par le builder **-03** (exécutif, strictement borné). Ne modifie AUCUN des 4
fichiers du snapshot -02 (package.json ×3 + pnpm-lock.yaml) ; aucun override ajouté,
retiré ou modifié. Ce document consigne le triage de reachability et la preuve
mesurée du mapping advisory→override.

## 0. Méthodologie et provenance des mesures

- **Toolchain** : node v22.22.3, pnpm 10.15.0.
- **Install** : `pnpm install --frozen-lockfile --ignore-scripts` → **RC=0** (le lockfile
  modifié du snapshot est cohérent avec les package.json modifiés ; aucun fallback
  non-frozen nécessaire).
- **Audit APRÈS (post-snapshot)** : `pnpm audit --prod --json` sur le working tree
  (HEAD 79a41839 + snapshot -02). Log : `.architect/tmp/audit-prod.json`.
  RC=1, **126 chemins vulnérables** = **122 advisories** (npm-id) répartis
  **48 high / 61 moderate / 13 low** après dédup GHSA.
- **Audit AVANT (pré-snapshot)** : worktree jetable détaché sur HEAD 79a41839
  (état SANS les 10 ajouts + protobufjs encore à 7.5.5). `pnpm audit --prod --json`.
  Log : `.architect/tmp/audit-before.json`.
- **Diff AVANT→APRÈS** (dédup par GHSA) : **21 advisories fermés** (15 high, 6 moderate),
  **0 régression** (aucun advisory nouvellement introduit par le snapshot).
  Log : `.architect/tmp/diff-before-after.txt`.

## 1. Modèle de surface déployée (base du verdict reachability)

Le verdict « atteignable en prod » se lit contre ce que chaque cible **embarque
réellement**, pas contre l'arbre npm complet :

- **`apps/server`** — Cloudflare **Worker** (`wrangler deploy`). Bundle = entrée `src`
  bundlée par esbuild/wrangler. Runtime Workers : **pas de filesystem, pas de
  `child_process`, pas de serveur de dev**. Toute CVE de classe « écriture de fichier /
  path traversal / dev-server / CLI » est **structurellement inapplicable** au runtime.
- **`apps/mail`** — app **React Router en `ssr:false`** (le build supprime le server
  bundle : _« Removing the server build … due to ssr:false »_) → **SPA client** servie en
  assets statiques. Seul le **bundle JS client** est exposé ; le tooling de build
  (vite/rollup/esbuild/tailwind-oxide) ne ship pas.
- **Outillage build/CI/dev** (eslint, vite, rollup, postcss, esbuild, drizzle-kit,
  @sentry/vite-plugin, @tailwindcss/oxide, wrangler CLI) : exécuté sur la machine
  CI/dev, **jamais dans l'artefact déployé**. Reachability runtime = **NON**.

Légende verdict : **NOT-REACHABLE** (hors artefact déployé, ou fonction vulnérable jamais
invoquée) · **REACHABLE-LOW** (package présent au runtime mais l'entrée vulnérable n'est
pas contrôlable par un attaquant / non exploitable dans le modèle Workers) ·
**REACHABLE** (exposition runtime réelle, correctif requis).

## 2. Synthèse reachability par package (high + moderate)

| Package                 | H   | M   | Chemin (pnpm why, tête)                                                         | Verdict                                                                                                | Fermé par snapshot ?                           | Owner               |
| ----------------------- | --- | --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------- |
| axios                   | 12  | 11  | `apps/server > twilio > axios`                                                  | **NOT-REACHABLE** — SDK npm `twilio` jamais importé (wrapper `fetch` maison)                           | non                                            | server              |
| dompurify               | 0   | 14  | `apps/mail > dompurify` (direct)                                                | **REACHABLE** — sanitisation HTML email                                                                | non                                            | mail                |
| minimatch               | 12  | 0   | eslint / @sentry-vite-plugin / @sentry/node / react-router glob                 | **NOT-REACHABLE** — ReDoS sur pattern glob non contrôlé par attaquant ; majorité build-time            | non                                            | mail (build)        |
| undici                  | 4   | 5   | `apps/server > cheerio > undici`                                                | **NOT-REACHABLE** — `cheerio.load(string)` + `cheerio/slim` ; chemin `fromURL()`/WS jamais emprunté    | non                                            | server              |
| tar                     | 6   | 1   | `apps/mail > @tailwindcss/vite > @tailwindcss/oxide > tar`                      | **NOT-REACHABLE** — Tailwind build-time ; pas de FS/extraction au runtime Workers                      | non                                            | mail (build)        |
| vite                    | 2   | 3   | `apps/mail > @react-router/dev > vite`                                          | **NOT-REACHABLE** — CVE dev-server/path uniquement en dev, pas en prod                                 | non                                            | mail (build)        |
| picomatch               | 2   | 2   | @sentry-vite-plugin/chokidar ; @react-router/dev>tinyglobby                     | **NOT-REACHABLE** — build-time                                                                         | non                                            | mail (build)        |
| agents                  | 0   | 3   | `apps/server > agents` ; `apps/mail > agents`                                   | **REACHABLE-LOW** — SDK utilisé ; CVE ciblent AI Playground/OAuth callback (surface dev)               | non                                            | server/mail         |
| lodash                  | 1   | 2   | `apps/mail > @react-router/dev > lodash`                                        | **NOT-REACHABLE** — dépendance du dev-server react-router, hors bundle client                          | non                                            | mail (build)        |
| lodash-es               | 1   | 2   | `apps/server > string-strip-html > lodash-es`                                   | **REACHABLE-LOW** — `stripHtml` utilisé (compose.ts) mais `_.template`/`_.unset`/`_.omit` non invoqués | non                                            | server              |
| @trpc/server            | 1   | 0   | `apps/mail > @trpc/server`                                                      | **NOT-REACHABLE** — CVE dans `experimental_nextAppDirCaller`, chemin absent du repo                    | non                                            | mail                |
| effect                  | 1   | 0   | `apps/server > effect` (direct)                                                 | **REACHABLE** — Effect/RPC est le cœur concurrence serveur                                             | non                                            | server              |
| defu                    | 1   | 0   | `apps/mail > better-auth > defu`                                                | **REACHABLE-LOW / GELÉ** — via better-auth 1.6.x intouchable ; clés internes non attaquables           | non (override RETIRÉ à dessein)                | orchestrateur (gel) |
| js-cookie               | 1   | 0   | `apps/mail > react-use > js-cookie` (**2.2.1**)                                 | **NOT-REACHABLE** — `react-use` importé uniquement en ligne commentée                                  | non (override `@3` ne vise pas la majeure 2.x) | mail                |
| qs                      | 0   | 2   | `apps/server > @googleapis/gmail > googleapis-common > qs`                      | **REACHABLE-LOW** — sérialise les query params fixes de l'app, pas d'entrée attaquant                  | non                                            | server              |
| ajv                     | 0   | 2   | eslint (build) ; `apps/server > @modelcontextprotocol/sdk > ajv`                | **REACHABLE-LOW** — ReDoS via `$data` sur schémas MCP internes                                         | non                                            | server              |
| brace-expansion         | 0   | 2   | eslint>minimatch ; @sentry/node>minimatch                                       | **NOT-REACHABLE** — patterns non contrôlés par attaquant                                               | non                                            | server (build)      |
| js-yaml                 | 0   | 2   | `apps/mail > eslint … > @eslint/eslintrc > js-yaml`                             | **NOT-REACHABLE** — parsing de config eslint, build-time                                               | non                                            | mail (build)        |
| markdown-it             | 0   | 2   | `apps/mail > @tiptap/pm > prosemirror-markdown > markdown-it`                   | **REACHABLE-LOW** — éditeur ; ReDoS sur markdown collé                                                 | non                                            | mail                |
| @isaacs/brace-expansion | 1   | 0   | `apps/mail > @sentry/react-router > glob > minimatch > @isaacs/brace-expansion` | **NOT-REACHABLE** — build/glob interne Sentry                                                          | non                                            | mail (build)        |
| @opentelemetry/core     | 0   | 1   | @sentry ; `apps/server > @microlabs/otel-cf-workers`                            | **REACHABLE-LOW** — baggage W3C ; requiert header malveillant ; DoS mémoire borné Workers              | non                                            | server (obs)        |
| esbuild                 | 0   | 1   | `. > drizzle-kit > @esbuild-kit > esbuild`                                      | **NOT-REACHABLE** — migrations drizzle, dev-time                                                       | non                                            | root (build)        |
| follow-redirects        | 0   | 1   | `apps/server > twilio > axios > follow-redirects`                               | **NOT-REACHABLE** — via axios/twilio non bundlé                                                        | non                                            | server              |
| glob                    | 1   | 0   | `apps/mail > @sentry/react-router > glob`                                       | **NOT-REACHABLE** — CVE = glob **CLI** `-c/--cmd`, jamais utilisé en API                               | non                                            | mail (build)        |
| jsondiffpatch           | 0   | 1   | `apps/mail > ai > jsondiffpatch`                                                | **NOT-REACHABLE** — XSS via `HtmlFormatter`, non utilisé par l'AI SDK                                  | non                                            | mail                |
| mdast-util-to-hast      | 0   | 1   | `apps/mail > novel > react-markdown > mdast-util-to-hast`                       | **REACHABLE-LOW** — rendu markdown ; classe non sanitisée                                              | non                                            | mail                |
| postcss                 | 0   | 1   | `apps/mail > @react-router/dev > vite > postcss`                                | **NOT-REACHABLE** — build-time CSS                                                                     | non                                            | mail (build)        |
| rollup                  | 1   | 0   | `apps/mail > @react-router/dev > vite > rollup`                                 | **NOT-REACHABLE** — écriture fichier via bundler, build-time                                           | non                                            | mail (build)        |
| uuid                    | 0   | 1   | `apps/server > uuid` ; via googleapis                                           | **REACHABLE-LOW** — CVE seulement si param `buf` fourni à v3/v5/v6                                     | non                                            | server              |
| wrangler                | 1   | 0   | `apps/server > wrangler`                                                        | **NOT-REACHABLE** — CVE = `wrangler pages deploy` (CLI CI/dev), hors runtime                           | non                                            | server (CI)         |
| yaml                    | 0   | 1   | `apps/mail > @react-router/dev > vite > yaml`                                   | **NOT-REACHABLE** — build-time                                                                         | non                                            | mail (build)        |

**Aucun** des advisories résiduels n'est fermé par les 11 overrides du snapshot : le
snapshot a fermé un ensemble **disjoint** (§5). Les résiduels REACHABLE/REACHABLE-LOW
demandent des bumps **hors périmètre -03** (owners ci-dessus) → arbitrage orchestrateur,
pas d'action builder.

## 3. Entrées détaillées — high + moderate (une par advisory, regroupées par package)

La reachability est une propriété du **package** (chemin + usage) : elle est partagée par
tous ses advisories, listés individuellement ci-dessous.

### axios (12H + 11M) — NOT-REACHABLE

Chemin : `apps/server > twilio@5.7.0 > axios`. **Le SDK npm `twilio` n'est jamais
importé** (`grep 'from \"twilio\"'` = ∅) ; `apps/server/src/lib/services.ts` implémente un
wrapper `fetch()` maison vers `https://api.twilio.com/.../Messages.json`. Aucun
`import axios` direct non plus. → axios est tree-shaké hors du bundle Worker. Toutes les
CVE (SSRF/no_proxy bypass, prototype-pollution proxy MITM, ReDoS, credential leak) sont
**inatteignables**. Recommandation owner (hors -03) : retirer la dépendance `twilio`
inutilisée. Advisories : GHSA-4hjh-wcwx-xvwj, GHSA-pmwg-cvhr-8vh7, GHSA-pf86-5x62-jrwf,
GHSA-6chq-wfr3-2hj9, GHSA-43fc-jf86-j433, GHSA-q8qp-cvcw-x6jj, GHSA-hfxv-24rg-xrqf,
GHSA-777c-7fjr-54vf, GHSA-p92q-9vqr-4j8v, GHSA-j5f8-grm9-p9fc, GHSA-3g43-6gmg-66jw,
GHSA-35jp-ww65-95wh (12H) · GHSA-3p68-rc4w-qgx5, GHSA-w9j2-pvgh-6h63, GHSA-3w6x-2g7m-8v23,
GHSA-445q-vr5w-6q77, GHSA-m7pr-hjqh-92cm, GHSA-5c9x-8gcm-mpgx, GHSA-vf2m-468p-8v99,
GHSA-xx6v-rp6x-q39c, GHSA-fvcv-3m26-pcqx, GHSA-62hf-57xw-28j9, GHSA-898c-q2cr-xwhg (11M).

### dompurify (14M) — REACHABLE

Chemin : `apps/mail > dompurify` (dépendance directe). **Utilisé** dans
`apps/mail/lib/email-utils.ts` et `apps/mail/components/ui/bimi-avatar.tsx` — sanitisation
d'HTML d'email côté client, chemin cœur d'un client mail. Les 14 moderates sont des
bypass mutation-XSS / pollution de config / IN_PLACE. **Atteignable et pertinent.**
Mitigation : bump `dompurify` ≥ 3.4.11 (dernière version corrigeant l'ensemble, dont
GHSA-cmwh-pvxp-8882). **Hors snapshot** → owner **mail**, item ouvert prioritaire.
Advisories : GHSA-v8jm-5vwx-cfxm, GHSA-v2wj-7wpq-c8vv, GHSA-cjmm-f4jc-qw8r,
GHSA-cj63-jhhr-wcxv, GHSA-39q2-94rc-95cp, GHSA-h7mw-gpvr-xq4m, GHSA-crv5-9vww-q3g8,
GHSA-v9jr-rg53-9pgp, GHSA-h8r8-wccr-v5f2, GHSA-76mc-f452-cxcm, GHSA-hpcv-96wg-7vj8,
GHSA-r47g-fvhr-h676, GHSA-rp9w-3fw7-7cwq, GHSA-cmwh-pvxp-8882.

### minimatch (12H) — NOT-REACHABLE

Chemins : `eslint-plugin-react-hooks > eslint > minimatch` (lint/build) ;
`@sentry/vite-plugin > … > glob > minimatch` (build) ; `@sentry/node > minimatch` et
`@sentry/react-router > glob > minimatch` (matching de chemins de config Sentry, non
attaquant). Les 3 CVE (GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74)
sont des ReDoS déclenchés par un **pattern glob** ; aucune entrée attaquant ne pilote de
pattern glob au runtime. Majorité des chemins = build-time.

### undici (4H + 5M) — NOT-REACHABLE

Chemin : `apps/server > cheerio > undici`. Le code utilise `cheerio.load(string)`
(`apps/server/src/lib/email-processor.ts`, `thread-workflow-utils/workflow-utils.ts`) et
importe `cheerio/slim` (`apps/server/src/lib/mail-sanitize/index.ts`). **Le chemin
`cheerio.fromURL()` — seul à embarquer le client fetch/WebSocket d'undici — n'est jamais
emprunté**, et `cheerio/slim` exclut carrément ce sous-système. Les CVE undici (WebSocket
overflow/DoS, HTTP smuggling, Set-Cookie) portent sur le client HTTP/WS **non instancié**.
Advisories : GHSA-f269-vfmq-vjvj, GHSA-vrm6-8vpv-qv8q, GHSA-v9p9-hfj2-hcw8,
GHSA-vxpw-j846-p89q (4H) · GHSA-g9mf-h72j-4rw9, GHSA-2mjp-6q6p-2qxm, GHSA-4992-7rv2-5pvq,
GHSA-p88m-4jfj-68fv, GHSA-pr7r-676h-xcf6 (5M).

### tar (6H + 1M) — NOT-REACHABLE

Chemin : `apps/mail > @tailwindcss/vite > @tailwindcss/oxide > tar`. Tailwind Oxide
n'extrait des archives qu'au **build CSS**. Les CVE (path traversal / hardlink / symlink
poisoning à l'extraction) exigent un FS et une extraction d'archive attaquant, **absents
du runtime Workers** et du bundle client. Advisories : GHSA-34x7-hfp2-rc4v,
GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, GHSA-qffp-2rhf-9h96, GHSA-9ppj-qmqm-q256,
GHSA-r6q2-hw4h-h46w (6H) · GHSA-vmf3-w455-68vh (1M).

### vite (2H + 3M) — NOT-REACHABLE (prod)

Chemin : `apps/mail > @react-router/dev > vite`. CVE = arbitrary file read via **dev
server** WebSocket, `server.fs.deny` bypass, path traversal `.map`, launch-editor NTLM —
toutes conditionnées au **serveur de dev Vite** exposé, jamais en prod (SPA statique).
Advisories : GHSA-p9ff-h696-f583, GHSA-fx2h-pf6j-xcff (2H) · GHSA-93m4-6634-74q7,
GHSA-4w7w-66w2-5vf9, GHSA-v6wh-96g9-6wx3 (3M).

### picomatch (2H + 2M) — NOT-REACHABLE

Chemins : `@sentry/vite-plugin > unplugin > chokidar > anymatch > picomatch` ;
`@react-router/dev > tinyglobby > picomatch`. Build/watch-time. ReDoS/method-injection
sur globs non attaquants. GHSA-c2c7-rcm5-vvqj (2H) · GHSA-3v7f-55p6-f55p (2M).

### agents (3M) — REACHABLE-LOW

Chemins : `apps/server > agents` (`routes/agent/mcp.ts`, `chat-agent.ts`) ;
`apps/mail > agents` (`ai-sidebar.tsx`, `ai-chat.tsx`). SDK Cloudflare Agents réellement
utilisé. Les CVE ciblent (a) IDOR via routing email par header et (b) XSS réfléchi dans
le **callback OAuth de l'AI Playground** — surface de démo non nécessairement exposée par
Zero. Mitigation : bump `agents` ≥ 0.3.10. Hors snapshot → owner server/mail.
GHSA-r7x9-8ph7-w8cg, GHSA-cvhv-6xm6-c3v4, GHSA-w5cr-2qhr-jqc5.

### lodash (1H + 2M) — NOT-REACHABLE / lodash-es (1H + 2M) — REACHABLE-LOW

`lodash` : `apps/mail > @react-router/dev > lodash` = dev-server react-router, hors bundle
client → NOT-REACHABLE. `lodash-es` : `apps/server > string-strip-html > lodash-es` ;
`stripHtml` **est** appelé (`apps/server/src/trpc/routes/ai/compose.ts` sur le body
d'email). Mais la CVE high (GHSA-r5fr-rjxr-66jc, code injection via `_.template`) et les
moderates (GHSA-f23m-r3pf-42rh, GHSA-xxjr-mmjv-4gpg, pollution via `_.unset`/`_.omit`)
portent sur des fonctions que `string-strip-html` **n'invoque pas** → REACHABLE-LOW.
Mitigation (owner server) : bump transitif lodash-es ≥ 4.18.0 quand string-strip-html le
permettra ; hors snapshot.

### @trpc/server (1H) — NOT-REACHABLE

Chemin : `apps/mail > @trpc/server`. GHSA-43p4-m455-4f4j = prototype pollution dans
`experimental_nextAppDirCaller` (adaptateur Next app-dir). `grep` du repo :
**aucune occurrence** de `experimental_nextAppDirCaller` — Zero est React Router/Workers,
pas Next. Chemin vulnérable absent.

### effect (1H) — REACHABLE

Chemin : `apps/server > effect` (direct). Effect est utilisé massivement côté serveur
(`pipelines.ts`, `thread-workflow-utils/`, `lib/auth.ts`, `routes/agent/*`, RPC).
GHSA-38f7-945m-qr2g : contamination du contexte `AsyncLocalStorage` entre fibers sous
charge RPC concurrente — **atteignable** dans le modèle de concurrence serveur.
Mitigation (owner server) : bump `effect` ≥ 3.20.0. Hors snapshot.

### defu (1H) — REACHABLE-LOW / GELÉ

Chemin : `apps/mail > better-auth > defu`. GHSA-737v-mqg7-c878 : prototype pollution via
`__proto__` dans l'argument `defaults`. Les objets fusionnés par better-auth sont sa
config interne, non pilotée par un attaquant → REACHABLE-LOW. **L'override defu 6.1.7 a
été RETIRÉ par le -02 à dessein** : `defu` vit dans l'arbre `better-auth` **gelé 1.6.x**
(résolu **1.6.23**) ; forcer defu ≥ 6.1.5 churnait better-auth, ce que le gel interdit.
Diagnostic à préserver. Owner : **orchestrateur** (arbitrage gel better-auth).

### qs (2M) — REACHABLE-LOW

Chemin : `apps/server > @googleapis/gmail > googleapis-common > qs`. googleapis est
utilisé (driver Gmail) ; `qs` sérialise les query params **fixes** de l'app vers l'API
Google, pas d'entrée attaquant. GHSA-6rw7-vpxm-498p, GHSA-q8mj-m7cp-5q26. Owner server.

### ajv (2M) — REACHABLE-LOW

Chemins : eslint (build) ; `apps/server > @modelcontextprotocol/sdk > ajv`. ReDoS via
option `$data` sur schémas MCP internes. GHSA-2g4f-4pwh-qvx6 (×2 lignes 6.x/8.x). Owner
server.

### brace-expansion (2M) — NOT-REACHABLE

Chemins : `eslint > minimatch > brace-expansion` (build) ; `@sentry/node > minimatch >
brace-expansion` (non attaquant). GHSA-f886-m6hf-6m8v (×2).

### js-yaml (2M) — NOT-REACHABLE

Chemin : `apps/mail > eslint … > @eslint/eslintrc > js-yaml`. Parsing de config eslint,
build-time. GHSA-mh29-5h37-fv8m, GHSA-h67p-54hq-rp68.

### markdown-it (2M) — REACHABLE-LOW

Chemin : `apps/mail > @tiptap/pm > prosemirror-markdown > markdown-it`. Éditeur tiptap ;
ReDoS/quadratique sur markdown collé par l'utilisateur (auto-DoS local, pas serveur).
GHSA-38c4-r59v-3vqw, GHSA-6v5v-wf23-fmfq. Owner mail.

### @isaacs/brace-expansion (1H) — NOT-REACHABLE

Chemin : `apps/mail > @sentry/react-router > glob > minimatch > @isaacs/brace-expansion`.
Glob interne Sentry, build. GHSA-7h2j-956f-4vf2.

### @opentelemetry/core (1M) — REACHABLE-LOW

Chemins : `@sentry/react-router > @opentelemetry/core` ; `apps/server >
@microlabs/otel-cf-workers > @opentelemetry/core`. GHSA-8988-4f7v-96qf : allocation
mémoire non bornée sur propagation baggage W3C — requiert un header baggage malveillant ;
DoS mémoire borné par les limites Workers. Owner server/observabilité.

### esbuild (1M) — NOT-REACHABLE

Chemin : `. > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`.
Migrations drizzle, dev-time. GHSA-67mh-4wv8-2f99 (dev server).

### follow-redirects (1M) — NOT-REACHABLE

Chemin : `apps/server > twilio > axios > follow-redirects`. Via axios/twilio non bundlé
(cf. axios). GHSA-r4q5-vmmm-2653.

### glob (1H) — NOT-REACHABLE

Chemin : `apps/mail > @sentry/react-router > glob`. GHSA-5j98-mcp5-4vw2 = injection de
commande via le **CLI** `glob -c/--cmd` ; l'API programmatique n'expose pas ce vecteur.

### jsondiffpatch (1M) — NOT-REACHABLE

Chemin : `apps/mail > ai > jsondiffpatch`. GHSA-33vc-wfww-vjfv = XSS via `HtmlFormatter`,
formateur HTML non utilisé par l'AI SDK (diff seul).

### mdast-util-to-hast (1M) — REACHABLE-LOW

Chemin : `apps/mail > novel > react-markdown > mdast-util-to-hast`. Rendu markdown ;
attribut `class` non sanitisé (GHSA-4fh9-h7wg-q85m). Owner mail.

### postcss (1M) — NOT-REACHABLE

Chemin : `apps/mail > @react-router/dev > vite > postcss`. Build CSS. GHSA-qx2v-qp2m-jg93.

### rollup (1H) — NOT-REACHABLE

Chemin : `apps/mail > @react-router/dev > vite > rollup`. GHSA-mw96-cpmx-2vgc = écriture
fichier via path traversal au **bundling**, build-time.

### uuid (1M) — REACHABLE-LOW

Chemins : `apps/server > uuid` ; `apps/server > @googleapis/gmail > googleapis-common >
uuid`. GHSA-w5hq-g745-h8pq = bounds check manquant en v3/v5/v6 **si `buf` fourni** ;
usage courant `uuid()` sans buf. Owner server.

### wrangler (1H) — NOT-REACHABLE (runtime)

Chemin : `apps/server > wrangler`. GHSA-36p8-mvp6-cv38 = OS command injection dans
`wrangler pages deploy` — **CLI exécuté en CI/dev**, hors artefact Worker déployé.
Pertinent supply-chain CI, pas runtime.

### yaml (1M) — NOT-REACHABLE

Chemin : `apps/mail > @react-router/dev > vite > yaml`. Build-time. GHSA-48c2-rrv3-qjmp.

## 4. Entrée dédiée — js-cookie@2.2.1 (ligne NON couverte par l'override `@3`)

- **Package / version** : `js-cookie@2.2.1`.
- **Chemin** : `apps/mail > react-use@^17.6.0 > js-cookie@2.2.1`.
- **Advisory** : GHSA-qjx8-664m-686j (CVE-2026-46625, **high**) — prototype hijack
  per-instance dans `assign()` permettant l'injection d'attributs de cookie.
  Note : `vuln <=3.0.5`, mais la ligne **2.2.1** est également < 3.0.7 et donc concernée.
- **Pourquoi l'override `js-cookie@3 → 3.0.8` ne la ferme pas** : l'override est scopé à la
  **majeure 3.x** (`js-cookie@3`). La ligne `react-use` épingle la **majeure 2.x** ;
  aucun bump majeur n'est autorisé (règle de gel), donc 2.2.1 reste hors périmètre du
  snapshot — c'est le ⚠ signalé par l'audit orchestrateur.
- **Reachability** : **NOT-REACHABLE**. `react-use` est déclaré dans `apps/mail/package.json`
  mais son **unique référence dans le code est commentée** :
  `apps/mail/components/responsive-modal.tsx:11: // import { useMedia } from 'react-use';`.
  Aucun hook `react-use` (dont le cookie hook) n'est instancié → js-cookie 2.2.1 est
  tree-shaké hors du bundle client.
- **Mitigation / owner** : owner **mail**. Option la plus propre (hors -03) : **retirer la
  dépendance `react-use` inutilisée**, ce qui élimine la ligne 2.2.1 sans bump majeur.
  À défaut, l'exposition reste nulle tant que `react-use` n'est pas importé.

## 5. Mapping advisory→override — 11 overrides du snapshot (preuve mesurée)

Mesure directe **AVANT→APRÈS** (`.architect/tmp/diff-before-after.txt`) : **21 advisories
fermés, 0 régression**. Détail par override :

| #   | Override (snapshot)                                    | Résolu au gel | Advisory(s) fermé(s) — preuve mesurée                                                                                                                                                                                                                             | Verdict                                                                                                                          |
| --- | ------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **protobufjs 7.6.5** (bump ← 7.5.5, override baseline) | 7.5.5         | **10** : GHSA-66ff-xgx4-vchm (H), GHSA-75px-5xx7-5xc7 (H), GHSA-jvwf-75h9-cwgg (H), GHSA-685m-2w69-288q (H), GHSA-wcpc-wj8m-hjx6 (H), GHSA-2pr8-phx7-x9h3 (M), GHSA-fx83-v9x8-x52w (M), GHSA-q6x5-8v7m-xcrf (M), GHSA-jggg-4jg4-v7c6 (M), GHSA-f38q-mgvj-vph7 (M) | **FERME** (patchés 7.5.6→7.6.3, couverts par 7.6.5)                                                                              |
| 2   | **fast-uri 3.1.3**                                     | 3.0.6         | **2** : GHSA-q3j6-qgpj-74h6 (H, patché 3.1.1), GHSA-v39h-62p7-jpjc (H, patché 3.1.2)                                                                                                                                                                              | **FERME**                                                                                                                        |
| 3   | **path-to-regexp@8 8.4.2**                             | 8.2.0         | **2** : GHSA-j3q9-mxjg-w52f (H), GHSA-27v5-c462-wpq7 (M) — patchés 8.4.0                                                                                                                                                                                          | **FERME**                                                                                                                        |
| 4   | **jws@4 4.0.1**                                        | 4.0.0         | **0** — aucun advisory sur la ligne 4.x                                                                                                                                                                                                                           | **NE FERME RIEN — SIGNALEMENT** (patch défensif ; NE PAS retirer, décision propriétaire)                                         |
| 5   | **jws@3 3.2.3** (AJOUT -02)                            | 3.2.2         | **1** : GHSA-869p-cjfg-cm3x (H) — auth0/node-jws vérifie mal la signature HMAC (patché 3.2.3)                                                                                                                                                                     | **FERME** — couvre la ligne 3.x manquée par le -01 (advisory de sécurité **auth**, notable)                                      |
| 6   | **flatted 3.4.2**                                      | 3.3.3         | **2** : GHSA-25h7-pfq9-p65f (H, patché 3.4.0), GHSA-rf6f-7fwh-wjgh (H, prototype pollution, patché 3.4.2)                                                                                                                                                         | **FERME**                                                                                                                        |
| 7   | **preact 10.29.7**                                     | 10.26.9       | **1** : GHSA-36hm-qxxp-pg3m (H, JSON VNode Injection, patché 10.26.10)                                                                                                                                                                                            | **FERME**                                                                                                                        |
| 8   | **linkifyjs 4.3.3**                                    | 4.3.1         | **1** : GHSA-95jq-xph2-cx9h (H, prototype pollution + HTML attr injection, patché 4.3.2)                                                                                                                                                                          | **FERME**                                                                                                                        |
| 9   | **linkify-it 5.0.2**                                   | 5.0.0         | **1** : GHSA-22p9-wv53-3rq4 (H, complexité quadratique, patché 5.0.1)                                                                                                                                                                                             | **FERME**                                                                                                                        |
| 10  | **js-cookie@3 3.0.8**                                  | 3.0.5         | **0** — aucun advisory sur la ligne 3.x résiduel (la 2.2.1 est hors scope `@3`)                                                                                                                                                                                   | **NE FERME RIEN de mesurable — SIGNALEMENT** (patch défensif 3.0.5→3.0.8 ; la CVE js-cookie subsiste sur la ligne 2.2.1, cf. §4) |
| 11  | **tar-fs 2.1.5**                                       | 2.1.3         | **1** : GHSA-vj76-c3g6-qr5v (H, symlink validation bypass, patché 2.1.4)                                                                                                                                                                                          | **FERME**                                                                                                                        |

**Total mesuré fermé** : 10+2+2+0+1+2+1+1+1+0+1 = **21 advisories** (15 high, 6 moderate),
cohérent au bit près avec le diff AVANT→APRÈS. **9 overrides ferment effectivement**,
**2 sont des patchs défensifs qui ne ferment aucun advisory mesurable** (jws@4, js-cookie@3)
— **signalés, non retirés** (décision propriétaire orchestrateur, conforme au mandat -03).
Note contextuelle : le **retrait** de l'override defu (par le -02) laisse subsister
GHSA-737v-mqg7-c878 (defu, high) — REACHABLE-LOW, gelé better-auth 1.6.x (cf. §3).

## 6. Lows (tableau compact — 13)

| Package                | Advisory            | Chemin (tête)                             | Reachability                       |
| ---------------------- | ------------------- | ----------------------------------------- | ---------------------------------- |
| dompurify              | GHSA-x4vx-rjvf-j5p4 | apps/mail > dompurify                     | REACHABLE (avec les 14 M)          |
| dompurify              | GHSA-vxr8-fq34-vvx9 | apps/mail > dompurify                     | REACHABLE                          |
| dompurify              | GHSA-gvmj-g25r-r7wr | apps/mail > dompurify                     | REACHABLE                          |
| undici                 | GHSA-35p6-xmwp-9g52 | apps/server > cheerio > undici            | NOT-REACHABLE (cheerio/slim, load) |
| undici                 | GHSA-g8m3-5g58-fq7m | apps/server > cheerio > undici            | NOT-REACHABLE                      |
| vite                   | GHSA-g4jq-h2w9-997c | apps/mail > @react-router/dev > vite      | NOT-REACHABLE (dev-server)         |
| vite                   | GHSA-jqfw-vq24-v9c3 | apps/mail > @react-router/dev > vite      | NOT-REACHABLE (dev-server)         |
| axios                  | GHSA-xhjh-pmcv-23jw | apps/server > twilio > axios              | NOT-REACHABLE (twilio non importé) |
| qs                     | GHSA-w7fw-mjwx-w883 | apps/server > …googleapis-common > qs     | REACHABLE-LOW (params fixes)       |
| @ai-sdk/provider-utils | GHSA-866g-f22w-33x8 | apps/mail > ai > @ai-sdk/provider-utils   | REACHABLE-LOW (AI SDK)             |
| ai                     | GHSA-rwvc-j5jr-mgvh | apps/mail > ai                            | REACHABLE-LOW (upload filetype)    |
| @babel/core            | GHSA-4x5r-pxfx-6jf8 | apps/mail > … > @babel/core               | NOT-REACHABLE (build-time)         |
| @eslint/plugin-kit     | GHSA-xffm-g5w8-qvg7 | apps/mail > eslint … > @eslint/plugin-kit | NOT-REACHABLE (lint)               |

## 7. Conclusion de triage

- Le snapshot -02 ferme **21 advisories high/moderate mesurés** (§5), sans régression.
- Sur les résiduels : la **quasi-totalité des 48 high** est **NOT-REACHABLE** (tooling
  build/dev, ou fonction vulnérable non invoquée : axios/twilio, undici/cheerio,
  minimatch/tar/vite/rollup/glob/wrangler build-time, @trpc nextAppDir absent).
- **Items runtime réellement ouverts** (hors périmètre -03, bumps à arbitrer par owners) :
  **dompurify** (mail, REACHABLE — prioritaire), **effect** (server, REACHABLE),
  **agents** (server/mail, REACHABLE-LOW), + une longue traîne REACHABLE-LOW
  (lodash-es, qs, ajv, markdown-it, mdast-util-to-hast, uuid, @opentelemetry/core).
- **defu** (high, gelé better-auth 1.6.x) et **js-cookie@2.2.1** (non atteignable,
  react-use commenté) : documentés, sans action possible sous le mandat -03.
- **Aucune** de ces observations n'autorise un nouveau bump/override/retrait par -03.
