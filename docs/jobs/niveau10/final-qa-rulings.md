# Rulings — Final QA Niveau 10

## 2026-07-14 — Le smoke fournisseur respecte la frontière CAS fail-closed

Le critère initial demandait que Codex et Claude mettent à jour le même brouillon après lecture.
Le jugement indépendant du slice `mcp-draft-loop` a établi, à partir des contrats publics Gmail et
Microsoft Graph, qu'aucun des deux fournisseurs actifs ne documente aujourd'hui une écriture
conditionnelle atomique exploitable par Zero pour ce brouillon. Un read-check-write local laisserait
une fenêtre d'écrasement et est interdit.

Le contrat final honnête est donc : lecture, contexte, création d'une réponse brouillon, liste et
relecture fonctionnent ; `updateDraft` annonce explicitement l'absence de CAS et échoue avant toute
réservation d'idempotence, lecture ou mutation fournisseur. L'agent doit préparer un nouveau
brouillon non envoyé pour proposer une correction. Un provider futur ne pourra activer la mise à
jour que s'il fournit un token et une écriture conditionnelle atomique liés à la révision retournée.

Le smoke final doit vérifier cette réponse fail-closed et ne doit jamais présenter Gmail ou
Microsoft comme supportant une mise à jour sûre du même ID. Cette décision ne réduit pas la
frontière draft-only : aucun outil send/delete/spam/settings n'est ajouté.

## 2026-07-14 — Consentement OAuth persistant séparé de la QA locale

L'autorisation du goal couvre l'implémentation, les tests, le push et la vérification Computer Use,
mais pas un nouveau consentement OAuth persistant. La QA locale, le smoke HTTP/in-process, la
preview authentifiée déjà disponible et toutes les preuves non persistantes sont exécutés d'abord.

Immédiatement avant d'ajouter réellement le serveur MCP à Codex ou Claude et d'accepter un écran de
consentement, l'orchestrateur doit demander une confirmation explicite à Thomas. Sans cette
confirmation, le rapport s'arrête honnêtement à cette frontière et ne transforme pas les preuves
locales en preuve d'une connexion OAuth live.
