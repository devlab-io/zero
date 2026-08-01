import {
  loadLocalDraft,
  ownedDraftStorageKey,
  saveLocalDraft,
  type DraftOwner,
} from '@/lib/draft-storage';
import { useComposerDraftPersistence } from './use-composer-draft-persistence';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Sonde minimale : expose le retour du hook pour piloter update/clear.
let latest: ReturnType<typeof useComposerDraftPersistence> | null = null;
function Probe({ owner }: { owner: DraftOwner | null }) {
  latest = useComposerDraftPersistence(owner, { threadId: 't1' });
  return null;
}

let container: HTMLDivElement;
let root: Root;

const draft = {
  to: ['x@y.test'],
  cc: [],
  bcc: [],
  subject: 'S',
  message: '<p>corps</p>',
  savedAt: Date.now(),
};

beforeEach(() => {
  localStorage.clear();
  latest = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useComposerDraftPersistence — owner partition (scope-fix)', () => {
  it('FAIL-CLOSED without an owner: no restore, update/clear write NOTHING anywhere', () => {
    act(() => {
      root.render(<Probe owner={null} />);
    });
    expect(latest!.restored).toBeNull();
    act(() => {
      latest!.update(draft);
      latest!.clear();
    });
    expect(localStorage.length).toBe(0);
  });

  it('persists and restores per OWNED key; another owner restores nothing', () => {
    const ownerA = { userId: 'u1', connectionId: 'ca' };
    act(() => {
      root.render(<Probe owner={ownerA} />);
    });
    act(() => {
      latest!.update(draft);
    });
    expect(localStorage.getItem(ownedDraftStorageKey(ownerA, { threadId: 't1' }))).toContain(
      'corps',
    );

    // Remount under owner B, same scope: A's draft is invisible.
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
      root.render(<Probe owner={{ userId: 'u1', connectionId: 'cb' }} />);
    });
    expect(latest!.restored).toBeNull();

    // Back under A: restored.
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
      root.render(<Probe owner={ownerA} />);
    });
    expect(latest!.restored?.message).toBe('<p>corps</p>');
  });
});

describe('useComposerDraftPersistence — owner TRANSITION on the SAME mount (generation guard)', () => {
  // The parent remount (ComposerOwnerGate key) is the first barrier; these
  // tests prove the hook holds the invariant even WITHOUT it: content
  // recorded under A can never be written under B's key.
  const ownerA = { userId: 'u1', connectionId: 'ca' };
  const ownerB = { userId: 'u1', connectionId: 'cb' };
  const keyA = ownedDraftStorageKey(ownerA, { threadId: 't1' });
  const keyB = ownedDraftStorageKey(ownerB, { threadId: 't1' });

  it("A→B without unmount: A's pending snapshot flushes under A only, never under B", () => {
    act(() => {
      root.render(<Probe owner={ownerA} />);
    });
    act(() => {
      latest!.update(draft);
    });
    // Owner switches on the SAME mount (no parent remount).
    act(() => {
      root.render(<Probe owner={ownerB} />);
    });
    // The old key's cleanup flushed A under A…
    expect(loadLocalDraft(keyA)?.message).toBe('<p>corps</p>');
    // …and neither the new key's registration, a pagehide, nor the final
    // unmount may adopt A's snapshot under B.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(localStorage.getItem(keyB)).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    expect(localStorage.getItem(keyB)).toBeNull();
  });

  it("after the transition, B's EXISTING draft is restored and never overwritten by A's state", () => {
    saveLocalDraft(keyB, { ...draft, subject: 'B', message: '<p>corps B</p>' });
    act(() => {
      root.render(<Probe owner={ownerA} />);
    });
    act(() => {
      latest!.update(draft); // A content pending in latestRef
    });
    act(() => {
      root.render(<Probe owner={ownerB} />);
    });
    expect(latest!.restored?.message).toBe('<p>corps B</p>');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => root.unmount());
    root = createRoot(container);
    expect(loadLocalDraft(keyB)?.message).toBe('<p>corps B</p>');
  });

  it('unresolved→resolved: updates recorded while owner was null never surface under the resolved key', () => {
    saveLocalDraft(keyB, { ...draft, message: '<p>corps B</p>' });
    act(() => {
      root.render(<Probe owner={null} />);
    });
    act(() => {
      latest!.update(draft); // dropped: fail-closed, not even buffered
    });
    act(() => {
      root.render(<Probe owner={ownerB} />);
    });
    expect(latest!.restored?.message).toBe('<p>corps B</p>');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => root.unmount());
    root = createRoot(container);
    expect(loadLocalDraft(keyB)?.message).toBe('<p>corps B</p>');
  });

  it('a STALE update callback captured under A writes under A — B stays untouched', () => {
    act(() => {
      root.render(<Probe owner={ownerA} />);
    });
    const staleUpdate = latest!.update;
    act(() => {
      root.render(<Probe owner={ownerB} />);
    });
    act(() => {
      staleUpdate({ ...draft, message: '<p>tardif A</p>' });
    });
    expect(loadLocalDraft(keyA)?.message).toBe('<p>tardif A</p>');
    expect(localStorage.getItem(keyB)).toBeNull();
    // Even the flush registered for B (pagehide + unmount) refuses the
    // A-tagged snapshot the stale callback just recorded.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => root.unmount());
    root = createRoot(container);
    expect(localStorage.getItem(keyB)).toBeNull();
  });
});
