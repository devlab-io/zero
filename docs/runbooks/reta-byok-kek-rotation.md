# Runbook — Rotation de la KEK du coffre BYOK Ask Reta

Portée : secrets Worker `RETA_BYOK_KEK_V1` / `RETA_BYOK_KEK_V2` /
`RETA_BYOK_KEK_ACTIVE` (apps/server). La rotation est **paresseuse et sans
interruption** : chaque enveloppe rencontrée sous une version non active est
« true-rewrappée » (le DEK est re-wrappé sous la KEK active ; `ciphertext` et
`iv` de la clé ne changent JAMAIS, la clé API n'est jamais déchiffrée pendant
la rotation) puis persistée par CAS
(`WHERE id/user_id/provider/kek_version = ancienne version`). Un CAS perdu
signifie qu'un autre isolate a déjà tourné la ligne : rechargement, aucune
erreur. Aucun endpoint utilisateur ou admin n'expose ces secrets — la seule
surface est `wrangler secret` + Postgres en lecture d'audit.

## Procédure (v1 → v2)

1. **Générer** la nouvelle KEK (32 octets, base64url) :
   `openssl rand 32 | basenc --base64url | tr -d '='`
2. **Déployer la fenêtre de rotation** — les DEUX secrets présents, v2 active :
   ```
   wrangler secret put RETA_BYOK_KEK_V2      # nouvelle clé
   wrangler secret put RETA_BYOK_KEK_ACTIVE  # valeur littérale : v2
   # RETA_BYOK_KEK_V1 reste en place
   ```
   Dès ce déploiement : les nouvelles clés (`setCredential`) sont wrappées
   sous v2 ; chaque usage d'une ligne v1 la migre vers v2 (trafic naturel).
3. **Laisser le trafic migrer** (lazy rewrap). Pas de commande batch exposée —
   si un backfill est nécessaire, l'exécuter côté opérateur en SQL + code
   interne, jamais via une route publique.
4. **Vérifier la fin de migration** (audit Postgres, lecture seule) :
   ```sql
   SELECT kek_version, count(*) FROM mail0_reta_byok_credential GROUP BY 1;
   ```
   Attendre `v1 → 0`. Les lignes v1 restantes appartiennent à des comptes
   inactifs : soit attendre leur prochain usage, soit accepter qu'elles
   échoueront fermé (erreur coffre fixe) après le retrait de V1.
5. **Retirer l'ancienne clé** une fois le compte v1 à zéro :
   ```
   wrangler secret delete RETA_BYOK_KEK_V1
   ```

## Rollback

Tant que les deux secrets sont déployés, repasser
`RETA_BYOK_KEK_ACTIVE=v1` suffit : le même mécanisme paresseux re-migre les
lignes v2 vers v1. Ne JAMAIS retirer un secret tant que des lignes existent
sous sa version (elles échoueraient fermé).

## Invariants garantis par le code (testés)

- `decodeKekRing` : ring vide ou version active sans secret → coffre
  indisponible (erreur fixe), Workers AI non affecté.
- Rewrap : `ciphertext`/`iv` préservés octet pour octet ; seul le wrap du DEK
  change ; CAS idempotent sous concurrence ; version absente du ring → échec
  fermé, jamais de boucle d'essais de KEK.
- Consentement : le rewrap ne contourne jamais la porte de consentement
  (version de consentement courante exigée avant tout déchiffrement).
