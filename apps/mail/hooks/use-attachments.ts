import { useSecondaryQueriesEnabled } from '@/hooks/use-secondary-queries';
import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

export const useAttachments = (messageId: string) => {
  const { data: session } = useSession();
  const trpc = useTRPC();
  // Secondary on thread open: attachments render below the body — yield the network
  // to mail.get + processEmailContent first.
  const secondaryEnabled = useSecondaryQueriesEnabled();
  const AttachmentsQuery = useQuery(
    trpc.mail.getMessageAttachments.queryOptions(
      { messageId },
      {
        enabled: !!session?.user?.id && !!messageId && secondaryEnabled,
        staleTime: 1000 * 60 * 60,
      },
    ),
  );

  return AttachmentsQuery;
};
