# Check — refactors structurels (V2.1-V2.4, V3.1-V3.3)

Gates PASS-only pour toute issue étiquetée *structurel*. L'inspection de code seule est
insuffisante : chaque gate exige une preuve exécutée.

1. **Comportement strictement inchangé** : tous les tests existants passent avant ET après
   (`pnpm test`) ; le build mail passe ; `wrangler deploy --dry-run` passe pour l'app touchée.
2. **Contrat stable** : snapshot avant/après identique du contrat public touché — routes HTTP
   exposées (inventaire), procédures tRPC (noms + types d'entrée/sortie), ou exports de module.
   Tout écart = FAIL sauf RULING préalable.
3. **Découpage** : aucun module résultant >800 LOC ; le fichier d'origine réduit à un point
   d'entrée/ré-export ou supprimé ; pas de copier-coller dupliqué entre modules (le juge
   spot-check).
4. **Durable Objects** (V2.1) : noms de classes DO exportées, bindings `wrangler.jsonc` et schéma
   SQLite inchangés — diff vide sur ces surfaces.
5. **Licence** : tout module dérivé d'un fichier portant l'en-tête « Zero Email Inc. » porte le
   même en-tête. Vérif : `grep -rL "Zero Email Inc" <modules dérivés>` vide.
6. **Frontières** (V2.4) : `grep -rn '\.\./\.\./\.\?\.\?/server' apps/mail` = 0 résultat ;
   `no-restricted-imports` présent dans la config ESLint et violé = CI rouge (preuve : run local
   de la règle sur un import factice, puis retrait).
7. **Ratchet LOC** : `scripts/checks/loc-ratchet` (créé en V0.2) passe avec la nouvelle borne ;
   la liste d'exceptions ne croît pas.

Un builder qui modifie un fichier sous `docs/checks/` = FAIL automatique.
