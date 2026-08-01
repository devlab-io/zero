import { isTypingOrModalTarget } from './use-hotkey-utils';

/**
 * Mod+J guard (slice-2 review). The chord binder deliberately keeps modifier
 * chords live inside inputs/dialogs (⌘K must dismiss the palette) — so the
 * Ask Reta opener enforces its own rule: NEVER hijack a typing context, an
 * open dialog, or the command palette. Bare `y` is already blocked by the
 * binder's single-key guard; this covers the chord path.
 */
export function shouldOpenAskRetaFromHotkey(activeElement: Element | null): boolean {
  return !isTypingOrModalTarget(activeElement);
}
