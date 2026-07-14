# Rulings — UX Trust

## Ruling 1 — le composeur réel était hors du touch-set

Le gel initial autorisait `components/mail/**`, mais le reply composer ne fait que monter le
composeur partagé. Les comportements exigés par l'acceptation 2 et 3 vivent réellement dans :

- `apps/mail/components/create/email-composer.tsx` ;
- `apps/mail/components/create/email-composer.fields.tsx` ;
- `apps/mail/components/create/create-email.tsx` ;
- `apps/mail/hooks/use-composer-draft-persistence.ts`.

Preuve avant modification : les toggles Cc/Bcc et formatage ont `tabIndex={-1}` dans les champs et
actions partagés ; les wrappers de création utilisent `w-[750px]` et `h-[600px]` ; le succès ou
l'échec de sauvegarde et la restauration locale sont pilotés par le composant partagé et son hook.
Modifier seulement `reply-composer.tsx` aurait produit une conformité apparente sans corriger le
composeur utilisé par les nouveaux messages.

Décision : ajouter uniquement ces quatre coutures au lint et au touch-set gelés. Aucun autre fichier
`components/create/**`, aucun hot path serveur, registre ou binder clavier n'est dégelé. Le builder
doit toujours laisser la spec et le check intacts et ne doit ni commit ni push.

## Ruling 2 — Judge 1 FAIL : une réponse autosave obsolète peut acquitter une édition récente

Les sept RUNs gelés sont verts, mais le premier juge indépendant a trouvé une course dans le vrai
composeur. `saveDraft` capture un contenu, attend `createDraft`, puis marque sans condition
`hasUnsavedChanges=false` et l'état `server`. Si l'utilisateur modifie le brouillon pendant cet
appel, la réponse de l'ancien snapshot acquitte à tort la nouvelle édition, qui reste seulement
locale et ne déclenche plus l'autosave suivant.

Décision : chaque édition pertinente doit avancer une version de snapshot. Une sauvegarde capture
la version qu'elle envoie et ne peut annoncer `server` ni nettoyer le dirty bit que si cette version
est encore courante au retour. Si une édition plus récente existe, l'interface reste explicitement
locale/dirty et le prochain autosave doit rester planifié. Le test correctif doit piloter cette
course asynchrone réelle (édition pendant une requête suspendue), pas seulement le reducer d'état.

La correction reste limitée à `email-composer.tsx`, à la couture de logique UX sous
`components/mail/**`, à `ux-trust.test.tsx` et au rapport autorisé. La preuve FAIL du juge est
conservée dans `docs/jobs/niveau10/ux-trust-judge-1.md`. Nouveau builder, checkrun déterministe et
nouveau jugement indépendant obligatoires avant intégration.
