import { useTRPC } from '@/providers/query-provider';
import { useSearchParams, Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { m } from '@/paraglide/messages';
import { Loader2 } from 'lucide-react';

/**
 * Retour OAuth Linear (P18) — page AUTHENTIFIÉE : lit state+code, appelle
 * integrations.completeInstall UNE fois (l'échange PKCE + le scellement des
 * tokens sont serveur ; rien de sensible ne transite ici), affiche l'issue et
 * renvoie vers /team?view=integrations. En cas d'échec : message + retour —
 * jamais de retry automatique (le state est consommé une seule fois).
 */
export default function LinearCallbackPage() {
  const [searchParams] = useSearchParams();
  const trpc = useTRPC();
  const complete = useMutation(trpc.integrations.completeInstall.mutationOptions());
  const firedRef = useRef(false);
  const state = searchParams.get('state') ?? '';
  const code = searchParams.get('code') ?? '';

  useEffect(() => {
    if (firedRef.current || !state || !code) return;
    firedRef.current = true;
    complete.mutate({ state, code });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, code]);

  const failed = complete.isError || !state || !code;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 text-center">
        {complete.isSuccess ? (
          <p className="text-sm">
            {m['common.teamIntegrations.callbackSuccess']({
              workspace: complete.data.workspaceName,
            })}
          </p>
        ) : failed ? (
          <p role="alert" className="text-sm">
            {m['common.teamIntegrations.callbackError']()}
          </p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm" aria-busy="true">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
            {m['common.teamIntegrations.callbackConnecting']()}
          </p>
        )}
        <Link
          to="/team?view=integrations"
          className="text-muted-foreground mt-4 inline-block text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {m['common.teamIntegrations.backToIntegrations']()}
        </Link>
      </div>
    </main>
  );
}
