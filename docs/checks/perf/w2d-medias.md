# Frozen checks — perf / w2d-medias

Executor: bash (cwd = racine du worktree)
Spec pointer: docs/spec/perf-9sur10.md (axes 2, 10) + revue docs/research/revue-perf-ux.md (W2-D) ; constats détaillés : revue-perf-bundle.md constats 12-15
Run: perf · Slice: w2d-medias
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baselines au gel (tree factory/perf, 94f05128) :
- `public/onboarding/` : step1.gif 18,6 MB, step2.gif 18,8 MB, step3.gif 10,1 MB, ready.png 5,4 MB, get-started.png 1,4 MB, coming-soon.png 0,7 MB.
- `components/onboarding.tsx:15-25` référence le CDN upstream `https://assets.0.email/step*.gif` (dépendance externe morte à localiser).
- Icônes PJ `public/assets/attachment-icons/*.svg` : ~450 kB chacune (raster base64 embarqué).
- Orphelins vérifiés 0 référence : `public/purple-gradient.png` (8,5 MB), `public/homepage-image.png` (613 kB), `public/fonts/geist/` (9 TTF, 720 kB).
- Lourds référencés : `pricing-gradient.png` 3,5 MB (pricing-dialog.tsx, pricing-card.tsx), `nizzy.jpg` 736 kB (HomeContent.tsx, footer.tsx, login/page.tsx, contributors.tsx).
- tsc apps/mail = 86 erreurs préexistantes.

## Runnable checks

- RUN: `find apps/mail/public -type f -size +500k ! -path "*onboarding*" | wc -l | tr -d ' '` -> expected output `0` (plus aucun fichier public > 500 kB hors onboarding)
- RUN: `du -sk apps/mail/public/onboarding | awk '{print ($1<=3072)?"ONBOARDING_OK":"ONBOARDING_TOO_BIG_"$1"kB"}'` -> expected output `ONBOARDING_OK` (dossier onboarding ≤ 3 MB au total, vidéos comprises)
- RUN: `find apps/mail/public/onboarding -name "*.gif" | wc -l | tr -d ' '` -> expected output `0` (GIF → vidéo)
- RUN: `grep -c "assets.0.email" apps/mail/components/onboarding.tsx || true` -> expected output `0` (plus de dépendance au CDN upstream)
- RUN: `find apps/mail/public/assets/attachment-icons -type f -size +20k | wc -l | tr -d ' '` -> expected output `0` (vraies icônes vectorielles)
- RUN: `test ! -f apps/mail/public/purple-gradient.png && test ! -f apps/mail/public/homepage-image.png && test ! -d apps/mail/public/fonts/geist && echo ORPHANS_GONE` -> expected output `ORPHANS_GONE`
- RUN: `cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/w2d-build.log 2>&1; echo "build exit: $?"` -> expected output `build exit: 0`
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 86 && echo TSC_MAIL_OK` -> expected output `TSC_MAIL_OK`
- RUN: `git status --porcelain -- apps/server packages docs/checks | wc -l | tr -d ' '` -> expected output `0` (apps/mail uniquement)

## Judge-only checks (orchestrator-graded)

- Onboarding visuellement intact en serve local : vidéos en autoplay muet en
  boucle (équivalent du GIF), pas de zone vide ni de 404 réseau.
- Icônes de pièces jointes rendues correctement dans l'inbox (mêmes types
  couverts : pdf, word, csv, zip, audio, video, figma, powerpoint, html, file).
- Aucune référence cassée : chaque fichier supprimé ou renommé a 0 référence
  restante dans le source (`grep` des anciens noms) ; les composants
  référençant nizzy/pricing-gradient pointent vers les nouveaux formats.
- Les remplacements WebP/AVIF/vidéo restent visuellement fidèles (pas de
  compression destructrice visible, dimensions correctes).
