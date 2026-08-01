import { useComposerDraftPersistence } from './use-composer-draft-persistence';
import { ownedDraftStorageKey, type DraftOwner } from '@/lib/draft-storage';
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
