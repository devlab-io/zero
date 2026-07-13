# Stress-test décomposition vague 2 (perf) — handover vers niveau9

*Orchestrateur perf, 2026-07-12. Passage adversarial lecture-seule sur les checks
gelés `38bb5fc9` (w2a/w2c/w2d) AVANT dispatch — dispatch finalement annulé
(ruling Option 1 : absorption par niveau9, cf. #7/#13). Ces corrections sont à
appliquer au re-gel `freeze/niveau9-v2` : **ne pas adopter les checks « tels
quels »**.*

## Bloquants (FALSIFIED — à corriger au re-gel)

1. **Dérive de baseline** : les « Baselines au gel » des 3 fichiers de checks
   décrivent l'état `94f05128`, mais le freeze SHA est `38bb5fc9` — entre les
   deux, les quick wins v0 (locales 19→2, orphelins, icônes) sont entrés dans
   l'arbre (interleaving 0e83bfbb/5cb35016, deux sessions dans un checkout).
   → Re-snapshoter toutes les baselines contre le tip mergé par niveau9.
2. **w2c check « locales == 2 » MORT** : déjà vert au gel (quick wins v0).
   Le point « locales 19→2 » du travail w2c est déjà accompli. → Retirer.
3. **w2c check « hljs dans exactement 1 chunk » INSATISFIABLE** : la signature
   `Could not find the language` = 0 chunk dans le build actuel ; highlight.js
   n'est qu'une dép transitive de `@tiptap/extension-code-block-lowlight`,
   non importée. `marked` n'est pas non plus importé par `apps/mail`.
   Le constat « marked+highlight dans le chunk inbox » de la revue bundle ne
   se reproduit pas sur le tree actuel. → Supprimer le check, ré-auditer le
   manifest de build réel avant de re-spécifier ce volet.
4. **Boundary w2c infaisable pour framer-motion** : les importeurs shell sont
   `components/ui/spinner.tsx`, `components/voice-button.tsx`,
   `components/ui/animated-number.tsx`, `components/ui/text-shimmer.tsx` —
   tous MUST NOT TOUCH pour w2c ; `manualChunks` regroupe mais ne rend pas
   lazy un import statique. → Élargir la boundary à ces fichiers ou déplacer
   le volet framer dans la slice qui possède `components/ui/**`.
5. **Contrat w2a « snippet depuis SQLite sans R2 » IMPOSSIBLE** : la table
   `threads` du DO (`routes/agent/db/schema.ts:5-22`) n'a pas de colonne
   snippet/preview ; le non-lu passe par `thread_labels` (OK). → Retirer le
   snippet du contrat, ou ajouter une colonne alimentée à la sync (slice
   structurelle séparée, bloquante).

## À durcir (WEAK)

6. **Prerender `/` × worker assets-only** : RR7 `ssr:false` + `prerender:['/']`
   émet la landing dans `index.html` et le shell dans `__spa-fallback.html` ;
   `wrangler.jsonc` (`not_found_handling: single-page-application`) ressert
   `index.html` → deep-link `/mail` recevrait la landing. Aucun check RUN ne
   l'attrape. → Ajouter un check de cohérence wrangler↔artefact.
7. **Note optimiste de #12 erronée** : l'optimisme est un overlay Jotai
   (`optimisticActionsAtom`, `components/mail/optimistic-thread-state.tsx`),
   PAS un patch de cache `mail.get`. La ligne rendue depuis `listThreads`
   doit continuer d'appliquer `useOptimisticThreadState(threadId)`.
8. **Icônes PJ** : consommateur réel = `components/create/uploaded-file-icon.tsx`
   (chemins en dur), hors de toute boundary. Quick wins v0 a ré-encodé à noms
   identiques (OK) ; toute évolution future doit garder les noms ou inclure
   ce fichier.
9. **Lockfile racine non gardé** : aucun check de périmètre ne surveille
   `pnpm-lock.yaml`/`package.json` racine — churn silencieux + conflits de
   worktrees. → Ajouter à tous les checks de périmètre.
10. **Greps gameables** : `grep -icE "subject|sender|receivedOn|snippet" >= 3`
    compte des lignes (une projection inline correcte échouerait ; un type
    enrichi sans câblage serveur passerait) ; `grep -c "'/'"` matche tout
    `'/'` du fichier. → awk sur le tableau `prerender` réel + vérif data-level.

## Vivants et réutilisables tels quels

Checks w2a #1-3 (interface/useThread/LIMIT — rouges au gel), w2c #2-3 (shell
gz 341→≤210, signatures analytics), w2d intégralité médias restants (GIFs
onboarding 48 MB + CDN `assets.0.email`, ready.png 5,4 MB, pricing-gradient,
nizzy — les quick wins v0 n'ont traité QUE les icônes et 2 orphelins),
gardes no-regression (build, tsc server 82 / mail 86, périmètre).

## Actifs transmis à niveau9

- Spec + barème 10 axes + note actuelle 4/10 : `docs/spec/perf-9sur10.md`.
- Protocole M1 (session authentifiée Thomas, ~1 h, axes 4 et 8) :
  `docs/spec/perf-m1.md` — à planifier, indépendant des vagues.
- Checks gelés à corriger : `docs/checks/perf/w2{a,c,d}-*.md` (+ ce rapport).
- Issues #12/#14/#15 : fermées avec renvoi vers les sub-issues niveau9.
