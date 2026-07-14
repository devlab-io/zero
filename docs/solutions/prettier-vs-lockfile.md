# Solution — le hook pre-commit reformate `pnpm-lock.yaml` (et casse le JSON unicode)

**Symptôme.** Un commit qui inclut `pnpm-lock.yaml` (ou un JSON contenant des caractères non-ASCII)
ressort modifié / corrompu après le hook `pre-commit`, ou le commit échoue de façon opaque.

**Diagnostic.** `.husky/pre-commit` lance `lint-staged`, qui exécute `prettier --write` sur les
fichiers stagés. Prettier **reformate** le lockfile pnpm (dont le format n'est pas le sien) et
**échappe** l'unicode dans les JSON générés — ce qui produit un diff parasite ou une sortie invalide.

**Correctif.**

1. Quand un commit ne porte **que** le lockfile (ou un artefact généré que le hook ne doit pas
   toucher), bypasser le hook :

   ```bash
   git commit --no-verify -m "chore: update pnpm-lock"
   ```

2. Quand du JSON est écrit par un script et doit conserver ses caractères non-ASCII, sérialiser avec
   `ensure_ascii=False` (Python) / l'équivalent (ne pas ré-échapper l'unicode), pour que
   prettier/relecture ne produisent pas un diff d'échappement.

**Prévention.** Le hook a une portée **staged-only** (il ne gate que ce qu'on committe — voir
`docs/testing.md` §pre-commit) : garder les commits de lockfile isolés et `--no-verify`. Source :
ruling docs §3 (« prettier-vs-lockfile »).
