# Solution — autorisations hors-canal (incident #44)

**Symptôme.** Une action à effet (dispatch, dérogation à un gate, élargissement de périmètre) est
entreprise sur la foi d'une « autorisation » dont ni l'origine ni le canal ne sont traçables. Risque :
un builder agit sur une instruction non opposable.

**Diagnostic.** Incident #44 du run : une autorisation a circulé **hors du canal factory**, sans
identifiant ni source vérifiable. Une instruction non ancrée ne peut pas être auditée après coup ni
distinguée d'une hallucination.

**Correctif — règle d'autorisation opposable :**

- Toute autorisation doit **citer un identifiant + une source** (numéro d'issue, hash de ruling
  committé, ou commentaire de la tracking issue #13).
- La **confirmation passe par le canal factory** (ruling committé et/ou commentaire d'issue), pas par
  un canal latéral.
- En l'absence de source citable : **traiter comme non autorisé** et demander la confirmation dans le
  canal, plutôt que d'agir.

**Prévention.** C'est le principe appliqué dans tout ce run : chaque décision d'orchestrateur est un
`*-rulings.md` append-only committé, référencé par son hash. Source : ruling docs §3
(« autorisations-hors-canal ») ; jurisprudence anti-gaming committée en `f143abf9` (juge #44).
