// Devlab: upstream hardcoded THEIR Sentry DSN with 100% tracing and session
// replay — every user action was shipped to Zero Email Inc.'s account. In our
// fork, telemetry is opt-in: set VITE_PUBLIC_SENTRY_DSN to enable it.
//
// w2cd (client weight): @sentry/react is loaded via dynamic import() so it never
// enters the critical inbox bundle. When no DSN is configured (the default), the
// Sentry chunk is never fetched at all.
const dsn = import.meta.env.VITE_PUBLIC_SENTRY_DSN as string | undefined;

if (dsn) {
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      tunnel: import.meta.env.VITE_PUBLIC_BACKEND_URL + '/monitoring/sentry',
      integrations: [Sentry.replayIntegration()],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      debug: false,
    });
  });
}
