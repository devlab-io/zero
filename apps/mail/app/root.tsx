import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
  type MetaFunction,
} from 'react-router';
import { ServerProviders } from '@/providers/server-providers';
import { ClientProviders } from '@/providers/client-providers';
import { useEffect, type PropsWithChildren } from 'react';
import { Button } from '@/components/ui/button';
import { getLocale } from '@/paraglide/runtime';
import { siteConfig } from '@/lib/site-config';
import { signOut } from '@/lib/auth-client';
import type { Route } from './+types/root';
import { AlertCircle } from 'lucide-react';
import { m } from '@/paraglide/messages';
import { ArrowLeft } from 'lucide-react';
import { RotateCw } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { LogOut } from 'lucide-react';
import { Home } from 'lucide-react';
import { log } from '@/lib/log';
import './globals.css';

// w2cd (client weight): @sentry/react is loaded via dynamic import() so it stays out
// of the critical inbox bundle. Error reporting only fires when telemetry is enabled
// (VITE_PUBLIC_SENTRY_DSN set) and the Sentry client has been initialized.
function captureToSentry(error: unknown, context: Record<string, unknown>) {
  if (!import.meta.env.VITE_PUBLIC_SENTRY_DSN) return;
  void import('@sentry/react').then((Sentry) => {
    if (!Sentry.getClient()) return;
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), context);
  });
}

// w2cd (client weight): getServerTrpc used to be defined here, which dragged
// @trpc/client + superjson (~11 kB gz) into the client shell for nothing — nothing
// imports it from the root. The canonical server-side version lives in
// lib/trpc.server.ts.

// pitbull (UI axis, P0): the collapsible "technical detail" must never dump a raw object.
// `JSON.stringify(new Error('x'))` is "{}" — Error.message/.stack/.name are non-enumerable
// own properties, so JSON.stringify never sees them. Read the fields directly instead, with a
// safe fallback for non-Error thrown values (rare: something that isn't a route error, isn't an
// Error, and JSON.stringifies to "{}" or throws — falls back to String(error), e.g.
// "[object Object]"; still not pretty, but never the bare "{}" that misled the user).
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return import.meta.env.DEV && error.stack ? error.stack : error.message || error.name;
  }
  if (typeof error === 'string') return error;
  try {
    const json = JSON.stringify(error);
    if (json && json !== '{}') return json;
  } catch {
    // circular or non-serializable — fall through to String()
  }
  return String(error);
}

function describeRouteError(error: { status: number; statusText: string; data: unknown }): string {
  const parts = [`status: ${error.status}`];
  if (error.statusText) parts.push(`statusText: ${error.statusText}`);
  if (error.data !== undefined) {
    try {
      parts.push(`data: ${JSON.stringify(error.data)}`);
    } catch {
      parts.push(`data: ${String(error.data)}`);
    }
  }
  return parts.join('\n');
}

export const meta: MetaFunction = () => {
  return [
    { title: siteConfig.title },
    { name: 'description', content: siteConfig.description },
    { property: 'og:title', content: siteConfig.title },
    { property: 'og:description', content: siteConfig.description },
    { property: 'og:image', content: siteConfig.openGraph.images[0].url },
    { property: 'og:url', content: siteConfig.alternates.canonical },
    { property: 'og:type', content: 'website' },
    { rel: 'manifest', href: '/manifest.webmanifest' },
  ];
};

export function Layout({ children }: PropsWithChildren) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#141414" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <link rel="manifest" href="/manifest.json" />
        {/* Warm up the connection to the tRPC backend early: saves one DNS+TLS
            round-trip (~150-200ms from Tahiti) on the first data fetch. */}
        {import.meta.env.VITE_PUBLIC_BACKEND_URL && (
          <>
            <link
              rel="preconnect"
              href={import.meta.env.VITE_PUBLIC_BACKEND_URL}
              crossOrigin="anonymous"
            />
            <link rel="dns-prefetch" href={import.meta.env.VITE_PUBLIC_BACKEND_URL} />
          </>
        )}
        <Meta />
        {import.meta.env.REACT_SCAN && (
          <script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js" />
        )}
        <Links />
      </head>
      <body className="antialiased">
        <ServerProviders>
          <ClientProviders>{children}</ClientProviders>
          {/* Devlab: DubAnalytics removed — click/referral tracking phoning dub.co
              for the editor's mail0.com domain. Nothing to gain in self-host. */}
        </ServerProviders>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// w2cd (client weight): reactivated as the neutral prerendered shell. With ssr:false +
// prerender:['/'], this is the HTML painted before hydration for the landing AND — via
// the Cloudflare SPA not_found_handling — for deep-links (e.g. /mail/inbox). It carries
// no route-specific (landing) markup, so a deep-link is never shown landing content.
export function HydrateFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin" />
    </div>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // #44 (post-#38): consume the ErrorBoundary i18n keys delivered by #38 (pages.error.boundary.*).
  //
  // pitbull (UI axis, P0) — this used to compute `message`/`details`/`stack` and then never
  // render them: the JSX always showed a static "Something went wrong!" plus a raw
  // `JSON.stringify(error, null, 2)` dump, which is "{}" for any plain thrown Error (see
  // describeError above). Fixed below to actually render the per-case copy, with the technical
  // detail behind a collapsible <details> instead of a naked object dump.
  //
  // Also: this is the ROOT route's boundary — the outermost one in the tree. Neither the
  // (auth)/login route nor its layout defines its own ErrorBoundary, so an error thrown there
  // (e.g. the `fetch('/api/public/providers')` in login/page.tsx's clientLoader failing) bubbles
  // all the way up here and replaces the ENTIRE route tree: the user doesn't see "a broken login
  // page", they see this boundary instead, with no path back to the login form. "Refresh" and
  // "Log Out and Refresh" both re-enter the same route and can re-trigger the same failure. The
  // "Retour à l'accueil" action below is the real escape hatch: it navigates to '/', a route that
  // did not just crash, breaking that loop.
  const routeError = isRouteErrorResponse(error) ? error : null;

  // Hooks below must run unconditionally on every render (rules of hooks) — the 404 early
  // return happens further down, AFTER useNavigate/useEffect, not before.
  const navigate = useNavigate();

  const kicker = routeError
    ? `${routeError.status} — ${m['pages.error.boundary.error']()}`
    : m['pages.error.boundary.oops']();
  const description = routeError
    ? routeError.statusText || m['pages.error.boundary.description']()
    : m['pages.error.boundary.description']();
  const technicalDetail = routeError ? describeRouteError(routeError) : describeError(error);

  useEffect(() => {
    log.error(error);

    // Report error to Sentry (lazy — see captureToSentry above)
    if (routeError) {
      captureToSentry(new Error(`Route Error ${routeError.status}: ${routeError.statusText}`), {
        tags: {
          type: 'route_error',
          status: routeError.status,
        },
        extra: {
          statusText: routeError.statusText,
          data: routeError.data,
        },
      });
    } else if (error instanceof Error) {
      captureToSentry(error, {
        tags: {
          type: 'app_error',
        },
      });
    } else {
      captureToSentry(new Error('Unknown error occurred'), {
        tags: {
          type: 'unknown_error',
        },
        extra: {
          error: error,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  if (routeError?.status === 404) {
    return <NotFound />;
  }

  return (
    <div className="dark:bg-background flex min-h-screen w-full items-center justify-center bg-white p-6 text-center">
      <div className="flex w-full max-w-md flex-col items-center justify-center dark:text-gray-100">
        <AlertCircle className="text-muted-foreground mb-4 h-10 w-10" />

        {/* Message */}
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">{kicker}</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {m['pages.error.boundary.somethingWentWrong']()}
          </h2>
          <p className="text-muted-foreground">{description}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="text-muted-foreground gap-2"
          >
            <RotateCw className="h-4 w-4" />
            {m['states.retry']()}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="text-muted-foreground gap-2"
          >
            <Home className="h-4 w-4" />
            {m['pages.error.boundary.goHome']()}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              window.location.href = '/login';
            }}
            className="text-muted-foreground gap-2"
          >
            <LogOut className="h-4 w-4" />
            {m['pages.error.boundary.signOutAndRetry']()}
          </Button>
        </div>

        {/* Technical detail: discreet, repliable, never a raw object dump. */}
        <details className="text-muted-foreground mt-6 w-full max-w-md text-left text-xs">
          <summary className="cursor-pointer select-none">
            {m['pages.error.boundary.seeConsole']()}
          </summary>
          <pre className="bg-muted/50 mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md p-2">
            {technicalDetail}
          </pre>
        </details>
      </div>
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="dark:bg-background flex w-full items-center justify-center bg-white text-center">
      <div className="flex-col items-center justify-center md:flex dark:text-gray-100">
        <div className="relative">
          <h1 className="text-muted-foreground/20 select-none text-[150px] font-bold">404</h1>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <AlertCircle className="text-muted-foreground h-20 w-20" />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {m['pages.error.notFound.title']()}
          </h2>
          <p className="text-muted-foreground">{m['pages.error.notFound.description']()}</p>
        </div>

        {/* Buttons */}
        <div className="mt-2 flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="text-muted-foreground gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {m['pages.error.notFound.goBack']()}
          </Button>
        </div>
      </div>
    </div>
  );
}
