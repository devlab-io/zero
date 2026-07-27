import { useMutation } from '@tanstack/react-query';
import { m } from '@/paraglide/messages';
import { log } from '@/lib/log';
import { toast } from 'sonner';

import type { UserSettings } from '@zero/server/schemas';
import { useTRPC } from '@/providers/query-provider';
import { isSendResult } from '@/lib/email-utils';

export type EmailData = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  attachments: File[];
  fromEmail?: string;
  scheduleAt?: string;
};

export type SerializedFile = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  data: string;
};

type SerializableEmailData = Omit<EmailData, 'attachments'> & {
  attachments: SerializedFile[];
};

const serializeFiles = async (files: File[]): Promise<SerializedFile[]> => {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      data: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }),
    })),
  );
};

export const deserializeFiles = (serializedFiles: SerializedFile[]): File[] => {
  return serializedFiles.map(({ data, name, type, lastModified }) => {
    const byteString = atob(data);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteArray[i] = byteString.charCodeAt(i);
    }
    return new File([byteArray], name, { type, lastModified });
  });
};

export const useUndoSend = () => {
  const trpc = useTRPC();
  const { mutateAsync: unsendEmail } = useMutation(trpc.mail.unsend.mutationOptions());

  const handleUndoSend = (
    result: unknown,
    settings: { settings: UserSettings } | undefined,
    emailData?: EmailData,
  ) => {
    if (isSendResult(result) && settings?.settings?.undoSendEnabled) {
      const { messageId, sendAt } = result;

      const timeRemaining = sendAt ? Math.max(0, sendAt - Date.now()) : 15_000;
      const wasUserScheduled = Boolean(emailData?.scheduleAt);

      if (timeRemaining > 5_000) {
        if (wasUserScheduled) {
          toast.success(m['common.undoSend.emailScheduled'](), {
            action: {
              label: m['common.undoSend.undo'](),
              onClick: async () => {
                try {
                  const result = await unsendEmail({ messageId });

                  // `mail.unsend` NE JETTE PAS quand l'annulation arrive trop tard : depuis
                  // que la barrière forte (Durable Object) tranche, un envoi en vol ou déjà
                  // réglé REND `{ success: false }`. Annoncer « planification annulée » sur
                  // une promesse simplement résolue serait donc un mensonge : le mail part.
                  if (!result?.success) {
                    log.error('Scheduled send cancellation refused', {
                      messageId,
                      reason: result?.error,
                    });
                    toast.error(m['common.undoSend.tooLateToCancel']());
                    return;
                  }

                  toast.info(m['common.undoSend.scheduleCancelled']());
                } catch (error) {
                  // Sans trace, une annulation d'envoi programmé qui échoue ne laissait
                  // aucun moyen de savoir POURQUOI le message est parti quand même.
                  log.error('Failed to cancel scheduled send', { messageId, error });
                  toast.error(m['common.undoSend.failedToCancel']());
                }
              },
            },
            duration: 15_000,
            closeButton: true,
          });
        } else {
          toast.success(m['common.undoSend.emailSent'](), {
            action: {
              label: m['common.undoSend.undo'](),
              onClick: async () => {
                try {
                  const result = await unsendEmail({ messageId });

                  // Refus « trop tard » : le mail EST parti. On sort avant toute réécriture
                  // d'état — pas de brouillon réinjecté dans localStorage, pas de composeur
                  // rouvert. Rouvrir le composeur laisserait croire que l'envoi a été repris,
                  // alors que le destinataire a déjà le message.
                  if (!result?.success) {
                    log.error('Undo send refused', { messageId, reason: result?.error });
                    toast.error(m['common.undoSend.tooLateToCancel']());
                    return;
                  }

                  if (emailData) {
                    const serializedAttachments = await serializeFiles(emailData.attachments);
                    const serializableData: SerializableEmailData = {
                      ...emailData,
                      attachments: serializedAttachments,
                    };
                    localStorage.setItem('undoEmailData', JSON.stringify(serializableData));
                  }

                  const url = new URL(window.location.href);
                  url.searchParams.delete('activeReplyId');
                  url.searchParams.delete('mode');
                  url.searchParams.delete('draftId');
                  url.searchParams.set('isComposeOpen', 'true');
                  window.history.replaceState({}, '', url.toString());

                  toast.info(m['common.undoSend.sendCancelled']());
                } catch (error) {
                  // Même défaut sur le chemin « annuler l'envoi immédiat » : l'échec de
                  // `unsend` (ou de la sérialisation des pièces jointes) était muet.
                  log.error('Failed to undo send', { messageId, error });
                  toast.error(m['common.undoSend.failedToCancel']());
                }
              },
            },
            duration: 15_000,
            closeButton: true,
          });
        }
      }
    }
  };

  return { handleUndoSend };
};
