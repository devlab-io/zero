import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';

export function useEmailAliases() {
  const trpc = useTRPC();
  const emailAliasesQuery = useQuery(
    trpc.mail.getEmailAliases.queryOptions(void 0, {
      // The tRPC output is branded `& Disposable` (Cloudflare Durable Object RPC
      // return type), which a plain array literal cannot satisfy. The cast strips
      // the phantom brand from the empty seed only — the runtime value stays `[]`.
      initialData: [] as unknown as { email: string; name?: string; primary?: boolean }[] &
        Disposable,
    }),
  );
  return emailAliasesQuery;
}
