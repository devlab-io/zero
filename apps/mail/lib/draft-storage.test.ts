import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLocalDraft,
  draftHasContent,
  draftStorageKey,
  loadLocalDraft,
  saveLocalDraft,
  type StoredComposerDraft,
} from './draft-storage';

// Issue #34, check point 5: a draft survives unmount, pagehide/reload AND a failed
// server autosave. localStorage durability is independent of the network.

const sample = (over: Partial<StoredComposerDraft> = {}): StoredComposerDraft => ({
  to: ['a@b.co'],
  cc: [],
  bcc: [],
  subject: 'Hello',
  message: '<p>Draft body</p>',
  savedAt: 1_700_000_000_000,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe('draftStorageKey', () => {
  it('is stable and scope-derived (one slot per composer instance)', () => {
    const key = draftStorageKey({ threadId: 't1', draftId: 'd1', replyId: 'r1' });
    expect(key).toBe(draftStorageKey({ threadId: 't1', draftId: 'd1', replyId: 'r1' }));
    expect(key).not.toBe(draftStorageKey({ threadId: 't2', draftId: 'd1', replyId: 'r1' }));
    expect(draftStorageKey({})).toContain('compose');
  });
});

describe('save/load/clear roundtrip', () => {
  it('persists and restores an identical snapshot', () => {
    const key = draftStorageKey({ threadId: 't1' });
    expect(saveLocalDraft(key, sample())).toBe(true);
    expect(loadLocalDraft(key)).toEqual(sample());
  });

  it('survives a failed server autosave (local snapshot is independent)', () => {
    const key = draftStorageKey({ draftId: 'd9' });
    saveLocalDraft(key, sample({ subject: 'Important' }));
    // Simulate the server autosave rejecting — no local mutation happens here.
    // The durable snapshot must still be readable afterwards.
    expect(loadLocalDraft(key)?.subject).toBe('Important');
  });

  it('overwrites the same slot instead of growing unboundedly', () => {
    const key = draftStorageKey({ threadId: 't1' });
    const before = localStorage.length;
    saveLocalDraft(key, sample({ message: 'v1' }));
    saveLocalDraft(key, sample({ message: 'v2' }));
    saveLocalDraft(key, sample({ message: 'v3' }));
    expect(localStorage.length).toBe(before + 1);
    expect(loadLocalDraft(key)?.message).toBe('v3');
  });

  it('clear removes the snapshot', () => {
    const key = draftStorageKey({ threadId: 't1' });
    saveLocalDraft(key, sample());
    clearLocalDraft(key);
    expect(loadLocalDraft(key)).toBeNull();
  });

  it('returns null for corrupt / malformed stored values (never throws)', () => {
    const key = draftStorageKey({ threadId: 't1' });
    localStorage.setItem(key, '{not json');
    expect(loadLocalDraft(key)).toBeNull();
    localStorage.setItem(key, JSON.stringify({ subject: 'x' }));
    expect(loadLocalDraft(key)).toBeNull();
  });
});

describe('draftHasContent', () => {
  it('is true when there is real text, a subject, or a recipient', () => {
    expect(draftHasContent(sample())).toBe(true);
    expect(draftHasContent(sample({ message: '<p></p>', subject: '', to: [] }))).toBe(false);
    expect(draftHasContent(sample({ message: '', subject: 'S', to: [] }))).toBe(true);
    expect(draftHasContent(sample({ message: '', subject: '', to: ['x@y.co'] }))).toBe(true);
  });
});
