import { PostHogAnalytics } from '@/providers/posthog-analytics';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from 'next-themes';
import { lazy, Suspense } from 'react';

// w2cd (client weight): sonner is only needed when a toast fires. Lazy-mount the
// Toaster; sonner keeps a module-level store so toasts emitted before the mount
// still render once it loads.
const Toaster = lazy(() => import('@/components/ui/toast'));

// w2cd (client weight): only what the public shell (landing, login, full-width
// pages) actually needs stays at the root. App-only providers (React Query/tRPC,
// jotai, sidebar, loading state) moved to app/(routes)/layout.tsx so their code
// stays out of the __spa-fallback shell bundle.
//
// The settings-driven `defaultTheme` was dropped: `defaultTheme` is only read at
// mount (when the settings query has not resolved yet, so it was always 'system'
// in practice) and theme changes go through next-themes' setTheme → localStorage
// (see settings/appearance). Behavior is unchanged.
export function ClientProviders({ children }: PropsWithChildren) {
  return (
    <NuqsAdapter>
      <ThemeProvider attribute="class" enableSystem disableTransitionOnChange defaultTheme="system">
        {children}
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
        <PostHogAnalytics />
      </ThemeProvider>
    </NuqsAdapter>
  );
}
