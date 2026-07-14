# WS7 — Résiduels code connus — VÉRIFIÉS / documentés (aucun fix)

commit gelé : `1c82b196`

## R1 — voice-provider.tsx:130-131 — accès `.name`/`.email` non gardés (CONFIRMÉ)
`apps/mail/providers/voice-provider.tsx`, dans `dynamicVariables` (obj. à l.129) :
```
130:  user_name: session?.user.name.split(' ')[0] || 'User',
131:  user_email: session?.user.email || '',
```
Le `?.` ne garde QUE `session` : si `session.user` existe mais `name` est `null/undefined`,
`.name.split(...)` **jette** ; si `session.user` est `undefined`, `.name` jette aussi. Même classe
que les 6 guards `session?.user` fermés par #34 — **oubli résiduel** ici. Reachability : chemin
gated par la feature voix ElevenLabs (`VITE_PUBLIC_ELEVENLABS_AGENT_ID` requis, l.119-120) →
impact réel borné mais crash possible au démarrage de session vocale si le profil user est partiel.

## R2 — thread-display-hotkeys.tsx:13-15 — `closeView` no-op (CONFIRMÉ)
`apps/mail/lib/hotkeys/thread-display-hotkeys.tsx` :
```
13: const closeView = (event: KeyboardEvent) => {
14:   event.preventDefault();
15: };
```
Câblé l.95 au handler `closeView` (raccourci Escape, annoncé « Close thread » dans
`config/shortcuts.ts:239`). Le handler appelle uniquement `preventDefault()` et **ne ferme pas** la
vue/thread → **no-op fonctionnel** vis-à-vis de l'action annoncée. (Touche visual-qa.md « shortcut
help ne doit pas annoncer de handlers manquants » : ici le handler existe mais n'exécute pas son
libellé.)

## R3 — thread-display-hotkeys.tsx:17 — commentaire périmé (CONFIRMÉ)
```
17: // `openLabels`/`openMove` are absent by design (no picker surface reachable in #32's
18: // may-touch — see shortcuts.ts).
```
Le commentaire affirme « no picker surface reachable ». Or #32 (w2e-keyboard-parity, merge 88df0b73)
a précisément ajouté les **pickers l/v**, et le composant utilise `setPicker` (l.23,
`useQueryState('picker')`). Le commentaire est donc **périmé/contredit** par l'état du code.

Tous constatés au commit gelé ; correction = propriété du propriétaire (code produit intouchable ici).
