import {
  askRetaSavedPromptsKey,
  loadAskRetaSavedPrompts,
  saveAskRetaSavedPrompts,
} from './ask-reta-saved-prompts';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Ask Reta saved prompts', () => {
  beforeEach(() => localStorage.clear());

  it('isolates prompts by user and active mailbox', () => {
    saveAskRetaSavedPrompts('user-a', 'conn-a', [
      { id: 'p1', title: 'Synthèse', content: 'Résume les décisions.', createdAt: 1 },
    ]);
    expect(loadAskRetaSavedPrompts('user-a', 'conn-a')).toHaveLength(1);
    expect(loadAskRetaSavedPrompts('user-a', 'conn-b')).toEqual([]);
    expect(loadAskRetaSavedPrompts('user-b', 'conn-a')).toEqual([]);
  });

  it('removes malformed or oversized stores', () => {
    const key = askRetaSavedPromptsKey('user-a', 'conn-a');
    localStorage.setItem(key, JSON.stringify({ version: 1, prompts: [{ content: 'missing' }] }));
    expect(loadAskRetaSavedPrompts('user-a', 'conn-a')).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });
});
