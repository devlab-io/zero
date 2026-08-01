import { shouldOpenAskRetaFromHotkey } from './ask-reta-hotkey-guard';
import { afterEach, describe, expect, it } from 'vitest';

// VRAI DOM (happy-dom) : le garde Mod+J contre inputs, dialogs et palette.

afterEach(() => {
  document.body.innerHTML = '';
});

describe('shouldOpenAskRetaFromHotkey — Mod+J never hijacks a modal context', () => {
  it('blocks inside a REAL open dialog (command palette / composer)', () => {
    document.body.innerHTML = `
      <div role="dialog">
        <input placeholder="Type a command or search..." />
      </div>`;
    const paletteInput = document.querySelector('input')!;
    expect(shouldOpenAskRetaFromHotkey(paletteInput)).toBe(false);
    expect(shouldOpenAskRetaFromHotkey(document.querySelector('[role="dialog"]'))).toBe(false);
  });

  it('blocks inside inputs, textareas and contenteditable', () => {
    document.body.innerHTML = `
      <input id="i" /><textarea id="t"></textarea>
      <div id="e" contenteditable="true"><p id="p">texte</p></div>`;
    expect(shouldOpenAskRetaFromHotkey(document.getElementById('i'))).toBe(false);
    expect(shouldOpenAskRetaFromHotkey(document.getElementById('t'))).toBe(false);
    expect(shouldOpenAskRetaFromHotkey(document.getElementById('p'))).toBe(false);
  });

  it('allows from the plain app surface', () => {
    document.body.innerHTML = `<main><button id="b">Inbox</button></main>`;
    expect(shouldOpenAskRetaFromHotkey(document.getElementById('b'))).toBe(true);
    expect(shouldOpenAskRetaFromHotkey(document.body)).toBe(true);
    expect(shouldOpenAskRetaFromHotkey(null)).toBe(true);
  });
});
