import { useActiveConnection } from '@/hooks/use-connections';
import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export function getLocalActivityWindow(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const week = new Date(today);
  const day = week.getDay();
  week.setDate(week.getDate() - (day === 0 ? 6 : day - 1));

  return { todayStartMs: today.getTime(), weekStartMs: week.getTime() };
}

export function useMailboxOverview() {
  const trpc = useTRPC();
  const { data: activeConnection } = useActiveConnection();
  const window = useMemo(() => getLocalActivityWindow(), []);
  const connectionId = activeConnection?.id ?? '';

  return useQuery(
    trpc.mail.mailboxOverview.queryOptions(
      { connectionId, ...window },
      {
        enabled: Boolean(connectionId),
        staleTime: 30_000,
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
      },
    ),
  );
}
