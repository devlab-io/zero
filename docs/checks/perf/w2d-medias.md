# Frozen checks — perf / w2d-medias · v2 (amendé post-stress-test + quick wins v0)

Executor: bash (cwd = racine du worktree)
Spec pointer: docs/spec/perf-9sur10.md (axes 2, 10) + revue docs/research/revue-perf-ux.md (W2-D) ; constats détaillés : revue-perf-bundle.md constats 12-15 ; amendements : docs/jobs/perf/stress-test-w2-checks.md (findings 1, 8, 9)
Run: perf · Slice: w2d-medias · Dispatch anticipé pré-approuvé (ruling Option 1 #7/#13 : « w2d avancé, surface disjointe, parallèle V0/V1 »)
Rule: any builder edit under docs/checks/ is an automatic FAIL.

Baselines au gel v2 (tree factory/perf, post 08ba4673 — quick wins v0 inclus) :
- `public/onboarding/` : step1.gif 18,6 MB, step2.gif 18,8 MB, step3.gif 10,1 MB, ready.png 5,4 MB, get-started.png 1,4 MB, coming-soon.png 0,76 MB.
- `components/onboarding.tsx` : **6 références** au CDN upstream mort `https://assets.0.email/*` (l.15-25).
- Lourds référencés : `pricing-gradient.png` 3,5 MB (pricing-dialog.tsx, pricing-card.tsx), `nizzy.jpg` 736 kB (HomeContent.tsx, footer.tsx, login/page.tsx, contributors.tsx).
- DÉJÀ TRAITÉ par quick wins v0 (5cb35016 + 0e83bfbb) : icônes PJ ≤ 2 kB, orphelins purple-gradient/homepage-image/fonts geist supprimés, locales 19→2 — les checks correspondants sont des GARDES anti-régression, pas des objectifs.
- Consommateur des icônes PJ : `components/create/uploaded-file-icon.tsx` (chemins en dur) — **noms de fichiers à préserver**.
- tsc apps/mail = 86 erreurs préexistantes. Outils dispo : ffmpeg 8.1.1, cwebp, gif2webp, avifenc (/opt/homebrew/bin).

## Runnable checks (objectifs)

- RUN: `find apps/mail/public -type f -size +500k ! -path "*onboarding*" | wc -l | tr -d ' '` -> expected output `0` (pricing-gradient et nizzy convertis/dimensionnés)
- RUN: `du -sk apps/mail/public/onboarding | awk '{print ($1<=3072)?"ONBOARDING_OK":"ONBOARDING_TOO_BIG_"$1"kB"}'` -> expected output `ONBOARDING_OK` (dossier ≤ 3 MB, vidéos comprises)
- RUN: `find apps/mail/public/onboarding -name "*.gif" | wc -l | tr -d ' '` -> expected output `0` (GIF → vidéo locale)
- RUN: `grep -c "assets.0.email" apps/mail/components/onboarding.tsx || true` -> expected output `0` (plus de dépendance au CDN upstream)
- RUN: `cd apps/mail && VITE_PUBLIC_BACKEND_URL="https://x.invalid" VITE_PUBLIC_APP_URL="https://x.invalid" npx react-router build > /tmp/w2d-build.log 2>&1; echo "build exit: $?"` -> expected output `build exit: 0`
- RUN: `test $(cd apps/mail && npx tsc --noEmit 2>&1 | grep -c "error TS") -le 86 && echo TSC_MAIL_OK` -> expected output `TSC_MAIL_OK`

## Runnable checks (gardes anti-régression, déjà verts au gel v2)

- RUN: `find apps/mail/public/assets/attachment-icons -type f -size +20k | wc -l | tr -d ' '` -> expected output `0`
- RUN: `ls apps/mail/public/assets/attachment-icons/pdf.svg apps/mail/public/assets/attachment-icons/word.svg apps/mail/public/assets/attachment-icons/csv.svg > /dev/null && echo ICONS_NAMES_OK` -> expected output `ICONS_NAMES_OK` (noms préservés — uploaded-file-icon.tsx les référence en dur)
- RUN: `test ! -f apps/mail/public/purple-gradient.png && test ! -f apps/mail/public/homepage-image.png && test ! -d apps/mail/public/fonts/geist && echo ORPHANS_STILL_GONE` -> expected output `ORPHANS_STILL_GONE`
- RUN: `git status --porcelain -- apps/server packages docs/checks package.json pnpm-lock.yaml | wc -l | tr -d ' '` -> expected output `0` (apps/mail uniquement ; lockfile racine intouché)

## Judge-only checks (orchestrator-graded)

- Onboarding visuellement intact en serve local : vidéos en autoplay muet en
  boucle (équivalent GIF), pas de zone vide ni de 404 réseau.
- Aucune référence cassée : chaque fichier supprimé/renommé a 0 référence
  restante dans le source ; les composants référençant nizzy/pricing-gradient
  pointent vers les nouveaux formats.
- Fidélité visuelle des remplacements (pas de compression destructrice
  visible, dimensions correctes).
- `uploaded-file-icon.tsx` non modifié OU modifié uniquement si un renommage
  d'icône l'exige (à éviter — préférer noms identiques).
