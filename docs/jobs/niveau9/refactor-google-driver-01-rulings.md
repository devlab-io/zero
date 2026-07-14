# Rulings — niveau9/refactor-google-driver-01 (issue #23) — append-only, orchestrateur

## RULING 2026-07-13 — gate loc-ratchet rouge HORS périmètre

Constat du builder vérifié : loc-ratchet exit 1 sur 2 fichiers apps/mail
préexistants (contributors.tsx 1040>1032, command-palette-context.tsx
1922>1913), rouges AVANT toute modification du job — croissance amenée par
des merges jugés PASS (typing #20, quick wins perf). Décision : le juge
évalue loc-ratchet sur le SEUL périmètre driver (0 régression, google.ts
sort des >800) ; le re-snapshot des bornes mail est une action orchestrateur
post-merge (commit d infrastructure, consigné sur #13). Ces deux fichiers
sont déjà possédés par #41 (contributors) et #28 (palette) qui les feront
fondre sous 800.

## Contrats actés
- Transport (#31) : google-transport.ts, classe GmailTransport,
  execute<T>(fn) = point unique de dispatch (27 sites, 0 accès direct hors
  transport).
- types.ts (#25) : chemin canonique INCHANGÉ.
