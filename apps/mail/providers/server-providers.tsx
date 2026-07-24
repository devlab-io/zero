import { AutumnProvider } from 'autumn-js/react';
import type { PropsWithChildren } from 'react';

// w2cd (client weight): QueryProvider moved to app/(routes)/layout.tsx — the public
// shell (landing, login, full-width pages) runs no tRPC/React Query code, so the
// whole query stack stays out of the __spa-fallback shell bundle. Autumn stays at
// the root because the public /pricing page consumes it via useBilling.
export function ServerProviders({ children }: PropsWithChildren) {
  return (
    <AutumnProvider backendUrl={import.meta.env.VITE_PUBLIC_BACKEND_URL}>{children}</AutumnProvider>
  );
}
