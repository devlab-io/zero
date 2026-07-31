import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { useSession } from '@/lib/auth-client';
import { useCallback } from 'react';

export function shouldFetchMessageAttachments(
  attachments?: readonly { attachmentId?: string }[],
): boolean {
  return Boolean(attachments?.some((attachment) => attachment.attachmentId));
}

/**
 * Les refs `cid:` restent dans le corps depuis que le sync n'inline plus les
 * images (chemin froid 4-7 s). Ce hook ne télécharge QUE les images inline du
 * message (inlineOnly), après le premier paint du corps, jamais les vraies
 * pièces jointes.
 */
export const useInlineImages = (messageId: string, enabled: boolean) => {
  const { data: session } = useSession();
  const trpc = useTRPC();
  return useQuery(
    trpc.mail.getMessageAttachments.queryOptions(
      { messageId, inlineOnly: true },
      {
        enabled: enabled && !!session?.user?.id && !!messageId,
        staleTime: 1000 * 60 * 60,
      },
    ),
  );
};

/**
 * Téléchargement des corps de pièces jointes à la demande (clic ouvrir /
 * télécharger). Plus aucun fetch de corps au rendu du message : les puces se
 * dessinent depuis les métadonnées déjà présentes dans le thread. React Query
 * mutualise et met en cache le premier clic (staleTime 1 h).
 */
export const useFetchAttachmentBodies = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    (messageId: string) =>
      queryClient.fetchQuery(
        trpc.mail.getMessageAttachments.queryOptions({ messageId }, { staleTime: 1000 * 60 * 60 }),
      ),
    [queryClient, trpc],
  );
};
