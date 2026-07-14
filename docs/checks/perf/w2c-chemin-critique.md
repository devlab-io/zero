# Frozen checks — perf / w2c-chemin-critique

Executor: bash (cwd = racine du worktree)
Spec pointer: docs/spec/perf-9sur10.md (axes 1, 2) + revue docs/research/revue-perf-ux.md (W2-C) ; constats détaillés : revue-perf-bundle.md constats 2, 4, 5, 6, 7, 8, 11
Run: perf · Slice: w2c-chemin-critique
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baselines au gel (tree factory/perf, 94f05128, build du 2026-07-12) :
- Shell : 45 chunks modulepreload/entry référencés par `build/client/index.html`, **341 kB gz** au total.
- Imports statiques : `@sentry/react` (app/root.tsx:24, app/instrument.ts:1), posthog (app/providers/client-providers.tsx:5,28), framer-motion dans le shell (chunk proxy, signature `transformPagePoint`).
- `react-router.config.ts:10` : `prerender: ['/manifest.webmanifest']` seulement ; `ssr:false`.
- Locales : 19 fichiers dans `apps/mail/messages/`.
- tsc apps/mail = 86 erreurs préexistantes.

## Runnable checks

- RUN: `cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/w2c-build.log 2>&1; echo "build exit: $?"` -> expected output `build exit: 0`
- RUN: `cd apps/mail && F=build/client/__spa-fallback.html; [ -f "$F" ] || F=build/client/index.html; grep -o 'assets/[A-Za-z0-9._-]*\.js' "$F" | sort -u | while read f; do gzip -9 -c "build/client/$f" | wc -c; done | awk '{s+=$1} END {printf "%d\n", s/1024}'` -> expected: <= 210 (shell SPA ≤ 210 kB gz, vs 341 au gel)
- RUN: `cd apps/mail && F=build/client/__spa-fallback.html; [ -f "$F" ] || F=build/client/index.html; c=0; for f in $(grep -o 'assets/[A-Za-z0-9._-]*\.js' "$F" | sort -u); do grep -lqE "posthog|sentry-trace|transformPagePoint" "build/client/$f" && c=$((c+1)); done; echo $c` -> expected output `0` (ni PostHog, ni Sentry, ni framer-motion dans les chunks du shell)
- RUN: `ls apps/mail/messages/*.json | wc -l | tr -d ' '` -> expected output `2` (fr + en uniquement)
- RUN: `grep -c "'/'" apps/mail/react-router.config.ts` -> expected: >= 1 (la landing `/` est dans prerender)
- RUN: `grep -rl "AI Powered Email" apps/mail/build/client --include="*.html" | wc -l | tr -d ' '` -> expected: >= 1 (HTML prerendu de la landing réellement émis)
- RUN: `cd apps/mail && grep -l "Could not find the language" build/client/assets/*.js | wc -l | tr -d ' '` -> expected output `1` (highlight.js mutualisé dans un seul chunk lazy, plus dupliqué)
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 86 && echo TSC_MAIL_OK` -> expected output `TSC_MAIL_OK`
- RUN: `git status --porcelain -- apps/server apps/mail/public docs/checks packages | wc -l | tr -d ' '` -> expected output `0` (client build/config uniquement ; les médias sont le périmètre de w2d)

## Judge-only checks (orchestrator-graded)

- En serve local : landing `/`, `/login` et l'inbox montent sans erreur
  console ; un deep-link direct vers `/mail` fonctionne malgré le prerender de
  `/` (fallback SPA correct — contrainte d'intégration n°5 du spec).
- PostHog et Sentry restent fonctionnels **quand** leur clé/DSN est présent :
  import dynamique conditionnel post-hydratation, pas une suppression.
- Les animations de la landing restent visuellement acceptables (framer lazy
  ou remplacé par du CSS — pas d'éléments cassés/invisibles à l'arrivée).
- La réduction du shell vient de vrais leviers (imports dynamiques,
  manualChunks, locales) — pas d'exclusion de fonctionnalité du build.
- Le chunk d'ouverture d'inbox ne contient plus `marked`/`highlight.js`
  (lecture du manifest/chunks) ; le rendu markdown/code des surfaces IA
  fonctionne toujours (lazy).
