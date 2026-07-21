import { useKeyboardLayout } from '@/components/keyboard-layout-indicator';
import { LoadingProvider } from '@/components/context/loading-context';
import { PostHogAnalytics } from '@/providers/posthog-analytics';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useSettings } from '@/hooks/use-settings';
import { Provider as JotaiProvider } from 'jotai';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from 'next-themes';
import { lazy, Suspense } from 'react';

// w2cd (client weight): sonner is only needed when a toast fires. Lazy-mount the
// Toaster; sonner keeps a module-level store so toasts emitted before the mount
// still render once it loads.
const Toaster = lazy(() => import('@/components/ui/toast'));

export function ClientProviders({ children }: PropsWithChildren) {
  const { data } = useSettings();
  useKeyboardLayout();

  const theme = data?.settings.colorTheme || 'system';

  return (
    <NuqsAdapter>
      <JotaiProvider>
        <ThemeProvider
          attribute="class"
          enableSystem
          disableTransitionOnChange
          defaultTheme={theme}
        >
          <SidebarProvider>
            <LoadingProvider>
              {children}
              <Suspense fallback={null}>
                <Toaster />
              </Suspense>
              <PostHogAnalytics />
            </LoadingProvider>
          </SidebarProvider>
        </ThemeProvider>
      </JotaiProvider>
    </NuqsAdapter>
  );
}
