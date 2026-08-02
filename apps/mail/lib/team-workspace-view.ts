export type TeamWorkspaceView = 'shared' | 'assigned' | 'mentions' | 'ops' | 'integrations';

export function resolveTeamWorkspaceView(value: string | null): TeamWorkspaceView {
  return value === 'assigned' || value === 'mentions' || value === 'ops' || value === 'integrations'
    ? value
    : 'shared';
}

export function selectMentionNotifications<
  T extends { kind: string; teamThreadId?: string | null },
>(notifications: readonly T[]): T[] {
  return notifications.filter(
    (notification) => notification.kind === 'mention' && Boolean(notification.teamThreadId),
  );
}
