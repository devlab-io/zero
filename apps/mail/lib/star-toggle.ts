import type { OptimisticAction } from '@/store/optimistic-updates';

type OptimisticActions = Record<string, OptimisticAction>;

export function resolveStarredState(
  threadId: string,
  baseStarred: boolean,
  optimisticActions: OptimisticActions,
) {
  return Object.values(optimisticActions).reduce((starred, action) => {
    if (action.type !== 'STAR' || !action.threadIds.includes(threadId)) return starred;
    return action.starred;
  }, baseStarred);
}

export function resolveNextStarredState(
  threadIds: string[],
  baseStarredByThread: Record<string, boolean>,
  optimisticActions: OptimisticActions,
) {
  if (!threadIds.length) return true;
  const everyThreadIsStarred = threadIds.every((threadId) =>
    resolveStarredState(threadId, baseStarredByThread[threadId] ?? false, optimisticActions),
  );
  return !everyThreadIsStarred;
}
