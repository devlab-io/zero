# Check — Shortwave keyboard parity

PASS only if all are true:

1. A machine-readable shortcut registry contains every in-scope row from the spec with exact key
   aliases and contextual scopes.
2. A test fails when a registered action has no handler, when two active scopes bind the same key
   to different actions, or when a help row has no live registration.
3. `g` navigation is a sequence with a bounded timeout, not a simultaneous chord.
4. Single-key commands are ignored in input, textarea, contenteditable, TipTap, and open dialogs.
5. Exactly one hotkey provider is mounted for mail routes.
6. Browser smoke proves: `/`, `c`, `r`, `a`, `f`, `d`, `h`, `s`, `j`, `k`, `x`, `g i`,
   `mod+k`, `shift+?`, and `Escape` with no console errors.
7. Reply and reply-all open with the expected recipients populated.
8. The settings/help UI renders from the same registry used by the handlers.

