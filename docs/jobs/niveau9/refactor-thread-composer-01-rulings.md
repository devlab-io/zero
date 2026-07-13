# Rulings — niveau9/refactor-thread-composer-01 (issue #27) — append-only, orchestrateur

## RULING 2026-07-13
- R1 (amendement de frontière) : édition MINIMALE de reply-composer.tsx
  APPROUVÉE — le seam contractuel (logique reply/replyAll) y vivait ; fichier
  non détenu par un builder en vol ; delta = suppression d un useEffect mort
  (no-op) + extraction fidèle vers reply-recipients.ts. Le juge vérifie que le
  diff de reply-composer.tsx est bien minimal et sans changement de
  comportement.
- R2 : collision textuelle attendue avec le lot clavier zero-niveau8 (matière
  première NON commitée, lecture seule) sur la même région — SANS objet en
  git (le lot n est pas une branche) ; consigné pour le contexte de dispatch
  de #32 : adopter le module deriveReplyRecipients, re-dériver le fix
  initialTo par-dessus.
- R3 : les 13 erreurs tsc server locales = environnementales (types wrangler
  non générés dans le worktree builder, pattern connu) — le juge mesure sous
  séquence complète, attendu server 0.
- Contrat acté (consommé par #32) : components/mail/reply-recipients.ts —
  deriveReplyRecipients(mode, message, userEmail) → {to, cc}, 10 tests ;
  bug « À » vide VOLONTAIREMENT non corrigé ici (propriété de #32).
- STATUS « DONE » lu comme COMPLETE (verdict au juge).
