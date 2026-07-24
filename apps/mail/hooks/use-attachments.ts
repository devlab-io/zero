import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { useSession } from '@/lib/auth-client';
import { useCallback } from 'react';

/**
 * Liste complète des pièces jointes, CORPS INCLUS.
 *
 * Devlab/perf — coûteux par nature : le serveur rapatrie le message entier
 * puis le contenu de toutes les pièces jointes (p50 3,4 s mesuré sur staging).
 * Ne l'employer que lorsque les octets sont réellement nécessaires d'un bloc,
 * par exemple un téléchargement groupé. Pour AFFICHER la liste, utiliser les
 * métadonnées déjà présentes dans la projection du fil (`message.attachments`,
 * corps vides) — voir `useAttachmentBodyLoader` pour le chargement à la
 * demande d'une pièce précise.
 */
export const useAttachments = (messageId: string, enabled = true) => {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const AttachmentsQuery = useQuery(
    trpc.mail.getMessageAttachments.queryOptions(
      { messageId },
      { enabled: enabled && !!session?.user?.id && !!messageId, staleTime: 1000 * 60 * 60 },
    ),
  );

  return AttachmentsQuery;
};

type AttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

/**
 * Charge le corps d'UNE pièce jointe, à la demande.
 *
 * Le résultat est mis en cache par react-query : rouvrir la même pièce ne
 * refait pas l'aller-retour. Rien n'est téléchargé tant que l'utilisateur n'a
 * pas cliqué.
 */
export const useAttachmentBodyLoader = (messageId: string) => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useCallback(
    async <T extends AttachmentMeta>(attachment: T): Promise<T & { body: string }> => {
      const { body } = await queryClient.fetchQuery(
        trpc.mail.getAttachmentBody.queryOptions(
          { messageId, attachmentId: attachment.attachmentId },
          { staleTime: 1000 * 60 * 60 },
        ),
      );
      return { ...attachment, body };
    },
    [queryClient, trpc, messageId],
  );
};
