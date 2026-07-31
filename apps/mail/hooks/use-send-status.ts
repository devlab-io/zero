import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { planSendWatch, sendWatchAction, type SendWatchStatus } from '@/lib/send-watch';
import { useTRPC } from '@/providers/query-provider';
import { m } from '@/paraglide/messages';

/**
 * Suivi post-enqueue d'un envoi : mail.send répond dès l'enqueue durable
 * (send_job + Queue), l'issue Gmail arrive après coup. Ce watcher sonde
 * getSendStatus aux jalons de lib/send-watch et, sur `failed`, affiche un
 * toast d'erreur avec action Retry (le payload est conservé côté serveur).
 * Fire-and-forget : il survit à la fermeture du composer, pas de la page.
 */
export const useSendStatusWatch = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: retrySend } = useMutation(trpc.mail.retrySend.mutationOptions());

  const watchSendStatus = useCallback(
    (messageId: string, sendAt?: number) => {
      const delays = planSendWatch(sendAt, Date.now());
      if (!delays) return;

      const showFailure = () => {
        toast.error(m['pages.createEmail.failedToSendEmail'](), {
          duration: 60_000,
          closeButton: true,
          action: {
            label: m['states.retry'](),
            onClick: async () => {
              try {
                const result = await retrySend({ messageId });
                if (result && 'success' in result && result.success === false) {
                  toast.error(m['pages.createEmail.failedToSendEmail']());
                  return;
                }
                watchSendStatus(messageId);
              } catch {
                toast.error(m['pages.createEmail.failedToSendEmail']());
              }
            },
          },
        });
      };

      const poll = async (index: number) => {
        let status: SendWatchStatus = 'unknown';
        try {
          const result = await queryClient.fetchQuery(
            trpc.mail.getSendStatus.queryOptions({ messageId }, { staleTime: 0 }),
          );
          status = (result?.status ?? 'unknown') as SendWatchStatus;
        } catch {
          // Erreur réseau : re-tenter au jalon suivant plutôt qu'alerter à tort.
        }
        const action = sendWatchAction(status);
        if (action === 'stop') return;
        if (action === 'alert') {
          showFailure();
          return;
        }
        const nextIndex = index + 1;
        if (nextIndex < delays.length) {
          setTimeout(() => void poll(nextIndex), delays[nextIndex] - delays[index]);
        }
      };

      setTimeout(() => void poll(0), delays[0]);
    },
    [queryClient, retrySend, trpc],
  );

  return { watchSendStatus };
};
