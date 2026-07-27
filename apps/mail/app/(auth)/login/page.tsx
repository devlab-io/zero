import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import type { ComponentProps, ReactNode } from 'react';
import { LoginClient } from './login-client';
import { m } from '@/paraglide/messages';
import { log } from '@/lib/log';

/**
 * La liste des providers est dérivée des props réellement acceptées par `LoginClient`,
 * ce qui remplace le tableau non typé qui était posé ici sans aucun contrat.
 */
type LoginProviders = ComponentProps<typeof LoginClient>['providers'];

type LoginLoaderData = {
  allProviders: LoginProviders;
  providersUnavailable: boolean;
  isProd: boolean;
};

const degraded = (isProd: boolean): LoginLoaderData => ({
  allProviders: [],
  providersUnavailable: true,
  isProd,
});

/**
 * Le formulaire de connexion est la DERNIÈRE porte d'entrée de l'application : s'il
 * disparaît, l'utilisateur n'a plus aucun recours. Le `fetch` était nu (pas de try/catch,
 * pas de test de `response.ok`, `response.json()` appelé sur n'importe quelle réponse) :
 * backend injoignable, 5xx ou page HTML d'erreur renvoyée par un proxy faisaient remonter
 * l'exception jusqu'à l'ErrorBoundary RACINE, qui remplaçait tout l'arbre — plus de
 * formulaire du tout. On dégrade désormais au lieu d'échouer : liste de providers vide,
 * bandeau d'avertissement, formulaire toujours rendu.
 */
export async function clientLoader(): Promise<LoginLoaderData> {
  const isProd = !import.meta.env.DEV;

  try {
    const response = await fetch(import.meta.env.VITE_PUBLIC_BACKEND_URL + '/api/public/providers');

    if (!response.ok) {
      log.error('Auth providers request failed with status', response.status);
      return degraded(isProd);
    }

    // Une réponse 200 non-JSON (portail captif, page d'erreur d'un proxy) fait lever
    // `response.json()` : c'est le catch ci-dessous qui l'absorbe.
    const data = (await response.json()) as { allProviders?: LoginProviders } | null;
    const allProviders = Array.isArray(data?.allProviders) ? data.allProviders : [];

    return { allProviders, providersUnavailable: allProviders.length === 0, isProd };
  } catch (error) {
    log.error('Failed to load auth providers', error);
    return degraded(isProd);
  }
}

function LoginNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-center gap-3 border-b border-orange-500/40 bg-orange-500/10 px-4 py-2 text-center text-sm text-orange-300"
    >
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { allProviders, providersUnavailable, isProd } = useLoaderData<typeof clientLoader>();

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-white dark:bg-black">
      {providersUnavailable ? (
        <LoginNotice>
          <span>{m['common.actions.errorTryAgainLater']()}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline underline-offset-2"
          >
            {m['states.retry']()}
          </button>
        </LoginNotice>
      ) : null}
      <LoginClient providers={allProviders} isProd={isProd} />
    </div>
  );
}

/**
 * Filet résiduel du segment (convention React Router 7). Le loader ci-dessus ne lève
 * plus, mais une erreur de render du formulaire remonterait sinon jusqu'à
 * l'ErrorBoundary racine, qui remplace TOUT l'arbre et ne propose aucun retour vers la
 * connexion. Ce filet-ci reste dans le segment `/login` et rend un chemin de sortie.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white p-6 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold tracking-tight dark:text-white">
        {m['pages.error.boundary.somethingWentWrong']()}
      </h1>
      <p className="text-muted-foreground max-w-md">{m['pages.error.boundary.description']()}</p>
      {detail ? (
        <details className="text-muted-foreground max-w-md text-left text-xs">
          <summary className="cursor-pointer">{m['pages.error.boundary.error']()}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{detail}</pre>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border px-4 py-2 text-sm dark:text-white"
        >
          {m['states.retry']()}
        </button>
        <a href="/" className="rounded-md border px-4 py-2 text-sm dark:text-white">
          {m['pages.error.boundary.goHome']()}
        </a>
      </div>
    </div>
  );
}
