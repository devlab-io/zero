import {
  ASK_RETA_CONVERSATION_CAP,
  ASK_RETA_CONVERSATION_RETENTION_MS,
  askRetaConversationKey,
  clearAskRetaConversation,
  loadAskRetaConversation,
  saveAskRetaConversation,
} from './ask-reta-conversation-storage';
import type { AskRetaTurn } from '@/components/copilot/ask-reta-state';
import { beforeEach, describe, expect, it } from 'vitest';

const turn = (id: string, overrides: Partial<AskRetaTurn> = {}): AskRetaTurn => ({
  id,
  role: 'assistant',
  content: `réponse ${id}`,
  payload: {
    citations: [
      {
        ref: 's1',
        kind: 'message',
        threadId: 'thread-1',
        messageId: 'msg-1',
        subject: 'Facture',
        sender: 'Compta <c@x.test>',
        date: '2026-07-30',
        excerptHash: 'a'.repeat(64),
        quote: 'quote vérifiée suffisamment longue ici',
      },
    ],
    steps: [
      {
        id: 'st1',
        kind: 'search',
        detail: '"facture" → 1 threads',
        sourceRefs: ['s1'],
        search: {
          query: 'facture',
          folder: 'sent',
          threads: [
            { threadId: 'thread-1', subject: 'Facture', sender: 'Compta', date: '2026-07-30' },
          ],
        },
      },
    ],
    model: 'llama-4-scout',
    // Raw draft HTML — MUST NOT survive persistence.
    proposal: {
      kind: 'new',
      subject: 'Relance',
      bodyHtml: '<p>CORPS-DE-BROUILLON-SECRET</p>',
    },
  },
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('ask-reta conversation storage — strict versioned projection', () => {
  it('NEVER persists the proposal or any draft body (absent from the raw JSON)', () => {
    saveAskRetaConversation('u1', 'c1', [turn('t1')]);
    const raw = localStorage.getItem(askRetaConversationKey('u1', 'c1'))!;
    expect(raw).not.toContain('proposal');
    expect(raw).not.toContain('CORPS-DE-BROUILLON-SECRET');
    expect(raw).not.toContain('bodyHtml');
    // …and after reload no draft action can reappear.
    const loaded = loadAskRetaConversation('u1', 'c1');
    expect(loaded[0]?.payload?.proposal).toBeUndefined();
    // Citations (bounded quotes) and steps metadata DO survive.
    expect(loaded[0]?.payload?.citations[0]?.quote).toContain('quote vérifiée');
    expect(loaded[0]?.payload?.steps[0]?.search?.folder).toBe('sent');
  });

  it('rejects a tampered store: injected proposal is stripped, off-contract data discarded', () => {
    const key = askRetaConversationKey('u1', 'c1');
    // Tampered: a proposal smuggled into the stored payload.
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        turns: [
          {
            id: 't1',
            role: 'assistant',
            content: 'ok',
            payload: {
              citations: [],
              steps: [],
              model: 'llama-4-scout',
              proposal: { kind: 'new', bodyHtml: '<script>x</script>' },
            },
          },
        ],
      }),
    );
    const loaded = loadAskRetaConversation('u1', 'c1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.payload?.proposal).toBeUndefined();
    expect(JSON.stringify(loaded)).not.toContain('script');

    // Off-contract shapes are discarded entirely.
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), turns: [{}] }));
    expect(loadAskRetaConversation('u1', 'c1')).toEqual([]);
    localStorage.setItem(key, '{"version":2,"savedAt":0,"turns":"nope"}');
    expect(loadAskRetaConversation('u1', 'c1')).toEqual([]);
  });

  it('discards an OVERSIZE store without parsing it', () => {
    const key = askRetaConversationKey('u1', 'c1');
    localStorage.setItem(key, `{"version":2,"savedAt":1,"turns":[${'"x",'.repeat(80_000)}"x"]}`);
    expect(loadAskRetaConversation('u1', 'c1')).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('A→B→A: scopes are fully isolated', () => {
    saveAskRetaConversation('u1', 'conn-a', [turn('a1', { content: 'secret de A' })]);
    expect(loadAskRetaConversation('u1', 'conn-b')).toEqual([]);
    expect(localStorage.getItem(askRetaConversationKey('u1', 'conn-b'))).toBeNull();
    const backToA = loadAskRetaConversation('u1', 'conn-a');
    expect(backToA[0]?.content).toBe('secret de A');
  });

  it('rejects a FUTURE savedAt beyond the short clock tolerance', () => {
    const key = askRetaConversationKey('u1', 'c1');
    saveAskRetaConversation('u1', 'c1', [turn('t1')]);
    const stored = JSON.parse(localStorage.getItem(key)!) as { savedAt: number };
    // A forged future stamp would defeat the TTL forever.
    stored.savedAt = Date.now() + 10 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(stored));
    expect(loadAskRetaConversation('u1', 'c1')).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();

    // A small skew (clock drift) stays tolerated.
    saveAskRetaConversation('u1', 'c1', [turn('t1')]);
    const slight = JSON.parse(localStorage.getItem(key)!) as { savedAt: number };
    slight.savedAt = Date.now() + 60 * 1000;
    localStorage.setItem(key, JSON.stringify(slight));
    expect(loadAskRetaConversation('u1', 'c1')).toHaveLength(1);
  });

  it('enforces TTL, cap and effective clear', () => {
    const key = askRetaConversationKey('u1', 'c1');
    // TTL
    saveAskRetaConversation('u1', 'c1', [turn('t1')]);
    const stored = JSON.parse(localStorage.getItem(key)!) as { savedAt: number };
    stored.savedAt = Date.now() - ASK_RETA_CONVERSATION_RETENTION_MS - 1;
    localStorage.setItem(key, JSON.stringify(stored));
    expect(loadAskRetaConversation('u1', 'c1')).toEqual([]);
    // Cap
    const many = Array.from({ length: ASK_RETA_CONVERSATION_CAP + 10 }, (_, i) =>
      turn(`t${i}`, { payload: undefined }),
    );
    saveAskRetaConversation('u1', 'c1', many);
    expect(loadAskRetaConversation('u1', 'c1')).toHaveLength(ASK_RETA_CONVERSATION_CAP);
    // Clear
    clearAskRetaConversation('u1', 'c1');
    expect(localStorage.getItem(key)).toBeNull();
  });
});
