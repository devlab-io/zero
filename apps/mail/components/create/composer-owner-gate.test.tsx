import {
  loadLocalDraft,
  ownedDraftStorageKey,
  saveLocalDraft,
  type DraftOwner,
  type StoredComposerDraft,
} from '@/lib/draft-storage';
import { useComposerDraftPersistence } from '@/hooks/use-composer-draft-persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerOwnerGate } from './composer-owner-gate';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Session / connexion pilotables : le gate lit ces holders à chaque render.
const sessionState: { data: { user: { id: string } } | null } = { data: null };
const connectionState: { data: { id: string } | null } = { data: null };
vi.mock('@/lib/auth-client', () => ({ useSession: () => sessionState }));
vi.mock('@/hooks/use-connections', () => ({ useActiveConnection: () => connectionState }));

/**
 * Intégration owner-transition (P1 2026-08-01) : le gate + le VRAI hook de
 * persistance, avec une sonde qui reproduit le contrat du composeur — l'état
 * « formulaire » est semé UNE FOIS au montage depuis la restauration ownée
 * (comme useForm defaultValues / TipTap content) et publié via update().
 */
let mounts = 0;
let probe: {
  owner: DraftOwner;
  seed: string;
  restored: StoredComposerDraft | null;
  update: (s: StoredComposerDraft) => void;
} | null = null;

function ComposerProbe({ owner }: { owner: DraftOwner }) {
  const { restored, update } = useComposerDraftPersistence(owner, {});
  // Semé au montage uniquement — un remount est le SEUL moyen d'en changer.
  const [seed] = useState(() => restored?.message ?? '');
  useEffect(() => {
    mounts += 1;
  }, []);
  probe = { owner, seed, restored, update };
  return <div data-testid="probe">{seed}</div>;
}

const renderGate = (root: Root) =>
  act(() => {
    root.render(
      <ComposerOwnerGate>{(owner) => <ComposerProbe owner={owner} />}</ComposerOwnerGate>,
    );
  });

const snapshot = (message: string): StoredComposerDraft => ({
  to: ['x@y.test'],
  cc: [],
  bcc: [],
  subject: 'S',
  message,
  savedAt: Date.now(),
});

const ownerA = { userId: 'user-1', connectionId: 'conn-a' };
const ownerB = { userId: 'user-1', connectionId: 'conn-b' };
const keyA = ownedDraftStorageKey(ownerA, {});
const keyB = ownedDraftStorageKey(ownerB, {});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  mounts = 0;
  probe = null;
  sessionState.data = null;
  connectionState.data = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ComposerOwnerGate — owner transition (P1)', () => {
  it('paints NOTHING while session/connection are unresolved (fail-closed)', () => {
    renderGate(root);
    expect(container.textContent).toBe('');
    expect(mounts).toBe(0);

    // Session alone is not an owner.
    sessionState.data = { user: { id: ownerA.userId } };
    renderGate(root);
    expect(mounts).toBe(0);
  });

  it("connection A→B WITHOUT manual unmount: the composer REMOUNTS, A's content flushes under A and never appears under B", () => {
    sessionState.data = { user: { id: ownerA.userId } };
    connectionState.data = { id: ownerA.connectionId };
    renderGate(root);
    expect(mounts).toBe(1);

    // The user typed under A (live composer state + durable autosave).
    act(() => {
      probe!.update(snapshot('<p>corps A</p>'));
    });

    // Account/connection switch — the parent just re-renders, no manual unmount.
    connectionState.data = { id: ownerB.connectionId };
    renderGate(root);

    // Atomic remount: a NEW instance, seeded from B's (empty) restore.
    expect(mounts).toBe(2);
    expect(probe!.owner).toEqual(ownerB);
    expect(probe!.seed).toBe('');

    // A's content landed under A's key only; B's slot never received it.
    expect(loadLocalDraft(keyA)?.message).toBe('<p>corps A</p>');
    expect(localStorage.getItem(keyB)).toBeNull();

    // A late pagehide after the switch still writes nothing under B — this is
    // exactly what Ask Reta's owned fallback for B would read.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(localStorage.getItem(keyB)).toBeNull();
  });

  it("B's EXISTING draft appears after the switch and is not overwritten by A's state", () => {
    saveLocalDraft(keyB, snapshot('<p>corps B</p>'));
    sessionState.data = { user: { id: ownerA.userId } };
    connectionState.data = { id: ownerA.connectionId };
    renderGate(root);
    act(() => {
      probe!.update(snapshot('<p>corps A</p>'));
    });

    connectionState.data = { id: ownerB.connectionId };
    renderGate(root);

    // The new instance is seeded from B's restore — never from A's live state.
    expect(probe!.seed).toBe('<p>corps B</p>');
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    act(() => root.unmount());
    root = createRoot(container);
    expect(loadLocalDraft(keyB)?.message).toBe('<p>corps B</p>');
    expect(loadLocalDraft(keyA)?.message).toBe('<p>corps A</p>');
  });

  it('unresolved→resolved: the composer mounts DIRECTLY on the owner restore — nothing to overwrite it', () => {
    saveLocalDraft(keyB, snapshot('<p>corps B</p>'));
    renderGate(root); // unresolved: nothing painted, no instance to leak from
    expect(mounts).toBe(0);

    sessionState.data = { user: { id: ownerB.userId } };
    connectionState.data = { id: ownerB.connectionId };
    renderGate(root);
    expect(mounts).toBe(1);
    expect(probe!.seed).toBe('<p>corps B</p>');
    expect(loadLocalDraft(keyB)?.message).toBe('<p>corps B</p>');
  });
});
