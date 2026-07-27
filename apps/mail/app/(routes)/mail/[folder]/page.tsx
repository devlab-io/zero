import { useLoaderData, useNavigate } from 'react-router';

import { MailLayout } from '@/components/mail/mail';
import { useLabels } from '@/hooks/use-labels';
import { authProxy } from '@/lib/auth-proxy';
import { useEffect, useState } from 'react';
import type { Route } from './+types/page';
import { log } from '@/lib/log';

const ALLOWED_FOLDERS = new Set(['inbox', 'draft', 'sent', 'spam', 'bin', 'archive', 'snoozed']);

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  if (!params.folder) return Response.redirect(`${import.meta.env.VITE_PUBLIC_APP_URL}/mail/inbox`);

  // Devlab (perf) : ne pas bloquer le rendu sur la session. Mesuré sur staging,
  // cet `await` retenait la route 2,4 s en régime établi (8,8 s au premier
  // chargement) et retardait d'autant le batch tRPC de la liste, alors que le
  // backend refuse déjà toute requête non authentifiée. La garde reste en
  // place : elle s'exécute en parallèle et redirige si la session est absente.
  void authProxy.api
    .getSession({ headers: request.headers })
    .then((session) => {
      if (!session) window.location.href = `${import.meta.env.VITE_PUBLIC_APP_URL}/login`;
    })
    .catch((error: unknown) => {
      // Échec réseau transitoire : ne pas rediriger (le backend refuse déjà les
      // requêtes non authentifiées), ne pas laisser un rejet non capté.
      log.error('[clientLoader] Vérification de session non bloquante échouée', error);
    });

  return {
    folder: params.folder,
  };
}

export default function MailPage() {
  const { folder } = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const [isLabelValid, setIsLabelValid] = useState<boolean | null>(true);

  const isStandardFolder = ALLOWED_FOLDERS.has(folder);

  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  useEffect(() => {
    if (isStandardFolder) {
      setIsLabelValid(true);
      return;
    }

    if (isLoadingLabels) return;

    if (userLabels) {
      const checkLabelExists = (labels: any[]): boolean => {
        for (const label of labels) {
          if (label.id === folder) return true;
          if (label.labels && label.labels.length > 0) {
            if (checkLabelExists(label.labels)) return true;
          }
        }
        return false;
      };

      const labelExists = checkLabelExists(userLabels);
      setIsLabelValid(labelExists);

      if (!labelExists) {
        const timer = setTimeout(() => {
          navigate('/mail/inbox');
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else {
      setIsLabelValid(false);
    }
  }, [folder, userLabels, isLoadingLabels, isStandardFolder, navigate]);

  if (!isLabelValid) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center">
        <h2 className="text-xl font-semibold">Folder not found</h2>
        <p className="text-muted-foreground mt-2">
          The folder you're looking for doesn't exist. Redirecting to inbox...
        </p>
      </div>
    );
  }

  return <MailLayout />;
}
