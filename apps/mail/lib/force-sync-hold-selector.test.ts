import {
  findForceSyncSnapshot,
  nextForceSyncHoldPhase,
  selectForceSyncHoldItems,
  type ForceSyncHoldPhaseTransition,
  type ForceSyncSnapshot,
} from './force-sync-hold-selector';
import { describe, expect, it } from 'vitest';

// forceSync hold (~40-45s repopulate window measured via wrangler tail on
// 2026-07-25): while active and the live view is still empty, the last known
// list for that exact view must be shown instead of a blank inbox.

describe('selectForceSyncHoldItems', () => {
  it('hold inactive → always the live list, snapshot ignored', () => {
    expect(
      selectForceSyncHoldItems({ active: false, freshItems: [], snapshotItems: ['a', 'b'] }),
    ).toEqual([]);
  });

  it('hold active + live list empty + snapshot present → shows the snapshot', () => {
    expect(
      selectForceSyncHoldItems({ active: true, freshItems: [], snapshotItems: ['a', 'b'] }),
    ).toEqual(['a', 'b']);
  });

  it('hold active + live list already non-empty → live list wins (resync caught up)', () => {
    expect(
      selectForceSyncHoldItems({ active: true, freshItems: ['fresh'], snapshotItems: ['a', 'b'] }),
    ).toEqual(['fresh']);
  });

  it('hold active + live list empty + no snapshot for this view → empty (never fabricates rows)', () => {
    expect(
      selectForceSyncHoldItems({ active: true, freshItems: [], snapshotItems: undefined }),
    ).toEqual([]);
  });

  it('hold active + live list empty + empty snapshot → empty, not stuck', () => {
    expect(selectForceSyncHoldItems({ active: true, freshItems: [], snapshotItems: [] })).toEqual(
      [],
    );
  });
});

describe('nextForceSyncHoldPhase', () => {
  it('no-op when the hold was never active', () => {
    expect(
      nextForceSyncHoldPhase({ active: false, purgeObserved: false, freshItemsLength: 5 }),
    ).toBe('none');
  });

  it('does NOT deactivate on the pre-purge non-empty cache right after arming (the bug this guards against)', () => {
    // At the instant of the click the server hasn't purged the client's cache
    // yet — the live query still resolves with the OLD, non-empty list. A
    // naive `active && freshItemsLength > 0` deactivation would disarm here,
    // before the empty page the hold exists to bridge ever shows up.
    expect(
      nextForceSyncHoldPhase({ active: true, purgeObserved: false, freshItemsLength: 12 }),
    ).toBe('none');
  });

  it('latches purgeObserved once the empty page (the actual purge) reaches the client', () => {
    expect(
      nextForceSyncHoldPhase({ active: true, purgeObserved: false, freshItemsLength: 0 }),
    ).toBe('observe-purge');
  });

  it('stays armed on further empty pages once the purge is already observed', () => {
    expect(nextForceSyncHoldPhase({ active: true, purgeObserved: true, freshItemsLength: 0 })).toBe(
      'none',
    );
  });

  it('deactivates on a non-empty response that FOLLOWS an observed purge (genuine repopulate)', () => {
    expect(nextForceSyncHoldPhase({ active: true, purgeObserved: true, freshItemsLength: 7 })).toBe(
      'deactivate',
    );
  });

  it('replays the real sequence end-to-end: this is the test that would have caught the bug', () => {
    // Simulates a hold driven purely by nextForceSyncHoldPhase, the same way
    // use-threads.ts' effect drives it, across the actual timeline observed
    // in production (wrangler tail, 2026-07-25):
    //   armed (pre-purge cache still full) -> purge reaches client (empty) ->
    //   still empty while the workflow repopulates -> repopulated (non-empty).
    let purgeObserved = false;
    const transitions: ForceSyncHoldPhaseTransition[] = [];
    const drive = (freshItemsLength: number) => {
      const phase = nextForceSyncHoldPhase({ active: true, purgeObserved, freshItemsLength });
      transitions.push(phase);
      if (phase === 'observe-purge') purgeObserved = true;
      return phase;
    };

    expect(drive(12)).toBe('none'); // onMutate fires; cache still has the pre-purge list
    expect(purgeObserved).toBe(false);
    expect(drive(0)).toBe('observe-purge'); // the purge lands on the client
    expect(purgeObserved).toBe(true);
    expect(drive(0)).toBe('none'); // still repopulating
    expect(drive(0)).toBe('none'); // still repopulating
    expect(drive(9)).toBe('deactivate'); // workflow repopulated the view

    expect(transitions).toEqual(['none', 'observe-purge', 'none', 'none', 'deactivate']);
  });
});

describe('findForceSyncSnapshot', () => {
  const snapshots: ForceSyncSnapshot<string>[] = [
    { hash: 'inbox-hash', items: ['a', 'b'] },
    { hash: 'sent-hash', items: ['c'] },
  ];

  it('matches the snapshot captured for the exact view (queryKey hash)', () => {
    expect(findForceSyncSnapshot(snapshots, 'sent-hash')).toEqual(['c']);
  });

  it('returns undefined when no snapshot was captured for this view (e.g. new folder)', () => {
    expect(findForceSyncSnapshot(snapshots, 'drafts-hash')).toBeUndefined();
  });

  it('returns undefined on an empty snapshot list', () => {
    expect(findForceSyncSnapshot([], 'inbox-hash')).toBeUndefined();
  });
});
