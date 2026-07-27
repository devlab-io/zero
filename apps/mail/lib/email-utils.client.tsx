import { getListUnsubscribeAction } from '@/lib/email-utils';
import { trpcClient } from '@/providers/query-provider';
import type { ParsedMessage } from '@/types';
import { log } from '@/lib/log';

// Audit : ce fichier portait un second moteur de rendu d'email, SANS APPELANT — `EmailTemplate`
// (`<div dangerouslySetInnerHTML>` alimenté par du HTML d'expéditeur), `template()`,
// `addStyleTags()`, `doesContainStyleTags()` et leurs auxiliaires (`proxyImageUrls`,
// `forceExternalLinks`, `getProxiedUrl`, `generateNonce`). Aucun n'était référencé nulle part
// dans le dépôt. Du code mort qui redevient dangereux dès qu'un appelant apparaît : c'est un
// puits XSS complet, doublon d'un chemin de rendu déjà assaini côté serveur. Supprimé plutôt
// que durci — le seul export vivant est `handleUnsubscribe`, utilisé par
// `components/mail/thread-display.tsx`.

export const handleUnsubscribe = async ({ emailData }: { emailData: ParsedMessage }) => {
  try {
    if (emailData.listUnsubscribe) {
      const listUnsubscribeAction = getListUnsubscribeAction({
        listUnsubscribe: emailData.listUnsubscribe,
        listUnsubscribePost: emailData.listUnsubscribePost,
      });
      if (listUnsubscribeAction) {
        switch (listUnsubscribeAction.type) {
          case 'get':
            window.open(listUnsubscribeAction.url, '_blank');
            break;
          case 'post':
            const controller = new AbortController();
            const timeoutId = setTimeout(
              () => controller.abort(),
              10000, // 10 seconds
            );

            await fetch(listUnsubscribeAction.url, {
              mode: 'no-cors',
              method: 'POST',
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
              },
              body: listUnsubscribeAction.body,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return true;
          case 'email':
            await trpcClient.mail.send.mutate({
              to: [
                {
                  email: listUnsubscribeAction.emailAddress,
                  name: listUnsubscribeAction.emailAddress,
                },
              ],
              subject: listUnsubscribeAction.subject.trim().length
                ? listUnsubscribeAction.subject
                : 'Unsubscribe Request',
              message: 'Zero sent this email to unsubscribe from this mailing list.',
            });
            return true;
        }
        // track('Unsubscribe', {
        //   domain: emailData.sender.email.split('@')?.[1] ?? 'unknown',
        // });
      }
    }
  } catch (error) {
    log.warn('Error unsubscribing', emailData);
    throw error;
  }
};
