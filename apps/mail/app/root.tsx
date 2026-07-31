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
import { buildSessionPrimeSnippet } from '@/lib/session-prime';
import { BootPerfPanel } from '@/components/boot-perf-panel';
import { useEffect, type PropsWithChildren } from 'react';
import { Button } from '@/components/ui/button';
import { getLocale } from '@/paraglide/runtime';
import { siteConfig } from '@/lib/site-config';
import { signOut } from '@/lib/auth-client';
import type { Route } from './+types/root';
import { AlertCircle } from 'lucide-react';
import { m } from '@/paraglide/messages';
import { ArrowLeft } from 'lucide-react';
import { Loader2 } from 'lucide-react';
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
        <meta name="theme-color" content="#140151" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/reta-mark.svg" type="image/svg+xml" />
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
            {/* r9 (cold boot) : lance /api/auth/get-session dès le PARSE du
                HTML — la RTT session recouvre le chargement du bundle au lieu
                de le suivre (waterfall CUA : ~1 s de gap au reload). Consommée
                one-shot par dedupedFetch ; P0 shell neutre inchangé. */}
            <script
              dangerouslySetInnerHTML={{
                __html: buildSessionPrimeSnippet(import.meta.env.VITE_PUBLIC_BACKEND_URL),
              }}
            />
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
        {/* r12 : panneau diagnostic cold boot, UNIQUEMENT avec ?bootperf=1 —
            hors providers pour vivre même pendant le shell neutre. */}
        <BootPerfPanel />
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
  let message = m['pages.error.boundary.oops']();
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : m['pages.error.boundary.error']();
    details =
      error.status === 404
        ? m['pages.error.boundary.notFoundDetails']()
        : error.statusText || details;
    if (error.status === 404) {
      return <NotFound />;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  useEffect(() => {
    log.error(error);
    log.error({ message, details, stack });

    // Report error to Sentry (lazy — see captureToSentry above)
    if (isRouteErrorResponse(error)) {
      captureToSentry(new Error(`Route Error ${error.status}: ${error.statusText}`), {
        tags: {
          type: 'route_error',
          status: error.status,
        },
        extra: {
          statusText: error.statusText,
          data: error.data,
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
  }, [error, message, details, stack]);

  return (
    <div className="dark:bg-background flex w-full items-center justify-center bg-white text-center">
      <div className="flex-col items-center justify-center md:flex dark:text-gray-100">
        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {m['pages.error.boundary.somethingWentWrong']()}
          </h2>
          <p className="text-muted-foreground">{m['pages.error.boundary.seeConsole']()}</p>
          <pre className="text-muted-foreground">{JSON.stringify(error, null, 2)}</pre>
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="text-muted-foreground gap-2"
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              window.location.href = '/login';
            }}
            className="text-muted-foreground gap-2"
          >
            Log Out and Refresh
          </Button>
        </div>
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
