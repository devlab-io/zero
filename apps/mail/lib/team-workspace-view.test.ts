import { resolveTeamWorkspaceView, selectMentionNotifications } from './team-workspace-view';
import { describe, expect, it } from 'vitest';

describe('team workspace dedicated views', () => {
  it('exposes stable Shared, Assigned, Mentions and Ops URL modes', () => {
    expect(resolveTeamWorkspaceView(null)).toBe('shared');
    expect(resolveTeamWorkspaceView('assigned')).toBe('assigned');
    expect(resolveTeamWorkspaceView('mentions')).toBe('mentions');
    expect(resolveTeamWorkspaceView('ops')).toBe('ops');
    expect(resolveTeamWorkspaceView('unknown')).toBe('shared');
  });

  it('keeps only thread-addressable mention notifications', () => {
    expect(
      selectMentionNotifications([
        { id: 'm1', kind: 'mention', teamThreadId: 'tt-1' },
        { id: 'c1', kind: 'comment', teamThreadId: 'tt-2' },
        { id: 'm2', kind: 'mention', teamThreadId: null },
      ]),
    ).toEqual([{ id: 'm1', kind: 'mention', teamThreadId: 'tt-1' }]);
  });
});
