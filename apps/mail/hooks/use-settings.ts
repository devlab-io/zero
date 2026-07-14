import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

export function useSettings() {
  const { data: session } = useSession();
  const trpc = useTRPC();

  // better-auth 1.6 emits a transient session WITHOUT `user` during hydration.
  // Guarding the second hop (`user?.id`) stops the boot-time crash (issue #34,
  // ruling 1). While the session is indeterminate the query stays disabled, so
  // `data` is undefined (an honest indeterminate state — never success-shaped).
  const settingsQuery = useQuery(
    trpc.settings.get.queryOptions(void 0, {
      enabled: !!session?.user?.id,
      staleTime: Infinity,
    }),
  );

  return settingsQuery;
}
