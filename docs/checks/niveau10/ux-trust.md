# Check — ux-trust

Executor: bash

Spec: `docs/spec/niveau10-mailos.md` section 5 et critères responsive/accessibilité.

## RUN

- RUN: `pnpm --filter @zero/mail exec vitest run components/mail/ux-trust.test.tsx components/mail/mail-list-thread.test.ts components/queue/queue-review.test.tsx` -> exit 0
- RUN: `pnpm --filter @zero/mail exec eslint components/mail components/queue app/root.tsx app/'(routes)'/settings/shortcuts` -> exit 0
- RUN: `pnpm --filter @zero/server types && pnpm --filter @zero/mail types && pnpm --filter @zero/mail exec react-router typegen && TYPECHECK_BLOCKING=1 node scripts/checks/typecheck-report.mjs` -> server 0 et mail 0
- RUN: `pnpm --filter @zero/mail exec react-router typegen && pnpm --filter @zero/mail build` -> exit 0
- RUN: `git status --porcelain | sed 's/^...//' | awk '!/^(apps\/mail\/(app\/root\.tsx|components\/mail\/.*|components\/queue\/.*|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/.*)|docs\/jobs\/niveau10\/ux-trust-01\.md)$/ {print; bad=1} END {exit bad}'` -> aucune sortie ; touch-set respecté
- RUN: `git diff -U0 -- apps/mail | grep -E '^\+.*transition-all' && exit 1 || exit 0` -> aucune transition-all ajoutée (diff uniquement)
- RUN: `git diff --check` -> exit 0

## ACCEPTANCE

1. Mail list, thread body et composer affichent un feedback dimensionnellement stable en
   <100 ms ; aucune zone blanche >100 ms ; 500/offline mène à erreur finie + retry.
2. Composer fluide à 390×844, 768×1024 et 1440×900, sans overflow ; safe-area et actions
   sticky mobile ; Tab parcourt To→Cc/Bcc→Subject→Body→actions.
3. Autosave distingue local/serveur/échec-retry ; une erreur ne marque jamais le brouillon
   sauvegardé et un reload restaure corps, sujet et destinataires sans perte silencieuse.
4. Ligne inbox sémantique et nom accessible ; actions visibles au focus, cibles tactiles,
   contraste AA et aucune commande invisible dans le tab order.
5. Queue : `j/k`, flèches, Enter/Space agissent sur la sélection ; pending par item ; une
   mutation ne bloque pas les autres ; 390 px sans overflow ; IDs derrière détails.
6. Aucun `transition-all` ajouté ; tokens/primitives existants, `tabular-nums` pour
   compteurs, reduced-motion respecté et Geist conservé.
7. JUDGE-ONLY navigateur authentifié : CLS <0,05, feedback visible <100 ms, Axe sans
   violation critique et captures aux trois viewports.
8. Le builder ne modifie pas le hot path serveur, la spec ou les checks et ne commit/push
   rien.
