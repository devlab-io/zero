import { useKeyboardLayout } from '@/components/keyboard-layout-indicator';
import { LoadingProvider } from '@/components/context/loading-context';
import { PostHogAnalytics } from '@/providers/posthog-analytics';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useSettings } from '@/hooks/use-settings';
import { Provider as JotaiProvider } from 'jotai';
import type { PropsWithChildren } from 'react';
import Toaster from '@/components/ui/toast';
import { ThemeProvider } from 'next-themes';

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
              <Toaster />
              <PostHogAnalytics />
            </LoadingProvider>
          </SidebarProvider>
        </ThemeProvider>
      </JotaiProvider>
    </NuqsAdapter>
  );
}
