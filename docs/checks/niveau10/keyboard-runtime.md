# Check — keyboard-runtime

Executor: bash

Spec: `docs/spec/niveau10-mailos.md` sections 1, critères clavier et limites.

## RUN

- RUN: `pnpm --filter @zero/mail exec vitest run lib/hotkeys/keyboard-runtime.test.tsx lib/hotkeys/keyboard-parity.test.ts components/mail/reply-recipients.test.ts` -> exit 0 ; événements réels et cas reply passent
- RUN: `pnpm --filter @zero/mail exec eslint config/shortcuts.ts lib/hotkeys components/mail/reply-recipients.ts components/mail/reply-composer.tsx components/create/email-composer.tsx app/'(routes)'/settings/shortcuts` -> exit 0
- RUN: `pnpm --filter @zero/mail exec react-router typegen && (pnpm --filter @zero/mail exec tsc --noEmit --pretty false > /tmp/zero-niveau10-keyboard-tsc.log 2>&1 || true) && ! rg '^(lib/hotkeys/|app/\(routes\)/settings/shortcuts/|components/mail/reply-|components/create/email-composer\.tsx|components/queue/queue-review\.tsx|config/shortcuts\.ts).*error TS' /tmp/zero-niveau10-keyboard-tsc.log && cat /tmp/zero-niveau10-keyboard-tsc.log && pnpm --filter @zero/mail build` -> exit 0 ; aucun défaut TypeScript dans le touch-set clavier et build complet vert
- RUN: `git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/mail\/(config\/shortcuts\.ts|lib\/hotkeys\/.*|components\/mail\/(reply-recipients(\.test)?\.ts|reply-composer\.tsx)|components\/create\/email-composer\.tsx|components\/queue\/queue-review\.tsx|app\/\(routes\)\/settings\/shortcuts\/.*|messages\/(en|fr)\.json)|docs\/jobs\/niveau10\/keyboard-runtime-01\.md)$/ {print; bad=1} END {exit bad}'` -> aucune sortie ; touch-set respecté
- RUN: `git diff --check` -> exit 0

## ACCEPTANCE

1. Toutes les variantes d'une action sont conservées et un vrai `KeyboardEvent` appelle
   exactement une fois le handler attendu dans le bon scope.
2. La matrice couvre `d/e`, `b/h`, `u/Shift+U`, `#/Delete/Mod+Backspace`, `+`, `Mod+,`,
   `Shift+?`, `g !`, `g #` sur QWERTY et AZERTY, sans parseur de ponctuation ambigu.
3. Aucun raccourci simple ne s'exécute dans input, editor ou dialog ; `Escape` est
   l'exception explicite et ferme le bon nouveau message/réponse/transfert selon une
   politique unique de sauvegarde.
4. `r/a` dérivent destinataires et sujet du dernier message ; `f` conserve le threading
   et le sujet de transfert mais laisse les destinataires vides. Identités propres et
   doublons To/Cc sont comparés sans casse.
5. `?` ouvre une aide contextuelle localisée ; les réglages ne présentent plus de cartes
   cliquables inertes. Toute personnalisation livrée persiste, refuse les collisions et
   se réinitialise de façon déterministe.
6. Les raccourcis queue rejoignent le registre canonique ; cette tranche ne change pas
   la présentation de la queue.
7. Le builder ne touche ni `docs/spec/` ni `docs/checks/` et ne commit/push rien.
