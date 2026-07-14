# Solution — libellé honnête des gates (« jamais poids OK »)

**Symptôme.** Un rapport décrit un gate comme « vert » / « OK » alors qu'il est rouge, ou emploie une
formulation floue qui laisse croire qu'un objectif est atteint quand il ne l'est pas.

**Diagnostic.** Sous pression de clôture, la tentation est de résumer un état partiel en succès. Un
juge froid re-mesure : un libellé optimiste contredit par la mesure est pire qu'un constat honnête —
il détruit la confiance dans **tout** le rapport.

**Correctif — jurisprudence du run :**

- **« jamais poids OK »** — ne jamais déclarer un gate de poids/perf « OK » sans la mesure qui le
  prouve. Idem pour tout gate : l'état affirmé doit être l'état mesuré.
- **Formulation unique et gelée par gate.** Chaque gate a une seule formulation opposable. Exemples
  du run :
  - Gate **A8** : **FAIL 435,9 vs 420** (le poids du chemin critique dépasse la cible ; c'est cette
    formulation exacte qui est employée, pas « presque OK »).
  - Typecheck : **ne jamais** décrire l'étape comme « typecheck vert » tant que `mail ≠ 0 total`
    (`docs/testing.md` §CI pt 3).
- Un état partiel se dit partiel : « X sur Y », borne atteinte / non atteinte, avec le chiffre.

**Prévention.** Reprendre la formulation gelée du gate telle quelle. Source : ruling docs §3
(« libellé-honnête ») ; carve-out de frontière et libellé honnête obligatoire (commentaire #13,
dispatch V5/#42).
