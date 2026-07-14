# Rulings — final-qa-bench-01 (issue #40)

Fichier append-only, propriété orchestrateur.

## Ruling pré-dispatch — registre des dettes de preuve routées (2026-07-14)

#40 est un job de VÉRIFICATION : code produit INTOUCHABLE. Les dettes routées ici
sont des PREUVES à produire ou des constats à documenter, jamais des fixes :

1. Navigateur authentifié : un Chrome staging authentifié EXISTE côté superviseur
   (Computer Use). La build locale contre le backend staging échoue STRICTEMENT sur
   CORS (pas d'ACAO localhost sur get-session/autumn) — fait consigné #44. Les preuves
   authentifiées (rendu réel Pricing/CreateEmail, activation Enter/Space native, trace
   réseau cold-inbox, smoke MCP #36, comparatif Shortwave) s'exécutent SOIT via la
   surface superviseur SUR DEMANDE (formuler la demande précise au rapport), SOIT
   sont BLOCKED explicites — jamais estimées, jamais contournées (cookie/proxy/override
   INTERDITS).
2. Vérification gen-trpc-boundary : identifier le commit post-#43 qui fait diverger le
   générateur du snapshot committé ; statuer (régénération avec revue du delta de
   surface, ou correctif générateur) — RAPPORT seulement, le fix appartient au
   propriétaire.
3. Résiduels code connus à VÉRIFIER/documenter (pas fixer) : voice-provider.tsx:129-130
   (.name/.email non gardés, même classe que les 6 guards #34), commentaire périmé
   thread-display-hotkeys:17, closeView no-op.
4. Bench : harnais R10 (2 warmups + 10 itérations alternées, médiane/p75, brut
   JSON/CSV conservé), profil réseau Tahiti 175 ms/1,5 Mbps ; cold-boot serveur :
   protocole ≥5 démarrages frais (ruling #6b) si mesuré.
5. Évidences par axe A1..A10 : exécuter CHAQUE commande de preuve du barème gelé
   (grading-rubric.md) avec sortie brute sous docs/research/niveau9/ — c'est le
   dossier du juge froid final.
6. Chiffres de référence au merge V5 : JS critique 435,9 KiB gz (gate 420 FAIL −15,9,
   plancher structurel), console serveur 8, tests 327+, tsc 0/0.

## Ruling fan-in A10 (superviseur, 2026-07-14)

#40 capture A10/docs-governance sur le gel 1c82b196 où ARCHITECTURE.md/FORK.md/
LICENSE-NOTES.md n'existent PAS ENCORE (#39 les crée en parallèle). C'est ATTENDU et
non un défaut. Règles :

1. Toute évidence A10 produite par #40 est ÉTIQUETÉE « pre-#39 » (dans le nom de
   fichier ET dans le contenu) — jamais présentée comme verdict d'axe.
2. Le JUGE FROID FINAL ré-exécute OBLIGATOIREMENT A10/docs-governance sur le HEAD
   FUSIONNÉ post-#39+#40 ; l'A10 pre-#39 est irrecevable comme verdict final.
3. Cette exigence de rerun est consignée ici et sera reprise verbatim dans le mandat
   du juge final.
