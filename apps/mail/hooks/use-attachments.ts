import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

export function shouldFetchMessageAttachments(
  attachments?: readonly { attachmentId?: string }[],
): boolean {
  return Boolean(attachments?.some((attachment) => attachment.attachmentId));
}

export const useAttachments = (messageId: string, options?: { enabled?: boolean }) => {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const AttachmentsQuery = useQuery(
    trpc.mail.getMessageAttachments.queryOptions(
      { messageId },
      {
        enabled: (options?.enabled ?? true) && !!session?.user?.id && !!messageId,
        staleTime: 1000 * 60 * 60,
      },
    ),
  );

  return AttachmentsQuery;
};
