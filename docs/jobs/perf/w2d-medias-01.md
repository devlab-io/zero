# Job report — perf / w2d-medias · builder 01

Worktree: `/Users/thomasverdenne/cc/zero/.claude/worktrees/agent-a3c300ec575589547`
Base: 7444411d (tip factory/perf au dispatch). Checks gelés : `docs/checks/perf/w2d-medias.md` (v2), lus intégralement avant tout code.

## PHASE 0 — plan et désaccords

Plan exécuté :
1. 3 GIFs onboarding → MP4 H.264 (scale 1280:-2 lanczos, CRF 28, preset veryslow, yuv420p, +faststart, sans audio) ; 3 PNGs onboarding → WebP 1316 px de large (2× la largeur d'affichage réelle : dialog `max-w-[690px]` − p-4 ≈ 658 css px, conteneur `aspect-video` + `object-cover`, onboarding.tsx). CRF 30/preset slow essayé d'abord (1768 kB) ; la marge budgétaire a permis CRF 28/veryslow pour la fidélité visuelle.
2. `components/onboarding.tsx` : 6 URLs `https://assets.0.email/*` → chemins locaux ; champ unique `video` (rendu via `<img>`) scindé en `video?`/`image?` typés explicitement (pour éviter des erreurs tsc d'union inférée) ; MP4 rendus en `<video autoPlay muted loop playsInline>` avec les mêmes classes (`object-cover`, crossfade opacity conservé).
3. `pricing-gradient.png` (1164×1605) → WebP 768 px (affiché `w-full` dans carte 384 css px) ; `nizzy.jpg` (1179×896) → WebP 256 px (affiché avatar 24×24 css px, attrs 250×250). Références mises à jour, originaux supprimés.

Désaccords / écarts constatés (preuves) :
- **Base du worktree erronée au dispatch** : worktree créé sur e7ca6f4d (merge factory/tartine), branche `worktree-agent-a3c300ec575589547` ; `docs/checks/perf/w2d-medias.md` absent du checkout ; `git merge-base --is-ancestor 7444411d HEAD` → NOT ancestor. Le commit 7444411d existe et est le tip de factory/perf. Correctif : arbre vérifié propre (`git status --porcelain` vide) puis `git reset --hard 7444411d`. Aucun commit créé.
- **`nizzy.jpg` : 1 référence réelle, pas 4.** Le prompt et la baseline (w2d-medias.md l.11) citent footer.tsx, login/page.tsx, contributors.tsx — ces fichiers ne contiennent que le handle `nizzyabi` (footer.tsx:152,162,172 ; contributors.tsx:62,75,78) et le placeholder `nizzy@0.email` (login/page.tsx:53), pas l'image. Seul `components/home/HomeContent.tsx:457` référençait `/nizzy.jpg`. Une seule mise à jour effectuée ; grep post-édit : 0 référence restante.
- Rien d'autre : checks gelés cohérents avec le prompt ; aucun autre fichier ne référence les 6 assets onboarding (grep sur *.tsx/*.ts/*.css/*.html/*.json hors node_modules).

## Commandes d'encodage (verbatim)

```bash
# PNGs onboarding → WebP (dans apps/mail/public/onboarding)
/opt/homebrew/bin/cwebp -q 80 -resize 1316 0 get-started.png -o get-started.webp
/opt/homebrew/bin/cwebp -q 80 -resize 1316 0 ready.png -o ready.webp
/opt/homebrew/bin/cwebp -q 80 -resize 1316 0 coming-soon.png -o coming-soon.webp

# GIFs → MP4 H.264 (essai 1 : CRF 30/slow, total 1768 kB ; final : CRF 28/veryslow)
for i in 1 2 3; do /opt/homebrew/bin/ffmpeg -y -v error -i step$i.gif \
  -vf "scale=1280:-2:flags=lanczos" -c:v libx264 -preset veryslow -crf 28 \
  -pix_fmt yuv420p -movflags +faststart -an step$i.mp4; done

# Lourds hors onboarding (dans apps/mail/public)
/opt/homebrew/bin/cwebp -q 80 -resize 768 0 pricing-gradient.png -o pricing-gradient.webp
/opt/homebrew/bin/cwebp -q 82 -resize 256 0 nizzy.jpg -o nizzy.webp
```

## Avant / après par fichier (octets)

| Fichier avant | Octets | Fichier après | Octets | Δ |
|---|---:|---|---:|---:|
| onboarding/step1.gif (1668×1080) | 19 068 596 | onboarding/step1.mp4 (1280×828, 22,2 s) | 994 908 | −94,8 % |
| onboarding/step2.gif (1704×1080) | 19 209 089 | onboarding/step2.mp4 (1280×812, 18,2 s) | 823 264 | −95,7 % |
| onboarding/step3.gif (1692×1080) | 10 393 413 | onboarding/step3.mp4 (1280×818, 16,3 s) | 503 924 | −95,2 % |
| onboarding/ready.png (2400×1350) | 5 516 064 | onboarding/ready.webp (1316×740) | 98 284 | −98,2 % |
| onboarding/get-started.png (2400×1350) | 1 425 538 | onboarding/get-started.webp (1316×740) | 45 660 | −96,8 % |
| onboarding/coming-soon.png (1920×1080) | 781 815 | onboarding/coming-soon.webp (1316×740) | 25 188 | −96,8 % |
| pricing-gradient.png (1164×1605) | 3 574 376 | pricing-gradient.webp (768×1059, alpha) | 269 876 | −92,4 % |
| nizzy.jpg (1179×896) | 753 723 | nizzy.webp (256×195) | 8 344 | −98,9 % |
| **Total** | **60 722 614** | | **2 769 448** | **−95,4 %** |

`du -sk apps/mail/public/onboarding` = **2596 kB** (cible ≤ 3072 kB).

## Sorties des RUN checks (verbatim, exécutées en une passe à la racine du worktree)

```
--- OBJ-1 ---
0
--- OBJ-2 ---
ONBOARDING_OK
--- OBJ-3 ---
0
--- OBJ-4 ---
0
--- OBJ-5 ---
build exit: 0
--- OBJ-6 ---
TSC_MAIL_OK
--- GARDE-1 ---
0
--- GARDE-2 ---
ICONS_NAMES_OK
--- GARDE-3 ---
ORPHANS_STILL_GONE
--- GARDE-4 ---
0
```

Commandes exactes = celles du fichier gelé, dans l'ordre (objectifs 1-6 puis gardes 1-4). tsc apps/mail = 86 erreurs exactement (comptage brut : `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `86`).

## Fichiers modifiés / supprimés / ajoutés (`git status --porcelain` avant écriture de ce rapport)

```
 M apps/mail/components/home/HomeContent.tsx
 M apps/mail/components/onboarding.tsx
 M apps/mail/components/pricing/pricing-card.tsx
 M apps/mail/components/ui/pricing-dialog.tsx
 D apps/mail/public/nizzy.jpg
 D apps/mail/public/onboarding/coming-soon.png
 D apps/mail/public/onboarding/get-started.png
 D apps/mail/public/onboarding/ready.png
 D apps/mail/public/onboarding/step1.gif
 D apps/mail/public/onboarding/step2.gif
 D apps/mail/public/onboarding/step3.gif
 D apps/mail/public/pricing-gradient.png
?? apps/mail/public/nizzy.webp
?? apps/mail/public/onboarding/coming-soon.webp
?? apps/mail/public/onboarding/get-started.webp
?? apps/mail/public/onboarding/ready.webp
?? apps/mail/public/onboarding/step1.mp4
?? apps/mail/public/onboarding/step2.mp4
?? apps/mail/public/onboarding/step3.mp4
?? apps/mail/public/pricing-gradient.webp
```

Plus ce rapport lui-même : `?? docs/jobs/perf/w2d-medias-01.md` (écrit après la capture ci-dessus). `uploaded-file-icon.tsx` : non modifié. `apps/server`, `packages`, `package.json`, `pnpm-lock.yaml`, `docs/checks` : intouchés (GARDE-4 = 0).

## Difficultés / oddities

1. **Worktree livré sur la mauvaise base** (e7ca6f4d au lieu de 7444411d) — voir PHASE 0. Réaligné par reset --hard sur arbre propre ; à corriger côté dispatch.
2. **node_modules absent du worktree** : premier `npx react-router build` → « could not determine executable to run ». Résolu par `pnpm install --frozen-lockfile` (exit 0, lockfile intouché). Le postinstall a créé un `.env` (gitignoré).
3. **Baseline tsc = 86 dépendante de fichiers générés gitignorés.** Worktree fraîchement installé : 96 erreurs — y compris SANS mes édits (vérifié par `git stash push` des 4 tsx → 96, puis pop). Mes édits contribuent 0 erreur. Le delta +10 : 7 erreurs `Cannot find module './+types/*'` (typegen react-router absent) + 3 erreurs liées au type global `Env` (déclaré par `apps/mail/worker-configuration.d.ts`, généré par wrangler, gitignoré, présent dans le checkout principal où la baseline a été mesurée — daté du 5 juil.). Reproduction de l'environnement de la baseline : `npx react-router typegen` (génère `.react-router/`, gitignoré) + copie du `apps/mail/worker-configuration.d.ts` du checkout principal (gitignoré). Résultat : 86 exactement, TSC_MAIL_OK. Aucun fichier suivi touché (GARDE-4 = 0). Recommandation pour les prochains gels : exprimer le check tsc en « erreurs hors fichiers générés » ou documenter la génération préalable requise.
4. **`nizzy.jpg` référencé 1 fois, pas 4** (baseline w2d-medias.md l.11 imprécise) — détail en PHASE 0.
5. Fidélité visuelle : frames extraites des MP4 (CRF 28) inspectées — texte des UI screencasts net à 1280 px. GIFs sources ~16,67 fps conservés. PSNR cwebp : pricing-gradient 40,6 dB, nizzy 42,0 dB.
