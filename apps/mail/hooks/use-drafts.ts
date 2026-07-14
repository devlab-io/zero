import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

export const useDraft = (id: string | null) => {
  const { data: session } = useSession();
  const trpc = useTRPC();
  // Guard the second hop (`user?.id`): better-auth 1.6 emits a transient session
  // without `user` during hydration (issue #34, D2 ruling — third twin guard).
  const draftQuery = useQuery(
    trpc.drafts.get.queryOptions(
      { id: id ?? '' },
      { enabled: !!session?.user?.id && !!id, staleTime: 1000 * 60 * 60 },
    ),
  );
  return draftQuery;
};
