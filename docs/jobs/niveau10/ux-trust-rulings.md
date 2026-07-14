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
