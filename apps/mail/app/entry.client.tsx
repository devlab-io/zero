import { startTransition, StrictMode } from 'react';
import { HydratedRouter } from 'react-router/dom';
import { hydrateRoot } from 'react-dom/client';
import './instrument';

// w2cd (client weight): @sentry/react is no longer statically imported here so it
// stays out of the critical hydration bundle. React render errors are forwarded to
// Sentry via dynamic import() — and only when telemetry is enabled (DSN set) and the
// client has actually initialized. Otherwise we just log, preserving prior behaviour.
function reportRenderError(error: unknown, componentStack?: string | null) {
  console.warn('Uncaught error', error, componentStack);
  if (!import.meta.env.VITE_PUBLIC_SENTRY_DSN) return;
  void import('@sentry/react').then((Sentry) => {
    if (Sentry.getClient()) Sentry.captureException(error);
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onUncaughtError: (error, errorInfo) => reportRenderError(error, errorInfo.componentStack),
      // Callback called when React catches an error in an ErrorBoundary.
      onCaughtError: (error, errorInfo) => reportRenderError(error, errorInfo.componentStack),
      // Callback called when React automatically recovers from errors.
      onRecoverableError: (error, errorInfo) => reportRenderError(error, errorInfo.componentStack),
    },
  );
});
