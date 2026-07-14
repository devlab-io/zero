# LICENSE-NOTES

Notes de conformité de licence pour ce fork (`devlab-io/zero`, forké de `Mail-0/Zero`).
Ce document est l'inventaire opposable des en-têtes de licence, la règle de préservation, la
posture opérationnelle et le plan de sortie. Il est référencé par `README.md` et `FORK.md`.

Établi au HEAD gelé `1c82b196` du run niveau9 (issue #13). Chiffres reproductibles par les
commandes citées. **Ce document ne tire aucune conclusion juridique** : il constate des faits et fixe
une posture prudente.

## 1. Faits constatés (non tranchés)

Trois éléments coexistent. Les décrire exactement est le cœur de l'axe conformité :

| Élément | Constat | Preuve |
|---|---|---|
| **Racine du dépôt** | `LICENSE` = **MIT**, `Copyright (c) 2025 Zero Email` | `LICENSE` l.1-3 |
| **En-tête des 20 fichiers** | référence à l'**Apache License 2.0** **ET** une **clause additionnelle restrictive**, citée verbatim ci-dessous | ex. `apps/server/src/routes/agent/index.ts:14` |
| **Pied de page produit (UI)** | `© 2025 Zero Email Inc, All Rights Reserved` — **branding**, distinct de la question de licence | `apps/mail/components/home/footer.tsx:216` |

**Clause additionnelle, verbatim** (dernière ligne de l'en-tête des 20 fichiers) :

> `Reuse or distribution of this file requires a license from Zero Email Inc.`

**Portée non tranchée.** La coexistence d'un en-tête référençant l'Apache 2.0, de cette **clause
additionnelle restrictive**, et d'un `LICENSE` racine MIT soulève une question de portée et de
conflit qui **n'est pas tranchée dans ce document**. L'Apache 2.0 permet d'assortir les
modifications/dérivés de termes additionnels ou différents ; on **ne peut donc pas** conclure d'ici
que la présence de l'en-tête Apache 2.0 ou du MIT racine rendrait ces fichiers librement
redistribuables. Toute conclusion de ce type relève d'une **revue juridique**, pas de ce document.

## 2. Inventaire exact (grep gelé)

```bash
grep -rl "Zero Email Inc" apps packages | wc -l   # => 22 au HEAD gelé
```

Décomposition des 22 correspondances : **20 fichiers restrictifs** (en-têtes portant la clause) +
**2 mentions** — `instrument.ts` (commentaire de télémétrie) et `footer.tsx` (branding UI), sans
en-tête de licence. Les 20 restrictifs sont vérifiables par
`grep -rl "Reuse or distribution of this file requires a license from Zero Email Inc" apps packages | wc -l` → **20**.

| # | Fichier | Nature |
|---|---|---|
| 1 | `apps/mail/app/instrument.ts` | **commentaire de télémétrie** (DSN Sentry upstream — pas d'en-tête Apache, pas de clause) |
| 2 | `apps/mail/components/home/footer.tsx` | **mention** (`© … All Rights Reserved`, branding UI — pas un en-tête) |
| 3 | `apps/server/src/lib/analyze/interests.ts` | en-tête Apache 2.0 **+ clause restrictive** |
| 4 | `apps/server/src/routes/agent/index.ts` | en-tête Apache 2.0 **+ clause restrictive** |
| 5 | `apps/server/src/routes/agent/chat-agent.ts` | en-tête + clause (dérivé) |
| 6 | `apps/server/src/routes/agent/errors.ts` | en-tête + clause (dérivé) |
| 7 | `apps/server/src/routes/agent/internal.ts` | en-tête + clause (dérivé) |
| 8 | `apps/server/src/routes/agent/labels.ts` | en-tête + clause (dérivé) |
| 9 | `apps/server/src/routes/agent/mcp.ts` | en-tête + clause |
| 10 | `apps/server/src/routes/agent/mcp-tools.ts` | en-tête + clause (dérivé) |
| 11 | `apps/server/src/routes/agent/mcp-tools.test.ts` | en-tête + clause (dérivé) |
| 12 | `apps/server/src/routes/agent/outbox.ts` | en-tête + clause (dérivé) |
| 13 | `apps/server/src/routes/agent/projection.ts` | en-tête + clause (dérivé) |
| 14 | `apps/server/src/routes/agent/recipients.ts` | en-tête + clause (dérivé) |
| 15 | `apps/server/src/routes/agent/shard-registry.ts` | en-tête + clause (dérivé) |
| 16 | `apps/server/src/routes/agent/sync.ts` | en-tête + clause (dérivé) |
| 17 | `apps/server/src/routes/agent/topics.ts` | en-tête + clause (dérivé) |
| 18 | `apps/server/src/routes/agent/zero-driver.ts` | en-tête + clause (dérivé) |
| 19 | `apps/server/src/thread-workflow-utils/workflow-engine.ts` | en-tête + clause |
| 20 | `apps/server/src/thread-workflow-utils/workflow-functions.ts` | en-tête + clause |
| 21 | `apps/server/src/workflows/sync-threads-workflow.ts` | en-tête + clause |
| 22 | `apps/server/src/workflows/sync-threads-coordinator-workflow.ts` | en-tête + clause |

## 3. Écart 9 → 22 : justification par lignée (origine → dérivés)

L'axe conformité (AS-2 de l'issue #13) a établi la baseline à **9 fichiers** au point de coupe du run
(`23359642`, vérifiable : `git grep -l "Zero Email Inc" 23359642 -- apps packages | wc -l` → **9**).
Le HEAD gelé en compte **22**. L'écart n'est **pas** une dérive : c'est la conséquence directe de la
règle de préservation. Le run a éclaté deux fichiers porteurs d'en-tête en modules dérivés, **chaque
dérivé conservant l'en-tête ET la clause restrictive**. Aucun en-tête n'a été retiré, aucune clause
supprimée.

**Les 9 fichiers d'origine (au gel `23359642`) → leurs descendants au HEAD :**

| # | Fichier d'origine (baseline `23359642`) | Nature | Statut au HEAD | Descendants (en-tête + clause préservés) |
|---|---|---|---|---|
| 1 | `apps/mail/app/instrument.ts` | mention | inchangé | — |
| 2 | `apps/mail/components/home/footer.tsx` | mention UI | inchangé | — |
| 3 | `apps/server/src/lib/analyze/interests.ts` | en-tête+clause | inchangé | — |
| 4 | `apps/server/src/routes/agent/index.ts` | en-tête+clause | **éclaté** (2262 → 25 LOC, barrel) — #22 `1b93aa02` | **11** : `chat-agent, errors, internal, labels, outbox, projection, recipients, shard-registry, sync, topics, zero-driver` |
| 5 | `apps/server/src/routes/agent/mcp.ts` | en-tête+clause | réduit (598 → 414 LOC) — surface MCP #36 `cd6148c3` | **2** : `mcp-tools.ts, mcp-tools.test.ts` |
| 6 | `apps/server/src/thread-workflow-utils/workflow-engine.ts` | en-tête+clause | inchangé | — |
| 7 | `apps/server/src/thread-workflow-utils/workflow-functions.ts` | en-tête+clause | inchangé | — |
| 8 | `apps/server/src/workflows/sync-threads-workflow.ts` | en-tête+clause | inchangé | — |
| 9 | `apps/server/src/workflows/sync-threads-coordinator-workflow.ts` | en-tête+clause | inchangé | — |

**Compte : 9 d'origine (7 restrictifs + 2 mentions, tous survivants) + 13 dérivés (11 de `index.ts` +
2 de `mcp.ts`) = 22** (soit **20 fichiers restrictifs** + 2 mentions ; lignée restrictive 7 → 20). Les 9 sont inventoriés, et
leurs 13 descendants avec eux ; l'écart est intégralement expliqué. Vérification de la préservation
sur un dérivé (ex. `projection.ts:14`) : la clause restrictive y figure identique à `index.ts:14`.

## 4. Règle de préservation des en-têtes

- **Tout module dérivé d'un fichier porteur de l'en-tête doit conserver l'en-tête verbatim, clause
  additionnelle comprise.** Familles concernées, vérifiées au gel : `routes/agent/*` (issu de
  `index.ts`/`mcp.ts`), `thread-workflow-utils/workflow-*`, `workflows/sync-threads-*`.
- Un refactor qui déplace ou scinde du code sous en-tête **ne retire jamais** l'en-tête ni la clause ;
  il les copie dans chaque fichier produit.
- Un nouveau fichier sans lignage vers un fichier sous en-tête n'a pas à porter cet en-tête.

## 5. Posture opérationnelle (stricte)

En raison de la clause additionnelle restrictive et de la portée non tranchée (§1), la posture de ce
fork est **prudente et stricte**, indépendamment de ce que le MIT racine ou l'en-tête Apache 2.0
pourraient par ailleurs permettre :

- **PAS de redistribution** de ces 20 fichiers,
- **PAS de relicensing**,
- **PAS de retrait (stripping)** de leur en-tête ou de leur clause,

**sans permission écrite d'upstream (`Zero Email Inc.`) OU une revue juridique** confirmant la portée
de la clause. Cette règle est reprise dans `README.md` et `FORK.md`. Le pied de page « All Rights
Reserved » (`footer.tsx`) est du **branding** distinct et n'entre pas dans ce raisonnement de licence.

## 6. Plan de sortie (si la redistribution devenait un objectif)

Aucune redistribution n'est engagée aujourd'hui. Si elle le devenait, deux voies, à faire précéder
d'une **revue juridique de la portée de la clause** :

1. **Permission / accord upstream** — obtenir de `Mail-0/Zero` / `Zero Email Inc.` une autorisation
   écrite couvrant la réutilisation ou la redistribution des fichiers concernés. Voie recommandée.
2. **Réécriture clean-room** — réimplémenter les modules porteurs d'en-tête (les 20 fichiers, dont
   les 13 dérivés) sans dériver du source upstream, à partir de la seule spec fonctionnelle, par un
   contributeur n'ayant pas lu le source original. Coût élevé (≈ 3–4 k LOC serveur à re-spécifier +
   re-tester) ; à n'engager que si la voie 1 échoue.

Tant qu'aucune des deux n'est engagée **et validée juridiquement**, la posture stricte du §5
s'applique.
