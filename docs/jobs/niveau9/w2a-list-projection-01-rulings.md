# Rulings — niveau9/w2a-list-projection-01 (issue #30) — append-only, orchestrateur

## RULING 2026-07-13 — décisions signalées
1. Recherche `q` (rawListThreads thin) et dossier Sent (destinataires absents
   de la projection threads) : fallback fetch par ligne ACCEPTÉ comme
   EXCEPTION SCOPÉE aux items thin UNIQUEMENT — le gate gelé porte sur le
   chemin INITIAL inbox (1 liste + ≤1 corps), qui doit être à ZÉRO fetch par
   ligne. Le ruling D1 #26 (« la row ne redevient jamais un point de fetch »)
   est amendé en conséquence : il vaut ABSOLUMENT pour les items projetés ;
   les surfaces thin (recherche, Sent) sont une DETTE INSCRITE — extension de
   la projection (colonnes destinataires / projection de recherche) candidate
   post-run, consignée pour le docs-debt de #39 et l évidence de #40.
2. Preuve du gate par analyse data-flow documentée : ACCEPTÉE — wrangler dev
   + headless exige Gmail/DO réels absents du worktree (même famille de
   blocker que le smoke auth) ; le juge vérifie au niveau code (enabled:false,
   greps) + tests unit (gzip, absence corps/base64) ; la preuve réseau LIVE
   reste due par #40 (session authentifiée).
3. Frontière tRPC régénérée par le porteur du contrat projection : conforme
   (déterminisme md5 à re-prouver par le juge).
